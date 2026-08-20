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

/**
 * Skala ön ayarları. Skala ayrı bir depolama türü değil — seçenekleri hep sayı
 * olan bir "select". Analiz bunu zaten tanıyor (`isNumericChoiceSet`) ve
 * toplamak yerine ortalıyor; 5 günün uyku puanı toplanmaz, ortalanır.
 * Arayüzde ayrı bir tür gibi sunulur, altta tek kural çalışır.
 */
export const SCALE_PRESETS: { key: string; label: string; choices: string[] }[] = [
  { key: "1-5", label: "1 – 5", choices: ["1", "2", "3", "4", "5"] },
  {
    key: "1-10",
    label: "1 – 10",
    choices: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"],
  },
  { key: "-2-2", label: "−2 … +2", choices: ["-2", "-1", "0", "1", "2"] },
];

export const SCALE_1_5 = SCALE_PRESETS[0].choices;

/**
 * Skalanın uçlarına verilen anlam. Sayılar tek başına hangi yönün iyi olduğunu
 * söylemiyor: "1–5" kötüden iyiye mi, tersi mi? Girdi ekranında basamakların
 * altında görünür.
 */
export interface ScaleLabels {
  low?: string;
  high?: string;
}

/** Seçenekler tamamen sayıysa bu bir skaladır (ayrı bir tür değil, aynı select) */
export const isScaleChoices = (c?: string[]): boolean =>
  !!c?.length && c.every((x) => Number.isFinite(Number(x)));

export const ENTRY_VALUE_TYPE_LABELS: Record<EntryValueType, string> = {
  number: "Number",
  text: "Text",
  boolean: "Evet / Hayır",
  select: "Option",
  "datetime-range": "Date-time range",
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
  updatedAt: number;
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

/**
 * Uygulamayla gelen, kullanıcıya kategori olarak SUNULMAYAN akışlar.
 * Altta sıradan kategori olarak dururlar — girdi, analiz, arama ve yedek
 * bedavaya gelsin diye — ama gezinilen yüzeylerde görünmezler; kendi ekleme
 * pencereleri vardır.
 */
export type BuiltInCategoryKey = "sleep" | "mood";

export interface Category {
  id: string;
  name: string;
  icon?: string;
  color: string;
  /** Uygulamayla gelen şablon kategori — gezinme yüzeylerinden gizlenir, özel akışı vardır */
  isBuiltIn?: boolean;
  /**
   * Hangi yerleşik akış olduğu. `isBuiltIn` tek başına "Uyku" demekti;
   * ikinci yerleşik (Ruh hali) gelince ayırt edici şart oldu. İndekssiz
   * alan: göç gerektirmez, açılışta eski kayıtlara doldurulur.
   */
  builtInKey?: BuiltInCategoryKey;
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
  updatedAt: number;
}

/**
 * Mod (arayüzde "Özellik") — takip edilen şeyin kendisi. Global havuzda yaşar,
 * adı tekildir: "Piyano çalma sürem", "Ağırlık", "Uyku Kalitesi".
 * Kategorilere/alt kategorilere atanarak paylaşılır.
 *
 * v18'den beri NASIL ölçüldüğünü de kendi taşır — ayrı bir "ölçü" nesnesi yok.
 * "Piyano çalma sürem" = sayıyla ölçülen, birimi dk olan bir özellik.
 */
export interface Mod {
  id: string;
  name: string;
  /**
   * Özelliğin kendi rengi. Boşsa adından türetiliyor (bkz. lib/mod-color) —
   * böylece hiçbir özellik renksiz kalmıyor, seçmek isteyen de kendi rengini
   * koyabiliyor. İndekssiz alan: Dexie göçü gerekmiyor.
   */
  color?: string;
  /** Nasıl ölçülüyor */
  valueType: EntryValueType;
  /** number'da sayının yanına gelen ek ("₺", "dk", "kg"). Özelliğin adı zaten
   *  birimse (Set, Tekrar) boş bırakılır — "Set: 4 set" saçma olurdu. */
  unit?: string;
  /** select'te seçenekler; hepsi sayıysa skala sayılır (toplanmaz, ortalanır) */
  choices?: string[];
  /** Skalanın uçlarının anlamı — girdi ekranında sayıların altında görünür */
  scaleLabels?: ScaleLabels;
  /** @deprecated v18 öncesi ölçü havuzuna bağ. Yeni modlarda yok; eski
   *  kayıtlarda dönüş yolu açık kalsın diye silinmedi. */
  entryTypeId?: string;
  /** @deprecated v19'da "yerleşik özellik" sınıfı kalktı — uygulamayla gelen
   *  özellik de yeniden adlandırılır ve silinir. Göç işareti temizler. */
  isBuiltIn?: boolean;
  createdAt: number;
  updatedAt: number;
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
  /** @deprecated v18 öncesi denormalize ölçü kopyası. Ölçüm artık modun
   *  üzerinde tek kaynakta; yeni atamalar bu alanı yazmaz. */
  entryTypeId?: string;
  order: number;
  createdAt: number;
  updatedAt: number;
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
  /** Takma adlar — otomatik bağ önerisi bunlarla da eşleşir (indekssiz) */
  aliases?: string[];
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
  /** Son değişiklik — yedek birleştirmede ve ileride senkronda "hangisi yeni" kararı */
  updatedAt: number;
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
  number: "Number",
  text: "Text",
  rating: "Puan (1–10)",
  time: "Saat",
  duration: "Süre",
  money: "Para",
  select: "Option",
  boolean: "Evet / Hayır",
};

export interface GoalTarget {
  /** Hedefin bağlı olduğu özellik. v18 göçü eski hedeflerde de doldurdu. */
  modId?: string;
  /** @deprecated v18 öncesi ölçü havuzu anahtarı — yeni hedefler yazmaz */
  entryTypeId?: string;
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
  updatedAt: number;
}

export interface GoalWithContext extends Omit<Goal, "targets"> {
  subcategory: SubCategory;
  category: Category;
  targets: GoalTargetWithContext[];
}

/**
 * Not bağlantısı — bir paragraftaki kelime/öbeğin (anchor) bir girdiye ya da
 * başka bir nota iliştirilmesi. Kullanıcının kendi kurduğu bağ; hayat
 * haritasının kenarı. [[app-vision]]
 */
export interface NoteLink {
  id: string;
  /** İliştirilen kelime/öbek — çipin etiketi ve metindeki dayanağı */
  anchor: string;
  type: "note" | "entry";
  /** Hedef not id'si ya da girdi id'si */
  targetId: string;
}

/** Not paragrafı — nota gömülü blok */
export interface NoteBlock {
  id: string;
  text: string;
  /** Bu paragraftaki kelime/öbeklerden çıkan bağlar (indekssiz, opsiyonel) */
  links?: NoteLink[];
}

/**
 * Gün notu — serbest yazım alanı (günce/not defteri). Ölçülebilir girdilerin
 * yanında düşünce, his ve yazılı aktiviteler için; bir güne birden çok not olabilir.
 */
export interface Note {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  title?: string;
  blocks: NoteBlock[];
  /** Takma adlar — otomatik bağ önerisi bunlarla da eşleşir (indekssiz) */
  aliases?: string[];
  createdAt: number;
  updatedAt: number;
}

/**
 * Silme günlüğü satırı. İki işi var:
 *  1. "Geri al" — payload kaydın tam kopyası olduğu için silinen geri konabilir.
 *  2. Mezar taşı (tombstone) — cihazlar arası senkron geldiğinde "bu kayıt
 *     silindi" bilgisi taşınmazsa silinen kayıt diğer cihazdan geri gelir.
 * Süresi dolanlar (30 gün) uygulama açılışında temizlenir.
 */
export interface Deletion {
  id: string;
  /** Aynı kullanıcı eylemiyle silinenler tek grupta — geri alma grubu döndürür */
  batchId: string;
  /** Kaydın tablosu ("entries", "notes", ...) */
  table: string;
  /** Silinen kaydın id'si */
  recordId: string;
  deletedAt: number;
  /** Kaydın tam kopyası */
  payload: unknown;
  updatedAt: number;
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
