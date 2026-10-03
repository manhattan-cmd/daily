import { ICON_GROUPS, isIconName, type IconName } from "./vocabulary";

/**
 * Ada göre sembol önerisi — "Kahve" yazana fincan, "Koşu" yazana koşan adam.
 *
 * Kök eşleşmesi (içeriyor mu): Türkçe ekler ("koşusu", "kahvaltı") ve
 * İngilizce adlar aynı listeden yakalanıyor. Üç harf ve altındaki kökler
 * ("su", "iş", "ev", "çay") yalnız TAM KELİME olarak sayılır — yoksa
 * "Koşusu" suya, "Sevgili" eve uyuyordu. Sıra önemli değil; bir ad birden
 * çok köke uyarsa hepsinin sembolleri sırayla eklenir, tekrarlar düşer.
 */
const KEYWORDS: [string[], IconName[]][] = [
  [["uyku", "uyu", "sleep", "gece", "şekerleme", "nap"], ["moon", "bed"]],
  [["uyan", "sabah", "morning"], ["sunrise", "alarm"]],
  [["spor", "fitness", "gym", "antrenman", "ağırlık", "workout"], ["lift", "run"]],
  [["koş", "run", "jog"], ["run", "steps"]],
  [["yürü", "walk", "adım", "step"], ["walk", "steps"]],
  [["bisiklet", "cycl", "bike"], ["cycle"]],
  [["yüz", "swim", "havuz"], ["swim"]],
  [["yoga", "meditasyon", "medit", "nefes"], ["yoga", "brain"]],
  [["futbol", "soccer"], ["soccer"]],
  [["basketbol", "basket"], ["basketball"]],
  [["tenis", "tennis"], ["tennis"]],
  [["doğa yürüyüş", "hike", "kamp", "dağ"], ["hike", "mountain"]],
  [["su", "water"], ["water"]],
  [["kahve", "coffee"], ["cup"]],
  [["çay", "tea"], ["tea"]],
  [["alkol", "bira", "şarap", "drink", "içki", "içecek"], ["drink"]],
  [["yemek", "food", "meal", "beslen", "öğün", "kahvaltı", "akşam", "öğle", "dışarıda", "restoran"], ["meal", "cook"]],
  [["atıştır", "snack", "tatlı", "sweet", "dessert"], ["sweet", "icecream"]],
  [["meyve", "fruit"], ["fruit"]],
  [["sebze", "veg", "salata"], ["veg"]],
  [["pizza"], ["pizza"]],
  [["kitap", "book", "okuma", "read"], ["book", "read"]],
  [["yaz", "write", "günlük", "journal"], ["write", "notebook"]],
  [["ders", "study", "okul", "school", "sınav", "ödev"], ["school", "notebook"]],
  [["dil", "language", "ingilizce", "english"], ["language"]],
  [["kurs", "course", "öğren", "learn"], ["graduation", "book"]],
  [["iş", "work", "mesai", "ofis", "office", "proje"], ["work", "screen"]],
  [["toplantı", "meeting"], ["meeting"]],
  [["kod", "code", "yazılım"], ["code", "screen"]],
  [["mail", "e-posta"], ["mail"]],
  [["para", "money", "harcama", "expense", "gider"], ["money", "wallet"]],
  [["fatura", "bill", "kira", "rent"], ["bill", "receipt"]],
  [["birikim", "save", "tasarruf"], ["save", "bank"]],
  [["yatırım", "invest", "borsa"], ["invest", "chart"]],
  [["market", "alışveriş", "shop", "grocery"], ["cart", "bag"]],
  [["sağlık", "health", "doktor", "hastane"], ["pulse", "medical"]],
  [["ilaç", "vitamin", "pill", "medication"], ["pill"]],
  [["kilo", "weight", "tartı"], ["weight"]],
  [["kalp", "heart", "nabız"], ["heart", "pulse"]],
  [["ruh", "mood", "duygu", "his"], ["mood-ok", "mood-bright"]],
  [["stres", "kaygı", "anksiyete", "anxiety"], ["mood-low", "brain"]],
  [["film", "dizi", "movie", "sinema", "series"], ["film"]],
  [["müzik", "music", "şarkı", "podcast"], ["music", "headphones"]],
  [["gitar", "guitar"], ["guitar"]],
  [["piyano", "piano"], ["piano"]],
  [["oyun", "game", "gaming"], ["game"]],
  [["resim", "çizim", "art", "boya"], ["art"]],
  [["fotoğraf", "photo", "kamera"], ["camera"]],
  [["satranç", "chess"], ["chess"]],
  [["bahçe", "garden", "bitki", "plant"], ["garden", "plant"]],
  [["arkadaş", "sosyal", "social", "friend", "buluşma"], ["people", "chat"]],
  [["aile", "family", "anne", "baba"], ["family"]],
  [["bebek", "baby", "çocuk"], ["baby"]],
  [["sevgili", "ilişki", "randevu", "date", "love"], ["love"]],
  [["parti", "party", "kutlama", "doğum günü"], ["party"]],
  [["köpek", "dog"], ["dog"]],
  [["kedi", "cat"], ["cat"]],
  [["ev", "home", "house"], ["home"]],
  [["temizlik", "clean", "ev işi", "chore"], ["clean", "home"]],
  [["çamaşır", "laundry"], ["laundry"]],
  [["banyo", "duş", "bath", "bakım", "care", "cilt", "skin"], ["bath"]],
  [["tamir", "repair", "fix"], ["tools"]],
  [["seyahat", "travel", "tatil", "trip", "uçuş", "flight"], ["plane", "luggage"]],
  [["otel", "hotel"], ["hotel"]],
  [["araba", "car", "sürüş", "drive"], ["car"]],
  [["yakıt", "benzin", "fuel", "gas"], ["gas", "car"]],
  [["toplu taşıma", "transit", "otobüs", "metro", "bus", "ulaşım", "transport"], ["transit", "train"]],
  [["taksi", "taxi"], ["car"]],
  [["doğa", "nature", "orman"], ["tree", "leaf"]],
];

/** Hiçbir şey yazılmamışken (ya da eşleşme yokken) gösterilecek genel seçki */
const DEFAULTS: IconName[] = ["moon", "run", "meal", "work", "book", "money", "people", "home"];

const groupOf = (icon?: string) =>
  ICON_GROUPS.find((g) => (g.icons as readonly string[]).includes(icon ?? ""));

/**
 * Önerilen semboller (en fazla `max`): önce ada uyanlar, sonra bağlamın
 * (üst kategorinin sembolünün) grubu, en son genel seçki.
 */
export function suggestIcons(
  name: string,
  contextIcon?: string,
  max = 8
): IconName[] {
  const q = name.toLocaleLowerCase("tr").trim();
  const out: IconName[] = [];
  const push = (n: IconName) => {
    if (!out.includes(n)) out.push(n);
  };
  if (q) {
    const words = q.split(/[^\p{L}]+/u).filter(Boolean);
    const hit = (r: string) =>
      r.length <= 3 && !r.includes(" ") ? words.includes(r) : q.includes(r);
    for (const [roots, icons] of KEYWORDS) {
      if (roots.some(hit)) icons.forEach(push);
    }
  }
  const ctx = groupOf(contextIcon);
  if (ctx) {
    if (isIconName(contextIcon)) push(contextIcon);
    (ctx.icons as readonly IconName[]).forEach(push);
  }
  DEFAULTS.forEach(push);
  return out.slice(0, max);
}

/** Bir sembolün grubunun anahtarı — sembol kategorileri o grupla açılsın */
export function iconGroupKey(icon?: string): string | undefined {
  return groupOf(icon)?.key;
}
