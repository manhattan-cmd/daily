/**
 * Analiz başlık bandının menüsü — TEK PANEL, iki satır: üstte zaman, altta
 * yol. Bir ara iki ayrı ray (iki çerçeve) ve kaydırınca kısılan bir bant
 * vardı; büyük duruyor ve iki ayrı şey gibi okunuyordu. Şimdi küçük ve sabit:
 * tek zemin, aralarında ince bir çizgi, öğeler aynı ölçüde. Fark yalnız
 * RENKTE — zaman bir ayar (seçili bölme nötr, ters renk), yol bir yer
 * (bulunulan kalem kategorinin renginde).
 */
export const MENU_PANEL =
  "flex flex-col overflow-hidden rounded-[14px] bg-[var(--sf-2)] ring-1 ring-inset ring-[var(--ln-1)]";
/** Panelin bir satırı (zaman ya da yol) */
export const RAIL = "flex h-[34px] min-w-0 items-center gap-0.5 px-[3px]";
/** Satırın öğesi — bölme ya da yol adımı */
export const RAIL_ITEM =
  "flex h-7 shrink-0 items-center justify-center rounded-[9px] text-[12px] font-semibold transition-colors";
