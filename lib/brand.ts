/**
 * Marka — ad ve logo tek yerde.
 *
 * Ad: Logbit (çevrilmez). İç adlar BİLEREK eski kaldı: IndexedDB "RoutineDB",
 * yedek dosyasının kimliği `app: "routine"`, ayar anahtarları "routine:*" ve
 * "routine-starter-seeded". Bunlar değişirse cihazdaki veri ve eski yedekler
 * görünmez olur.
 *
 * Logo: bit ızgarası — üç kare (kategori) ve bir daire (bit), uygulamanın
 * brütal dilinde: kalın siyah çerçeve, bulanıksız kaydırılmış gölge, düz renk.
 * Geometri 512×512 tuvalde; uygulamadaki simge (components/ui/logbit-mark)
 * ve ikon dosyaları (scripts/make-icons.mjs) buradan çizilir.
 */

export const APP_NAME = "Logbit";

export type MarkPart =
  | { kind: "rect"; x: number; y: number; size: number; r: number; fill: string }
  | { kind: "circle"; cx: number; cy: number; r: number; fill: string };

export const MARK = {
  bg: "#8ea6ff",
  ink: "#111111",
  /** çerçeve kalınlığı (512 tuvalde) */
  stroke: 20,
  /** sert gölgenin kayması */
  shadow: 16,
  parts: [
    { kind: "rect", x: 106, y: 106, size: 124, r: 28, fill: "#ffffff" },
    { kind: "rect", x: 266, y: 106, size: 124, r: 28, fill: "#ff9ecd" },
    { kind: "rect", x: 106, y: 266, size: 124, r: 28, fill: "#7ae582" },
    { kind: "circle", cx: 328, cy: 328, r: 64, fill: "#ffd23f" },
  ] as MarkPart[],
};
