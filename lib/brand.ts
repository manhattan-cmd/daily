/**
 * Marka — ad ve logo tek yerde.
 *
 * Ad: Logbit (çevrilmez). İç adlar BİLEREK eski kaldı: IndexedDB "RoutineDB",
 * yedek dosyasının kimliği `app: "routine"`, ayar anahtarları "routine:*" ve
 * "routine-starter-seeded". Bunlar değişirse cihazdaki veri ve eski yedekler
 * görünmez olur.
 *
 * Logo: "Kutu" maskotu — pembe bir kategori karesi (kutu) karakter, önünde
 * sarı bir bit tutuyor ("bunu da kaydedelim"); elleri beyaz küçük bitler.
 * Brütal dil: kalın siyah çerçeve, bulanıksız kaydırılmış gölge, düz renk.
 * Geometri 512×512 tuvalde; uygulamadaki simge (components/ui/logbit-mark)
 * ve ikon dosyaları (scripts/make-icons.mjs) markPartsSvg'den çizilir.
 */

export const APP_NAME = "Logbit";

/**
 * Logonun parçaları, çizim sırasıyla. `detail` = yüz (gözler, ağız): tam
 * renkte mürekkep, tek renk ikonda oyulur. `sw`/`sh` = parçaya özel çerçeve
 * kalınlığı ve gölge kayması (küçük parçalar ince).
 */
export type MarkPart =
  | { kind: "rect"; x: number; y: number; w: number; h: number; r: number; fill: string; sw?: number; sh?: number }
  | { kind: "circle"; cx: number; cy: number; r: number; fill: string; sw?: number; sh?: number }
  | { kind: "detail"; svg: (color: string) => string };

const INK = "#111111";

export const MARK = {
  bg: "#8ea6ff",
  ink: INK,
  /** çerçeve kalınlığı (512 tuvalde) */
  stroke: 20,
  /** sert gölgenin kayması */
  shadow: 16,
  /** maskotun tuttuğu bit — kelime logosunda i'nin noktası da bu renk */
  bit: "#ffd23f",
  /** maskotun gövdesi (kategori kutusu) — kelime logosundaki maskot da bu renk */
  body: "#ff9ecd",
  parts: [
    // ayaklar
    { kind: "rect", x: 196, y: 398, w: 44, h: 26, r: 12, fill: INK },
    { kind: "rect", x: 272, y: 398, w: 44, h: 26, r: 12, fill: INK },
    // gövde: kategori kutusu
    { kind: "rect", x: 116, y: 120, w: 280, h: 262, r: 50, fill: "#ff9ecd" }, // = body
    // yüz
    {
      kind: "detail",
      svg: (c) =>
        `<ellipse cx="222" cy="204" rx="13" ry="19" fill="${c}"/><ellipse cx="290" cy="204" rx="13" ry="19" fill="${c}"/>` +
        `<path d="M226 244 Q256 268 286 244" fill="none" stroke="${c}" stroke-width="11" stroke-linecap="round"/>`,
    },
    // tuttuğu bit ve eller
    { kind: "circle", cx: 256, cy: 344, r: 54, fill: "#ffd23f" },
    { kind: "circle", cx: 196, cy: 350, r: 20, fill: "#ffffff", sw: 12, sh: 8 },
    { kind: "circle", cx: 316, cy: 350, r: 20, fill: "#ffffff", sw: 12, sh: 8 },
  ] as MarkPart[],
};

function shape(p: Exclude<MarkPart, { kind: "detail" }>, attrs: string): string {
  return p.kind === "rect"
    ? `<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="${p.r}"${attrs}/>`
    : `<circle cx="${p.cx}" cy="${p.cy}" r="${p.r}"${attrs}/>`;
}

/** Logonun kendisi (zeminsiz, 512 tuval): her parça önce sert gölgesi, üstünde rengi ve çerçevesi */
export function markPartsSvg(): string {
  return MARK.parts
    .map((p) => {
      if (p.kind === "detail") return p.svg(MARK.ink);
      const sw = p.sw ?? MARK.stroke;
      const sh = p.sh ?? MARK.shadow;
      const stroke = ` stroke="${MARK.ink}" stroke-width="${sw}" stroke-linejoin="round"`;
      // siyah parçanın gölgesi kendine yapışıp kütleye dönüşür — onlarda gölge yok
      const shadow = p.fill === MARK.ink ? "" : shape(p, ` fill="${MARK.ink}"${stroke} transform="translate(${sh} ${sh})"`);
      return shadow + shape(p, ` fill="${p.fill}"${stroke}`);
    })
    .join("");
}

/**
 * Tek renk siluet için maske içeriği (beyaz = görünür): parçalar dolu, üst üste
 * binenlerin arası ve yüz oyuk. Temalı Android ikonu bununla çizilir.
 */
export function markMaskSvg(): string {
  return MARK.parts
    .map((p) =>
      p.kind === "detail"
        ? p.svg("#000")
        : shape(p, ` fill="#fff" stroke="#000" stroke-width="14" stroke-linejoin="round"`)
    )
    .join("");
}
