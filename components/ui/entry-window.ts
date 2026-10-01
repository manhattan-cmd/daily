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
 *
 * Açılış yaylı (window-pop, globals.css) — girdi ekleme ekranıyla aynı his.
 */
export const ENTRY_WINDOW =
  "window-pop flex flex-col w-[calc(100%-2rem)] max-w-md h-[min(680px,calc(100dvh-6rem))] overflow-y-auto overscroll-contain pb-0";

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

/**
 * Girdi ekleme ekranı — TAM EKRAN. Uygulamada en sık yapılan iş; pencerede
 * liste dar kalıyordu ve klavye açılınca geriye pek bir şey görünmüyordu.
 * Telefonda ekranın tamamı; masaüstünde telefon çerçevesinin tam üstüne
 * oturur (app-shell'deki ölçüler). Kabuk saydam ve hareketsiz: açılış
 * animasyonu içteki yüzeyde (entry-screen-in), çünkü masaüstündeki ortalama
 * transform'u animasyon ezerdi.
 */
export const ENTRY_SCREEN =
  "inset-0 left-0 top-0 flex h-dvh w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-0 bg-transparent p-0 shadow-none md:left-1/2 md:top-1/2 md:h-[min(844px,calc(100dvh-4rem))] md:w-[390px] md:-translate-x-1/2 md:-translate-y-1/2";
