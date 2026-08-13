import { nanoid } from "nanoid";
import { db } from "./index";
import { logDeletions, newBatchId } from "./deletions";
import { toLocalDateValue } from "@/lib/utils";
import { matchesSearch, normalizeSearch } from "@/lib/search";
import type {
  Activity,
  Category,
  CategoryModifier,
  SubCategory,
  Field,
  Entry,
  EntryValue,
  EntryValueWithType,
  EntryType,
  GlobalDimension,
  EntryWithContext,
  Goal,
  GoalTarget,
  GoalWithContext,
  Mod,
  Note,
  NoteBlock,
  EntryValueType,
  ScaleLabels,
} from "@/types";
import { SCALE_1_5, isScaleChoices } from "@/types";

const now = () => Date.now();
const id = () => nanoid(12);

// ============ Entry Types ============

const BUILT_IN_ENTRY_TYPES: Omit<
  EntryType,
  "id" | "createdAt" | "updatedAt"
>[] = [
  { name: "Money", unit: "$", valueType: "number", isBuiltIn: true, order: 1 },
  { name: "Quantity", unit: "pcs", valueType: "number", isBuiltIn: true, order: 2 },
  { name: "Duration", unit: "min", valueType: "number", isBuiltIn: true, order: 3 },
  { name: "Weight", unit: "kg", valueType: "number", isBuiltIn: true, order: 4 },
  { name: "Distance", unit: "km", valueType: "number", isBuiltIn: true, order: 5 },
  { name: "1–5 Scale", unit: "", valueType: "select", choices: ["1", "2", "3", "4", "5"], isBuiltIn: true, order: 6 },
  { name: "1–10 Scale", unit: "", valueType: "select", choices: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"], isBuiltIn: true, order: 7 },
  { name: "Calories", unit: "kcal", valueType: "number", isBuiltIn: true, order: 8 },
  { name: "Yes / No", unit: "", valueType: "boolean", isBuiltIn: true, order: 9 },
  { name: "Steps", unit: "steps", valueType: "number", isBuiltIn: true, order: 10 },
  { name: "Reps", unit: "reps", valueType: "number", isBuiltIn: true, order: 11 },
  { name: "Date Range", unit: "", valueType: "datetime-range", isBuiltIn: true, order: 12 },
];

/**
 * Arayüz İngilizceye geçerken yerleşik kayıtların ADI da değişti. Mevcut
 * kurulumlarda bunlar YENİDEN ADLANDIRILMALI, yenisi eklenmemeli: aksi halde
 * kullanıcının "Para ₺" ölçüsü dururken bir de "Money $" belirir, girdileri
 * eski ölçüde kalır. Birim değişmez — kullanıcının kayıtlı verisinin anlamı
 * ₺ ise ₺ kalır (para birimi ilerideki bir ayar).
 */
const RENAMED_ENTRY_TYPES: [from: string, to: string][] = [
  ["Para", "Money"],
  ["Miktar", "Quantity"],
  ["Süre", "Duration"],
  ["Ağırlık", "Weight"],
  ["Mesafe", "Distance"],
  ["1–5 Skala", "1–5 Scale"],
  ["1–10 Skala", "1–10 Scale"],
  ["Kalori", "Calories"],
  ["Evet / Hayır", "Yes / No"],
  ["Adım", "Steps"],
  ["Tekrar", "Reps"],
  ["Tarih Aralığı", "Date Range"],
];

/**
 * from → to yeniden adlandırma. Hedef ad zaten varsa dokunulmaz (kopya
 * oluşturmaz); kaynak yoksa yapacak bir şey yoktur.
 */
async function renameByName(
  table: typeof db.entryTypes | typeof db.mods | typeof db.categories,
  pairs: [string, string][]
): Promise<void> {
  for (const [from, to] of pairs) {
    const rows = await table.toArray();
    const target = rows.find((r) => r.name === to);
    if (target) continue;
    const source = rows.find((r) => r.name === from);
    if (source) await table.update(source.id, { name: to });
  }
}

export async function ensureBuiltInEntryTypes(): Promise<void> {
  // Önce Türkçe adları taşı — yoksa aşağıdaki "eksikleri tamamla" adımı
  // İngilizce karşılıklarını ikinci kopya olarak ekler
  await renameByName(db.entryTypes, RENAMED_ENTRY_TYPES);

  const existing = await db.entryTypes.toArray();

  // Deduplicate: keep oldest of each name, delete the rest
  const byName = new Map<string, EntryType[]>();
  for (const t of existing) {
    const arr = byName.get(t.name) ?? [];
    arr.push(t);
    byName.set(t.name, arr);
  }
  const toDelete: string[] = [];
  for (const [, types] of byName) {
    if (types.length > 1) {
      types.sort((a, b) => a.createdAt - b.createdAt);
      toDelete.push(...types.slice(1).map((t) => t.id));
    }
  }
  if (toDelete.length) await db.entryTypes.bulkDelete(toDelete);

  // Add any missing built-in types (check by name)
  const survivingNames = new Set(
    existing.filter((t) => !toDelete.includes(t.id)).map((t) => t.name)
  );
  const toAdd = BUILT_IN_ENTRY_TYPES.filter(
    (t) => !survivingNames.has(t.name)
  ).map(
    (t) =>
      ({ ...t, id: id(), createdAt: now(), updatedAt: now() }) satisfies EntryType
  );
  if (toAdd.length) await db.entryTypes.bulkAdd(toAdd);
}

export async function listEntryTypes(): Promise<EntryType[]> {
  const all = await db.entryTypes.toArray();
  return all.sort((a, b) => a.order - b.order);
}

export async function createEntryType(input: {
  name: string;
  unit: string;
  valueType?: import("@/types").EntryValueType;
  choices?: string[];
}): Promise<EntryType> {
  const count = await db.entryTypes.count();
  const entryType: EntryType = {
    id: id(),
    name: input.name,
    unit: input.unit,
    valueType: input.valueType ?? "number",
    ...(input.choices?.length ? { choices: input.choices } : {}),
    isBuiltIn: false,
    order: count + 1,
    createdAt: now(),
    updatedAt: now(),
  };
  await db.entryTypes.add(entryType);
  return entryType;
}

export async function updateEntryType(
  typeId: string,
  patch: Partial<Pick<EntryType, "name" | "unit" | "choices">>
): Promise<void> {
  await db.entryTypes.update(typeId, patch);
}

export async function deleteEntryType(entryTypeId: string): Promise<void> {
  await db.entryTypes.delete(entryTypeId);
}

// ============ Global Dimensions ============

export async function ensureBuiltInDimensions(): Promise<void> {
  const existing = await db.globalDimensions.toArray();
  const hasMoney = existing.some((d) => d.type === "money" && d.isBuiltIn);
  const hasTime = existing.some((d) => d.type === "time" && d.isBuiltIn);

  const toAdd: GlobalDimension[] = [];
  if (!hasMoney) {
    toAdd.push({
      id: id(),
      name: "Money",
      type: "money",
      isBuiltIn: true,
      createdAt: now(),
      updatedAt: now(),
    });
  }
  if (!hasTime) {
    toAdd.push({
      id: id(),
      name: "Time",
      type: "time",
      isBuiltIn: true,
      createdAt: now(),
      updatedAt: now(),
    });
  }
  if (toAdd.length) await db.globalDimensions.bulkAdd(toAdd);
}

export async function listDimensions(): Promise<GlobalDimension[]> {
  return db.globalDimensions.toArray();
}

// ============ Built-in Categories ============

const BUILT_IN_CATEGORIES = [
  {
    name: "Sleep",
    color: "#8b5cf6",
    icon: "Moon",
    subcategories: [{ name: "Night Sleep", icon: "🌙" }],
  },
] as const;

/** Yerleşik kategori ve onun alt kaleminin Türkçe adları (mevcut kurulumlar) */
const RENAMED_CATEGORIES: [string, string][] = [["Uyku", "Sleep"]];
const RENAMED_SUBCATEGORIES: [string, string][] = [
  ["Gece Uykusu", "Night Sleep"],
];

export async function ensureBuiltInCategories(): Promise<void> {
  await renameByName(db.categories, RENAMED_CATEGORIES);
  // Alt kalem adı yalnızca yerleşik kategorinin altındayken taşınır —
  // kullanıcının kendi "Gece Uykusu" kalemine dokunulmaz
  for (const cat of await db.categories.filter((c) => !!c.isBuiltIn).toArray()) {
    const subs = await db.subcategories
      .where("categoryId")
      .equals(cat.id)
      .toArray();
    for (const [from, to] of RENAMED_SUBCATEGORIES) {
      if (subs.some((s) => s.name === to)) continue;
      const source = subs.find((s) => s.name === from);
      if (source) await db.subcategories.update(source.id, { name: to });
    }
  }
  await ensureBuiltInCategoryTemplates();
}

async function ensureBuiltInCategoryTemplates(): Promise<void> {
  for (const template of BUILT_IN_CATEGORIES) {
    let cat = await db.categories.where("name").equals(template.name).first();
    if (!cat) {
      cat = await createCategory({
        name: template.name,
        color: template.color,
        icon: template.icon,
      });
    }
    if (!cat.isBuiltIn) {
      await db.categories.update(cat.id, { isBuiltIn: true });
    }
    // Şablon alt kategorileri eksikse tamamla (mevcut kurulumlar dahil)
    const subs = await db.subcategories
      .where("categoryId")
      .equals(cat.id)
      .toArray();
    const subNames = new Set(subs.map((s) => s.name.toLocaleLowerCase("en-US")));
    for (const sub of template.subcategories) {
      if (!subNames.has(sub.name.toLocaleLowerCase("en-US"))) {
        await createSubCategory({ categoryId: cat.id, name: sub.name, icon: sub.icon });
      }
    }
  }
}

// ============ İlk Açılış Tohumu ============

/**
 * Bomboş bir uygulamayla karşılaşan yeni kullanıcı kategori → alt kategori →
 * özellik zincirini kavrayamıyor. İlk açılışta bu zinciri gösteren örnek bir
 * yapı kurulur. Yerleşik DEĞİLler: sıradan kayıtlar, istenmeyeni silinir.
 *
 * `mods` kategoriye bağlanır ve alt kategorilere kendiliğinden yayılır;
 * alt kategorinin kendi `mods`'u ise ona özel eklenir (Yürüyüş'ün Mesafe'si
 * gibi) — böylece devralma ve özelleştirme birlikte görülür.
 */
/**
 * Özellik referansı. Düz metin: havuzdaki hazır özellik ("Money").
 * Nesne: kendi adıyla, kendi ölçümüyle yaratılacak özellik ("Body Weight",
 * sayıyla ölçülür, birimi kg) — özelliğin ölçümü kendi üzerinde taşıdığı
 * en iyi böyle görülüyor.
 */
type StarterMod = string | ({ name: string } & ModMeasure);

type StarterSub = {
  name: string;
  icon?: string;
  /** Sabit/düzenli kalem — analizde "düzenlileri hariç tut" anahtarını görünür kılar */
  regular?: boolean;
  mods?: StarterMod[];
  subs?: StarterSub[];
};

/**
 * Örnek yapı, tek başına bir öğretici: kullanıcı gezerken şunları görüyor —
 *  • kategori → alt kategori → alt kategori derinliği (Harcamalar › Fatura › Elektrik)
 *  • kategoriye bağlanan özelliğin alt ağaca inmesi (Harcamalar'ın "Para"sı)
 *  • sadece bir kaleme takılan özellik (Yürüyüş'ün "Mesafe"si)
 *  • kendi adıyla özellik, hazır bir ölçüyle (Sağlık › Kilo, ölçü: Ağırlık)
 *  • sabit kalemler (Kira, Fatura, Abonelik)
 *  • farklı ölçü türleri: ₺, dk, km, adım, kg, adet, 1–5 skala, evet/hayır
 * Örnek GİRDİ yok — analizleri sahte veriyle kirletmemek için.
 */
const STARTER_CATEGORIES: {
  name: string;
  color: string;
  icon: string;
  mods: StarterMod[];
  subs: StarterSub[];
}[] = [
  {
    name: "Expenses",
    color: "#f59e0b",
    icon: "Wallet",
    mods: ["Money"],
    subs: [
      { name: "Groceries", icon: "ShoppingCart" },
      {
        name: "Food & Drink",
        icon: "Utensils",
        subs: [
          { name: "Cafe", icon: "Coffee" },
          { name: "Restaurant", icon: "Salad" },
          { name: "Takeaway", icon: "Croissant" },
        ],
      },
      {
        name: "Transport",
        icon: "Car",
        subs: [
          { name: "Fuel", icon: "Flame" },
          { name: "Public Transit", icon: "Users" },
        ],
      },
      {
        name: "Bills",
        icon: "Zap",
        regular: true,
        subs: [
          { name: "Electricity", icon: "Zap" },
          { name: "Water", icon: "Droplet" },
          { name: "Internet", icon: "Laptop" },
          { name: "Phone", icon: "Phone" },
        ],
      },
      { name: "Rent", icon: "Home", regular: true },
      { name: "Subscriptions", icon: "Tv", regular: true },
    ],
  },
  {
    name: "Fitness",
    color: "#10b981",
    icon: "Dumbbell",
    mods: ["Duration"],
    subs: [
      {
        name: "Walking",
        icon: "Footprints",
        mods: ["Distance", { name: "Steps", valueType: "number" }],
      },
      { name: "Running", icon: "Timer", mods: ["Distance"] },
      { name: "Cycling", icon: "Bike", mods: ["Distance"] },
      {
        name: "Workout",
        icon: "Dumbbell",
        mods: [{ name: "Reps", valueType: "number" }],
      },
    ],
  },
  {
    name: "Study",
    color: "#6366f1",
    icon: "GraduationCap",
    mods: ["Duration"],
    subs: [
      { name: "Lessons", icon: "GraduationCap" },
      {
        name: "Reading",
        icon: "Book",
        mods: [{ name: "Pages", valueType: "number" }],
      },
      { name: "Projects", icon: "Laptop" },
    ],
  },
  {
    name: "Health",
    color: "#ec4899",
    icon: "HeartPulse",
    mods: [],
    subs: [
      {
        name: "Body Weight",
        icon: "Stethoscope",
        mods: [{ name: "Body Weight", valueType: "number", unit: "kg" }],
      },
      {
        name: "Water",
        icon: "Droplet",
        mods: [{ name: "Glasses of Water", valueType: "number" }],
      },
      {
        name: "Mood",
        icon: "Smile",
        mods: [{ name: "Mood", valueType: "select", choices: SCALE_1_5 }],
      },
      {
        name: "Medication",
        icon: "Pill",
        regular: true,
        mods: [{ name: "Medication Taken", valueType: "boolean" }],
      },
    ],
  },
];

/** Tohum bir kez atılır; kullanıcı örnekleri silerse geri gelmemeli. */
const STARTER_FLAG = "routine-starter-seeded";

/**
 * Örnek yapıyı yalnızca gerçekten boş bir kurulumda kur. Kullanıcının kendi
 * kategorisi ya da tek bir girdisi bile varsa (mevcut kullanıcılar, yedekten
 * dönenler) hiç dokunulmaz — o durumda da bayrak yazılır ki her açılışta
 * tekrar bakılmasın.
 */
export async function ensureStarterData(): Promise<void> {
  if (typeof window === "undefined") return;
  if (localStorage.getItem(STARTER_FLAG)) return;

  const [categories, entryCount] = await Promise.all([
    db.categories.toArray(),
    db.entries.count(),
  ]);
  const inUse = entryCount > 0 || categories.some((c) => !c.isBuiltIn);

  if (!inUse) {
    for (const template of STARTER_CATEGORIES) {
      const cat = await createCategory({
        name: template.name,
        color: template.color,
        icon: template.icon,
      });
      // Önce kategoriye bağla: sonra açılan alt kategoriler devralır
      for (const ref of template.mods) {
        const mod = await resolveStarterMod(ref);
        if (mod) await attachMod("category", cat.id, mod.id);
      }
      await seedStarterSubs(cat.id, undefined, template.subs);
    }
  }

  localStorage.setItem(STARTER_FLAG, "1");
}

/** Havuzdaki atomu bulur; nesne referansında yoksa ölçüsüyle yaratır. */
async function resolveStarterMod(ref: StarterMod): Promise<Mod | undefined> {
  const name = typeof ref === "string" ? ref : ref.name;
  const existing = await findModByName(name);
  if (existing || typeof ref === "string") return existing;
  const { mod } = await createMod(name, ref);
  return mod;
}

/** Alt kategori ağacını özyinelemeli kurar — çocuklar üstünün özelliklerini devralır. */
async function seedStarterSubs(
  categoryId: string,
  parentId: string | undefined,
  subs: StarterSub[]
): Promise<void> {
  for (const s of subs) {
    const sub = await createSubCategory({
      categoryId,
      parentId,
      name: s.name,
      icon: s.icon,
    });
    if (s.regular) {
      await db.subcategories.update(sub.id, { isRegular: true });
    }
    // Kaleme özel özellikler — çocuklar bunları da devralsın diye onlardan önce
    for (const ref of s.mods ?? []) {
      const mod = await resolveStarterMod(ref);
      if (mod) await attachMod("subcategory", sub.id, mod.id);
    }
    if (s.subs?.length) await seedStarterSubs(categoryId, sub.id, s.subs);
  }
}

// ============ Categories ============

export async function listCategories(): Promise<Category[]> {
  const all = await db.categories.toArray();
  return all.sort((a, b) => a.order - b.order);
}

export async function getCategory(catId: string): Promise<Category | undefined> {
  return db.categories.get(catId);
}

export async function createCategory(input: {
  name: string;
  color: string;
  icon?: string;
}): Promise<Category> {
  const order = (await db.categories.count()) + 1;
  const cat: Category = {
    id: id(),
    name: input.name,
    color: input.color,
    icon: input.icon,
    order,
    createdAt: now(),
    updatedAt: now(),
  };
  await db.categories.add(cat);
  return cat;
}

export async function updateCategory(
  catId: string,
  patch: Partial<Pick<Category, "name" | "color" | "icon">>
): Promise<void> {
  await db.categories.update(catId, { ...patch, updatedAt: now() });
  // Kök alt kategori kategorinin adını/ikonunu yansıtır — senkron tut
  if (patch.name || patch.icon) {
    const root = await db.subcategories
      .where("categoryId")
      .equals(catId)
      .filter((s) => !!s.isCategoryRoot)
      .first();
    if (root) {
      await db.subcategories.update(root.id, {
        ...(patch.name ? { name: patch.name } : {}),
        ...(patch.icon ? { icon: patch.icon } : {}),
        updatedAt: now(),
      });
    }
  }
}

export async function deleteCategory(catId: string): Promise<string> {
  const batchId = newBatchId();
  const subs = await db.subcategories.where("categoryId").equals(catId).toArray();
  // Kök dahil tüm alt ağaç aynı grupta silinsin ki "Geri al" kategoriyi
  // içindeki her şeyle birlikte döndürsün
  for (const sub of subs) await deleteSubCategory(sub.id, "all", batchId);
  await db.transaction(
    "rw",
    [db.categories, db.categoryModifiers, db.deletions],
    async () => {
      const attachments = await db.categoryModifiers
        .filter((m) => m.targetType === "category" && m.targetId === catId)
        .toArray();
      const category = await db.categories.get(catId);
      await logDeletions("categoryModifiers", attachments, batchId);
      if (category) await logDeletions("categories", [category], batchId);
      await db.categoryModifiers.bulkDelete(attachments.map((a) => a.id));
      await db.categories.delete(catId);
    }
  );
  return batchId;
}

// ============ SubCategories ============

export async function listSubCategoriesByCategory(
  catId: string
): Promise<SubCategory[]> {
  const all = await db.subcategories.where("categoryId").equals(catId).toArray();
  return all
    .filter((s) => !s.parentId && !s.isCategoryRoot)
    .sort((a, b) => a.order - b.order);
}

/**
 * Kategorinin gizli kök alt kategorisini getir; yoksa yarat.
 * Girdi/hedef doğrudan kategoriye eklenirken bu kök kullanılır —
 * mevcut subcategoryId tabanlı akış hiç değişmez.
 */
export async function getOrCreateCategoryRootSub(
  categoryId: string
): Promise<SubCategory> {
  const existing = await db.subcategories
    .where("categoryId")
    .equals(categoryId)
    .filter((s) => !!s.isCategoryRoot)
    .first();
  if (existing) return existing;

  const cat = await db.categories.get(categoryId);
  if (!cat) throw new Error("Kategori bulunamadı");

  const sub: SubCategory = {
    id: id(),
    categoryId,
    name: cat.name,
    ...(cat.icon ? { icon: cat.icon } : {}),
    isCategoryRoot: true,
    order: 0,
    createdAt: now(),
    updatedAt: now(),
  };
  await db.subcategories.add(sub);
  await inheritModifiers("category", categoryId, sub.id);
  return sub;
}

export async function listSubCategoriesByParent(
  parentId: string
): Promise<SubCategory[]> {
  const all = await db.subcategories.where("parentId").equals(parentId).toArray();
  return all.sort((a, b) => a.order - b.order);
}

export async function getSubCategory(
  subId: string
): Promise<SubCategory | undefined> {
  return db.subcategories.get(subId);
}

export async function createSubCategory(input: {
  categoryId: string;
  parentId?: string;
  name: string;
  icon?: string;
}): Promise<SubCategory> {
  const siblings = await db.subcategories
    .where("categoryId")
    .equals(input.categoryId)
    .count();
  const sub: SubCategory = {
    id: id(),
    categoryId: input.categoryId,
    ...(input.parentId ? { parentId: input.parentId } : {}),
    name: input.name,
    icon: input.icon,
    order: siblings + 1,
    createdAt: now(),
    updatedAt: now(),
  };
  await db.subcategories.add(sub);

  // Inherit modifiers from parent (subcategory or category)
  const parentType = input.parentId ? "subcategory" : "category";
  const parentId = input.parentId ?? input.categoryId;
  await inheritModifiers(parentType, parentId, sub.id);

  return sub;
}

export async function updateSubCategory(
  subId: string,
  patch: Partial<Pick<SubCategory, "name" | "icon" | "isRegular">>
): Promise<void> {
  await db.subcategories.update(subId, { ...patch, updatedAt: now() });
}

/**
 * Girdi ekleme v2 ağında düğümleri çokgen köşelerine yerleştirme = kardeşler
 * arası yeniden sıralama. Verilen id sırasına göre order = index atanır.
 */
export async function reorderCategories(orderedIds: string[]): Promise<void> {
  await db.transaction("rw", db.categories, async () => {
    for (let i = 0; i < orderedIds.length; i++) {
      await db.categories.update(orderedIds[i], { order: i + 1, updatedAt: now() });
    }
  });
}
export async function reorderSubcategories(orderedIds: string[]): Promise<void> {
  await db.transaction("rw", db.subcategories, async () => {
    for (let i = 0; i < orderedIds.length; i++) {
      await db.subcategories.update(orderedIds[i], { order: i + 1, updatedAt: now() });
    }
  });
}

/**
 * Alt kategoriyi sil.
 * - mode "all" (varsayılan): kendisi, tüm torunları ve onların girdileri kalıcı silinir.
 * - mode "promote": yalnızca bu düğüm kaldırılır; girdileri ve doğrudan çocukları
 *   bir üst seviyeye (üst alt kategori; yoksa kategorinin kökü) taşınır — hiçbir
 *   girdi silinmez. Analizler parentId zincirini canlı okuduğundan yeni hiyerarşiye
 *   kendiliğinden uyar.
 */
export async function deleteSubCategory(
  subId: string,
  mode: "all" | "promote" = "all",
  batchId = newBatchId()
): Promise<string> {
  const sub = await db.subcategories.get(subId);
  if (!sub || sub.isCategoryRoot) return batchId;

  if (mode === "promote") {
    // Girdilerin taşınacağı hedef: üst alt kategori; kök seviyedeyse kategorinin kökü
    const entryTargetSubId = sub.parentId
      ? sub.parentId
      : (await getOrCreateCategoryRootSub(sub.categoryId)).id;
    // Çocukların yeni üstü: bu düğümün üstü (undefined → kök seviye)
    const childParentId = sub.parentId;
    const children = await db.subcategories
      .where("parentId")
      .equals(subId)
      .toArray();
    // Çocuklar hedef seviyenin mevcut kardeşlerinin ardına eklensin
    const baseOrder = await db.subcategories
      .where("categoryId")
      .equals(sub.categoryId)
      .filter(
        (s) =>
          !s.isCategoryRoot &&
          s.id !== subId &&
          (s.parentId ?? undefined) === (childParentId ?? undefined)
      )
      .count();

    await db.transaction(
      "rw",
      [
        db.subcategories,
        db.entries,
        db.fields,
        db.categoryModifiers,
        db.deletions,
      ],
      async () => {
        // Girdiler ve (varsa eski) alanlar üst seviyeye — değerler geçerli kalsın
        await db.entries
          .where("subcategoryId")
          .equals(subId)
          .modify({ subcategoryId: entryTargetSubId, updatedAt: now() });
        await db.fields
          .where("subcategoryId")
          .equals(subId)
          .modify({ subcategoryId: entryTargetSubId, updatedAt: now() });
        // Çocukları bir seviye yukarı al (promote) — undefined parentId kökü demektir
        let ord = baseOrder + 1;
        for (const c of children) {
          await db.subcategories.update(c.id, {
            parentId: childParentId,
            order: ord++,
            updatedAt: now(),
          });
        }
        // Bu düğümün kendi mod atamalarını sil, sonra düğümü sil
        const attachments = await db.categoryModifiers
          .filter((m) => m.targetType === "subcategory" && m.targetId === subId)
          .toArray();
        await logDeletions("categoryModifiers", attachments, batchId);
        await logDeletions("subcategories", [sub], batchId);
        await db.categoryModifiers.bulkDelete(attachments.map((a) => a.id));
        await db.subcategories.delete(subId);
      }
    );
    return batchId;
  }

  // mode === "all": özyinelemeli tam silme — hepsi tek grupta
  const children = await db.subcategories.where("parentId").equals(subId).toArray();
  for (const child of children) await deleteSubCategory(child.id, "all", batchId);

  const fields = await db.fields.where("subcategoryId").equals(subId).toArray();
  const entries = await db.entries.where("subcategoryId").equals(subId).toArray();
  const entryIds = entries.map((e) => e.id);
  // Girdileri ve değerlerini toplu yol siler: aktivite temizliği ve günlük orada
  if (entryIds.length) await deleteEntries(entryIds, batchId);

  await db.transaction(
    "rw",
    [db.fields, db.subcategories, db.categoryModifiers, db.deletions],
    async () => {
      const attachments = await db.categoryModifiers
        .filter((m) => m.targetType === "subcategory" && m.targetId === subId)
        .toArray();
      await logDeletions("fields", fields, batchId);
      await logDeletions("categoryModifiers", attachments, batchId);
      await logDeletions("subcategories", [sub], batchId);

      if (fields.length) await db.fields.bulkDelete(fields.map((f) => f.id));
      await db.categoryModifiers.bulkDelete(attachments.map((a) => a.id));
      await db.subcategories.delete(subId);
    }
  );
  return batchId;
}

/**
 * Alt kategoriyi başka bir üstün altına taşır — target.parentId verilirse o alt
 * kategorinin, verilmezse target.categoryId kategorisinin ana seviyesine.
 * Alt ağacı (torunları) ve girdileri birlikte gelir: girdiler subcategoryId ile
 * bağlı olduğundan dokunulmaz; kategori değişiyorsa tüm alt ağacın denormalize
 * categoryId'si güncellenir. Analizler parentId zincirini canlı okuduğundan yeni
 * hiyerarşiye kendiliğinden uyar. Döngü koruması: kendi alt ağacına taşınamaz.
 */
export async function moveSubCategory(
  subId: string,
  target: { categoryId: string; parentId?: string }
): Promise<boolean> {
  const sub = await db.subcategories.get(subId);
  if (!sub || sub.isCategoryRoot) return false;
  const all = await db.subcategories.toArray();

  let destCategoryId = target.categoryId;
  const destParentId = target.parentId;
  if (destParentId !== undefined) {
    if (destParentId === subId) return false;
    const parent = all.find((s) => s.id === destParentId);
    if (!parent || parent.isCategoryRoot) return false;
    // Hedef üstün kategorisi esas alınır (çağıran eski bilgi geçirmiş olabilir)
    destCategoryId = parent.categoryId;
    // Döngü koruması: hedef üst, taşınanın torunu olamaz
    let cur: SubCategory | undefined = parent;
    let hops = 0;
    while (cur && hops++ < 50) {
      if (cur.id === subId) return false;
      cur = cur.parentId ? all.find((s) => s.id === cur!.parentId) : undefined;
    }
  }
  // Yerinde bırakma — no-op
  if (
    sub.categoryId === destCategoryId &&
    (sub.parentId ?? undefined) === destParentId
  )
    return false;

  // Alt ağaç (kendisi dahil)
  const subtreeIds = [subId];
  for (let i = 0; i < subtreeIds.length; i++) {
    for (const s of all)
      if (s.parentId === subtreeIds[i]) subtreeIds.push(s.id);
  }

  const order =
    all.filter(
      (s) =>
        s.categoryId === destCategoryId &&
        !s.isCategoryRoot &&
        (s.parentId ?? undefined) === destParentId &&
        s.id !== subId
    ).length + 1;

  await db.transaction("rw", db.subcategories, async () => {
    // Dexie update semantiği: undefined verilen alan kayıttan silinir (ana seviye)
    await db.subcategories.update(subId, {
      categoryId: destCategoryId,
      parentId: destParentId,
      order,
      updatedAt: now(),
    });
    if (sub.categoryId !== destCategoryId) {
      for (const descId of subtreeIds.slice(1)) {
        await db.subcategories.update(descId, {
          categoryId: destCategoryId,
          updatedAt: now(),
        });
      }
    }
  });
  return true;
}

// ============ Mod Havuzu (global atomlar) ============

const normModName = (s: string) => s.trim().toLocaleLowerCase("en-US");

export type ModWithType = Mod & { entryType: EntryType };

/**
 * Özelliğin ölçümünü eski `EntryType` şeklinde sunar.
 *
 * v18'de ölçü ayrı nesne olmaktan çıktı ama onu okuyan ~200 nokta var (analiz,
 * girdi formu, hedefler, kartlar). Hepsini aynı anda değiştirmek yerine, mod
 * kendi ölçümünü bu şekille veriyor — okuyan taraf değişmiyor. Kaynak artık
 * tek: modun kendisi.
 */
export function measureOf(mod: Mod): EntryType {
  return {
    id: mod.entryTypeId ?? mod.id,
    name: mod.name,
    unit: mod.unit ?? "",
    valueType: mod.valueType ?? "number",
    ...(mod.choices?.length ? { choices: mod.choices } : {}),
    isBuiltIn: mod.isBuiltIn ?? false,
    order: 0,
    createdAt: mod.createdAt,
    updatedAt: mod.updatedAt,
  };
}

/**
 * Hedef/form anahtarı: bir atamayı temsil eden özelliğin id'si.
 * Eski (v9 öncesi) atamalarda modId yok — o zaman atamanın kendi id'si.
 */
export const targetKeyOf = (a: { modId?: string; id: string }): string =>
  a.modId ?? a.id;

/** Özelliğin ölçüm ayarı — yaratırken ve düzenlerken tek parça halinde gezer */
export interface ModMeasure {
  valueType: EntryValueType;
  unit?: string;
  choices?: string[];
  scaleLabels?: ScaleLabels;
}

/** Türe uymayan alanları düşürerek kaydet — tür değişince eski yapılandırma
 *  kayıtta asılı kalmasın (birim seçip çoktan seçmeliye dönmek gibi) */
export const measureFieldsOf = (m: ModMeasure) => {
  const choices =
    m.valueType === "select" && m.choices?.length ? m.choices : undefined;
  const low = m.scaleLabels?.low?.trim();
  const high = m.scaleLabels?.high?.trim();
  const labeled = isScaleChoices(choices) && (low || high);
  return {
    valueType: m.valueType,
    unit: m.valueType === "number" ? m.unit?.trim() || undefined : undefined,
    choices,
    scaleLabels: labeled
      ? { ...(low ? { low } : {}), ...(high ? { high } : {}) }
      : undefined,
  };
};

/**
 * Uygulamayla gelen özellikler — kurulumda hazır bulunsunlar diye. Ayrıcalıkları
 * YOK: kullanıcının kendi yarattıklarıyla aynı kayıtlar, yeniden adlandırılır,
 * ölçümü değiştirilir, silinir. "Yerleşik özellik" diye korunan bir sınıf
 * bırakmadık — kullanıcı kendi uygulamasında neyi tutacağına kendi karar verir.
 *
 * Başlangıç yapısı (STARTER_TEMPLATE) bunlara ADIYLA başvurur, o yüzden örnek
 * yapı kurulmadan önce ekilmeleri gerekir.
 */
const SEED_FEATURES: ({ name: string } & ModMeasure)[] = [
  { name: "Money", valueType: "number", unit: "₺" },
  { name: "Duration", valueType: "number", unit: "min" },
  { name: "Distance", valueType: "number", unit: "km" },
  { name: "Quantity", valueType: "number", unit: "pcs" },
  { name: "Weight", valueType: "number", unit: "kg" },
  { name: "Calories", valueType: "number", unit: "kcal" },
  { name: "Sleep Duration", valueType: "datetime-range" },
  { name: "Sleep Quality", valueType: "select", choices: SCALE_1_5 },
  { name: "Mood", valueType: "select", choices: SCALE_1_5 },
];

/**
 * Hazır özellikleri YALNIZCA boş kuruluma ek.
 *
 * Eskiden bu iş her açılışta çalışıyor, eksik olanı geri koyuyor ve listede
 * olmayan "yerleşik" kaydı siliyordu. Özellikler artık düzenlenebilir ve
 * silinebilir olduğuna göre bu davranış kullanıcıya karşı çalışırdı: sildiği
 * özellik geri gelir, verdiği ad geri alınırdı. Bu yüzden tek kriter var —
 * havuz tamamen boşsa ek, değilse hiç dokunma.
 */
export async function seedDefaultFeatures(): Promise<void> {
  if ((await db.mods.count()) > 0) return;
  await db.mods.bulkAdd(
    SEED_FEATURES.map((f) => ({
      id: id(),
      name: f.name,
      ...measureFieldsOf(f),
      createdAt: now(),
      updatedAt: now(),
    }))
  );
}

export async function listMods(): Promise<ModWithType[]> {
  const mods = await db.mods.toArray();
  return mods
    .map((m) => ({ ...m, entryType: measureOf(m) }))
    .sort(
      (a, b) =>
        Number(b.isBuiltIn ?? false) - Number(a.isBuiltIn ?? false) ||
        a.name.localeCompare(b.name, "en")
    );
}

export async function findModByName(name: string): Promise<Mod | undefined> {
  const n = normModName(name);
  return db.mods.filter((m) => normModName(m.name) === n).first();
}

/** İsim tekildir: aynı adla ikinci atom yaratılamaz — var olan döner. */
export async function createMod(
  name: string,
  measure: ModMeasure
): Promise<{ mod: Mod; created: boolean }> {
  const existing = await findModByName(name);
  if (existing) return { mod: existing, created: false };
  const mod: Mod = {
    id: id(),
    name: name.trim(),
    ...measureFieldsOf(measure),
    isBuiltIn: false,
    createdAt: now(),
    updatedAt: now(),
  };
  await db.mods.add(mod);
  return { mod, created: true };
}

/** Yeniden adlandırma da tekillik korur; çakışmada false döner. */
export async function renameMod(modId: string, name: string): Promise<boolean> {
  const clash = await findModByName(name);
  if (clash && clash.id !== modId) return false;
  await db.mods.update(modId, { name: name.trim() });
  return true;
}

/**
 * Özelliğin nasıl ölçüldüğünü değiştir. Ölçüm modun üzerinde durduğu için tek
 * kayıt güncellenir — atamaların denormalize kopyasını senkronlama derdi bitti.
 *
 * Eskiden kaydedilmiş değerler ham metin olarak durur; tür değişince
 * okunamayan değer olabileceği için arayüz kullanıcıyı uyarır.
 */
export async function setModMeasure(
  modId: string,
  measure: ModMeasure
): Promise<void> {
  await db.mods.update(modId, {
    ...measureFieldsOf(measure),
    // Havuza bağ artık anlamsız — bu özellik kendi ölçümünü taşıyor
    entryTypeId: undefined,
  });
}

/**
 * Özelliği sil — atamaları ve kayıtlı değerleriyle birlikte, tek geri
 * alınabilir küme olarak.
 *
 * Değerler eskiden bırakılıyordu ("ölçü adına düşer"); ölçü ayrı bir nesneyken
 * hâlâ bir adları vardı. Artık ölçüm özelliğin üzerinde, yani özellik gidince
 * değer sahipsiz kalıyor: ne adı ne birimi olan, hiçbir yerde okunmayan bir
 * satır. Sessiz çöp bırakmak yerine siliyoruz — silme günlüğü sayesinde
 * "Geri al" hepsini birden geri getirir.
 */
export async function deleteMod(modId: string): Promise<string> {
  const batchId = newBatchId();
  await db.transaction(
    "rw",
    [db.mods, db.categoryModifiers, db.entryValues, db.deletions],
    async () => {
      const mod = await db.mods.get(modId);
      if (!mod) return;
      const attachments = await db.categoryModifiers
        .filter((a) => a.modId === modId)
        .toArray();
      const values = await db.entryValues.where("modId").equals(modId).toArray();

      await logDeletions("mods", [mod], batchId);
      await logDeletions("categoryModifiers", attachments, batchId);
      await logDeletions("entryValues", values, batchId);

      await db.entryValues.bulkDelete(values.map((v) => v.id));
      await db.categoryModifiers.bulkDelete(attachments.map((a) => a.id));
      await db.mods.delete(modId);
    }
  );
  return batchId;
}

// ============ Atamalar (mod ↔ kategori/alt kategori) ============

export type CategoryModifierWithType = CategoryModifier & {
  mod?: Mod;
  entryType: EntryType;
};

export async function listModifiersForTarget(
  targetType: "category" | "subcategory",
  targetId: string
): Promise<CategoryModifierWithType[]> {
  const attachments = await db.categoryModifiers
    .where("[targetType+targetId]")
    .equals([targetType, targetId])
    .toArray()
    .catch(() =>
      db.categoryModifiers
        .filter((m) => m.targetType === targetType && m.targetId === targetId)
        .toArray()
    );
  attachments.sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);

  const modIds = [
    ...new Set(attachments.map((a) => a.modId).filter((x): x is string => !!x)),
  ];
  const mods = modIds.length ? await db.mods.bulkGet(modIds) : [];
  const modMap = new Map(mods.filter(Boolean).map((m) => [m!.id, m!]));

  // Ölçüm modun kendi üzerinde; atamanın denormalize entryTypeId'si artık
  // okunmuyor. Modu bulunamayan atama (bozuk kalıntı) listeye girmez.
  const out: CategoryModifierWithType[] = [];
  for (const a of attachments) {
    const mod = a.modId ? modMap.get(a.modId) : undefined;
    if (!mod) continue;
    out.push({ ...a, name: mod.name, mod, entryType: measureOf(mod) });
  }
  return out;
}

/** Havuzdaki bir modu hedefe bağla (varsa dokunma) ve alt kategorilere yay. */
export async function attachMod(
  targetType: "category" | "subcategory",
  targetId: string,
  modId: string
): Promise<CategoryModifier> {
  const mod = await db.mods.get(modId);
  if (!mod) throw new Error("Mod bulunamadı");

  const existing = await db.categoryModifiers
    .filter((a) => a.targetType === targetType && a.targetId === targetId)
    .toArray();
  const already = existing.find((a) => a.modId === modId);
  if (already) {
    await propagateModToDescendants(targetType, targetId, mod);
    return already;
  }

  const attachment: CategoryModifier = {
    id: id(),
    modId,
    targetType,
    targetId,
    order: existing.length + 1,
    createdAt: now(),
    updatedAt: now(),
  };
  await db.categoryModifiers.add(attachment);
  await propagateModToDescendants(targetType, targetId, mod);
  return attachment;
}

async function propagateModToDescendants(
  parentType: "category" | "subcategory",
  parentId: string,
  mod: Mod
): Promise<void> {
  let children: SubCategory[];
  if (parentType === "category") {
    children = await db.subcategories
      .where("categoryId")
      .equals(parentId)
      .filter((s) => !s.parentId)
      .toArray();
  } else {
    children = await db.subcategories
      .where("parentId")
      .equals(parentId)
      .toArray();
  }

  for (const child of children) {
    const already = await db.categoryModifiers
      .filter(
        (a) => a.targetType === "subcategory" && a.targetId === child.id && a.modId === mod.id
      )
      .first();
    if (!already) {
      const count = await db.categoryModifiers
        .filter((a) => a.targetType === "subcategory" && a.targetId === child.id)
        .count();
      await db.categoryModifiers.add({
        id: id(),
        modId: mod.id,
        targetType: "subcategory",
        targetId: child.id,
            order: count + 1,
        createdAt: now(),
        updatedAt: now(),
      });
    }
    await propagateModToDescendants("subcategory", child.id, mod);
  }
}

export async function removeModifier(modifierId: string): Promise<void> {
  await db.categoryModifiers.delete(modifierId);
}

/** Hedefin altındaki tüm alt kategori id'leri (her derinlikte). */
async function listDescendantSubIds(
  targetType: "category" | "subcategory",
  targetId: string
): Promise<string[]> {
  if (targetType === "category") {
    const subs = await db.subcategories
      .where("categoryId")
      .equals(targetId)
      .toArray();
    return subs.map((s) => s.id);
  }
  const ids: string[] = [];
  let frontier = [targetId];
  while (frontier.length) {
    const children = await db.subcategories
      .where("parentId")
      .anyOf(frontier)
      .toArray();
    frontier = children.map((c) => c.id);
    ids.push(...frontier);
  }
  return ids;
}

/** Aynı özelliğin hedefin altındaki alt kategorilerde kaç ataması var? */
export async function countDescendantModAttachments(
  targetType: "category" | "subcategory",
  targetId: string,
  modId: string
): Promise<number> {
  const ids = new Set(await listDescendantSubIds(targetType, targetId));
  if (!ids.size) return 0;
  return db.categoryModifiers
    .filter(
      (a) =>
        a.targetType === "subcategory" && ids.has(a.targetId) && a.modId === modId
    )
    .count();
}

/**
 * Atamayı kaldır ve aynı özelliği hedefin altındaki tüm alt kategorilerden de
 * sök. Girdi değerlerine dokunmaz — özellik havuzda, kayıtlar yerinde kalır.
 */
export async function removeModifierCascade(modifierId: string): Promise<void> {
  const att = await db.categoryModifiers.get(modifierId);
  if (!att) return;
  const ids = new Set(
    await listDescendantSubIds(att.targetType, att.targetId)
  );
  await db.transaction("rw", db.categoryModifiers, async () => {
    await db.categoryModifiers.delete(modifierId);
    if (att.modId && ids.size) {
      await db.categoryModifiers
        .filter(
          (a) =>
            a.targetType === "subcategory" &&
            ids.has(a.targetId) &&
            a.modId === att.modId
        )
        .delete();
    }
  });
}

export async function inheritModifiers(
  sourceType: "category" | "subcategory",
  sourceId: string,
  newSubcategoryId: string
): Promise<void> {
  const sourceAttachments = await db.categoryModifiers
    .filter((a) => a.targetType === sourceType && a.targetId === sourceId)
    .toArray();
  if (!sourceAttachments.length) return;
  const inherited: CategoryModifier[] = sourceAttachments.map((a, i) => ({
    id: id(),
    modId: a.modId,
    targetType: "subcategory" as const,
    targetId: newSubcategoryId,
    entryTypeId: a.entryTypeId,
    order: i + 1,
    createdAt: now(),
    updatedAt: now(),
  }));
  await db.categoryModifiers.bulkAdd(inherited);
}

// ============ Fields ============

export async function listFieldsBySubCategory(
  subId: string
): Promise<Field[]> {
  const all = await db.fields.where("subcategoryId").equals(subId).toArray();
  return all.sort((a, b) => a.order - b.order);
}

export async function getField(fieldId: string): Promise<Field | undefined> {
  return db.fields.get(fieldId);
}

export async function createField(input: Omit<Field, "id" | "order" | "createdAt" | "updatedAt">): Promise<Field> {
  const siblings = await db.fields
    .where("subcategoryId")
    .equals(input.subcategoryId)
    .count();
  const field: Field = {
    ...input,
    id: id(),
    order: siblings + 1,
    createdAt: now(),
    updatedAt: now(),
  };
  await db.fields.add(field);
  return field;
}

export async function updateField(
  fieldId: string,
  patch: Partial<Omit<Field, "id" | "subcategoryId" | "createdAt">>
): Promise<void> {
  await db.fields.update(fieldId, { ...patch, updatedAt: now() });
}

export async function deleteField(fieldId: string): Promise<void> {
  await db.transaction("rw", [db.fields, db.entryValues], async () => {
    await db.entryValues.where("fieldId").equals(fieldId).delete();
    await db.fields.delete(fieldId);
  });
}

// ============ Entries ============

// ============ Activities ============

export async function createActivity(input: {
  name: string;
  icon?: string;
  occurredAt?: number;
}): Promise<Activity> {
  const a: Activity = {
    id: id(),
    name: input.name.trim(),
    icon: input.icon,
    occurredAt: input.occurredAt ?? now(),
    createdAt: now(),
    updatedAt: now(),
  };
  await db.activities.add(a);
  return a;
}

/** Aktivite kaydını (yoksa) verilen id ile yaratır — akış id'yi bellekte üretir,
 * kayıt ilk girdi kaydedilirken yazılır; isim verip vazgeçen çöp kayıt bırakmaz. */
export async function ensureActivity(input: {
  id: string;
  name: string;
  occurredAt: number;
}): Promise<void> {
  const existing = await db.activities.get(input.id);
  if (existing) return;
  await db.activities.add({
    id: input.id,
    name: input.name.trim(),
    occurredAt: input.occurredAt,
    createdAt: now(),
    updatedAt: now(),
  });
}

export async function updateActivity(
  activityId: string,
  patch: Partial<Pick<Activity, "name" | "icon">>
): Promise<void> {
  await db.activities.update(activityId, { ...patch, updatedAt: now() });
}

/** Geçmiş aktivite adları — en yeniden eskiye, tekilleştirilmiş (öneri çipleri) */
export async function listActivityNameSuggestions(limit = 8): Promise<string[]> {
  const all = await db.activities.orderBy("createdAt").reverse().toArray();
  const seen = new Set<string>();
  const out: string[] = [];
  for (const a of all) {
    const key = a.name.trim().toLocaleLowerCase("en-US");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(a.name);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Aktiviteyi siler. mode "disband": girdiler bağımsız girdi olarak kalır
 * (activityId kaldırılır); "with-entries": içindeki tüm girdiler değerleriyle
 * birlikte silinir.
 */
export async function deleteActivity(
  activityId: string,
  mode: "disband" | "with-entries"
): Promise<void> {
  const entries = await db.entries
    .where("activityId")
    .equals(activityId)
    .toArray();
  if (mode === "with-entries") {
    for (const e of entries) await deleteEntry(e.id);
  } else {
    for (const e of entries) {
      // Dexie update semantiği: undefined verilen alan kayıttan silinir
      await db.entries.update(e.id, { activityId: undefined, updatedAt: now() });
    }
  }
  await db.activities.delete(activityId);
}

// ============ Parallel Subcategories ============

export type ParallelSub = SubCategory & { categoryName: string };

export async function findParallelSubcategories(subId: string): Promise<ParallelSub[]> {
  const sub = await db.subcategories.get(subId);
  if (!sub) return [];
  const nameLower = sub.name.toLowerCase().trim();
  const allSubs = await db.subcategories.toArray();
  const matches = allSubs.filter(
    (s) =>
      s.id !== subId &&
      s.categoryId !== sub.categoryId &&
      s.name.toLowerCase().trim() === nameLower
  );
  if (!matches.length) return [];
  const catIds = [...new Set(matches.map((s) => s.categoryId))];
  const cats = await db.categories.bulkGet(catIds);
  const catMap = new Map(cats.filter(Boolean).map((c) => [c!.id, c!]));
  return matches.map((s) => ({ ...s, categoryName: catMap.get(s.categoryId)?.name ?? "" }));
}

export async function createEntry(input: {
  subcategoryId: string;
  title?: string;
  typeValues?: { entryTypeId?: string; value: string; modId?: string }[];
  occurredAt?: number;
  notes?: string;
  linkedGroupId?: string;
  activityId?: string;
}): Promise<Entry> {
  const entry: Entry = {
    id: id(),
    subcategoryId: input.subcategoryId,
    title: input.title,
    notes: input.notes,
    occurredAt: input.occurredAt ?? now(),
    createdAt: now(),
    updatedAt: now(),
    ...(input.linkedGroupId ? { linkedGroupId: input.linkedGroupId } : {}),
    ...(input.activityId ? { activityId: input.activityId } : {}),
  };
  const values: EntryValue[] = (input.typeValues ?? []).map((v) => ({
    id: id(),
    entryId: entry.id,
    ...(v.entryTypeId ? { entryTypeId: v.entryTypeId } : {}),
    ...(v.modId ? { modId: v.modId } : {}),
    value: v.value,
    updatedAt: now(),
  }));

  await db.transaction("rw", [db.entries, db.entryValues], async () => {
    await db.entries.add(entry);
    if (values.length) await db.entryValues.bulkAdd(values);
  });
  return entry;
}

/** Var olan girdiye tek değer ekler — girdi kartından özellik ekleme akışı */
export async function addEntryValue(
  entryId: string,
  input: { entryTypeId?: string; modId?: string; value: string }
): Promise<void> {
  await db.transaction("rw", [db.entries, db.entryValues], async () => {
    await db.entryValues.add({
      id: id(),
      entryId,
      entryTypeId: input.entryTypeId,
      ...(input.modId ? { modId: input.modId } : {}),
      value: input.value,
      updatedAt: now(),
    });
    await db.entries.update(entryId, { updatedAt: now() });
  });
}

export async function updateEntry(
  entryId: string,
  input: {
    title?: string;
    typeValues?: { entryTypeId?: string; value: string; modId?: string }[];
    occurredAt?: number;
    notes?: string;
  }
): Promise<void> {
  await db.transaction("rw", [db.entries, db.entryValues], async () => {
    const entry = await db.entries.get(entryId);
    await db.entries.update(entryId, {
      title: input.title,
      notes: input.notes,
      occurredAt: input.occurredAt,
      updatedAt: now(),
    });
    // Replace entryType-based values only (keep legacy field-based ones)
    const existing = await db.entryValues.where("entryId").equals(entryId).toArray();
    // Alan (Field) değeri olmayan her şey yeniden yazılır. Eskiden burada
    // "entryTypeId taşıyanlar" deniyordu; v18'den sonra yeni değerler o alanı
    // taşımıyor ve süzgeç onları atlayıp kayıt biriktirirdi.
    const typeValueIds = existing.filter((v) => !v.fieldId).map((v) => v.id);
    if (typeValueIds.length) await db.entryValues.bulkDelete(typeValueIds);
    const newValues: EntryValue[] = (input.typeValues ?? []).map((v) => ({
      id: id(),
      entryId,
      ...(v.entryTypeId ? { entryTypeId: v.entryTypeId } : {}),
      ...(v.modId ? { modId: v.modId } : {}),
      value: v.value,
      updatedAt: now(),
    }));
    if (newValues.length) await db.entryValues.bulkAdd(newValues);

    // Paylaşılan atomları aynı linkedGroup'taki kardeş girdilere senkronla
    if (entry?.linkedGroupId && input.typeValues?.length) {
      const siblings = await db.entries
        .where("linkedGroupId")
        .equals(entry.linkedGroupId)
        .filter((e) => e.id !== entryId)
        .toArray();
      for (const sibling of siblings) {
        const sibVals = await db.entryValues.where("entryId").equals(sibling.id).toArray();
        for (const tv of input.typeValues) {
          const match = sibVals.find((v) =>
            tv.modId ? v.modId === tv.modId : v.entryTypeId === tv.entryTypeId
          );
          if (match) await db.entryValues.update(match.id, { value: tv.value });
        }
      }
    }
  });
}

/**
 * Girdiyi verilen gruba bağlar; zaten bir grubu varsa dokunmaz. Etkin grup
 * id'sini döner. Düzenlemede paralel perspektif akışının SONUNDA çağrılır —
 * erken bağlamak gün sayfasında kartı LinkedEntryCard'a çevirip açık
 * düzenleme modalını unmount ederdi.
 */
export async function linkEntryToGroup(
  entryId: string,
  groupId: string
): Promise<string> {
  const entry = await db.entries.get(entryId);
  if (!entry) throw new Error("Girdi bulunamadı");
  if (entry.linkedGroupId) return entry.linkedGroupId;
  await db.entries.update(entryId, {
    linkedGroupId: groupId,
    updatedAt: now(),
  });
  return groupId;
}

// Aynı linkedGroup'taki kardeş girdilerde geçen mod id'leri (paylaşılan atomlar).
export async function getLinkedSiblingModIds(entryId: string): Promise<Set<string>> {
  const entry = await db.entries.get(entryId);
  if (!entry?.linkedGroupId) return new Set();
  const siblings = await db.entries
    .where("linkedGroupId")
    .equals(entry.linkedGroupId)
    .filter((e) => e.id !== entryId)
    .toArray();
  if (!siblings.length) return new Set();
  const sibIds = siblings.map((s) => s.id);
  const vals = await db.entryValues.where("entryId").anyOf(sibIds).toArray();
  return new Set(vals.filter((v) => v.modId).map((v) => v.modId!));
}

/** Tek girdi silme — toplu yolun aynısı (aktivite temizliği ve silme günlüğü dahil) */
export async function deleteEntry(entryId: string): Promise<string> {
  return deleteEntries([entryId]);
}

// ============ Toplu Gün Öğesi İşlemleri ============

const startOfDayTs = (t: number) => {
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

/** "YYYY-MM-DDTHH:mm" yerel zaman damgasını gün olarak kaydırır */
function shiftLocalDateTime(s: string, days: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})(.*)$/.exec(s);
  if (!m) return s;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + days);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}${m[4]}`;
}

/**
 * Seçili girdileri başka bir güne taşı. Her girdinin kendi saati korunur,
 * yalnızca tarihi değişir. Tarih aralığı değerleri (uyku gibi) girdiyle aynı
 * gün sayısı kadar kaydırılır — yoksa kartta eski tarihler kalırdı.
 * Girdileri kısmen taşınan bir aktivitenin zamanı kalan girdilerinin en
 * erkenine çekilir; tamamı taşındıysa yeni güne kayar.
 */
export async function moveEntriesToDate(
  entryIds: string[],
  dateStr: string
): Promise<void> {
  if (!entryIds.length) return;
  const [y, m, d] = dateStr.split("-").map(Number);
  const dtrTypeIds = new Set(
    (
      await db.entryTypes
        .filter((t) => t.valueType === "datetime-range")
        .toArray()
    ).map((t) => t.id)
  );
  await db.transaction(
    "rw",
    [db.entries, db.entryValues, db.activities],
    async () => {
      const entries = (await db.entries.bulkGet(entryIds)).filter(
        (e): e is Entry => !!e
      );
      const touchedActivities = new Set<string>();
      for (const e of entries) {
        const src = new Date(e.occurredAt);
        const next = new Date(
          y, m - 1, d,
          src.getHours(), src.getMinutes(), src.getSeconds(), src.getMilliseconds()
        );
        const dayDelta = Math.round(
          (startOfDayTs(next.getTime()) - startOfDayTs(e.occurredAt)) / 86400000
        );
        await db.entries.update(e.id, {
          occurredAt: next.getTime(),
          updatedAt: now(),
        });

        if (dayDelta !== 0 && dtrTypeIds.size) {
          const values = await db.entryValues
            .where("entryId")
            .equals(e.id)
            .toArray();
          for (const v of values) {
            if (!v.entryTypeId || !dtrTypeIds.has(v.entryTypeId) || !v.value)
              continue;
            try {
              const parsed = JSON.parse(v.value) as {
                start?: string;
                end?: string;
              };
              await db.entryValues.update(v.id, {
                value: JSON.stringify({
                  ...parsed,
                  ...(parsed.start
                    ? { start: shiftLocalDateTime(parsed.start, dayDelta) }
                    : {}),
                  ...(parsed.end
                    ? { end: shiftLocalDateTime(parsed.end, dayDelta) }
                    : {}),
                }),
              });
            } catch {
              /* biçimi bozuk değere dokunma */
            }
          }
        }

        if (e.activityId) touchedActivities.add(e.activityId);
      }
      for (const activityId of touchedActivities) {
        const rest = await db.entries.where("activityId").equals(activityId).toArray();
        if (!rest.length) continue;
        await db.activities.update(activityId, {
          occurredAt: Math.min(...rest.map((x) => x.occurredAt)),
          updatedAt: now(),
        });
      }
    }
  );
}

/** Notlar günü `date` alanıyla tutar — taşımak tarihi değiştirmektir */
export async function moveNotesToDate(
  noteIds: string[],
  dateStr: string
): Promise<void> {
  if (!noteIds.length) return;
  await db.transaction("rw", db.notes, async () => {
    for (const noteId of noteIds) {
      await db.notes.update(noteId, { date: dateStr, updatedAt: now() });
    }
  });
}

export async function deleteNotes(
  noteIds: string[],
  batchId = newBatchId()
): Promise<string> {
  if (!noteIds.length) return batchId;
  await db.transaction("rw", [db.notes, db.deletions], async () => {
    const notes = (await db.notes.bulkGet(noteIds)).filter(
      (n): n is Note => !!n
    );
    await logDeletions("notes", notes, batchId);
    await db.notes.bulkDelete(noteIds);
  });
  return batchId;
}

/** Hedefler de günü `date` alanıyla tutar */
export async function moveGoalsToDate(
  goalIds: string[],
  dateStr: string
): Promise<void> {
  if (!goalIds.length) return;
  await db.transaction("rw", db.goals, async () => {
    for (const goalId of goalIds) {
      await db.goals.update(goalId, { date: dateStr });
    }
  });
}

export async function deleteGoals(
  goalIds: string[],
  batchId = newBatchId()
): Promise<string> {
  if (!goalIds.length) return batchId;
  await db.transaction("rw", [db.goals, db.deletions], async () => {
    const goals = (await db.goals.bulkGet(goalIds)).filter(
      (g): g is Goal => !!g
    );
    await logDeletions("goals", goals, batchId);
    await db.goals.bulkDelete(goalIds);
  });
  return batchId;
}

/**
 * Seçili girdileri değerleriyle birlikte sil. Girdisi kalmayan aktiviteler
 * de düşer (boş aktivite kartı gün sayfasında zaten görünmez).
 * Silinen her şey günlüğe yazılır — "Geri al" ondan besleniyor.
 */
export async function deleteEntries(
  entryIds: string[],
  batchId = newBatchId()
): Promise<string> {
  if (!entryIds.length) return batchId;
  await db.transaction(
    "rw",
    [db.entries, db.entryValues, db.activities, db.deletions],
    async () => {
      const entries = (await db.entries.bulkGet(entryIds)).filter(
        (e): e is Entry => !!e
      );
      const touchedActivities = new Set(
        entries.map((e) => e.activityId).filter((a): a is string => !!a)
      );
      const values = await db.entryValues
        .where("entryId")
        .anyOf(entryIds)
        .toArray();

      await logDeletions("entries", entries, batchId);
      await logDeletions("entryValues", values, batchId);

      await db.entryValues.where("entryId").anyOf(entryIds).delete();
      await db.entries.bulkDelete(entryIds);

      for (const activityId of touchedActivities) {
        const left = await db.entries.where("activityId").equals(activityId).count();
        if (left > 0) continue;
        const activity = await db.activities.get(activityId);
        if (activity) await logDeletions("activities", [activity], batchId);
        await db.activities.delete(activityId);
      }
    }
  );
  return batchId;
}

/**
 * Gün sayfasındaki toplu silme — girdi, hedef ve notlar TEK grupta silinir ki
 * "Geri al" hepsini birden döndürsün.
 */
// Gün öğelerinin toplu taşınması/silinmesi lib/db/day-items.ts'te — tür
// listesi orada tek yerde durur, buradaki üçlü elle çağrı kalkmıştı.

export async function listEntriesByDate(dateStr: string): Promise<EntryWithContext[]> {
  const [year, month, day] = dateStr.split("-").map(Number);
  const start = new Date(year, month - 1, day, 0, 0, 0, 0).getTime();
  const end = new Date(year, month - 1, day, 23, 59, 59, 999).getTime();
  const entries = await db.entries
    .where("occurredAt")
    .between(start, end, true, true)
    .toArray();
  entries.sort((a, b) => b.occurredAt - a.occurredAt);
  return hydrateEntries(entries);
}

/**
 * Alt kategori başına girdi sayısı. Girdi ekleme ağında sık kullanılanları
 * parlatmak için — tam kayıtları okumadan yalnız indeks anahtarları gezilir,
 * girdi sayısı büyüdükçe de ucuz kalır.
 */
/**
 * Alt kategori → girdi sayısı.
 *
 * `since` verilirse yalnız o andan sonraki girdiler sayılıyor. Bağ haritası
 * bunu kullanıyor: toplam sayı "şu anki hayatı" değil arşivi gösteriyor,
 * bıraktığın bir alışkanlık haritada hep parlak kalıyordu (bkz. lib/usage).
 */
export async function getEntryCountsBySubcategory(
  since?: number
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (since === undefined) {
    // Anahtar taraması: kaydın gövdesini hiç okumadan sayıyor
    await db.entries.orderBy("subcategoryId").eachKey((key) => {
      const id = String(key);
      counts.set(id, (counts.get(id) ?? 0) + 1);
    });
    return counts;
  }
  await db.entries
    .where("occurredAt")
    .aboveOrEqual(since)
    .each((e) => {
      counts.set(e.subcategoryId, (counts.get(e.subcategoryId) ?? 0) + 1);
    });
  return counts;
}

export type DayBar = {
  date: string;
  count: number;
  /** O günün kategori kırılımı, çoktan aza — şerit bunu yığılmış gösterir */
  segments: { color: string; count: number }[];
};

/**
 * Son N günün özeti (bugün dahil, eskiden yeniye) — ana sayfadaki ritim
 * şeridi için. Her gün: girdi sayısı ve kategori kırılımı.
 */
export async function getRecentDaySummaries(days = 7): Promise<DayBar[]> {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const start = new Date();
  start.setDate(start.getDate() - (days - 1));
  start.setHours(0, 0, 0, 0);

  const entries = await db.entries
    .where("occurredAt")
    .between(start.getTime(), end.getTime(), true, true)
    .toArray();

  const subIds = [...new Set(entries.map((e) => e.subcategoryId))];
  const subs = subIds.length ? await db.subcategories.bulkGet(subIds) : [];
  const catIdBySub = new Map<string, string>();
  for (const s of subs) if (s) catIdBySub.set(s.id, s.categoryId);
  const cats = await db.categories.toArray();
  const catById = new Map(cats.map((c) => [c.id, c]));

  const byDay = new Map<string, Map<string, number>>();
  const counts = new Map<string, number>();
  for (const e of entries) {
    const key = toLocalDateValue(e.occurredAt);
    counts.set(key, (counts.get(key) ?? 0) + 1);
    const catId = catIdBySub.get(e.subcategoryId);
    if (!catId) continue;
    const m = byDay.get(key) ?? new Map<string, number>();
    m.set(catId, (m.get(catId) ?? 0) + 1);
    byDay.set(key, m);
  }

  const out: DayBar[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const key = toLocalDateValue(d.getTime());
    const m = byDay.get(key);
    out.push({
      date: key,
      count: counts.get(key) ?? 0,
      segments: m
        ? [...m.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([id, n]) => ({ color: catById.get(id)?.color, count: n }))
            .filter((s): s is { color: string; count: number } => !!s.color)
        : [],
    });
  }
  return out;
}

export type DaySummary = {
  count: number;
  /** O gün girdi alan kategorilerin renkleri — en çok girdisi olan başta */
  colors: string[];
};

/**
 * Ay görünümü için gün özeti: girdi sayısı + o gün dokunulan kategorilerin
 * renkleri. Takvimdeki küçük renkli işaretler bundan beslenir.
 */
export async function getMonthDaySummary(
  year: number,
  month: number,
  maxColors = 4
): Promise<Map<number, DaySummary>> {
  const start = new Date(year, month, 1, 0, 0, 0, 0).getTime();
  const end = new Date(year, month + 1, 0, 23, 59, 59, 999).getTime();
  const entries = await db.entries
    .where("occurredAt")
    .between(start, end, true, true)
    .toArray();
  const out = new Map<number, DaySummary>();
  if (!entries.length) return out;

  const subIds = [...new Set(entries.map((e) => e.subcategoryId))];
  const subs = await db.subcategories.bulkGet(subIds);
  const catIdBySub = new Map<string, string>();
  for (const s of subs) if (s) catIdBySub.set(s.id, s.categoryId);
  const cats = await db.categories.toArray();
  const catById = new Map(cats.map((c) => [c.id, c]));

  // gün → (kategori → o gün kaç girdi)
  const perDay = new Map<number, Map<string, number>>();
  const counts = new Map<number, number>();
  for (const e of entries) {
    const day = new Date(e.occurredAt).getDate();
    counts.set(day, (counts.get(day) ?? 0) + 1);
    const catId = catIdBySub.get(e.subcategoryId);
    if (!catId) continue;
    const m = perDay.get(day) ?? new Map<string, number>();
    m.set(catId, (m.get(catId) ?? 0) + 1);
    perDay.set(day, m);
  }

  for (const [day, count] of counts) {
    const byCat = perDay.get(day);
    const colors = byCat
      ? [...byCat.entries()]
          .sort(
            (a, b) =>
              b[1] - a[1] ||
              (catById.get(a[0])?.order ?? 0) - (catById.get(b[0])?.order ?? 0)
          )
          .slice(0, maxColors)
          .map(([id]) => catById.get(id)?.color)
          .filter((c): c is string => !!c)
      : [];
    out.set(day, { count, colors });
  }
  return out;
}

export async function listRecentEntries(limit = 20): Promise<EntryWithContext[]> {
  const entries = await db.entries
    .orderBy("occurredAt")
    .reverse()
    .limit(limit)
    .toArray();
  return hydrateEntries(entries);
}

/**
 * Tek girdiyi kategori/alt kategori ve değerleriyle birlikte getirir — analiz
 * listelerinden girdiye dokununca düzenleme modalını açmak için.
 */
export async function getEntryWithContext(
  entryId: string
): Promise<EntryWithContext | undefined> {
  const entry = await db.entries.get(entryId);
  if (!entry) return undefined;
  return (await hydrateEntries([entry]))[0];
}

export async function listEntriesBySubCategory(
  subId: string,
  limit?: number
): Promise<EntryWithContext[]> {
  const entries = await db.entries
    .where("subcategoryId")
    .equals(subId)
    .reverse()
    .sortBy("occurredAt");
  return hydrateEntries(limit ? entries.slice(0, limit) : entries);
}

/**
 * Alt kategorinin ve tüm torunlarının girdileri, yeniden eskiye. Yapı
 * sayfasındaki "son girdiler" bölümü için — orada sayfalama istemcide
 * yapıldığından üst sınır cömert ama sınırsız değil.
 */
export async function listEntriesBySubtree(
  subId: string,
  limit = 200
): Promise<EntryWithContext[]> {
  const all = await db.subcategories.toArray();
  const kids = new Map<string, string[]>();
  for (const s of all) {
    if (!s.parentId) continue;
    kids.set(s.parentId, [...(kids.get(s.parentId) ?? []), s.id]);
  }
  const ids: string[] = [];
  const stack = [subId];
  while (stack.length) {
    const id = stack.pop()!;
    if (ids.includes(id)) continue;
    ids.push(id);
    stack.push(...(kids.get(id) ?? []));
  }
  const entries = await db.entries
    .where("subcategoryId")
    .anyOf(ids)
    .reverse()
    .sortBy("occurredAt");
  return hydrateEntries(entries.slice(0, limit));
}

export async function listEntriesByCategory(
  catId: string,
  limit = 20
): Promise<EntryWithContext[]> {
  const subs = await db.subcategories.where("categoryId").equals(catId).toArray();
  if (!subs.length) return [];
  const subIds = subs.map((s) => s.id);
  const entries = await db.entries
    .where("subcategoryId")
    .anyOf(subIds)
    .reverse()
    .sortBy("occurredAt");
  return hydrateEntries(entries.slice(0, limit));
}

// ============ Default Modifiers ============

export async function ensureDefaultModifiers(): Promise<void> {
  const uykuCat = await db.categories.where("name").equals("Uyku").first();
  if (!uykuCat) return;
  for (const modName of ["Uyku Süresi", "Uyku Kalitesi"]) {
    const mod = await findModByName(modName);
    if (mod) await attachMod("category", uykuCat.id, mod.id);
  }
}

// ============ Goals ============

export async function createGoal(input: {
  date: string;
  subcategoryId: string;
  targets: GoalTarget[];
  note?: string;
}): Promise<Goal> {
  const goal: Goal = {
    id: id(),
    date: input.date,
    subcategoryId: input.subcategoryId,
    targets: input.targets,
    ...(input.note ? { note: input.note } : {}),
    createdAt: now(),
    updatedAt: now(),
  };
  await db.goals.add(goal);
  return goal;
}

export async function listGoalsByDate(date: string): Promise<GoalWithContext[]> {
  const goals = await db.goals.where("date").equals(date).toArray();
  goals.sort((a, b) => a.createdAt - b.createdAt);
  return hydrateGoals(goals);
}

async function hydrateGoals(goals: Goal[]): Promise<GoalWithContext[]> {
  if (!goals.length) return [];
  const subIds = [...new Set(goals.map((g) => g.subcategoryId))];
  // Support legacy goals that stored a single entryTypeId instead of targets[]
  const rawGoals = goals as Array<Goal & { entryTypeId?: string; targetValue?: string }>;
  const resolvedTargets = rawGoals.map((g) =>
    g.targets ?? (g.entryTypeId ? [{ entryTypeId: g.entryTypeId, targetValue: g.targetValue ?? "" }] : [])
  );
  const typeIds = [
    ...new Set(
      resolvedTargets
        .flat()
        .map((t) => t.entryTypeId)
        .filter((x): x is string => !!x)
    ),
  ];
  const targetModIds = [
    ...new Set(
      resolvedTargets.flat().map((t) => t.modId).filter((x): x is string => !!x)
    ),
  ];
  const subs = await db.subcategories.bulkGet(subIds);
  const subMap = new Map(subs.filter(Boolean).map((s) => [s!.id, s!]));
  const catIds = [...new Set(subs.filter(Boolean).map((s) => s!.categoryId))];
  const cats = await db.categories.bulkGet(catIds);
  const catMap = new Map(cats.filter(Boolean).map((c) => [c!.id, c!]));
  const types = typeIds.length ? await db.entryTypes.bulkGet(typeIds) : [];
  const typeMap = new Map(types.filter(Boolean).map((t) => [t!.id, t!]));
  const targetMods = targetModIds.length
    ? await db.mods.bulkGet(targetModIds)
    : [];
  const targetModMap = new Map(
    targetMods.filter(Boolean).map((m) => [m!.id, m!])
  );
  const results: GoalWithContext[] = [];
  for (let i = 0; i < goals.length; i++) {
    const g = goals[i];
    const sub = subMap.get(g.subcategoryId);
    if (!sub) continue;
    const cat = catMap.get(sub.categoryId);
    if (!cat) continue;
    const hydratedTargets = resolvedTargets[i]
      .map((t) => {
        // Ölçüm önce özelliğin kendisinden; eski hedeflerde (modu silinmiş
        // olabilir) ölçü havuzuna düşülür
        const mod = t.modId ? targetModMap.get(t.modId) : undefined;
        const entryType = mod
          ? measureOf(mod)
          : t.entryTypeId
            ? typeMap.get(t.entryTypeId)
            : undefined;
        return entryType ? { ...t, entryType, mod } : null;
      })
      .filter(Boolean) as GoalWithContext["targets"];
    results.push({ ...g, targets: hydratedTargets, subcategory: sub, category: cat });
  }
  return results;
}

export async function completeGoal(goalId: string): Promise<void> {
  const goal = await db.goals.get(goalId);
  if (!goal || goal.completedEntryId) return;

  // Support legacy goals with single entryTypeId/targetValue
  const raw = goal as Goal & { entryTypeId?: string; targetValue?: string };
  const targets = raw.targets ?? (raw.entryTypeId ? [{ entryTypeId: raw.entryTypeId, targetValue: raw.targetValue ?? "" }] : []);

  // Her hedefin modunu çöz (eski hedeflerde ölçüden havuz modu bul) ve alt kategoriye ata
  const resolvedModIds = new Map<GoalTarget, string | undefined>();
  for (const t of targets) {
    let modId = t.modId;
    if (!modId) {
      const poolMod = await db.mods
        .filter((m) => m.entryTypeId === t.entryTypeId)
        .first();
      modId = poolMod?.id;
    }
    if (modId) {
      await attachMod("subcategory", goal.subcategoryId, modId);
    }
    resolvedModIds.set(t, modId);
  }

  const [year, month, day] = goal.date.split("-").map(Number);
  const d = new Date(year, month - 1, day);
  const n = new Date();
  d.setHours(n.getHours(), n.getMinutes(), 0, 0);

  const entry = await createEntry({
    subcategoryId: goal.subcategoryId,
    typeValues: targets.map((t) => ({
      entryTypeId: t.entryTypeId,
      modId: resolvedModIds.get(t),
      value: t.targetValue,
    })),
    occurredAt: d.getTime(),
  });

  await db.goals.update(goalId, { completedEntryId: entry.id });
}

export async function uncompleteGoal(goalId: string): Promise<void> {
  const goal = await db.goals.get(goalId);
  if (!goal?.completedEntryId) return;
  await deleteEntry(goal.completedEntryId);
  const updated = { ...goal };
  delete updated.completedEntryId;
  await db.goals.put(updated);
}

export async function updateGoal(
  goalId: string,
  patch: { targets: GoalTarget[] }
): Promise<void> {
  await db.goals.update(goalId, patch);
}

export async function deleteGoal(goalId: string): Promise<string> {
  const batchId = newBatchId();
  const goal = await db.goals.get(goalId);
  // Hedefi tamamlayan girdi de gider — ikisi tek grupta, geri alma bütün döner
  if (goal?.completedEntryId) {
    await deleteEntries([goal.completedEntryId], batchId);
  }
  return deleteGoals([goalId], batchId);
}

export interface SearchFilters {
  /** Serbest metin — başlık, not, takma ad ve kalem/kategori adında aranır */
  query: string;
  /** Yalnızca bu kategorinin alt ağacı */
  categoryId?: string;
  /** [from, to) — yerel gün sınırlarıyla verilmeli */
  from?: number;
  to?: number;
  limit?: number;
}

/**
 * Girdi araması.
 *
 * Metin eşleşmesi iki yoldan olur: girdinin KENDİ metni (başlık, not, takma ad)
 * ya da ait olduğu kalemin/kategorinin adı — "kahve" yazınca hem başlığında
 * kahve geçen girdiler hem de Kafe kalemindekiler gelsin diye.
 *
 * Ad eşleşmesi önce küçük tablolarda (kategoriler, alt kategoriler) yapılır;
 * girdiler occurredAt indeksinde yeniden eskiye taranır ve limit dolunca durur.
 * Böylece tüm girdi tablosu belleğe alınmaz.
 */
export async function searchEntries(
  filters: SearchFilters
): Promise<EntryWithContext[]> {
  const limit = filters.limit ?? 100;
  // Karşılaştırma kuralı lib/search.ts'te — liste içi süzme de aynısını
  // kullanıyor ki aynı sorgu iki yerde farklı sonuç vermesin
  const q = normalizeSearch(filters.query.trim());

  const [cats, subs] = await Promise.all([
    db.categories.toArray(),
    db.subcategories.toArray(),
  ]);
  const catById = new Map(cats.map((c) => [c.id, c]));

  // Kapsam: kategori seçiliyse onun tüm alt ağacı
  let scopeIds: Set<string> | null = null;
  if (filters.categoryId) {
    scopeIds = new Set(
      subs.filter((s) => s.categoryId === filters.categoryId).map((s) => s.id)
    );
  }

  // Adı sorguyla eşleşen kalemler — bu kalemlerin TÜM girdileri sonuçtadır
  const nameMatched = new Set<string>();
  if (q) {
    for (const s of subs) {
      const cat = catById.get(s.categoryId);
      const hay = `${s.isCategoryRoot ? "" : s.name} ${cat?.name ?? ""}`;
      if (matchesSearch(hay, q)) nameMatched.add(s.id);
    }
  }

  const textOf = (e: Entry) =>
    `${e.title ?? ""} ${e.notes ?? ""} ${(e.aliases ?? []).join(" ")}`;

  const found: Entry[] = [];
  const from = filters.from;
  const to = filters.to;
  let coll = db.entries.orderBy("occurredAt").reverse();
  if (from !== undefined || to !== undefined) {
    coll = db.entries
      .where("occurredAt")
      .between(from ?? -Infinity, to ?? Infinity, true, false)
      .reverse();
  }
  await coll.until(() => found.length >= limit).each((e) => {
    if (found.length >= limit) return;
    if (scopeIds && !scopeIds.has(e.subcategoryId)) return;
    if (q && !nameMatched.has(e.subcategoryId) && !matchesSearch(textOf(e), q))
      return;
    found.push(e);
  });

  found.sort((a, b) => b.occurredAt - a.occurredAt);
  return hydrateEntries(found);
}

async function hydrateEntries(entries: Entry[]): Promise<EntryWithContext[]> {
  if (!entries.length) return [];
  const subIds = [...new Set(entries.map((e) => e.subcategoryId))];
  const entryIds = entries.map((e) => e.id);
  const subs = await db.subcategories.bulkGet(subIds);
  const subMap = new Map(subs.filter(Boolean).map((s) => [s!.id, s!]));
  const catIds = [...new Set(subs.filter(Boolean).map((s) => s!.categoryId))];
  const cats = await db.categories.bulkGet(catIds);
  const catMap = new Map(cats.filter(Boolean).map((c) => [c!.id, c!]));
  const allFields = await db.fields.where("subcategoryId").anyOf(subIds).toArray();
  const fieldsBySub = new Map<string, Field[]>();
  for (const f of allFields) {
    const arr = fieldsBySub.get(f.subcategoryId) ?? [];
    arr.push(f);
    fieldsBySub.set(f.subcategoryId, arr);
  }
  const allValues = await db.entryValues.where("entryId").anyOf(entryIds).toArray();
  const valuesByEntry = new Map<string, EntryValue[]>();
  for (const v of allValues) {
    const arr = valuesByEntry.get(v.entryId) ?? [];
    arr.push(v);
    valuesByEntry.set(v.entryId, arr);
  }

  // Collect all entryTypeIds referenced from EntryValues
  const valueTypeIds = [
    ...new Set(allValues.map((v) => v.entryTypeId).filter((x): x is string => !!x)),
  ];
  const entryTypesRaw = valueTypeIds.length
    ? await db.entryTypes.bulkGet(valueTypeIds)
    : [];
  const entryTypeMap = new Map(
    entryTypesRaw.filter(Boolean).map((t) => [t!.id, t!])
  );

  // Havuz modlarını çöz — değer çipleri mod adını gösterir
  const valueModIds = [
    ...new Set(allValues.map((v) => v.modId).filter((x): x is string => !!x)),
  ];
  const modsRaw = valueModIds.length ? await db.mods.bulkGet(valueModIds) : [];
  const modMap = new Map(modsRaw.filter(Boolean).map((m) => [m!.id, m!]));

  const results: EntryWithContext[] = [];
  for (const e of entries) {
    const sub = subMap.get(e.subcategoryId);
    if (!sub) continue;
    const cat = catMap.get(sub.categoryId);
    if (!cat) continue;
    const fields = (fieldsBySub.get(sub.id) ?? []).sort(
      (a, b) => a.order - b.order
    );
    const rawValues = valuesByEntry.get(e.id) ?? [];
    const valuesWithType: EntryValueWithType[] = rawValues.map((v) => {
      const mod = v.modId ? modMap.get(v.modId) : undefined;
      return {
        ...v,
        // Ölçüm önce özelliğin kendisinden. v18'den beri yeni değerler
        // entryTypeId taşımıyor; havuza bakmak onları ölçümsüz bırakıyordu ve
        // kartlar ölçümsüz değeri hiç çizmiyordu (taze kurulumda TÜM girdiler
        // boş görünüyordu — kendi cihazında eski entryTypeId'ler durduğu için
        // fark edilmiyordu).
        entryType: mod
          ? measureOf(mod)
          : v.entryTypeId
            ? entryTypeMap.get(v.entryTypeId)
            : undefined,
        mod,
      };
    });
    results.push({
      ...e,
      subcategory: sub,
      category: cat,
      fields,
      values: valuesWithType,
    });
  }
  return results;
}

// ============ Notlar ============

/** Tüm notlar (boşlar hariç), en yeni gün önce. */
export async function listAllNotes(): Promise<Note[]> {
  const notes = await db.notes.toArray();
  return notes
    .filter((n) => !noteIsEmpty(n))
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
}

export async function listNotesByDate(date: string): Promise<Note[]> {
  const notes = await db.notes.where("date").equals(date).toArray();
  return notes.sort((a, b) => a.createdAt - b.createdAt);
}

export async function getNote(noteId: string): Promise<Note | undefined> {
  return db.notes.get(noteId);
}

/** Boş bir notla başla — editör açılırken çağrılır; boş kalırsa geri dönüşte silinir */
export async function createNote(date: string): Promise<Note> {
  const note: Note = {
    id: id(),
    date,
    title: "",
    blocks: [{ id: id(), text: "" }],
    createdAt: now(),
    updatedAt: now(),
  };
  await db.notes.add(note);
  return note;
}

export async function updateNote(
  noteId: string,
  changes: { title?: string; blocks?: NoteBlock[]; aliases?: string[] }
): Promise<void> {
  await db.notes.update(noteId, { ...changes, updatedAt: now() });
}

/** Girdinin takma adlarını ayarla (otomatik bağ önerisi bunlarla da eşleşir). */
export async function setEntryAliases(
  entryId: string,
  aliases: string[]
): Promise<void> {
  await db.entries.update(entryId, { aliases, updatedAt: now() });
}

export async function deleteNote(noteId: string): Promise<string> {
  return deleteNotes([noteId]);
}

/** Başlıksız ve tüm parağrafları boş not — listelerde gizlenir, çıkışta silinir */
export function noteIsEmpty(note: Note): boolean {
  return (
    !(note.title ?? "").trim() &&
    note.blocks.every((b) => !b.text.trim())
  );
}

// ============ Not bağlantıları (kelime→girdi, öbek→not) ============

export interface EntryPick {
  id: string;
  title: string;
  subName: string;
  catName: string;
  color: string;
  /** YYYY-MM-DD (occurredAt'ten) */
  date: string;
  occurredAt: number;
  aliases?: string[];
}

function ymdLocal(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

async function toEntryPicks(entries: Entry[]): Promise<EntryPick[]> {
  const subIds = [...new Set(entries.map((e) => e.subcategoryId))];
  const subs = (await db.subcategories.bulkGet(subIds)).filter(
    Boolean
  ) as SubCategory[];
  const subMap = new Map(subs.map((s) => [s.id, s]));
  const catIds = [...new Set(subs.map((s) => s.categoryId))];
  const cats = (await db.categories.bulkGet(catIds)).filter(
    Boolean
  ) as Category[];
  const catMap = new Map(cats.map((c) => [c.id, c]));
  return entries.map((e) => {
    const sub = subMap.get(e.subcategoryId);
    const cat = sub ? catMap.get(sub.categoryId) : undefined;
    const isRoot = !!sub?.isCategoryRoot;
    return {
      id: e.id,
      title:
        (e.title ?? "").trim() ||
        (isRoot ? cat?.name ?? "Girdi" : sub?.name ?? "Girdi"),
      subName: sub?.name ?? "",
      catName: cat?.name ?? "",
      color: cat?.color ?? "#64748b",
      date: ymdLocal(e.occurredAt),
      occurredAt: e.occurredAt,
      aliases: e.aliases,
    };
  });
}

/** Girdi iliştirme seçici için son girdiler (bağlamıyla). */
export async function listEntriesForPicker(limit = 120): Promise<EntryPick[]> {
  const entries = await db.entries
    .orderBy("occurredAt")
    .reverse()
    .limit(limit)
    .toArray();
  return toEntryPicks(entries);
}

/** Belirli girdilerin kısa bilgisi (çip render'ı için). */
export async function getEntryBriefs(
  ids: string[]
): Promise<Map<string, EntryPick>> {
  if (!ids.length) return new Map();
  const entries = (await db.entries.bulkGet(ids)).filter(Boolean) as Entry[];
  const picks = await toEntryPicks(entries);
  return new Map(picks.map((p) => [p.id, p]));
}

/** Wiki bağı: başlığıyla yeni bir not aç (öbek → not). */
export async function createNoteWithTitle(
  date: string,
  title: string
): Promise<Note> {
  const note: Note = {
    id: id(),
    date,
    title: title.trim(),
    blocks: [{ id: id(), text: "" }],
    createdAt: now(),
    updatedAt: now(),
  };
  await db.notes.add(note);
  return note;
}

/** Bu nota bağlanan (geri bağlantı) notlar. */
export async function listNoteBacklinks(noteId: string): Promise<Note[]> {
  const all = await db.notes.toArray();
  return all
    .filter(
      (n) =>
        n.id !== noteId &&
        !noteIsEmpty(n) &&
        n.blocks.some((b) =>
          (b.links ?? []).some(
            (l) => l.type === "note" && l.targetId === noteId
          )
        )
    )
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
}

/** Bu girdiyi anan (kelime iliştiren) notlar — girdi tarafı backlink. */
export async function listEntryBacklinks(entryId: string): Promise<Note[]> {
  const all = await db.notes.toArray();
  return all
    .filter(
      (n) =>
        !noteIsEmpty(n) &&
        n.blocks.some((b) =>
          (b.links ?? []).some(
            (l) => l.type === "entry" && l.targetId === entryId
          )
        )
    )
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
}

export interface SubPick {
  id: string;
  name: string;
  catName: string;
  color: string;
}

/** Yeni girdi iliştirme için alt kategoriler (kök hariç), kategoriye göre. */
export async function listSubcategoriesForPicker(): Promise<SubPick[]> {
  const [subs, cats] = await Promise.all([
    db.subcategories.toArray(),
    db.categories.toArray(),
  ]);
  const catMap = new Map(cats.map((c) => [c.id, c]));
  return subs
    .filter((s) => !s.isCategoryRoot)
    .map((s) => {
      const c = catMap.get(s.categoryId);
      return {
        id: s.id,
        name: s.name,
        catName: c?.name ?? "",
        color: c?.color ?? "#64748b",
      };
    })
    .sort(
      (a, b) =>
        a.catName.localeCompare(b.catName, "en") ||
        a.name.localeCompare(b.name, "en")
    );
}

/** Otomatik bağ önerisi (unlinked mentions) için bağlanabilir hedefler:
 *  başlıklı notlar + başlıklı girdiler. Adı en az 3 karakter. */
export interface LinkTarget {
  type: "note" | "entry";
  id: string;
  /** Metinde eşleşen ad (başlık ya da takma ad) */
  name: string;
  /** Hedefin görünen adı (başlık) — seçici/çip için */
  title: string;
  date?: string;
  color?: string;
}

export async function listLinkTargets(
  excludeNoteId: string
): Promise<LinkTarget[]> {
  const [notes, entries] = await Promise.all([
    db.notes.toArray(),
    listEntriesForPicker(200),
  ]);
  const out: LinkTarget[] = [];
  const add = (base: Omit<LinkTarget, "name">, name: string) => {
    const nm = name.trim();
    if (nm.length >= 3) out.push({ ...base, name: nm });
  };
  for (const n of notes) {
    if (n.id === excludeNoteId || noteIsEmpty(n)) continue;
    const title =
      (n.title ?? "").trim() ||
      n.blocks.map((b) => b.text.trim()).find(Boolean) ||
      "Not";
    const base = { type: "note" as const, id: n.id, title };
    add(base, n.title ?? "");
    for (const a of n.aliases ?? []) add(base, a);
  }
  for (const e of entries) {
    const base = {
      type: "entry" as const,
      id: e.id,
      title: e.title,
      date: e.date,
      color: e.color,
    };
    add(base, e.title);
    for (const a of e.aliases ?? []) add(base, a);
  }
  return out;
}
