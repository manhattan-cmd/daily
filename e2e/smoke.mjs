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

  await type("cafe");
  await page.getByRole("button", { name: /This month|Bu ay/ }).click();
  await page.waitForTimeout(800);
  eq("tarih aralığı süzüyor", await rows(), 1);

  check("arama: sayfa hatası yok", errors.length === 0, errors.join(" | "));
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
