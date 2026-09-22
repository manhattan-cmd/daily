import type {
  AnalysisView,
  Category,
  CategoryModifier,
  Entry,
  EntryType,
  EntryValue,
  Field,
  GlobalDimension,
  Goal,
  Mod,
  SubCategory,
} from "@/types";
import type { BackupData } from "./backup";

/**
 * Yedek birleştirmede YAPI eşleştirmesi.
 *
 * Sorun: birleştirme kayıtları id'ye göre eşliyordu. Kimlikler kurulum
 * başına rastgele üretildiği için başka bir cihazda (ya da temiz bir
 * kurulumda) alınmış yedekteki "Harcamalar", bu cihazdaki "Harcamalar"la
 * aynı şey olduğu halde başka bir id taşıyor — birleştirme ikisini iki ayrı
 * kayıt sanıp yan yana koyuyordu. Sonuç: her kategori, her kalem ve her
 * özellik ikiye katlanıyordu. En olası kullanım ("başka cihazın yedeğini
 * bu cihaza kat") tam da bunu tetikliyordu.
 *
 * Çözüm: yazmadan önce yedeği bu cihazın yapısına GÖRE YENİDEN ADRESLE.
 * Yapı kayıtları (kategori, kalem, özellik, ölçü) kimliğine göre eşlenir —
 * kategori adı, kalem için "hangi kategorinin/kalemin altında, hangi ad",
 * yerleşik akışlar için de dile bağlı olmayan `builtInKey`. Eşleşenin id'si
 * cihazdaki id'yle değiştirilir; girdi, değer ve hedefler de yeni id'ye
 * bağlanır. Böylece yedekteki GİRDİLER cihazdaki yapıya takılır, yapı
 * çoğalmaz.
 *
 * Girdi/not/hedef gibi OLAY kayıtları asla ada göre eşlenmez: aynı gün aynı
 * kaleme iki ayrı yürüyüş yazılmış olabilir, ikisi de gerçek. Onlar id'de
 * kalır — aynı cihazın yedeğinde id zaten tutar, başka cihazınkinde yeni
 * kayıt olarak gelir.
 */

/** Cihazdaki yapı — eşleştirme için gereken en az alan */
export interface DeviceStructure {
  categories: Pick<Category, "id" | "name" | "builtInKey">[];
  subcategories: Pick<
    SubCategory,
    "id" | "categoryId" | "parentId" | "name" | "isCategoryRoot"
  >[];
  mods: Pick<Mod, "id" | "name">[];
  entryTypes: Pick<EntryType, "id" | "name">[];
  globalDimensions: Pick<GlobalDimension, "id" | "name">[];
  categoryModifiers: Pick<
    CategoryModifier,
    "id" | "targetType" | "targetId" | "modId"
  >[];
}

/**
 * Ad eşleşmesi. Büyük/küçük harf ve baştaki/sondaki boşluk yutulur; Türkçe
 * dökümü kullanılır ki "İş" ile "iş" aynı sayılsın (en-US dökümünde "İ"
 * bambaşka bir harfe düşüyor).
 */
const norm = (s: string | undefined): string =>
  (s ?? "").trim().toLocaleLowerCase("tr");

const ROOT = "*root*";

export interface ReconcileResult {
  data: BackupData;
  /** Cihazdaki bir kayda bağlanan yapı kaydı sayısı — yani çoğalmaktan kurtulan */
  matched: number;
}

/**
 * Yedeği cihazın yapısına göre yeniden adresler. Saf fonksiyon: veritabanına
 * dokunmaz, girdi verisini değiştirmez, yalnız kimlikleri çevirir.
 */
export function reconcileBackup(
  data: BackupData,
  device: DeviceStructure
): ReconcileResult {
  const map = new Map<string, string>();
  let matched = 0;

  /** Yedekteki id'yi cihazdakine bağla */
  const claim = (backupId: string, deviceId: string) => {
    if (!backupId || !deviceId) return;
    if (backupId !== deviceId) matched++;
    map.set(backupId, deviceId);
  };
  const at = (id: string | undefined): string | undefined =>
    id ? map.get(id) ?? id : id;

  // ——— Kategoriler: önce yerleşik anahtar, sonra ad
  const catsIn = (data.categories ?? []) as Category[];
  const usedCats = new Set<string>();
  const deviceCatByKey = new Map<string, string>();
  const deviceCatByName = new Map<string, string>();
  for (const c of device.categories) {
    if (c.builtInKey) deviceCatByKey.set(c.builtInKey, c.id);
    deviceCatByName.set(norm(c.name), c.id);
  }
  for (const c of catsIn) {
    // Yerleşiklerin adı dile göre değişebilir; anahtar değişmez
    const hit =
      (c.builtInKey && deviceCatByKey.get(c.builtInKey)) ||
      deviceCatByName.get(norm(c.name));
    if (hit && !usedCats.has(hit)) {
      usedCats.add(hit);
      claim(c.id, hit);
    }
  }

  // ——— Özellikler (havuz): ad tekil, doğrudan eşleşir
  const usedMods = new Set<string>();
  const deviceModByName = new Map(device.mods.map((m) => [norm(m.name), m.id]));
  for (const m of (data.mods ?? []) as Mod[]) {
    const hit = deviceModByName.get(norm(m.name));
    if (hit && !usedMods.has(hit)) {
      usedMods.add(hit);
      claim(m.id, hit);
    }
  }

  // ——— Eski ölçü havuzu ve küresel boyutlar: ad
  const matchByName = <T extends { id: string; name: string }>(
    rows: T[],
    deviceRows: { id: string; name: string }[]
  ) => {
    const used = new Set<string>();
    const byName = new Map(deviceRows.map((r) => [norm(r.name), r.id]));
    for (const r of rows) {
      const hit = byName.get(norm(r.name));
      if (hit && !used.has(hit)) {
        used.add(hit);
        claim(r.id, hit);
      }
    }
  };
  matchByName((data.entryTypes ?? []) as EntryType[], device.entryTypes);
  matchByName(
    (data.globalDimensions ?? []) as GlobalDimension[],
    device.globalDimensions
  );

  // ——— Kalemler: üstten aşağı. Anahtar "hangi kategori / hangi üst kalem /
  //     hangi ad" — aynı ad iki ayrı yerde geçebiliyor (Harcamalar › Faturalar ›
  //     Su ile Beslenme › Su), o yüzden ad tek başına yetmiyor.
  const subsIn = (data.subcategories ?? []) as SubCategory[];
  const usedSubs = new Set<string>();
  const deviceSubKey = new Map<string, string>();
  for (const s of device.subcategories) {
    const key = s.isCategoryRoot
      ? `${s.categoryId}|${ROOT}`
      : `${s.categoryId}|${s.parentId ?? ""}|${norm(s.name)}`;
    if (!deviceSubKey.has(key)) deviceSubKey.set(key, s.id);
  }

  const byId = new Map(subsIn.map((s) => [s.id, s]));
  const depthOf = (s: SubCategory): number => {
    let d = 0;
    let cur = s.parentId;
    const seen = new Set<string>([s.id]);
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      d++;
      cur = byId.get(cur)?.parentId;
    }
    return d;
  };
  for (const s of [...subsIn].sort((a, b) => depthOf(a) - depthOf(b))) {
    const categoryId = at(s.categoryId);
    // Üst kalem bu döngüde zaten işlendi (derinlik sırası), id'si güncel
    const parentId = s.parentId ? at(s.parentId) : undefined;
    const key = s.isCategoryRoot
      ? `${categoryId}|${ROOT}`
      : `${categoryId}|${parentId ?? ""}|${norm(s.name)}`;
    const hit = deviceSubKey.get(key);
    if (hit && !usedSubs.has(hit)) {
      usedSubs.add(hit);
      claim(s.id, hit);
    }
  }

  // ——— Bağlantılar (özellik ataması): (hedef + özellik) çifti kimliktir.
  //     Aynı çift iki ayrı id'yle iki kez yazılırsa kalemde aynı özellik iki
  //     kere görünür.
  const deviceAttKey = new Map<string, string>();
  for (const a of device.categoryModifiers) {
    if (!a.modId) continue;
    deviceAttKey.set(`${a.targetType}|${a.targetId}|${a.modId}`, a.id);
  }
  for (const a of (data.categoryModifiers ?? []) as CategoryModifier[]) {
    if (!a.modId) continue;
    const hit = deviceAttKey.get(
      `${a.targetType}|${at(a.targetId)}|${at(a.modId)}`
    );
    if (hit) claim(a.id, hit);
  }

  // ——— Yeniden adresleme
  const out: BackupData = {
    ...data,
    categories: catsIn.map((c) => ({ ...c, id: at(c.id)! })),
    subcategories: subsIn.map((s) => ({
      ...s,
      id: at(s.id)!,
      categoryId: at(s.categoryId)!,
      ...(s.parentId ? { parentId: at(s.parentId)! } : {}),
    })),
    mods: ((data.mods ?? []) as Mod[]).map((m) => ({ ...m, id: at(m.id)! })),
    entryTypes: ((data.entryTypes ?? []) as EntryType[]).map((t) => ({
      ...t,
      id: at(t.id)!,
    })),
    globalDimensions: ((data.globalDimensions ?? []) as GlobalDimension[]).map(
      (g) => ({ ...g, id: at(g.id)! })
    ),
    fields: ((data.fields ?? []) as Field[]).map((f) => ({
      ...f,
      subcategoryId: at(f.subcategoryId)!,
    })),
    categoryModifiers: ((data.categoryModifiers ?? []) as CategoryModifier[]).map(
      (a) => ({
        ...a,
        id: at(a.id)!,
        targetId: at(a.targetId)!,
        ...(a.modId ? { modId: at(a.modId)! } : {}),
        ...(a.entryTypeId ? { entryTypeId: at(a.entryTypeId)! } : {}),
      })
    ),
    entries: ((data.entries ?? []) as Entry[]).map((e) => ({
      ...e,
      subcategoryId: at(e.subcategoryId)!,
    })),
    entryValues: ((data.entryValues ?? []) as EntryValue[]).map((v) => ({
      ...v,
      ...(v.modId ? { modId: at(v.modId)! } : {}),
      ...(v.entryTypeId ? { entryTypeId: at(v.entryTypeId)! } : {}),
      ...(v.fieldId ? { fieldId: at(v.fieldId)! } : {}),
    })),
    analysisViews: ((data.analysisViews ?? []) as AnalysisView[]).map((v) => ({
      ...v,
      targetId: at(v.targetId)!,
      modId: at(v.modId)!,
    })),
    goals: ((data.goals ?? []) as Goal[]).map((g) => ({
      ...g,
      subcategoryId: at(g.subcategoryId)!,
      targets: (g.targets ?? []).map((t) => ({
        ...t,
        ...(t.modId ? { modId: at(t.modId)! } : {}),
        ...(t.entryTypeId ? { entryTypeId: at(t.entryTypeId)! } : {}),
      })),
    })),
  };

  return { data: out, matched };
}
