import { nanoid } from "nanoid";
import { db } from "./index";
import type {
  Category,
  SubCategory,
  Field,
  Entry,
  EntryValue,
  EntryValueWithType,
  EntryType,
  GlobalDimension,
  EntryWithContext,
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
    [db.fields, db.entries, db.entryValues, db.subcategories],
    async () => {
      if (entryIds.length) {
        await db.entryValues.where("entryId").anyOf(entryIds).delete();
      }
      await db.entries.where("subcategoryId").equals(subId).delete();
      if (fieldIds.length) await db.fields.bulkDelete(fieldIds);
      await db.subcategories.delete(subId);
    }
  );
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

export async function createEntry(input: {
  subcategoryId: string;
  title?: string;
  typeValues?: { entryTypeId: string; value: string }[];
  occurredAt?: number;
  notes?: string;
}): Promise<Entry> {
  const entry: Entry = {
    id: id(),
    subcategoryId: input.subcategoryId,
    title: input.title,
    notes: input.notes,
    occurredAt: input.occurredAt ?? now(),
    createdAt: now(),
    updatedAt: now(),
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
  });
}

export async function deleteEntry(entryId: string): Promise<void> {
  await db.transaction("rw", [db.entries, db.entryValues], async () => {
    await db.entryValues.where("entryId").equals(entryId).delete();
    await db.entries.delete(entryId);
  });
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
