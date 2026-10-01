/**
 * Kayıt pencerelerinin ortak ölçüsü — girdi, uyku, ruh hali, hedef, not.
 *
 * Hepsi aynı boyda: yanlarda 16'şar px pay (eskiden ekranı yandan yana
 * kaplıyordu), sabit yükseklik. Boy içeriğe göre değişince (girdi 607, ruh
 * hali 760 px) her kart farklı bir pencere açıyormuş gibi duruyordu; not
 * tam sayfaya, hedef alttan açılan bir yüzeye gidiyordu.
 *
 * Yerleşim: başlık üstte, eylemler (Kaydet…) altta sabit, arası kayar.
 * İçerik kısaysa eylemler yine en altta durur (mt-auto); uzunsa kaydırırken
 * görünür kalır (sticky).
 */
export const ENTRY_WINDOW =
  "flex flex-col w-[calc(100%-2rem)] max-w-md h-[min(680px,calc(100dvh-6rem))] overflow-y-auto overscroll-contain pb-0";

/**
 * Alt eylem bölümü — kenardan kenara uzanır. Alt dolgu pencerede değil
 * burada (pencere pb-0): kayan kabın alt dolgusu yapışkan bölümün ALTINDA
 * kalıyor, arkadaki içerik oradan görünüyordu.
 */
export const ENTRY_WINDOW_FOOTER =
  "sticky bottom-0 z-10 mt-auto -mx-6 border-t border-[var(--ln-1)] bg-card px-6 pb-6 pt-3";

/**
 * Girdi ekleme ve düzenleme pencereleri biraz daha kısa: not artık pencerede
 * yazılmıyor (dokununca ayrı not görünümü açılıyor, bkz. note-editor), o
 * yüzden geniş bir yazma alanına yer ayırmak gerekmiyor.
 */
export const ENTRY_WINDOW_COMPACT = ENTRY_WINDOW.replace(
  "h-[min(680px,calc(100dvh-6rem))]",
  "h-[min(580px,calc(100dvh-6rem))]"
);

/**
 * Ruh hali penceresi büyük: duygu ızgarası, yoğunluk ve not tek bakışta
 * sığsın. Yine de pencere — kenarlarda (üstte ve altta 16 px) pay ve köşeler
 * kalıyor, tam ekran değil.
 */
export const ENTRY_WINDOW_LARGE = ENTRY_WINDOW.replace(
  "h-[min(680px,calc(100dvh-6rem))]",
  "h-[calc(100dvh-2rem)]"
);
