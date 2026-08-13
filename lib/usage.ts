/**
 * Kullanım seviyesi — bağ haritasındaki hatların kalınlığı ve parlaklığı
 * bundan çıkıyor.
 *
 * İki karar var burada, ikisi de bilinçli:
 *
 * 1. SAYIM PENCERELİ. Toplam girdi sayısı yanlış cevap veriyordu: iki yıl
 *    önce sıkı tuttuğun ama artık uğramadığın bir dal haritada hep parlak
 *    kalıyor, yeni edindiğin alışkanlık ise sönük duruyordu. Harita şu anki
 *    hayatı göstermeli, arşivi değil — o yüzden yalnız SON 30 GÜN sayılıyor.
 *
 * 2. SEVİYELER AYRIK. Oran sürekli olunca (en çok kullanılana bölmek) iki
 *    yakın dal ayırt edilemiyor, üstelik tek bir kalem her şeyi sönük
 *    bırakabiliyordu. Bunun yerine alışkanlık dilinde beş basamak var:
 *    hiç · ara sıra · haftalık · sık · neredeyse her gün. Eşikler mutlak,
 *    yani bir dalın basamağı komşusunun ne yaptığına bağlı değil.
 */

/** Sayımın kapsadığı gün sayısı */
export const USAGE_WINDOW_DAYS = 30;

/** 0 = hiç … 4 = neredeyse her gün */
export type UsageLevel = 0 | 1 | 2 | 3 | 4;

/**
 * Pencere içindeki girdi sayısı → basamak. Eşikler 30 güne göre okunuyor:
 * 3 girdi ayda birkaç kez, 8 girdi haftada iki, 20 girdi neredeyse her gün.
 */
export function usageLevel(count: number): UsageLevel {
  if (count <= 0) return 0;
  if (count < 3) return 1;
  if (count < 8) return 2;
  if (count < 20) return 3;
  return 4;
}

/** Basamağın 0–1 arası karşılığı — çizim kalınlığı ve parlaklığı için */
export function levelRatio(level: UsageLevel): number {
  return level / 4;
}

/** Pencerenin başlangıç anı (ms) — sayımlar bu andan sonrasını alıyor */
export function usageSince(now = Date.now()): number {
  return now - USAGE_WINDOW_DAYS * 24 * 60 * 60 * 1000;
}
