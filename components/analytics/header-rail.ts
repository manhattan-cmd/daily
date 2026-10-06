/**
 * Analiz başlık bandının iki rayı (zaman + yol) için ortak ölçüler. İki satır
 * aynı aileden görünsün: aynı genişlik, yükseklik, köşe ve öğe biçimi. Fark
 * yalnız RENKTE — zaman bir ayar (seçili bölme nötr, ters renk), yol bir yer
 * (bulunulan kalem kategorinin renginde).
 *
 * Bant aşağı kayınca kısılır (PageHeader collapsed → data-collapsed): raylar
 * ve öğeleri incelir.
 */
export const RAIL =
  "flex h-10 min-w-0 items-center gap-0.5 rounded-[14px] bg-[var(--sf-2)] p-1 ring-1 ring-inset ring-[var(--ln-1)] group-data-[collapsed=true]/hdr:h-8 group-data-[collapsed=true]/hdr:rounded-[12px] group-data-[collapsed=true]/hdr:p-[3px]";
/** Rayın öğesi — bölme ya da yol adımı */
export const RAIL_ITEM =
  "flex h-8 shrink-0 items-center justify-center rounded-[10px] text-[12.5px] font-semibold transition-colors group-data-[collapsed=true]/hdr:h-[26px] group-data-[collapsed=true]/hdr:rounded-[9px] group-data-[collapsed=true]/hdr:text-[12px]";
