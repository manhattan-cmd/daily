/**
 * Seçenek + yoğunluk.
 *
 * Duygular seçenekli bir özelliğin (mod) değerleri: seçilen her duygu kendi
 * EntryValue satırı. Yoğunluğu (0–100) taşımak için yeni bir tablo ya da yeni
 * bir ölçüm türü uydurulmadı, değerin kendisi taşıyor: "Happy" ya da
 * "Happy|70".
 *
 * Neden yeni sütun değil: EntryValue'nun şeması yedek biçimini ve ileride
 * senkronu bağlıyor; bir alan eklemek Dexie göçü demek. Neden JSON değil:
 * kayıtlı eski değerler düz etiket ve analiz dağılımı ham değeri grupluyor —
 * düz etiket biçimi geriye dönük olarak zaten doğru sonucu veriyor, yoğunluk
 * eklenmiş olanı da bu dosyadaki tek ayrıştırıcı düz etikete indiriyor.
 *
 * Yoğunluğu AYARLAYAN arayüz şimdilik kaldırıldı (bkz. EmotionPicker); okuma
 * tarafı duruyor ki daha önce yoğunlukla kaydedilmiş değerler hem doğru
 * gösterilsin hem de düzenlemede korunsun.
 *
 * Ayırıcı seçenek adlarında geçmiyor; yine de ayrıştırma temkinli: son
 * ayırıcıdan sonrası 0–100 arası bir tamsayı DEĞİLSE değer olduğu gibi etiket
 * sayılır. Böylece içinde "|" olan bir seçenek adı bozulmuyor.
 */

export const LEVEL_SEP = "|";
export const LEVEL_MIN = 0;
export const LEVEL_MAX = 100;

export interface ChoiceLevel {
  label: string;
  /** Kaydedilmemişse null — eski kayıtlar ve yoğunluk taşımayan seçenekler */
  level: number | null;
}

export function splitChoiceLevel(value: string): ChoiceLevel {
  const at = value.lastIndexOf(LEVEL_SEP);
  if (at <= 0) return { label: value, level: null };
  const tail = value.slice(at + 1);
  if (!/^\d{1,3}$/.test(tail)) return { label: value, level: null };
  const level = Number(tail);
  if (level < LEVEL_MIN || level > LEVEL_MAX) return { label: value, level: null };
  return { label: value.slice(0, at), level };
}

/** Ham değerin etiketi — analiz dağılımı ve listeler bununla gruplar */
export const choiceLabel = (value: string): string =>
  splitChoiceLevel(value).label;

export const choiceLevel = (value: string): number | null =>
  splitChoiceLevel(value).level;

export function packChoiceLevel(label: string, level?: number | null): string {
  if (level === null || level === undefined) return label;
  const clamped = Math.min(LEVEL_MAX, Math.max(LEVEL_MIN, Math.round(level)));
  return `${label}${LEVEL_SEP}${clamped}`;
}
