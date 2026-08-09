/**
 * Uçtan uca duman testleri.
 *
 * Bu senaryolar elle doğrulanırken gerçek hata yakaladıkları için kalıcı hale
 * getirildi: notların yedeğe hiç girmemesi, geri almanın kaydı eksik
 * döndürmesi, dil değişiminde hydration uyuşmazlığı, aramanın kalem adını
 * görmemesi. Hepsi tarayıcıda, gerçek IndexedDB üzerinde çalışır.
 *
 * Çalıştırma:  npm run dev   (ayrı terminalde)
 *              npm run e2e
 *
 * Her senaryo TAZE bir tarayıcı profili açar — biri diğerinin verisini görmez.
 */
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const BASE = process.env.E2E_BASE ?? "http://localhost:3000";
const HEADLESS = process.env.E2E_HEADED !== "1";
const VIEWPORT = { width: 390, height: 844 };

const pad = (n) => String(n).padStart(2, "0");
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// ─── küçük iddia yardımcıları ────────────────────────────────────────────────
let failures = 0;
const results = [];

function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  if (!ok) failures++;
}
const eq = (name, actual, expected) =>
  check(name, actual === expected, `beklenen ${expected}, gelen ${actual}`);
const truthy = (name, v, detail = "") => check(name, !!v, detail);

// ─── ortak yardımcılar ───────────────────────────────────────────────────────

/** Uygulamayı açar, yerleşik veri kurulumunu bekler */
async function openApp(browser, { locale = "en-US" } = {}) {
  const page = await browser.newPage({ viewport: VIEWPORT, locale });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));
  page.on("dialog", (d) => {
    errors.push("NATIVE DIALOG: " + d.message());
    d.dismiss();
  });
  await page.goto(`${BASE}/calendar/${today()}`);
  await page.waitForTimeout(4500);
  return { page, errors };
}

/** Ham IndexedDB üzerinden kayıt sayısı */
const count = (page, table) =>
  page.evaluate(async (t) => {
    const db = await new Promise((res) => {
      const r = indexedDB.open("RoutineDB");
      r.onsuccess = () => res(r.result);
    });
    if (![...db.objectStoreNames].includes(t)) return -1;
    return new Promise((res) => {
      const r = db.transaction(t).objectStore(t).count();
      r.onsuccess = () => res(r.result);
    });
  }, table);

/** Seçilen alt kategoriye n girdi yazar (Dexie canlı sorguları için reload gerekir) */
const seedEntries = (page, subName, rows) =>
  page.evaluate(
    async ({ subName, rows }) => {
      const db = await new Promise((res) => {
        const r = indexedDB.open("RoutineDB");
        r.onsuccess = () => res(r.result);
      });
      const all = (t) =>
        new Promise((res) => {
          const r = db.transaction(t).objectStore(t).getAll();
          r.onsuccess = () => res(r.result);
        });
      const subs = await all("subcategories");
      const sub = subs.find((s) => s.name === subName);
      if (!sub) throw new Error("alt kategori yok: " + subName);
      const now = Date.now();
      const tx = db.transaction("entries", "readwrite");
      rows.forEach((row, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (row.daysAgo ?? 0));
        tx.objectStore("entries").put({
          // id kalem adını içerir: iki ayrı tohumlama birbirinin üstüne yazmasın
          id: `e2e-${subName}-${i}`,
          subcategoryId: sub.id,
          title: row.title,
          notes: row.notes,
          occurredAt: d.getTime(),
          createdAt: now,
          updatedAt: now,
        });
      });
      await new Promise((res) => {
        tx.oncomplete = res;
      });
    },
    { subName, rows }
  );

// ─── 1. Yedek: dışa aktar → birleştir → değiştir ─────────────────────────────
async function backupRoundtrip(browser) {
  const { page, errors } = await openApp(browser);
  await page.context().grantPermissions([]).catch(() => {});

  // Not + girdi
  await page.evaluate(async (date) => {
    const db = await new Promise((res) => {
      const r = indexedDB.open("RoutineDB");
      r.onsuccess = () => res(r.result);
    });
    const now = Date.now();
    const tx = db.transaction("notes", "readwrite");
    tx.objectStore("notes").put({
      id: "n1",
      date,
      title: "Günlüğüm",
      blocks: [{ id: "b1", text: "ilk sürüm" }],
      createdAt: now,
      updatedAt: now,
    });
    await new Promise((res) => {
      tx.oncomplete = res;
    });
  }, today());

  await page.goto(`${BASE}/settings`);
  await page.waitForTimeout(2000);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: /JSON/i }).click(),
  ]);
  const file = await download.path();
  const json = JSON.parse(
    await (await import("node:fs/promises")).readFile(file, "utf8")
  );

  eq("yedek sürümü 2", json.version, 2);
  truthy("notlar yedekte", (json.data.notes ?? []).length === 1);
  truthy(
    "dosya adı yerel tarihle",
    download.suggestedFilename().startsWith("routine-yedek-" + today())
  );

  // Cihazdaki notu yedekten YENİ yap + yedekte olmayan bir not ekle
  await page.evaluate(async (date) => {
    const db = await new Promise((res) => {
      const r = indexedDB.open("RoutineDB");
      r.onsuccess = () => res(r.result);
    });
    const later = Date.now() + 60000;
    const tx = db.transaction("notes", "readwrite");
    tx.objectStore("notes").put({
      id: "n1",
      date,
      title: "Günlüğüm",
      blocks: [{ id: "b1", text: "CİHAZDAKİ YENİ" }],
      createdAt: later - 60000,
      updatedAt: later,
    });
    tx.objectStore("notes").put({
      id: "n2",
      date,
      title: "Yedekte yok",
      blocks: [{ id: "b2", text: "kalmalı" }],
      createdAt: later,
      updatedAt: later,
    });
    await new Promise((res) => {
      tx.oncomplete = res;
    });
  }, today());

  // Birleştir: yeni olan kazanır, fazladan kayıt silinmez
  await page.setInputFiles('input[type="file"]', file);
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: /Merge|Birleştir/ }).click();
  await page.waitForTimeout(2000);
  const merged = await page.evaluate(async () => {
    const db = await new Promise((res) => {
      const r = indexedDB.open("RoutineDB");
      r.onsuccess = () => res(r.result);
    });
    const notes = await new Promise((res) => {
      const r = db.transaction("notes").objectStore("notes").getAll();
      r.onsuccess = () => res(r.result);
    });
    return notes.map((n) => n.blocks[0].text).sort();
  });
  truthy(
    "birleştirmede cihazdaki yeni sürüm kaldı",
    merged.includes("CİHAZDAKİ YENİ")
  );
  truthy("birleştirmede fazladan kayıt silinmedi", merged.includes("kalmalı"));

  // Değiştir: yalnızca yedektekiler kalır
  await page.setInputFiles('input[type="file"]', file);
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: /^(Replace|Değiştir)/ }).click();
  await page.waitForTimeout(2000);
  eq("değiştirmede yalnızca yedektekiler", await count(page, "notes"), 1);

  // Bozuk dosya sessizce yutulmamalı
  const tmp = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "bozuk.json"
  );
  const fs = await import("node:fs/promises");
  await fs.writeFile(tmp, '{"app":"başka","data":{}}');
  await page.setInputFiles('input[type="file"]', tmp);
  await page.waitForTimeout(1000);
  truthy(
    "bozuk dosyada açıklayıcı hata",
    (await page.evaluate(() => document.body.innerText)).match(
      /Routine yedeği|Routine backup/i
    )
  );
  await fs.unlink(tmp).catch(() => {});

  check("yedek: sayfa hatası yok", errors.length === 0, errors.join(" | "));
  await page.close();
}

// ─── 2. Silme + geri alma ────────────────────────────────────────────────────
async function deleteAndUndo(browser) {
  const { page, errors } = await openApp(browser);
  await seedEntries(page, "Cafe", [
    { title: "A", daysAgo: 0 },
    { title: "B", daysAgo: 0 },
  ]);
  await page.reload();
  await page.waitForTimeout(2500);

  eq("başlangıçta 2 girdi", await count(page, "entries"), 2);

  // Basılı tut → toplu seçim → tümünü seç → sil
  const card = page.locator("text=Cafe").first();
  const box = await card.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();
  await page.waitForTimeout(600);
  await page.getByRole("button", { name: /Select all|Tümünü seç/ }).click();
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: /^(Delete|Sil)$/ }).first().click();
  await page.waitForTimeout(400);
  await page
    .getByRole("button", { name: /^(Delete|Sil)$/ })
    .last()
    .click();
  await page.waitForTimeout(1500);

  eq("silindikten sonra 0 girdi", await count(page, "entries"), 0);
  truthy("silme günlüğü doldu", (await count(page, "deletions")) > 0);
  truthy(
    "geri al şeridi göründü",
    (await page.evaluate(() => document.body.innerText)).match(/Undo|Geri al/)
  );

  await page.getByRole("button", { name: /Undo|Geri al/ }).click();
  await page.waitForTimeout(1500);
  eq("geri alınca girdiler döndü", await count(page, "entries"), 2);
  eq("günlük temizlendi", await count(page, "deletions"), 0);

  check("silme: sayfa hatası yok", errors.length === 0, errors.join(" | "));
  await page.close();
}

// ─── 3. Başka güne taşıma ────────────────────────────────────────────────────
async function moveToAnotherDay(browser) {
  const { page, errors } = await openApp(browser);
  await seedEntries(page, "Cafe", [{ title: "Taşınacak", daysAgo: 0 }]);
  await page.reload();
  await page.waitForTimeout(2500);

  const onDay = (d) =>
    page.evaluate(async (date) => {
      const db = await new Promise((res) => {
        const r = indexedDB.open("RoutineDB");
        r.onsuccess = () => res(r.result);
      });
      const entries = await new Promise((res) => {
        const r = db.transaction("entries").objectStore("entries").getAll();
        r.onsuccess = () => res(r.result);
      });
      const pad = (n) => String(n).padStart(2, "0");
      const key = (t) => {
        const x = new Date(t);
        return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
      };
      return entries.filter((e) => key(e.occurredAt) === date).length;
    }, d);

  const yesterday = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  })();

  eq("girdi bugünde", await onDay(today()), 1);

  const card = page.locator("text=Cafe").first();
  const box = await card.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();
  await page.waitForTimeout(600);
  await page.getByRole("button", { name: /another day|Başka güne/ }).click();
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: /Previous day|Önceki gün/ }).click();
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: /Move to|gününe taşı/ }).click();
  await page.waitForTimeout(2000);

  eq("girdi bugünden çıktı", await onDay(today()), 0);
  eq("girdi düne taşındı", await onDay(yesterday), 1);
  truthy(
    "hedef güne yönlendirdi",
    page.url().includes(yesterday),
    `url: ${page.url()}`
  );

  check("taşıma: sayfa hatası yok", errors.length === 0, errors.join(" | "));
  await page.close();
}

// ─── 4. Arama ────────────────────────────────────────────────────────────────
async function search(browser) {
  const { page, errors } = await openApp(browser);
  await seedEntries(page, "Cafe", [
    { title: "Kronotrop", notes: "üçüncü dalga kahve", daysAgo: 2 },
    { title: "Petra", daysAgo: 45 },
  ]);
  await seedEntries(page, "Groceries", [
    { title: "Haftalık", notes: "kahve çekirdeği", daysAgo: 1 },
  ]);
  await page.goto(`${BASE}/search`);
  await page.waitForTimeout(1500);

  const rows = async () =>
    page.evaluate(() => {
      const h = [...document.querySelectorAll("h3")].find((x) =>
        /Results|Sonuçlar/.test(x.textContent)
      );
      if (!h) return 0;
      return [
        ...h.parentElement.parentElement.querySelectorAll("button"),
      ].filter((b) => /·/.test(b.textContent)).length;
    });
  const type = async (q) => {
    await page.fill('input[placeholder]', q);
    await page.waitForTimeout(800);
  };

  await type("kahve");
  eq("metin araması başlık+notta eşleşti", await rows(), 2);
  await type("cafe");
  eq("kalem adı da eşleşiyor", await rows(), 2);
  await type("zzzz");
  eq("eşleşme yoksa boş", await rows(), 0);
  // Not "üçüncü dalga kahve" — kimse aramada şapka yazmak zorunda kalmasın
  await type("ucuncu");
  eq("aksansız sorgu şapkalı notu buluyor", await rows(), 1);

  await type("cafe");
  await page.getByRole("button", { name: /This month|Bu ay/ }).click();
  await page.waitForTimeout(800);
  eq("tarih aralığı süzüyor", await rows(), 1);

  check("arama: sayfa hatası yok", errors.length === 0, errors.join(" | "));
  await page.close();
}

// ─── 5. Liste içi arama ──────────────────────────────────────────────────────
/**
 * Girdi listelerinin kendi büyüteci — /search'ten farkı kapsamı: yalnız
 * bakılan kalemin girdilerini süzer. Aksan duyarsızlığı burada da sınanıyor
 * çünkü kural (lib/search.ts) iki aramada da ortak.
 */
async function listSearch(browser) {
  const { page, errors } = await openApp(browser);

  // Eşik 8 satır — altında büyüteç bilerek çıkmaz
  await seedEntries(
    page,
    "Cafe",
    [
      "İstanbul kahvesi", "Işık Kafe", "Kronotrop", "Petra",
      "Öğle molası", "Sabah espresso", "Filtre kahve", "Latte",
      "Cortado", "Türk kahvesi",
    ].map((title, i) => ({ title, daysAgo: i }))
  );
  const catId = await page.evaluate(async () => {
    const db = await new Promise((res) => {
      const r = indexedDB.open("RoutineDB");
      r.onsuccess = () => res(r.result);
    });
    const subs = await new Promise((res) => {
      const r = db.transaction("subcategories").objectStore("subcategories").getAll();
      r.onsuccess = () => res(r.result);
    });
    return subs.find((s) => s.name === "Cafe")?.categoryId;
  });

  await page.goto(`${BASE}/analytics/${catId}`);
  await page.waitForTimeout(2600);
  await page.mouse.move(195, 500);
  await page.mouse.wheel(0, 8000);
  await page.waitForTimeout(900);

  /** Süzülen/toplam rozeti — "3/10" ya da "10" */
  const badge = () =>
    page.evaluate(() => {
      const h = [...document.querySelectorAll("h3")].find((x) =>
        /Recent entries/i.test(x.textContent)
      );
      return h?.querySelector("span")?.textContent ?? null;
    });

  const toggle = page.getByRole("button", { name: "Search in this list" });
  eq("analiz listesinde büyüteç var", await toggle.count(), 1);
  await toggle.first().click();
  await page.waitForTimeout(400);

  const box = page.locator('input[placeholder="Filter these entries…"]');
  const type = async (q) => {
    await box.fill(q);
    await page.waitForTimeout(600);
  };

  await type("kahve");
  eq("liste içi süzme çalışıyor", await badge(), "3/10");
  // Kullanıcı "İ" ve "ı" yazmak zorunda kalmasın
  await type("istanbul");
  eq("aksansız sorgu İ'yi buluyor", await badge(), "1/10");
  await type("isik");
  eq("aksansız sorgu ı/ş'yi buluyor", await badge(), "1/10");
  await type("zzzz");
  eq("eşleşme yoksa liste boş", await badge(), "0/10");

  // Kapatmak süzgeci kaldırmalı — süzülü liste eksik veri sanılır
  await toggle.first().click();
  await page.waitForTimeout(500);
  eq("kapatınca süzgeç kalkıyor", await badge(), "10");
  eq("kapatınca kutu gidiyor", await box.count(), 0);

  check("liste içi arama: sayfa hatası yok", errors.length === 0, errors.join(" | "));
  await page.close();
}

// ─── 6. Özellik: ölçüm özelliğin kendi üzerinde ──────────────────────────────
/**
 * v18: ölçü ayrı bir nesne olmaktan çıktı. İki şey sınanıyor —
 *  1) Yeni özellik türünü/birimini kendi taşıyor, ölçü havuzuna bağ kurmuyor.
 *  2) v18 ÖNCESİ bir yedeği geri yüklerken ölçüm özelliğin üzerine kopyalanıyor.
 *     Şema göçü içe aktarılan kayıtlara uğramaz; bu kopyalama olmazsa uyku
 *     aralığı, skala ve evet/hayır sessizce "sayı"ya dönerdi.
 */
async function featureMeasure(browser) {
  const { page, errors } = await openApp(browser);
  await page.goto(`${BASE}/structure/mods`);
  await page.waitForTimeout(2500);

  const newFeature = () =>
    page.getByRole("button", { name: "New feature", exact: true }).click();
  const readMods = (names) =>
    page.evaluate(async (names) => {
      const db = await new Promise((res) => {
        const r = indexedDB.open("RoutineDB");
        r.onsuccess = () => res(r.result);
      });
      const all = await new Promise((r) => {
        const q = db.transaction("mods").objectStore("mods").getAll();
        q.onsuccess = () => r(q.result);
      });
      return all
        .filter((m) => names.includes(m.name))
        .map((m) => ({
          name: m.name,
          vt: m.valueType,
          unit: m.unit ?? null,
          ch: m.choices ?? null,
          etid: m.entryTypeId ?? null,
        }));
    }, names);

  // Sayı, birimsiz — adı zaten birim olan özellik ("Set: 4 set" saçma olurdu)
  await newFeature();
  await page.waitForTimeout(500);
  await page.locator("#pool-mod-name").fill("Sets");
  await page.getByRole("button", { name: "Create" }).click();
  await page.waitForTimeout(900);

  // Skala — depoda sayısal seçenek kümesi, analiz bunu ortalar
  await newFeature();
  await page.waitForTimeout(500);
  await page.locator("#pool-mod-name").fill("Focus");
  await page.getByRole("button", { name: "Scale", exact: true }).click();
  await page.getByRole("button", { name: "1 – 10" }).click();
  await page.getByRole("button", { name: "Create" }).click();
  await page.waitForTimeout(900);

  // Çoktan seçmeli — kullanıcının kendi kelimeleri
  await newFeature();
  await page.waitForTimeout(500);
  await page.locator("#pool-mod-name").fill("Trigger");
  await page.getByRole("button", { name: "Multiple choice", exact: true }).click();
  const opt = page.locator('input[placeholder="Add an option"]');
  for (const o of ["stress", "coffee"]) {
    await opt.fill(o);
    await opt.press("Enter");
    await page.waitForTimeout(200);
  }
  await page.getByRole("button", { name: "Create" }).click();
  await page.waitForTimeout(900);

  const made = await readMods(["Sets", "Focus", "Trigger"]);
  const by = (n) => made.find((m) => m.name === n);
  eq("üç özellik de yaratıldı", made.length, 3);
  eq("sayı: birim boş bırakılabiliyor", by("Sets")?.unit, null);
  eq("skala sayısal seçenek kümesi", by("Focus")?.ch?.length, 10);
  eq("çoktan seçmeli kendi seçeneklerini taşıyor", by("Trigger")?.ch?.join(), "stress,coffee");
  check(
    "hiçbiri ölçü havuzuna bağlı değil",
    made.every((m) => m.etid === null),
    JSON.stringify(made)
  );

  // Birim önerisi havuzdakilerden gelmeli ("adet/Adet/tane" ayrışmasın)
  await newFeature();
  await page.waitForTimeout(600);
  const units = await page.evaluate(() => {
    const inp = document.querySelector('[role="dialog"] #measure-unit');
    return inp
      ? [...inp.parentElement.querySelectorAll("button")].map((b) => b.textContent.trim())
      : [];
  });
  check("kullanılan birimler öneriliyor", units.includes("kg") && units.includes("km"), units.join(","));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);

  // v18 ÖNCESİ yedeği geri yükle: özelliklerde ölçüm alanı yok, ölçü kaydına
  // bağlılar. Şema göçü içe aktarılan kayda uğramaz — geri yükleme yolu
  // ölçümü kopyalamazsa hepsi sessizce "sayı" olur.
  const legacy = {
    app: "routine",
    version: 2,
    exportedAt: Date.now(),
    data: {
      categories: [], subcategories: [], fields: [], globalDimensions: [],
      entries: [], entryValues: [], goals: [], activities: [], notes: [],
      categoryModifiers: [],
      entryTypes: [
        { id: "t-dtr", name: "Date Range", unit: "", valueType: "datetime-range", isBuiltIn: true, order: 1, createdAt: 1, updatedAt: 1 },
        { id: "t-sc", name: "1–5 Scale", unit: "", valueType: "select", choices: ["1","2","3","4","5"], isBuiltIn: true, order: 2, createdAt: 1, updatedAt: 1 },
        { id: "t-yn", name: "Yes / No", unit: "", valueType: "boolean", isBuiltIn: true, order: 3, createdAt: 1, updatedAt: 1 },
      ],
      // valueType/unit/choices YOK — v18 öncesi şekil
      mods: [
        { id: "m-dtr", name: "Legacy Range", entryTypeId: "t-dtr", createdAt: 1, updatedAt: 1 },
        { id: "m-sc", name: "Legacy Scale", entryTypeId: "t-sc", createdAt: 1, updatedAt: 1 },
        { id: "m-yn", name: "Legacy Flag", entryTypeId: "t-yn", createdAt: 1, updatedAt: 1 },
      ],
    },
  };
  const legacyPath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    ".legacy-backup.tmp.json"
  );
  fs.writeFileSync(legacyPath, JSON.stringify(legacy), "utf8");
  try {
    await page.goto(`${BASE}/settings`);
    await page.waitForTimeout(2000);
    await page.setInputFiles('input[type="file"]', legacyPath);
    await page.waitForTimeout(1200);
    await page.getByRole("button", { name: /Replace|Değiştir/i }).last().click();
    await page.waitForTimeout(3000);

    const back = await readMods(["Legacy Range", "Legacy Scale", "Legacy Flag"]);
    const b = (n) => back.find((m) => m.name === n);
    eq("eski yedek: tarih aralığı korundu", b("Legacy Range")?.vt, "datetime-range");
    eq("eski yedek: skala korundu", b("Legacy Scale")?.ch?.length, 5);
    eq("eski yedek: evet/hayır korundu", b("Legacy Flag")?.vt, "boolean");
  } finally {
    fs.rmSync(legacyPath, { force: true });
  }

  check("özellik: sayfa hatası yok", errors.length === 0, errors.join(" | "));
  await page.close();
}

// ─── 7. Uygulamayla gelen özelliklerin ayrıcalığı yok ────────────────────────
/**
 * v19: "yerleşik özellik" sınıfı kalktı. Hazır gelen özellik de kullanıcının
 * yarattığı gibi yeniden adlandırılır ve silinir.
 *
 * İki kalıcı tuzak sınanıyor: (1) açılış rutini eskiden her seferinde ad
 * devrini uyguluyordu — kullanıcının verdiği ad bir sonraki açılışta geri
 * alınırdı; (2) eksik "yerleşik"i geri koyuyordu — silinen özellik dirilirdi.
 */
async function seededFeatures(browser) {
  const { page, errors } = await openApp(browser);
  const read = () =>
    page.evaluate(async () => {
      const db = await new Promise((res) => {
        const r = indexedDB.open("RoutineDB");
        r.onsuccess = () => res(r.result);
      });
      const g = (t) =>
        new Promise((r) => {
          const q = db.transaction(t).objectStore(t).getAll();
          q.onsuccess = () => r(q.result);
        });
      const [mods, values] = await Promise.all([g("mods"), g("entryValues")]);
      return {
        names: mods.map((m) => m.name),
        flagged: mods.filter((m) => m.isBuiltIn).length,
        values: values.length,
      };
    });

  await page.goto(`${BASE}/structure/mods`);
  await page.waitForTimeout(2500);

  const start = await read();
  truthy("hazır özellikler kurulmuş", start.names.includes("Money"));
  eq("yerleşik işareti kalmadı", start.flagged, 0);
  eq(
    "havuz tek parça (yerleşik/kendi başlığı yok)",
    await page.evaluate(() => document.querySelectorAll("h2").length),
    0
  );

  const openFeature = async (name) => {
    await page.locator(`button:has-text("${name}")`).first().click();
    await page.waitForTimeout(600);
  };
  const confirmDelete = async () => {
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await page.waitForTimeout(600);
    await page.getByRole("button", { name: /Delete|Sil/ }).last().click();
    await page.waitForTimeout(1400);
  };

  // Hazır gelen özellik yeniden adlandırılabilmeli — ve ad kalıcı olmalı
  await openFeature("Money");
  eq(
    "hazır özellikte de Sil var",
    await page.getByRole("button", { name: "Delete", exact: true }).count(),
    1
  );
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.waitForTimeout(500);
  eq("adı düzenlenebilir", await page.locator("#edit-mod-name").count(), 1);
  await page.locator("#edit-mod-name").fill("Para");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForTimeout(1200);
  await page.reload();
  await page.waitForTimeout(3500);
  const renamed = await read();
  truthy("verilen ad yeniden yüklemede korundu", renamed.names.includes("Para"));
  check(
    "açılış rutini eski adı geri koymuyor",
    !renamed.names.includes("Money"),
    renamed.names.join(",")
  );

  // Silme geri alınabilir olmalı
  await openFeature("Sleep Quality");
  await confirmDelete();
  const afterDelete = await read();
  eq("silindi", afterDelete.names.length, renamed.names.length - 1);
  const undo = page.getByRole("button", { name: /Undo|Geri al/ });
  eq("geri al çubuğu çıktı", await undo.count(), 1);
  await undo.first().click();
  await page.waitForTimeout(1800);
  const undone = await read();
  truthy("geri alma özelliği döndürdü", undone.names.includes("Sleep Quality"));

  // Silinen özellik açılışta dirilmemeli
  await openFeature("Calories");
  await confirmDelete();
  await page.reload();
  await page.waitForTimeout(4000);
  const final = await read();
  check(
    "silinen özellik açılışta geri gelmiyor",
    !final.names.includes("Calories"),
    final.names.join(",")
  );

  check("hazır özellik: sayfa hatası yok", errors.length === 0, errors.join(" | "));
  await page.close();
}

// ─── 4. Dil değişimi ─────────────────────────────────────────────────────────
async function language(browser) {
  const { page, errors } = await openApp(browser);
  await page.goto(BASE);
  await page.waitForTimeout(2000);

  const body = () => page.evaluate(() => document.body.innerText);
  truthy("varsayılan İngilizce", (await body()).includes("Welcome"));

  await page.goto(`${BASE}/settings`);
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: "Türkçe" }).click();
  await page.waitForTimeout(600);
  await page.goto(BASE);
  await page.waitForTimeout(1500);
  truthy("Türkçeye geçti", (await body()).includes("Hoş geldin"));
  truthy(
    "tarih biçimi de dile uydu",
    /Ağustos|Ocak|Şubat|Mart|Nisan|Mayıs|Haziran|Temmuz|Eylül|Ekim|Kasım|Aralık/.test(
      await body()
    )
  );

  await page.reload();
  await page.waitForTimeout(1500);
  truthy("seçim yeniden yüklemede korundu", (await body()).includes("Hoş geldin"));
  eq(
    "html lang güncellendi",
    await page.evaluate(() => document.documentElement.lang),
    "tr"
  );

  check("dil: sayfa hatası yok", errors.length === 0, errors.join(" | "));
  await page.close();
}

// ─── çalıştır ────────────────────────────────────────────────────────────────
const SCENARIOS = {
  backup: backupRoundtrip,
  undo: deleteAndUndo,
  move: moveToAnotherDay,
  search,
  listSearch,
  featureMeasure,
  seededFeatures,
  language,
};

const only = process.argv[2];
const browser = await chromium.launch({ headless: HEADLESS });
try {
  for (const [name, fn] of Object.entries(SCENARIOS)) {
    if (only && only !== name) continue;
    const before = results.length;
    try {
      await fn(browser);
    } catch (e) {
      check(`${name}: senaryo çöktü`, false, e.message.slice(0, 200));
    }
    const mine = results.slice(before);
    const bad = mine.filter((r) => !r.ok).length;
    console.log(
      `${bad ? "✗" : "✓"} ${name.padEnd(9)} ${mine.length - bad}/${mine.length}`
    );
    for (const r of mine.filter((x) => !x.ok))
      console.log(`    ✗ ${r.name}${r.detail ? " — " + r.detail : ""}`);
  }
} finally {
  await browser.close();
}

console.log(
  `\n${results.length - failures}/${results.length} kontrol geçti` +
    (failures ? ` · ${failures} BAŞARISIZ` : "")
);
process.exit(failures ? 1 : 0);
