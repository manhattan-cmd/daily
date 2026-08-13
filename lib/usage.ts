/**
 * Kullanım yoğunluğu — bağ haritasındaki hatların kalınlığı, parlaklığı ve
 * ışık dalgasının temposu bundan çıkıyor.
 *
 * Üç karar var burada, üçü de bilinçli:
 *
 * 1. SAYIM PENCERELİ. Toplam girdi sayısı yanlış cevap veriyordu: iki yıl
 *    önce sıkı tuttuğun ama artık uğramadığın bir dal haritada hep parlak
 *    kalıyor, yeni edindiğin alışkanlık sönük duruyordu. Harita şu anki
 *    hayatı göstermeli, arşivi değil.
 *
 * 2. ÖLÇÜ SAYI DEĞİL, RİTİM. Her şey "günde kaç kez" üzerinden konuşuyor.
 *    Sabit sayı eşikleri (3 girdi, 8 girdi…) pencereye yapışıktı: pencereyi
 *    30 günden 90 güne çıkarsan bütün anlamlar kayıyordu. Ritim ölçüsü
 *    pencereden bağımsız — eşikler "haftada bir", "üç günde bir", "günde
 *    bir" diye okunuyor ve pencere ne olursa olsun aynı şeyi söylüyor.
 *
 * 3. PARLAKLIK SÜREKLİ, BASAMAK AYRIK. Çizim sürekli bir yoğunluk kullanıyor
 *    (logaritmik: ayda bir uğranan dal da görünür, günde üç kez uğranan dal
 *    ekranı yakmıyor). Basamak ise ayrık kararlar için: dalga temposu gibi.
 *    Yoğunluğu "haritanın en ağırına böl" diye hesaplamak yanlıştı — tek bir
 *    yoğun dal her şeyi sönük bırakıyordu; şimdi ölçü mutlak.
 */

/** Sayımın kapsadığı gün sayısı */
export const USAGE_WINDOW_DAYS = 30;

/** 0 = hiç … 4 = neredeyse her gün */
export type UsageLevel = 0 | 1 | 2 | 3 | 4;

/** Pencere içindeki girdi sayısı → günlük ritim (girdi/gün) */
export function usageRate(count: number, days = USAGE_WINDOW_DAYS): number {
  if (count <= 0 || days <= 0) return 0;
  return count / days;
}

/**
 * Ritim → basamak. Eşikler gün cinsinden okunuyor:
 * iki haftada bir · haftada iki · günde bir · daha sık.
 */
export function usageLevel(rate: number): UsageLevel {
  if (rate <= 0) return 0;
  if (rate < 1 / 14) return 1;
  if (rate < 1 / 3.5) return 2;
  if (rate < 1) return 3;
  return 4;
}

/** Yoğunluğun doygunlaştığı ritim — bunun üstü artık daha parlak olmuyor */
const FULL_RATE = 2;
/** Görünürlüğün başladığı ritim (ayda bir) — eğrinin tabanı */
const SEEN_RATE = 1 / 30;

/**
 * Ritim → 0–1 sürekli yoğunluk. Logaritmik: ayda bir uğranan dal da
 * görünüyor (0.17 civarı), günde bir 0.83'e çıkıyor, üstü doygunlaşıyor.
 * Doğrusal olsaydı seyrek dallar görünmez, yoğun dallar da ekranı yakardı.
 */
export function usageIntensity(rate: number): number {
  if (rate <= 0) return 0;
  const top = Math.log(1 + FULL_RATE / SEEN_RATE);
  return Math.min(1, Math.log(1 + rate / SEEN_RATE) / top);
}

/** Pencerenin başlangıç anı (ms) — sayımlar bu andan sonrasını alıyor */
export function usageSince(now = Date.now()): number {
  return now - USAGE_WINDOW_DAYS * 24 * 60 * 60 * 1000;
}
