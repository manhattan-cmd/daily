import { nanoid } from "nanoid";
import { db } from "./index";
import type {
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
} from "@/types";

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
    subcategories: [
      { name: "İyi Uyku", icon: "😴" },
      { name: "Orta Uyku", icon: "😐" },
      { name: "Az Uyku", icon: "😫" },
    ],
  },
] as const;

export async function ensureBuiltInCategories(): Promise<void> {
  for (const template of BUILT_IN_CATEGORIES) {
    const existing = await db.categories.where("name").equals(template.name).first();
    if (!existing) {
      const cat = await createCategory({
        name: template.name,
        color: template.color,
        icon: template.icon,
      });
      for (const sub of template.subcategories) {
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
  return all.filter((s) => !s.parentId).sort((a, b) => a.order - b.order);
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
  patch: Partial<Pick<SubCategory, "name" | "icon">>
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

// ============ Category Modifiers ============

export type CategoryModifierWithType = CategoryModifier & { entryType: EntryType };

export async function listModifiersForTarget(
  targetType: "category" | "subcategory",
  targetId: string
): Promise<CategoryModifierWithType[]> {
  const mods = await db.categoryModifiers
    .where("[targetType+targetId]")
    .equals([targetType, targetId])
    .toArray()
    .catch(() =>
      // Fallback for browsers that don't support compound index on this version
      db.categoryModifiers
        .filter((m) => m.targetType === targetType && m.targetId === targetId)
        .toArray()
    );
  mods.sort((a, b) => a.order - b.order);
  const typeIds = [...new Set(mods.map((m) => m.entryTypeId))];
  const types = typeIds.length ? await db.entryTypes.bulkGet(typeIds) : [];
  const typeMap = new Map(types.filter(Boolean).map((t) => [t!.id, t!]));
  return mods
    .map((m) => ({ ...m, entryType: typeMap.get(m.entryTypeId)! }))
    .filter((m) => m.entryType);
}

export async function assignModifier(
  targetType: "category" | "subcategory",
  targetId: string,
  entryTypeId: string
): Promise<CategoryModifier> {
  const existing = await db.categoryModifiers
    .filter((m) => m.targetType === targetType && m.targetId === targetId)
    .toArray();
  const mod: CategoryModifier = {
    id: id(),
    targetType,
    targetId,
    entryTypeId,
    order: existing.length + 1,
    createdAt: now(),
  };
  await db.categoryModifiers.add(mod);
  // Propagate to all existing descendants
  await propagateModToDescendants(targetType, targetId, entryTypeId);
  return mod;
}

async function propagateModToDescendants(
  parentType: "category" | "subcategory",
  parentId: string,
  entryTypeId: string
): Promise<void> {
  let children: SubCategory[];
  if (parentType === "category") {
    // Direct children of a root category = subs with this categoryId and no parentId
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
        (m) =>
          m.targetType === "subcategory" &&
          m.targetId === child.id &&
          m.entryTypeId === entryTypeId
      )
      .first();
    if (!already) {
      const count = await db.categoryModifiers
        .filter((m) => m.targetType === "subcategory" && m.targetId === child.id)
        .count();
      await db.categoryModifiers.add({
        id: id(),
        targetType: "subcategory",
        targetId: child.id,
        entryTypeId,
        order: count + 1,
        createdAt: now(),
      });
    }
    // Recurse into grandchildren
    await propagateModToDescendants("subcategory", child.id, entryTypeId);
  }
}

export async function removeModifier(modifierId: string): Promise<void> {
  await db.categoryModifiers.delete(modifierId);
}

export async function inheritModifiers(
  sourceType: "category" | "subcategory",
  sourceId: string,
  newSubcategoryId: string
): Promise<void> {
  const sourceMods = await db.categoryModifiers
    .filter((m) => m.targetType === sourceType && m.targetId === sourceId)
    .toArray();
  if (!sourceMods.length) return;
  const inherited: CategoryModifier[] = sourceMods.map((m, i) => ({
    id: id(),
    targetType: "subcategory" as const,
    targetId: newSubcategoryId,
    entryTypeId: m.entryTypeId,
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
  typeValues?: { entryTypeId: string; value: string }[];
  occurredAt?: number;
  notes?: string;
  linkedGroupId?: string;
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
  };
  const values: EntryValue[] = (input.typeValues ?? []).map((v) => ({
    id: id(),
    entryId: entry.id,
    entryTypeId: v.entryTypeId,
    value: v.value,
  }));

  await db.transaction("rw", [db.entries, db.entryValues], async () => {
    await db.entries.add(entry);
    if (values.length) await db.entryValues.bulkAdd(values);
  });
  return entry;
}

export async function updateEntry(
  entryId: string,
  input: {
    title?: string;
    typeValues?: { entryTypeId: string; value: string }[];
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
      value: v.value,
    }));
    if (newValues.length) await db.entryValues.bulkAdd(newValues);

    // Sync shared typeIds to sibling entries in the same linkedGroup
    if (entry?.linkedGroupId && input.typeValues?.length) {
      const siblings = await db.entries
        .where("linkedGroupId")
        .equals(entry.linkedGroupId)
        .filter((e) => e.id !== entryId)
        .toArray();
      for (const sibling of siblings) {
        const sibVals = await db.entryValues.where("entryId").equals(sibling.id).toArray();
        for (const tv of input.typeValues) {
          const match = sibVals.find((v) => v.entryTypeId === tv.entryTypeId);
          if (match) await db.entryValues.update(match.id, { value: tv.value });
        }
      }
    }
  });
}

// Returns the set of entryTypeIds that appear in at least one sibling entry of the same linkedGroup.
export async function getLinkedSiblingTypeIds(entryId: string): Promise<Set<string>> {
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
  return new Set(vals.filter((v) => v.entryTypeId).map((v) => v.entryTypeId!));
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
  const tarihType = await db.entryTypes.where("name").equals("Tarih Aralığı").first();
  if (!tarihType) return;
  const existing = await db.categoryModifiers
    .filter(
      (m) =>
        m.targetType === "category" &&
        m.targetId === uykuCat.id &&
        m.entryTypeId === tarihType.id
    )
    .first();
  if (!existing) {
    await assignModifier("category", uykuCat.id, tarihType.id);
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
  const subs = await db.subcategories.bulkGet(subIds);
  const subMap = new Map(subs.filter(Boolean).map((s) => [s!.id, s!]));
  const catIds = [...new Set(subs.filter(Boolean).map((s) => s!.categoryId))];
  const cats = await db.categories.bulkGet(catIds);
  const catMap = new Map(cats.filter(Boolean).map((c) => [c!.id, c!]));
  const types = typeIds.length ? await db.entryTypes.bulkGet(typeIds) : [];
  const typeMap = new Map(types.filter(Boolean).map((t) => [t!.id, t!]));
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
        return entryType ? { ...t, entryType } : null;
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

  // Ensure each target's entryType is assigned as a modifier to the subcategory
  for (const t of targets) {
    const existingMod = await db.categoryModifiers
      .filter(
        (m) =>
          m.targetType === "subcategory" &&
          m.targetId === goal.subcategoryId &&
          m.entryTypeId === t.entryTypeId
      )
      .first();
    if (!existingMod) {
      await assignModifier("subcategory", goal.subcategoryId, t.entryTypeId);
    }
  }

  const [year, month, day] = goal.date.split("-").map(Number);
  const d = new Date(year, month - 1, day);
  const n = new Date();
  d.setHours(n.getHours(), n.getMinutes(), 0, 0);

  const entry = await createEntry({
    subcategoryId: goal.subcategoryId,
    typeValues: targets.map((t) => ({ entryTypeId: t.entryTypeId, value: t.targetValue })),
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
