export type FieldType =
  | "number"
  | "text"
  | "rating"
  | "time"
  | "duration"
  | "money"
  | "select"
  | "boolean";

export type EntryValueType = "number" | "text" | "boolean" | "select" | "datetime-range";

export const ENTRY_VALUE_TYPE_LABELS: Record<EntryValueType, string> = {
  number: "Sayı",
  text: "Metin",
  boolean: "Evet / Hayır",
  select: "Seçenek",
  "datetime-range": "Tarih-Saat Aralığı",
};

export interface EntryType {
  id: string;
  name: string;
  unit: string;
  valueType?: EntryValueType;
  choices?: string[];
  isBuiltIn: boolean;
  order: number;
  createdAt: number;
}

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
  /** Uygulamayla gelen şablon kategori (Uyku) — girdi seçiciden gizlenir, özel akışı vardır */
  isBuiltIn?: boolean;
  order: number;
  createdAt: number;
  updatedAt: number;
}

export interface SubCategory {
  id: string;
  categoryId: string;
  parentId?: string;
  name: string;
  icon?: string;
  /** Kategorinin kendisini temsil eden gizli kök — girdi/hedef doğrudan kategoriye eklenirken kullanılır, listelerde görünmez */
  isCategoryRoot?: boolean;
  /** Düzenli/sabit kalem (kira, fatura gibi) — analizlerde tek dokunuşla hariç
   * tutulabilir; işaret alt ağaca miras iner. İndekssiz opsiyonel alan (migration yok). */
  isRegular?: boolean;
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

/**
 * Mod — hiyerarşinin atomu. Global havuzda yaşar, adı tekildir.
 * "Para", "Uyku Aralığı" (yerleşik) ya da "Yürüyüş süresi" (kullanıcı).
 * Bir ölçü türüyle (entryType) ölçülür; kategorilere/alt kategorilere atanarak paylaşılır.
 */
export interface Mod {
  id: string;
  name: string;
  entryTypeId: string;
  isBuiltIn?: boolean;
  createdAt: number;
}

/**
 * Atama — havuzdaki bir modun bir kategori/alt kategoriye bağlanması.
 * (Tarihî sebeple tablo adı categoryModifiers.)
 */
export interface CategoryModifier {
  id: string;
  /** Global mod havuzundaki atom */
  modId?: string;
  /** @deprecated v8 kalıntısı — artık ad havuzdaki moddan gelir */
  name?: string;
  targetType: "category" | "subcategory";
  targetId: string;
  /** Modun ölçüsü (denormalize; mod.entryTypeId ile aynı) */
  entryTypeId: string;
  order: number;
  createdAt: number;
}

/**
 * Aktivite — farklı kategori/alt kategorilerden girdileri tek oturum altında
 * toplayan konteyner ("Market alışverişi", "Antrenman"). Paralel gruptan
 * (linkedGroupId) farkı: içindeki girdiler AYRI olaylardır, değer senkronu yok.
 * Girdiler alt kategorilerinde kaldığından genel analizler etkilenmez;
 * activityId indeksi ileride aktivite bazlı analize zemin sağlar.
 */
export interface Activity {
  id: string;
  name: string;
  icon?: string;
  occurredAt: number;
  createdAt: number;
  updatedAt: number;
}

export interface Entry {
  id: string;
  subcategoryId: string;
  title?: string;
  notes?: string;
  occurredAt: number;
  createdAt: number;
  updatedAt: number;
  linkedGroupId?: string;
  /** Bağlı olduğu aktivite (varsa) — gün sayfasında aktivite kartında katlanır */
  activityId?: string;
}

export interface EntryValue {
  id: string;
  entryId: string;
  fieldId?: string;
  entryTypeId?: string;
  /** Değerin bağlı olduğu isimli mod; girdiye özel eklenen ölçülerde boş olabilir */
  modId?: string;
  value: string;
}

export type EntryValueWithType = EntryValue & {
  entryType?: EntryType;
  mod?: Mod;
};

export interface EntryWithContext extends Entry {
  values: EntryValueWithType[];
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

/**
 * Analiz yöntemi — bir modun girdileri üzerinde nasıl özetleneceği.
 * sum/avg tek sayı, max/min tarihli tek sayı, daily gün gün seri grafiği.
 */
export type AnalysisMethod = "sum" | "avg" | "max" | "min" | "daily";

export const ANALYSIS_METHOD_LABELS: Record<AnalysisMethod, string> = {
  sum: "Toplam",
  avg: "Ortalama",
  max: "En Yüksek",
  min: "En Düşük",
  daily: "Gün Gün",
};

export const ANALYSIS_METHOD_DESCRIPTIONS: Record<AnalysisMethod, string> = {
  sum: "Aralıktaki tüm değerlerin toplamı",
  avg: "Girdi başına ortalama değer",
  max: "Aralıktaki en yüksek değer",
  min: "Aralıktaki en düşük değer",
  daily: "Günlük değişimi gösteren seri",
};

/**
 * Analiz widget'ı — kullanıcının bir kategori/alt kategori analizinde görmek
 * istediği (mod × yöntem) seçimi. Yapı bölümündeki Analiz Ayarları sayfasında
 * mod küresi bir yönteme bırakılarak oluşturulur; analiz sayfasında kutu olarak
 * gösterilir.
 */
export interface AnalysisWidget {
  id: string;
  targetType: "category" | "subcategory";
  targetId: string;
  modId: string;
  method: AnalysisMethod;
  order: number;
  createdAt: number;
}

export interface GoalTarget {
  entryTypeId: string;
  /** Hedefin bağlı olduğu global mod (yeni kayıtlarda dolu) */
  modId?: string;
  targetValue: string;
}

export interface GoalTargetWithContext extends GoalTarget {
  entryType: EntryType;
  mod?: Mod;
}

export interface Goal {
  id: string;
  date: string;
  subcategoryId: string;
  targets: GoalTarget[];
  note?: string;
  completedEntryId?: string;
  createdAt: number;
}

export interface GoalWithContext extends Omit<Goal, "targets"> {
  subcategory: SubCategory;
  category: Category;
  targets: GoalTargetWithContext[];
}

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
