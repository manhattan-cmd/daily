/**
 * Marka — ad ve logo tek yerde.
 *
 * Ad: Logbit (çevrilmez). İç adlar BİLEREK eski kaldı: IndexedDB "RoutineDB",
 * yedek dosyasının kimliği `app: "routine"`, ayar anahtarları "routine:*" ve
 * "routine-starter-seeded". Bunlar değişirse cihazdaki veri ve eski yedekler
 * görünmez olur.
 *
 * Logo: paylaşılan bit — dört kare (kategori), tam ortada hepsine değen bir
 * daire (bit); bitin karelerle kesiştiği yerler yeşil (girdi). Uygulamada bir
 * özellik birçok kategoride aynı atom olabildiği için bit hepsine değiyor.
 * Brütal dil: kalın siyah çerçeve, bulanıksız kaydırılmış gölge, düz renk.
 * Geometri 512×512 tuvalde; uygulamadaki simge (components/ui/logbit-mark)
 * ve ikon dosyaları (scripts/make-icons.mjs) buradan çizilir.
 *
 * Kesişim ya hiç olmamalı ya belirgin: çerçeve ve gölge dar şeridi örtüyor,
 * ince kesişim kıymık gibi okunur.
 */

export const APP_NAME = "Logbit";

export type MarkSquare = { x: number; y: number; size: number; r: number; fill: string };
export type MarkBit = { cx: number; cy: number; r: number; fill: string };

export const MARK = {
  bg: "#8ea6ff",
  ink: "#111111",
  /** çerçeve kalınlığı (512 tuvalde) */
  stroke: 20,
  /** sert gölgenin kayması */
  shadow: 16,
  /** bitin karelerle kesiştiği yerin rengi */
  meet: "#7ae582",
  squares: [
    { x: 108, y: 108, size: 130, r: 28, fill: "#ffffff" },
    { x: 258, y: 108, size: 130, r: 28, fill: "#ff9ecd" },
    { x: 108, y: 258, size: 130, r: 28, fill: "#c9b8ff" },
    { x: 258, y: 258, size: 130, r: 28, fill: "#ffb38a" },
  ] as MarkSquare[],
  bit: { cx: 248, cy: 248, r: 90, fill: "#ffd23f" } as MarkBit,
};
