export type FieldType =
  | "number"
  | "text"
  | "rating"
  | "time"
  | "duration"
  | "money"
  | "select"
  | "boolean";

export type GlobalDimensionType = "money" | "time";

export type MoneyClassification = "expense" | "income" | "investment";

export interface FieldOptions {
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  choices?: string[];
  scale?: number;
  multiline?: boolean;
  currency?: string;
  defaultValue?: string;
}

export interface GlobalDimensionConfig {
  dimensionId: string;
  classification?: MoneyClassification;
  label?: string;
}

export interface Category {
  id: string;
  name: string;
  icon?: string;
  color: string;
  order: number;
  createdAt: number;
  updatedAt: number;
}

export interface SubCategory {
  id: string;
  categoryId: string;
  name: string;
  icon?: string;
  order: number;
  createdAt: number;
  updatedAt: number;
}

export interface Field {
  id: string;
  subcategoryId: string;
  name: string;
  type: FieldType;
  options?: FieldOptions;
  required?: boolean;
  globalDimension?: GlobalDimensionConfig;
  order: number;
  createdAt: number;
  updatedAt: number;
}

export interface GlobalDimension {
  id: string;
  name: string;
  type: GlobalDimensionType;
  isBuiltIn?: boolean;
  createdAt: number;
}

export interface Entry {
  id: string;
  subcategoryId: string;
  notes?: string;
  occurredAt: number;
  createdAt: number;
  updatedAt: number;
}

export interface EntryValue {
  id: string;
  entryId: string;
  fieldId: string;
  value: string;
}

export interface EntryWithContext extends Entry {
  values: EntryValue[];
  subcategory: SubCategory;
  category: Category;
  fields: Field[];
}

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  number: "Sayı",
  text: "Metin",
  rating: "Puan (1–10)",
  time: "Saat",
  duration: "Süre",
  money: "Para",
  select: "Seçenek",
  boolean: "Evet / Hayır",
};

export const CATEGORY_COLORS = [
  "#6366f1", // indigo
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#ef4444", // red
  "#f59e0b", // amber
  "#10b981", // emerald
  "#06b6d4", // cyan
  "#3b82f6", // blue
  "#84cc16", // lime
  "#f97316", // orange
] as const;
