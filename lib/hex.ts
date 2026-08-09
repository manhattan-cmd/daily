/**
 * Kovan (honeycomb) yerleşimi.
 *
 * Kategoriler ızgarada değil, ortadan dışa doğru büyüyen bir petekte durur:
 * merkez hücre, çevresinde 6'lık halka, sonra 12'lik, sonra 18'lik. Sayı tam
 * bir halkayı doldurmadığında peteğin ucu açık kalır — 11 kalem "yarım örülmüş
 * kovan" gibi görünür. Bu kasıtlı: yapının büyümeye açık olduğunu şekil
 * kendisi söylüyor.
 */

/** Eksenel (axial) altıgen koordinatı */
export interface Axial {
  q: number;
  r: number;
}

/** Sivri tepeli altıgende bir komşuya gitmenin altı yönü */
const DIRECTIONS: Axial[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

/**
 * Merkezden dışa doğru spiral sırayla n hücre.
 *
 * Halka halka ilerler; bir halkayı doldurmadan dışarı çıkmaz, böylece eksik
 * kalan hep en dış halkadadır ve boşluk tek bir yerde toplanır (dağınık
 * delikler yerine).
 */
export function hexSpiral(n: number): Axial[] {
  if (n <= 0) return [];
  const out: Axial[] = [{ q: 0, r: 0 }];
  for (let ring = 1; out.length < n; ring++) {
    // Halkaya, 5. yöne doğru `ring` adım giderek gir
    let q = DIRECTIONS[4].q * ring;
    let r = DIRECTIONS[4].r * ring;
    for (let side = 0; side < 6 && out.length < n; side++) {
      for (let step = 0; step < ring && out.length < n; step++) {
        out.push({ q, r });
        q += DIRECTIONS[side].q;
        r += DIRECTIONS[side].r;
      }
    }
  }
  return out;
}

/** n hücreyi saran peteğin kaç halka ettiği (merkez = 0) */
export function hexRings(n: number): number {
  let ring = 0;
  while (1 + 3 * ring * (ring + 1) < n) ring++;
  return ring;
}

/**
 * Eksenel koordinat → piksel merkezi (sivri tepeli / pointy-top).
 * `size` altıgenin merkezden köşesine uzaklığı.
 */
export function axialToPixel(a: Axial, size: number): { x: number; y: number } {
  return {
    x: size * Math.sqrt(3) * (a.q + a.r / 2),
    y: size * 1.5 * a.r,
  };
}

/** Sivri tepeli altıgenin köşe noktaları — SVG polygon ve clip-path için */
export function hexCorners(cx: number, cy: number, size: number): string {
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 180) * (60 * i - 90);
    return `${(cx + size * Math.cos(a)).toFixed(2)},${(cy + size * Math.sin(a)).toFixed(2)}`;
  }).join(" ");
}

/** Sivri tepeli altıgen clip-path (yüzde tabanlı — her boyutta çalışır) */
export const HEX_CLIP =
  "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)";

/**
 * n hücrelik peteğin kapladığı kutu ve merkez ofseti.
 * Petek dikey yönde 1.5·size adımlarla, yatayda √3·size adımlarla büyür.
 */
export function hexBounds(n: number, size: number) {
  const cells = hexSpiral(n).map((a) => axialToPixel(a, size));
  const xs = cells.map((c) => c.x);
  const ys = cells.map((c) => c.y);
  const pad = size * 1.15;
  const minX = Math.min(0, ...xs) - pad;
  const maxX = Math.max(0, ...xs) + pad;
  const minY = Math.min(0, ...ys) - pad;
  const maxY = Math.max(0, ...ys) + pad;
  return {
    width: maxX - minX,
    height: maxY - minY,
    offsetX: -minX,
    offsetY: -minY,
  };
}
