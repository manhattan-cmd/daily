import { nanoid } from "nanoid";
import { db } from "./index";
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
  NoteTag,
} from "@/types";
import { CATEGORY_COLORS } from "@/types";

const now = () => Date.now();
const id = () => nanoid(12);

// ============ Entry Types ============

const BUILT_IN_ENTRY_TYPES: Omit<EntryType, "id" | "createdAt">[] = [
  { name: "Para", unit: "₺", valueType: "number", isBuiltIn: true, order: 1 },
  { name: "Miktar", unit: "adet", valueType: "number", isBuiltIn: true, order: 2 },
  { name: "Süre", unit: "dk", valueType: "number", isBuiltIn: true, order: 3 },
  { name: "Ağırlık", unit: "kg", valueType: "number", isBuiltIn: true, order: 4 },
  { name: "Mesafe", unit: "km", valueType: "number", isBuiltIn: true, order: 5 },
  { name: "1–5 Skala", unit: "", valueType: "select", choices: ["1", "2", "3", "4", "5"], isBuiltIn: true, order: 6 },
  { name: "1–10 Skala", unit: "", valueType: "select", choices: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"], isBuiltIn: true, order: 7 },
  { name: "Kalori", unit: "kcal", valueType: "number", isBuiltIn: true, order: 8 },
  { name: "Evet / Hayır", unit: "", valueType: "boolean", isBuiltIn: true, order: 9 },
  { name: "Adım", unit: "adım", valueType: "number", isBuiltIn: true, order: 10 },
  { name: "Tekrar", unit: "tekrar", valueType: "number", isBuiltIn: true, order: 11 },
  { name: "Tarih Aralığı", unit: "", valueType: "datetime-range", isBuiltIn: true, order: 12 },
];

export async function ensureBuiltInEntryTypes(): Promise<void> {
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
  ).map((t) => ({ ...t, id: id(), createdAt: now() } satisfies EntryType));
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
      name: "Para",
      type: "money",
      isBuiltIn: true,
      createdAt: now(),
    });
  }
  if (!hasTime) {
    toAdd.push({
      id: id(),
      name: "Zaman",
      type: "time",
      isBuiltIn: true,
      createdAt: now(),
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
    name: "Uyku",
    color: "#8b5cf6",
    icon: "Moon",
    subcategories: [{ name: "Gece Uykusu", icon: "🌙" }],
  },
] as const;

export async function ensureBuiltInCategories(): Promise<void> {
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
    const subNames = new Set(subs.map((s) => s.name.toLocaleLowerCase("tr-TR")));
    for (const sub of template.subcategories) {
      if (!subNames.has(sub.name.toLocaleLowerCase("tr-TR"))) {
        await createSubCategory({ categoryId: cat.id, name: sub.name, icon: sub.icon });
      }
    }
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

export async function deleteCategory(catId: string): Promise<void> {
  const subs = await db.subcategories.where("categoryId").equals(catId).toArray();
  for (const sub of subs) await deleteSubCategory(sub.id);
  await db.categoryModifiers
    .filter((m) => m.targetType === "category" && m.targetId === catId)
    .delete();
  await db.categories.delete(catId);
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

export async function deleteSubCategory(subId: string): Promise<void> {
  // Recursively delete children first
  const children = await db.subcategories.where("parentId").equals(subId).toArray();
  for (const child of children) await deleteSubCategory(child.id);

  const fields = await db.fields.where("subcategoryId").equals(subId).toArray();
  const fieldIds = fields.map((f) => f.id);
  const entries = await db.entries.where("subcategoryId").equals(subId).toArray();
  const entryIds = entries.map((e) => e.id);

  await db.transaction(
    "rw",
    [db.fields, db.entries, db.entryValues, db.subcategories, db.categoryModifiers],
    async () => {
      if (entryIds.length) {
        await db.entryValues.where("entryId").anyOf(entryIds).delete();
      }
      await db.entries.where("subcategoryId").equals(subId).delete();
      if (fieldIds.length) await db.fields.bulkDelete(fieldIds);
      await db.categoryModifiers
        .filter((m) => m.targetType === "subcategory" && m.targetId === subId)
        .delete();
      await db.subcategories.delete(subId);
    }
  );
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

const normModName = (s: string) => s.trim().toLocaleLowerCase("tr-TR");

export type ModWithType = Mod & { entryType: EntryType };

/**
 * Yerleşik atomlar — genel ölçüm kavramları. Amaçları mod fikrini öğretmek:
 * kullanıcı bunlara bakıp "Yatırım Parası", "Çalışma Süresi" gibi kendi
 * spesifik atomlarını yaratır. Spesifik şeyler (Adım, Uyku Aralığı...)
 * yerleşik OLMAZ.
 */
const BUILT_IN_MODS: { name: string; typeName: string }[] = [
  { name: "Para", typeName: "Para" },
  { name: "Süre", typeName: "Süre" },
  { name: "Mesafe", typeName: "Mesafe" },
  { name: "Miktar", typeName: "Miktar" },
  // Şablon Uyku kategorisinin yerleşik modları
  { name: "Uyku Süresi", typeName: "Tarih Aralığı" },
  { name: "Uyku Kalitesi", typeName: "1–5 Skala" },
];

/** Eski kurulumlardaki adları yeni yerleşik adlara taşı */
const RENAMED_BUILT_IN_MODS: { from: string; to: string }[] = [
  { from: "Uyku Aralığı", to: "Uyku Süresi" },
];

/** Seçilmiş yerleşik modları kur; liste dışı kalan eski yerleşikleri temizle/indirge. */
export async function ensureBuiltInMods(): Promise<void> {
  // Ad devri: "Uyku Aralığı" → "Uyku Süresi" (atamalar ve değerler aynı modda kalır)
  for (const r of RENAMED_BUILT_IN_MODS) {
    const target = await findModByName(r.to);
    if (target) continue;
    const legacy = await findModByName(r.from);
    if (legacy) {
      await db.mods.update(legacy.id, { name: r.to, isBuiltIn: true });
    }
  }

  const [types, mods] = await Promise.all([
    db.entryTypes.toArray(),
    db.mods.toArray(),
  ]);
  const typeByName = new Map(types.map((t) => [normModName(t.name), t]));
  const existingNames = new Set(mods.map((m) => normModName(m.name)));

  const toAdd: Mod[] = [];
  for (const b of BUILT_IN_MODS) {
    if (existingNames.has(normModName(b.name))) continue;
    const type = typeByName.get(normModName(b.typeName));
    if (!type) continue;
    toAdd.push({
      id: id(),
      name: b.name,
      entryTypeId: type.id,
      isBuiltIn: true,
      createdAt: now(),
    });
  }
  if (toAdd.length) await db.mods.bulkAdd(toAdd);

  // Liste dışı kalan yerleşik işaretli modlar: kullanılmıyorsa sil,
  // kullanılıyorsa kullanıcı moduna indirge (veri bozulmasın).
  const curated = new Set(BUILT_IN_MODS.map((b) => normModName(b.name)));
  const candidates = mods.filter(
    (m) => m.isBuiltIn && !curated.has(normModName(m.name))
  );
  if (!candidates.length) return;
  const candidateIds = candidates.map((m) => m.id);
  const [usedInAttachments, usedInValues] = await Promise.all([
    db.categoryModifiers
      .filter((a) => !!a.modId && candidateIds.includes(a.modId))
      .toArray(),
    db.entryValues.where("modId").anyOf(candidateIds).toArray(),
  ]);
  const used = new Set([
    ...usedInAttachments.map((a) => a.modId!),
    ...usedInValues.map((v) => v.modId!),
  ]);
  for (const mid of candidateIds) {
    if (used.has(mid)) {
      await db.mods.update(mid, { isBuiltIn: false });
    } else {
      await db.mods.delete(mid);
    }
  }
}

export async function listMods(): Promise<ModWithType[]> {
  const mods = await db.mods.toArray();
  const typeIds = [...new Set(mods.map((m) => m.entryTypeId))];
  const types = typeIds.length ? await db.entryTypes.bulkGet(typeIds) : [];
  const typeMap = new Map(types.filter(Boolean).map((t) => [t!.id, t!]));
  return mods
    .map((m) => ({ ...m, entryType: typeMap.get(m.entryTypeId)! }))
    .filter((m) => m.entryType)
    .sort(
      (a, b) =>
        Number(b.isBuiltIn ?? false) - Number(a.isBuiltIn ?? false) ||
        a.name.localeCompare(b.name, "tr")
    );
}

export async function findModByName(name: string): Promise<Mod | undefined> {
  const n = normModName(name);
  return db.mods.filter((m) => normModName(m.name) === n).first();
}

/** İsim tekildir: aynı adla ikinci atom yaratılamaz — var olan döner. */
export async function createMod(
  name: string,
  entryTypeId: string
): Promise<{ mod: Mod; created: boolean }> {
  const existing = await findModByName(name);
  if (existing) return { mod: existing, created: false };
  const mod: Mod = {
    id: id(),
    name: name.trim(),
    entryTypeId,
    isBuiltIn: false,
    createdAt: now(),
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

/** Modu havuzdan sil — tüm atamalarıyla birlikte. Girdi değerleri ölçü adına düşer. */
export async function deleteMod(modId: string): Promise<void> {
  await db.transaction("rw", [db.mods, db.categoryModifiers], async () => {
    await db.categoryModifiers.filter((a) => a.modId === modId).delete();
    await db.mods.delete(modId);
  });
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

  const typeIds = [
    ...new Set(
      attachments.map((a) => modMap.get(a.modId ?? "")?.entryTypeId ?? a.entryTypeId)
    ),
  ];
  const types = typeIds.length ? await db.entryTypes.bulkGet(typeIds) : [];
  const typeMap = new Map(types.filter(Boolean).map((t) => [t!.id, t!]));

  return attachments
    .map((a) => {
      const mod = a.modId ? modMap.get(a.modId) : undefined;
      const entryTypeId = mod?.entryTypeId ?? a.entryTypeId;
      return {
        ...a,
        entryTypeId,
        name: mod?.name ?? a.name ?? typeMap.get(entryTypeId)?.name,
        mod,
        entryType: typeMap.get(entryTypeId)!,
      };
    })
    .filter((a) => a.entryType);
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
    entryTypeId: mod.entryTypeId,
    order: existing.length + 1,
    createdAt: now(),
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
        entryTypeId: mod.entryTypeId,
        order: count + 1,
        createdAt: now(),
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
    const key = a.name.trim().toLocaleLowerCase("tr-TR");
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
  typeValues?: { entryTypeId: string; value: string; modId?: string }[];
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
    entryTypeId: v.entryTypeId,
    ...(v.modId ? { modId: v.modId } : {}),
    value: v.value,
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
  input: { entryTypeId: string; modId?: string; value: string }
): Promise<void> {
  await db.transaction("rw", [db.entries, db.entryValues], async () => {
    await db.entryValues.add({
      id: id(),
      entryId,
      entryTypeId: input.entryTypeId,
      ...(input.modId ? { modId: input.modId } : {}),
      value: input.value,
    });
    await db.entries.update(entryId, { updatedAt: now() });
  });
}

export async function updateEntry(
  entryId: string,
  input: {
    title?: string;
    typeValues?: { entryTypeId: string; value: string; modId?: string }[];
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
    const typeValueIds = existing.filter((v) => v.entryTypeId).map((v) => v.id);
    if (typeValueIds.length) await db.entryValues.bulkDelete(typeValueIds);
    const newValues: EntryValue[] = (input.typeValues ?? []).map((v) => ({
      id: id(),
      entryId,
      entryTypeId: v.entryTypeId,
      ...(v.modId ? { modId: v.modId } : {}),
      value: v.value,
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

export async function deleteEntry(entryId: string): Promise<void> {
  await db.transaction("rw", [db.entries, db.entryValues], async () => {
    await db.entryValues.where("entryId").equals(entryId).delete();
    await db.entries.delete(entryId);
  });
}

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

export async function getMonthEntryCounts(
  year: number,
  month: number
): Promise<Map<number, number>> {
  const start = new Date(year, month, 1, 0, 0, 0, 0).getTime();
  const end = new Date(year, month + 1, 0, 23, 59, 59, 999).getTime();
  const entries = await db.entries
    .where("occurredAt")
    .between(start, end, true, true)
    .toArray();
  const counts = new Map<number, number>();
  for (const e of entries) {
    const d = new Date(e.occurredAt).getDate();
    counts.set(d, (counts.get(d) ?? 0) + 1);
  }
  return counts;
}

export async function listRecentEntries(limit = 20): Promise<EntryWithContext[]> {
  const entries = await db.entries
    .orderBy("occurredAt")
    .reverse()
    .limit(limit)
    .toArray();
  return hydrateEntries(entries);
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
  const typeIds = [...new Set(resolvedTargets.flat().map((t) => t.entryTypeId))];
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
        const entryType = typeMap.get(t.entryTypeId);
        const mod = t.modId ? targetModMap.get(t.modId) : undefined;
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

export async function deleteGoal(goalId: string): Promise<void> {
  const goal = await db.goals.get(goalId);
  if (goal?.completedEntryId) {
    await deleteEntry(goal.completedEntryId);
  }
  await db.goals.delete(goalId);
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
    const valuesWithType: EntryValueWithType[] = rawValues.map((v) => ({
      ...v,
      entryType: v.entryTypeId ? entryTypeMap.get(v.entryTypeId) : undefined,
      mod: v.modId ? modMap.get(v.modId) : undefined,
    }));
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

/**
 * Yerleşik not etiketleri — paragraf etiket havuzunun çekirdeği.
 * Kullanıcı kendi etiketlerini bunların yanına yaratır.
 */
const BUILT_IN_NOTE_TAGS: Omit<NoteTag, "id" | "createdAt">[] = [
  { name: "Düşünce", color: "#8b5cf6", isBuiltIn: true, order: 1 },
  { name: "His", color: "#ec4899", isBuiltIn: true, order: 2 },
  { name: "Not", color: "#3b82f6", isBuiltIn: true, order: 3 },
  { name: "Aktivite", color: "#06b6d4", isBuiltIn: true, order: 4 },
];

const normTagName = (s: string) => s.trim().toLocaleLowerCase("tr-TR");

export async function ensureBuiltInNoteTags(): Promise<void> {
  const existing = await db.noteTags.toArray();
  const existingNames = new Set(existing.map((t) => normTagName(t.name)));
  const toAdd = BUILT_IN_NOTE_TAGS.filter(
    (t) => !existingNames.has(normTagName(t.name))
  ).map((t) => ({ ...t, id: id(), createdAt: now() } satisfies NoteTag));
  if (toAdd.length) await db.noteTags.bulkAdd(toAdd);
}

export async function listNoteTags(): Promise<NoteTag[]> {
  const all = await db.noteTags.toArray();
  return all.sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
}

/** Etiket yarat — ad tekildir; çakışmada null döner. Renk paletten sırayla seçilir. */
export async function createNoteTag(name: string): Promise<NoteTag | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const all = await db.noteTags.toArray();
  if (all.some((t) => normTagName(t.name) === normTagName(trimmed))) return null;
  const tag: NoteTag = {
    id: id(),
    name: trimmed,
    color: CATEGORY_COLORS[all.length % CATEGORY_COLORS.length],
    order: Math.max(0, ...all.map((t) => t.order)) + 1,
    createdAt: now(),
  };
  await db.noteTags.add(tag);
  return tag;
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
    blocks: [{ id: id(), text: "", tagIds: [] }],
    createdAt: now(),
    updatedAt: now(),
  };
  await db.notes.add(note);
  return note;
}

export async function updateNote(
  noteId: string,
  changes: { title?: string; blocks?: NoteBlock[] }
): Promise<void> {
  await db.notes.update(noteId, { ...changes, updatedAt: now() });
}

export async function deleteNote(noteId: string): Promise<void> {
  await db.notes.delete(noteId);
}

/** Başlıksız ve tüm parağrafları boş not — listelerde gizlenir, çıkışta silinir */
export function noteIsEmpty(note: Note): boolean {
  return (
    !(note.title ?? "").trim() &&
    note.blocks.every((b) => !b.text.trim())
  );
}
