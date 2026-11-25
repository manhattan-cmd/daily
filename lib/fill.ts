/**
 * Renkli dolgu — blok dilinin renkli yüzeyleri (bölüm başları, şeritler,
 * karolar, kartın künyesi) rengi doğrudan değil bununla basıyor.
 *
 * Brütal'de rengin kendisi. Gece'de rengin GECE TONU: aynı renk tonu (hue),
 * yarı doygunluk, bütün renklerde aynı algısal parlaklık (OKLCH L 0.33).
 * Böylece sarı gri bir zeytine değil koyu altına, turuncu kehribara döner;
 * her rengin üstünde açık yazı aynı kontrastla okunur. (Kâğıda yüzdeyle
 * karıştırmak denendi — sarı ve turuncu çamurlaşıyordu.)
 *
 * Tema seçimi CSS'te: `color-mix(in srgb, RENK var(--fill-k), GECE_TONU)` —
 * Brütal'de --fill-k 100% (rengin kendisi), Gece'de 0%. Gece tonu burada
 * hesaplanıp sabit renk olarak yazılıyor; tarayıcının göreli renk sözdizimine
 * (oklch(from …)) dayanmıyor, eski WebView'larda da çalışır.
 *
 * Küçük işaretler (noktalar, çubuklar, grafik) bunu KULLANMIYOR — gecede de
 * kendi parlaklıklarında, ışık gibi dururlar. Bkz. app/globals.css
 * "Blok dili renkleri".
 */

/** Gece tonunun parlaklığı ve doygunluk çarpanı (globals.css'teki gece
 *  kurallarıyla ve lib/skin-boot durum çubuğu renkleriyle aynı) */
export const NIGHT_L = 0.33;
export const NIGHT_C = 0.5;

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

function parseHex(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.replace(/./g, (x) => x + x);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number];
}

const cache = new Map<string, string | null>();

/** Rengin tonu (hue) korunarak OKLCH parlaklığı `L`, doygunluğu `k` katı */
function oklchTone(rgb: [number, number, number], L: number, k: number): string {
  const [r, g, b] = rgb.map(toLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const A = (1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s) * k;
  const B = (0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s) * k;
  const l2 = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m2 = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s2 = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const out = [
    4.0767416621 * l2 - 3.3077115913 * m2 + 0.2309699292 * s2,
    -1.2684380046 * l2 + 2.6097574011 * m2 - 0.3413193965 * s2,
    -0.0041960863 * l2 - 0.7034186147 * m2 + 1.707614701 * s2,
  ]
    .map((c) => Math.round(Math.min(1, Math.max(0, toGamma(c))) * 255))
    .map((c) => c.toString(16).padStart(2, "0"))
    .join("");
  return `#${out}`;
}

/** Rengin gece tonu (#rrggbb) — hex değilse null */
export function nightTone(color: string): string | null {
  const hit = cache.get(color);
  if (hit !== undefined) return hit;
  const rgb = parseHex(color);
  const res = rgb ? oklchTone(rgb, NIGHT_L, NIGHT_C) : null;
  cache.set(color, res);
  return res;
}

/** Rengin gecede yanan hali — koyu tonlu yüzeyin üstündeki simge için
 *  parlak ton (OKLCH L 0.84, doygunluk korunur). Hex değilse null. */
export function nightGlow(color: string): string | null {
  const key = `glow:${color}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const rgb = parseHex(color);
  if (!rgb) {
    cache.set(key, null);
    return null;
  }
  const res = oklchTone(rgb, 0.84, 0.9);
  cache.set(key, res);
  return res;
}

/** Renkli yüzeyin üstündeki simge: Brütal'de mürekkep (siyah), Gece'de
 *  rengin yanan hali — "renkler ışık" */
export function blockInk(color: string): string {
  const glow = nightGlow(color);
  return glow ? `color-mix(in srgb, var(--ink) var(--fill-k), ${glow})` : "var(--ink)";
}

/** Renkli yüzeyin zemini: Brütal'de renk, Gece'de gece tonu */
export function blockFill(color: string): string {
  const night = nightTone(color);
  // Hex olmayan (değişken, saydam renk) — gecede kâğıda yüzdeyle karışır
  if (!night) return `color-mix(in srgb, ${color} calc(100% * var(--fill-scale)), var(--paper))`;
  return `color-mix(in srgb, ${color} var(--fill-k), ${night})`;
}

/** Rengin açık tonu — Brütal'de beyaza `pct` oranında karışmış hali; Gece'de
 *  aynı oran gece ölçeğiyle kâğıda */
export const blockFillTint = (color: string, pct: number): string =>
  `color-mix(in srgb, ${color} calc(${pct}% * var(--fill-scale)), var(--paper))`;

/**
 * Renkli yüzeyin stili: zemini blockFill, ayrıca rengin kendisi `--fc`
 * değişkeninde. Brütal --fc'yi okumaz (görünüş aynı); Gece bölüm başlarını,
 * künyeleri ve bantları bu renkle ışıtır — zeminin içine rengin ışığı sızar,
 * kenarında rengin kıl çizgisi yanar (bkz. app/gece.css).
 */
export const fillStyle = (color: string) => ({
  background: blockFill(color),
  ["--fc" as string]: color,
});
