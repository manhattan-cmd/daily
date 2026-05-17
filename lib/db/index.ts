import Dexie, { type Table } from "dexie";
import type {
  Category,
  SubCategory,
  Field,
  Entry,
  EntryValue,
  EntryType,
  GlobalDimension,
} from "@/types";

export class RoutineDB extends Dexie {
  categories!: Table<Category, string>;
  subcategories!: Table<SubCategory, string>;
  fields!: Table<Field, string>;
  globalDimensions!: Table<GlobalDimension, string>;
  entries!: Table<Entry, string>;
  entryValues!: Table<EntryValue, string>;
  entryTypes!: Table<EntryType, string>;

  constructor() {
    super("RoutineDB");
    this.version(1).stores({
      categories: "id, name, order, createdAt",
      subcategories: "id, categoryId, name, order, createdAt",
      fields: "id, subcategoryId, type, order, createdAt",
      globalDimensions: "id, name, type",
      entries: "id, subcategoryId, occurredAt, createdAt",
      entryValues: "id, entryId, fieldId",
    });
    this.version(2).stores({
      subcategories: "id, categoryId, parentId, name, order, createdAt",
    });
    this.version(3).stores({
      entries: "id, subcategoryId, occurredAt, createdAt, entryTypeId",
      entryTypes: "id, name, isBuiltIn, order, createdAt",
    });
    this.version(4).stores({
      entries: "id, subcategoryId, occurredAt, createdAt, title",
      entryValues: "id, entryId, fieldId, entryTypeId",
    });
  }
}

export const db = new RoutineDB();
