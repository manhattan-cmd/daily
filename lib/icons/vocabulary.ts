/**
 * Sembol sözlüğü — ADLAR burada, çizimler sette (lib/icons/sets/*).
 *
 * Ayrımın sebebi: kullanıcının seçtiği şey `subcategory.icon = "run"` diye
 * kaydediliyor. Yarın çizim dilini değiştirmek istersek yeni bir set yazıp
 * etkin seti çevirmek yetiyor — kayıtlı veri aynı kalıyor, "run" yine "run".
 * Bu yüzden set, sözlüğün TAMAMINI karşılamak zorunda (bkz. IconSet tipi);
 * eksik bir set derlenmiyor, yarısı boş bir ekran çıkmıyor.
 */

export const ICON_GROUPS = [
  {
    key: "time",
    icons: ["moon", "bed", "sun", "sunrise", "clock", "alarm", "hourglass", "calendar", "timer"],
  },
  {
    key: "body",
    icons: ["run", "walk", "steps", "lift", "cycle", "swim", "yoga", "heart", "pulse", "weight", "pill", "medical", "water"],
  },
  {
    key: "sport",
    icons: ["soccer", "basketball", "tennis", "volleyball", "pingpong", "boxing", "golf", "bowling", "dart", "skate", "ski", "fishing", "surf", "hike"],
  },
  {
    key: "mind",
    icons: ["mood-bright", "mood-ok", "mood-flat", "mood-low", "brain", "eye", "spark"],
  },
  {
    key: "food",
    icons: ["meal", "cook", "cup", "tea", "drink", "fruit", "veg", "bread", "egg", "fish", "meat", "pizza", "noodle", "sweet", "icecream"],
  },
  {
    key: "shop",
    icons: ["cart", "bag", "store", "tag", "box", "truck", "barcode", "discount", "receipt", "wallet"],
  },
  {
    key: "edu",
    icons: ["book", "read", "write", "notebook", "school", "graduation", "science", "language", "calculator", "library", "certificate", "backpack"],
  },
  {
    key: "work",
    icons: ["work", "screen", "call", "mail", "meeting", "target", "idea", "check", "chart", "code"],
  },
  {
    key: "hobby",
    icons: ["game", "film", "music", "guitar", "piano", "mic", "headphones", "art", "camera", "chess", "dice", "cards", "puzzle", "knit", "build", "garden"],
  },
  {
    key: "people",
    icons: ["person", "people", "family", "baby", "love", "ring", "party", "chat", "dog", "cat", "bird"],
  },
  {
    key: "home",
    icons: ["home", "key", "tools", "trash", "lamp", "wifi", "sofa", "door", "plant", "clean", "laundry", "bath"],
  },
  {
    key: "travel",
    icons: ["car", "transit", "train", "plane", "boat", "scooter", "map", "route", "luggage", "hotel", "ticket", "compass", "gas"],
  },
  { key: "money", icons: ["money", "coin", "card", "save", "bill", "bank", "invest"] },
  {
    key: "nature",
    icons: ["leaf", "tree", "flower", "mountain", "wave", "sea", "rain", "snow", "cloud", "fire", "star"],
  },
] as const;

export type IconGroupKey = (typeof ICON_GROUPS)[number]["key"];
export type IconName = (typeof ICON_GROUPS)[number]["icons"][number];

export const ICON_NAMES: IconName[] = ICON_GROUPS.flatMap(
  (g) => g.icons as readonly IconName[]
);

const NAME_SET = new Set<string>(ICON_NAMES);
export const isIconName = (v?: string): v is IconName => !!v && NAME_SET.has(v);
