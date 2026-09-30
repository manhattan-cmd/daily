/**
 * Kayıt pencerelerinin ortak ölçüsü — girdi, uyku, ruh hali, hedef, not.
 *
 * Aynı genişlik, aynı köşe ve düzen; boy İÇERİĞE göre, üst sınırla. Bir ara
 * hepsi sabit 680 px'ti: kısa bir girdide eylemler en alta itiliyor, notla
 * Kaydet arasında büyük bir boşluk kalıyordu ve pencere ekranı boylu boyunca
 * kaplıyordu. Uzun içerik (ruh halinin duygu ızgarası) sınırda durup içeride
 * kayar.
 *
 * Yerleşim: başlık üstte, eylemler altta (yan yana: İptal | Kaydet), arası
 * kayar; eylemler kaydırırken görünür kalır (sticky).
 */
export const ENTRY_WINDOW =
  "window-in flex flex-col w-[calc(100%-2.5rem)] max-w-[360px] max-h-[min(560px,calc(100dvh-8rem))] overflow-y-auto overscroll-contain rounded-3xl p-5 pb-0";

/**
 * Alt eylem bölümü — kenardan kenara uzanır, düğmeler yan yana ve eşit.
 * Alt dolgu pencerede değil burada (pencere pb-0): kayan kabın alt dolgusu
 * yapışkan bölümün ALTINDA kalıyor, arkadaki içerik oradan görünüyordu.
 */
export const ENTRY_WINDOW_FOOTER =
  "sticky bottom-0 z-10 mt-auto -mx-5 flex-row gap-2 border-t border-[var(--ln-1)] bg-card px-5 pb-5 pt-3 [&>*]:flex-1";
