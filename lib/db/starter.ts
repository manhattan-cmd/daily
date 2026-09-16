import type { EntryValueType } from "@/types";
import type { Locale } from "@/lib/i18n";

/**
 * İlk açılış tohumu — kategori ağacı ve özellik havuzu.
 *
 * Neden ayrı dosya: burası SORGU değil İÇERİK. Liste uzun ve elle sık sık
 * budanacak (kategori çıkar, kalem ekle); queries.ts'in içinde dursaydı her
 * içerik düzenlemesi veri katmanının ortasını karıştırırdı.
 *
 * Tohumun kendisi bir öğretici. Kullanıcı gezerken şunları GÖRÜYOR:
 *  • kategori → kalem → alt kalem derinliği (Harcamalar › Faturalar › Elektrik)
 *  • kategoriye takılan özelliğin bütün alt ağaca inmesi (Harcamalar'ın Parası)
 *  • yalnız bir kaleme takılan özellik (Yürüyüş'ün Mesafesi)
 *  • aynı atomun kategoriler arasında paylaşılması (Süre yedi yerde) —
 *    haritanın ilk açılışta boş olmamasının sebebi bu
 *  • altı ölçü türünün hepsi: sayı, skala, evet/hayır, seçim, zaman aralığı, metin
 *  • düzenli kalemler (Kira, Faturalar, Abonelikler, İlaç)
 * Örnek GİRDİ yok — analizler sahte veriyle kirlenmesin.
 */

/** Tohum metni: kurulum anındaki dile yazılır, o andan sonra kullanıcının adı olur. */
export type Loc = { en: string; tr: string };
export type Text = Loc | string;

export const pickText = (v: Text, locale: Locale): string =>
  typeof v === "string" ? v : v[locale];

export type StarterMeasure = {
  valueType: EntryValueType;
  unit?: Text;
  choices?: readonly Text[];
  scaleLabels?: { low?: Text; high?: Text };
};

/** Havuzdaki bir özellik — adı ve ölçüsü birlikte, tek kaynak. */
export type StarterFeature = { name: Text } & StarterMeasure;

const scale = (min: number, max: number) =>
  Array.from({ length: max - min + 1 }, (_, i) => String(min + i));

/**
 * Özellik havuzu. Ağaçtaki her başvuru buradaki nesnenin KENDİSİNİ gösterir —
 * ada göre arama yok, o yüzden yazım hatası derlenmiyor ve bir özelliğin ölçüsü
 * tek yerde duruyor.
 */
export const F = {
  money: {
    name: { en: "Money", tr: "Para" },
    valueType: "number",
    unit: { en: "$", tr: "₺" },
  },
  duration: {
    name: { en: "Duration", tr: "Süre" },
    valueType: "number",
    unit: { en: "min", tr: "dk" },
  },
  distance: {
    name: { en: "Distance", tr: "Mesafe" },
    valueType: "number",
    unit: "km",
  },
  steps: {
    name: { en: "Steps", tr: "Adım" },
    valueType: "number",
    unit: { en: "steps", tr: "adım" },
  },
  quantity: {
    name: { en: "Quantity", tr: "Adet" },
    valueType: "number",
    unit: { en: "pcs", tr: "adet" },
  },
  glasses: {
    name: { en: "Glasses", tr: "Bardak" },
    valueType: "number",
    unit: { en: "glasses", tr: "bardak" },
  },
  pages: {
    name: { en: "Pages", tr: "Sayfa" },
    valueType: "number",
    unit: { en: "pages", tr: "sayfa" },
  },
  calories: {
    name: { en: "Calories", tr: "Kalori" },
    valueType: "number",
    unit: "kcal",
  },
  bodyWeight: {
    name: { en: "Body Weight", tr: "Vücut ağırlığı" },
    valueType: "number",
    unit: "kg",
  },
  liftedWeight: {
    name: { en: "Lifted Weight", tr: "Kaldırılan ağırlık" },
    valueType: "number",
    unit: "kg",
  },
  sets: {
    name: { en: "Sets", tr: "Set" },
    valueType: "number",
    unit: { en: "sets", tr: "set" },
  },
  reps: {
    name: { en: "Reps", tr: "Tekrar" },
    valueType: "number",
    unit: { en: "reps", tr: "tekrar" },
  },
  exertion: {
    name: { en: "Exertion", tr: "Zorlanma" },
    valueType: "select",
    choices: scale(1, 5),
    scaleLabels: {
      low: { en: "Easy", tr: "Kolay" },
      high: { en: "Very hard", tr: "Çok zor" },
    },
  },
  productivity: {
    name: { en: "Productivity", tr: "Verimlilik" },
    valueType: "select",
    choices: scale(1, 5),
    scaleLabels: {
      low: { en: "Poor", tr: "Kötü" },
      high: { en: "Great", tr: "Çok iyi" },
    },
  },
  severity: {
    name: { en: "Severity", tr: "Şiddet" },
    valueType: "select",
    choices: scale(1, 10),
    scaleLabels: {
      low: { en: "Mild", tr: "Hafif" },
      high: { en: "Unbearable", tr: "Dayanılmaz" },
    },
  },
  done: {
    name: { en: "Done", tr: "Yapıldı" },
    valueType: "boolean",
  },
  meal: {
    name: { en: "Meal", tr: "Öğün" },
    valueType: "select",
    choices: [
      { en: "Breakfast", tr: "Kahvaltı" },
      { en: "Lunch", tr: "Öğle" },
      { en: "Dinner", tr: "Akşam" },
      { en: "Snack", tr: "Atıştırmalık" },
    ],
  },
  workHours: {
    name: { en: "Work Hours", tr: "Çalışma aralığı" },
    valueType: "datetime-range",
  },
  book: {
    name: { en: "Book", tr: "Kitap" },
    valueType: "text",
  },
  withWhom: {
    name: { en: "With Whom", tr: "Kiminle" },
    valueType: "text",
  },
  symptom: {
    name: { en: "Symptom", tr: "Belirti" },
    valueType: "text",
  },
  place: {
    name: { en: "Place", tr: "Yer" },
    valueType: "text",
  },
} satisfies Record<string, StarterFeature>;

/** Boş kuruluma ekilecek havuz — ağacın kullandığı her atom burada. */
export const STARTER_FEATURES: StarterFeature[] = Object.values(F);

export type StarterSub = {
  name: Text;
  icon?: string;
  /** Sabit/düzenli kalem — analizde "düzenlileri hariç tut" anahtarını görünür kılar */
  regular?: boolean;
  mods?: StarterFeature[];
  subs?: StarterSub[];
};

export type StarterCategory = {
  name: Text;
  color: string;
  icon: string;
  mods: StarterFeature[];
  subs: StarterSub[];
};

/**
 * Semboller `lib/icons/vocabulary.ts` sözlüğünden — eski lucide adları değil,
 * uygulamanın kendi seti. Renkler kategori başına ayrı: harita ve grafikler
 * kategoriyi renkten tanıyor, iki kategori aynı tonu almamalı.
 */
export const STARTER_CATEGORIES: StarterCategory[] = [
  // ——— 1. Harcamalar: kategori özelliğinin bütün ağaca inmesi + derinlik
  {
    name: { en: "Expenses", tr: "Harcamalar" },
    color: "#E0A21A",
    icon: "wallet",
    mods: [F.money],
    subs: [
      { name: { en: "Groceries", tr: "Market" }, icon: "cart" },
      {
        name: { en: "Eating Out", tr: "Dışarıda yeme-içme" },
        icon: "meal",
        subs: [
          { name: { en: "Cafe", tr: "Kafe" }, icon: "cup" },
          { name: { en: "Restaurant", tr: "Restoran" }, icon: "meal" },
          { name: { en: "Takeaway", tr: "Paket sipariş" }, icon: "bag" },
        ],
      },
      {
        name: { en: "Transport", tr: "Ulaşım" },
        icon: "car",
        subs: [
          { name: { en: "Fuel", tr: "Yakıt" }, icon: "gas" },
          { name: { en: "Public Transit", tr: "Toplu taşıma" }, icon: "transit" },
          { name: { en: "Taxi", tr: "Taksi" }, icon: "car" },
        ],
      },
      {
        name: { en: "Bills", tr: "Faturalar" },
        icon: "bill",
        regular: true,
        subs: [
          { name: { en: "Electricity", tr: "Elektrik" }, icon: "lamp" },
          { name: { en: "Water", tr: "Su" }, icon: "water" },
          { name: { en: "Internet", tr: "İnternet" }, icon: "wifi" },
          { name: { en: "Phone", tr: "Telefon" }, icon: "call" },
        ],
      },
      { name: { en: "Rent", tr: "Kira" }, icon: "home", regular: true },
      { name: { en: "Subscriptions", tr: "Abonelikler" }, icon: "card", regular: true },
      {
        name: { en: "Shopping", tr: "Alışveriş" },
        icon: "bag",
        subs: [
          { name: { en: "Clothing", tr: "Giyim" }, icon: "tag" },
          { name: { en: "Home", tr: "Ev eşyası" }, icon: "sofa" },
          { name: { en: "Tech", tr: "Teknoloji" }, icon: "screen" },
        ],
      },
    ],
  },

  // ——— 2. Spor: miras (Süre, Zorlanma) + kaleme özel ölçüler
  {
    name: { en: "Fitness", tr: "Spor" },
    color: "#17A67B",
    icon: "run",
    mods: [F.duration, F.exertion],
    subs: [
      {
        name: { en: "Walking", tr: "Yürüyüş" },
        icon: "walk",
        mods: [F.distance, F.steps],
      },
      { name: { en: "Running", tr: "Koşu" }, icon: "run", mods: [F.distance] },
      { name: { en: "Cycling", tr: "Bisiklet" }, icon: "cycle", mods: [F.distance] },
      {
        name: { en: "Weight Training", tr: "Ağırlık antrenmanı" },
        icon: "lift",
        mods: [F.sets, F.reps, F.liftedWeight],
      },
      { name: { en: "Yoga / Stretching", tr: "Yoga / esneme" }, icon: "yoga" },
      { name: { en: "Swimming", tr: "Yüzme" }, icon: "swim" },
      {
        name: { en: "Team Sports", tr: "Takım sporu" },
        icon: "soccer",
        subs: [
          { name: { en: "Football", tr: "Futbol" }, icon: "soccer" },
          { name: { en: "Basketball", tr: "Basketbol" }, icon: "basketball" },
          { name: { en: "Tennis", tr: "Tenis" }, icon: "tennis" },
        ],
      },
    ],
  },

  // ——— 3. Beslenme: seçim türü + harcamayla paralel girdi kurulabilen kalemler
  {
    name: { en: "Nutrition", tr: "Beslenme" },
    color: "#E4632E",
    icon: "meal",
    mods: [F.meal],
    subs: [
      {
        name: { en: "Home Cooked", tr: "Ev yemeği" },
        icon: "cook",
        mods: [F.calories],
      },
      { name: { en: "Eating Out", tr: "Dışarıda" }, icon: "meal", mods: [F.calories] },
      { name: { en: "Snack", tr: "Atıştırmalık" }, icon: "sweet", mods: [F.calories] },
      { name: { en: "Coffee / Tea", tr: "Kahve / çay" }, icon: "cup", mods: [F.quantity] },
      { name: { en: "Water", tr: "Su" }, icon: "water", mods: [F.glasses] },
      {
        name: { en: "Alcohol", tr: "Alkol" },
        icon: "drink",
        mods: [F.quantity, F.money],
      },
    ],
  },

  // ——— 4. Sağlık: evet/hayır, 1–10 skala, metin — kategori özelliği YOK
  {
    name: { en: "Health", tr: "Sağlık" },
    color: "#E15C5C",
    icon: "pulse",
    mods: [],
    subs: [
      {
        name: { en: "Body Weight", tr: "Vücut ağırlığı" },
        icon: "weight",
        mods: [F.bodyWeight],
      },
      {
        name: { en: "Medication / Vitamins", tr: "İlaç / vitamin" },
        icon: "pill",
        regular: true,
        mods: [F.done],
      },
      {
        name: { en: "Pain / Symptom", tr: "Ağrı / şikâyet" },
        icon: "medical",
        mods: [F.severity, F.symptom],
      },
      {
        name: { en: "Doctor Visit", tr: "Doktor / randevu" },
        icon: "medical",
        mods: [F.money],
      },
    ],
  },

  // ——— 5. Öğrenme: metin özelliği (Kitap) + paylaşılan Süre
  {
    name: { en: "Learning", tr: "Öğrenme" },
    color: "#5B6CF0",
    icon: "book",
    mods: [F.duration],
    subs: [
      {
        name: { en: "Reading", tr: "Okuma" },
        icon: "read",
        mods: [F.pages, F.book],
      },
      { name: { en: "Class / Course", tr: "Ders / kurs" }, icon: "school" },
      { name: { en: "Language Practice", tr: "Dil pratiği" }, icon: "language" },
      { name: { en: "Video / Tutorial", tr: "Video / eğitim" }, icon: "screen" },
      { name: { en: "Project", tr: "Proje" }, icon: "code" },
    ],
  },

  // ——— 6. Ev işleri
  {
    name: { en: "Housework", tr: "Ev işleri" },
    color: "#8A94A6",
    icon: "home",
    mods: [F.duration],
    subs: [
      { name: { en: "Cleaning", tr: "Temizlik" }, icon: "clean" },
      { name: { en: "Laundry", tr: "Çamaşır" }, icon: "laundry" },
      { name: { en: "Dishes / Kitchen", tr: "Bulaşık / mutfak" }, icon: "cook" },
      { name: { en: "Repairs", tr: "Tamir / montaj" }, icon: "tools" },
      { name: { en: "Plants", tr: "Bitki bakımı" }, icon: "plant" },
    ],
  },

  // ——— 7. İş: zaman aralığı ölçüsünün kullanıcı tarafındaki tek örneği
  {
    name: { en: "Work", tr: "İş" },
    color: "#3F86C4",
    icon: "work",
    mods: [F.duration],
    subs: [
      { name: { en: "Shift", tr: "Mesai" }, icon: "clock", mods: [F.workHours] },
      {
        name: { en: "Focus Work", tr: "Odak çalışma" },
        icon: "target",
        mods: [F.productivity],
      },
      { name: { en: "Meeting", tr: "Toplantı" }, icon: "meeting" },
      { name: { en: "Correspondence", tr: "Yazışma" }, icon: "mail" },
      { name: { en: "Freelance", tr: "Serbest iş" }, icon: "chart", mods: [F.money] },
    ],
  },

  // ——— 8. Sosyal
  {
    name: { en: "Social", tr: "Sosyal" },
    color: "#C2599E",
    icon: "people",
    mods: [F.duration],
    subs: [
      {
        name: { en: "Meetup", tr: "Buluşma" },
        icon: "chat",
        mods: [F.withWhom],
      },
      { name: { en: "Family", tr: "Aile" }, icon: "family" },
      { name: { en: "Phone Call", tr: "Telefon görüşmesi" }, icon: "call" },
      {
        name: { en: "Event / Celebration", tr: "Etkinlik / kutlama" },
        icon: "party",
        mods: [F.money],
      },
    ],
  },

  // ——— 9. Eğlence
  {
    name: { en: "Leisure", tr: "Eğlence" },
    color: "#8258E8",
    icon: "game",
    mods: [F.duration],
    subs: [
      { name: { en: "TV / Film", tr: "Dizi / film" }, icon: "film" },
      { name: { en: "Games", tr: "Oyun" }, icon: "game" },
      { name: { en: "Music", tr: "Müzik" }, icon: "music" },
      { name: { en: "Social Media", tr: "Sosyal medya" }, icon: "screen" },
      {
        name: { en: "Cinema / Concert", tr: "Sinema / konser" },
        icon: "ticket",
        mods: [F.money],
      },
    ],
  },

  // ——— 10. Yolculuk
  {
    name: { en: "Travel", tr: "Yolculuk" },
    color: "#2FA79B",
    icon: "map",
    mods: [],
    subs: [
      {
        name: { en: "Commute", tr: "Günlük yolculuk" },
        icon: "route",
        mods: [F.distance, F.duration],
      },
      {
        name: { en: "Trip", tr: "Seyahat" },
        icon: "luggage",
        mods: [F.money, F.place],
      },
    ],
  },
];
