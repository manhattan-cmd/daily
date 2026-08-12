/**
 * Altıgen çizim yardımcıları.
 *
 * Yön: tabanı yere paralel altıgen (köşeler sağda ve solda). Bu yönde
 * komşular TAM ÜST, TAM ALT ve dört köşegende olur — sivri tepeli altıgende
 * "tam altına" diye bir komşu yoktur, o yüzden yön önemli.
 *
 * Hücrelerin NEREYE oturduğu artık burada değil: petek görünümü tek kademelik
 * yuva düzeninden (merkez + çevresi) bütün ağacın açık durduğu bir haritaya
 * geçti, o kural lib/hexmap.ts'te.
 */

export interface Point {
  x: number;
  y: number;
}

/**
 * Tabanı yere paralel altıgenin köşeleri — köşeler 0°, 60°… yani sağda ve
 * solda; üst ve alt kenarlar yatay.
 */
export function hexCorners(cx: number, cy: number, size: number): string {
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 180) * (60 * i);
    return `${(cx + size * Math.cos(a)).toFixed(2)},${(cy + size * Math.sin(a)).toFixed(2)}`;
  }).join(" ");
}

/** Aynı altıgenin CSS clip-path karşılığı (kutu oranı 2 : √3) */
export const HEX_CLIP =
  "polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)";
