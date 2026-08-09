/**
 * Altıgen yerleşim — merkez bir hücre, çevresinde çocukları.
 *
 * Yön: tabanı yere paralel altıgen (köşeler sağda ve solda). Bu yönde
 * komşular TAM ÜST, TAM ALT ve dört köşegende olur — sivri tepeli altıgende
 * "tam altına" diye bir komşu yoktur, o yüzden yön önemli.
 *
 * Yuvalar sayıya göre seçilir, sırayla doldurulmaz: amaç her sayıda
 * olabildiğince simetrik durmak. 3 çocuk alt-sağ/alt-sol/üst olur, 4 çocuk
 * kelebek (iki üst iki alt) olur — sıralı doldurma ikisini de bozardı.
 */

/** Ekran koordinatında (y aşağı) komşu yönleri, birim = altıgenin R'si */
const DIR = {
  N: { x: 0, y: -Math.sqrt(3) },
  NE: { x: 1.5, y: -Math.sqrt(3) / 2 },
  SE: { x: 1.5, y: Math.sqrt(3) / 2 },
  S: { x: 0, y: Math.sqrt(3) },
  SW: { x: -1.5, y: Math.sqrt(3) / 2 },
  NW: { x: -1.5, y: -Math.sqrt(3) / 2 },
} as const;

export type Dir = keyof typeof DIR;

/**
 * Çocuk sayısına göre yuva düzeni. Her satır kendi içinde simetrik:
 *   1 → tam alt
 *   2 → alt sağ + alt sol
 *   3 → alt sağ + alt sol + üst
 *   4 → kelebek (iki alt, iki üst)
 *   5 → kelebek + tam alt
 *   6 → altı kenarın hepsi
 */
const SLOTS: Record<number, Dir[]> = {
  1: ["S"],
  2: ["SW", "SE"],
  3: ["SW", "SE", "N"],
  4: ["SW", "SE", "NW", "NE"],
  5: ["SW", "SE", "NW", "NE", "S"],
  6: ["SW", "SE", "NW", "NE", "N", "S"],
};

export interface Point {
  x: number;
  y: number;
}

/**
 * 6'yı aşan çocuklar için ikinci halka. Yine simetri: tam alttaki boşluktan
 * başlanır, sonra sağa ve sola dönüşümlü açılır. Kullanıcının tarifindeki
 * "7. aşağıdaki boşluğa girer" kuralı budur.
 */
function secondRing(): Point[] {
  const cells: Point[] = [];
  const dirs = [DIR.N, DIR.NE, DIR.SE, DIR.S, DIR.SW, DIR.NW];
  // İki adımlık her bileşim — halka 2'nin 12 hücresi
  const seen = new Set<string>();
  for (const a of dirs) {
    for (const b of dirs) {
      const p = { x: a.x + b.x, y: a.y + b.y };
      const key = `${p.x.toFixed(3)},${p.y.toFixed(3)}`;
      // Merkeze dönenler ve halka 1'e düşenler elenir
      const r = Math.hypot(p.x, p.y);
      if (r < Math.sqrt(3) * 1.2 || seen.has(key)) continue;
      seen.add(key);
      cells.push(p);
    }
  }
  // Tam alttan başla, sağ/sol dönüşümlü aç
  return cells.sort((p, q) => {
    const ang = (c: Point) => Math.abs(Math.atan2(c.x, c.y)); // 0 = tam alt
    const d = ang(p) - ang(q);
    if (Math.abs(d) > 1e-6) return d;
    return q.x - p.x;
  });
}

/**
 * n çocuğun merkez etrafındaki konumları (birim R cinsinden, merkez 0,0).
 * 6'ya kadar simetrik yuva tablosundan, sonrası ikinci halkadan.
 */
export function hexSlots(n: number): Point[] {
  if (n <= 0) return [];
  if (n <= 6) return SLOTS[n].map((d) => ({ ...DIR[d] }));
  const ring1 = SLOTS[6].map((d) => ({ ...DIR[d] }));
  return [...ring1, ...secondRing().slice(0, n - 6)];
}

/**
 * Konumları piksele çevirip kutuyu hesapla. `size` altıgenin merkezden
 * köşesine uzaklığı; merkez hücre de kutuya dahil.
 */
export function hexLayout(n: number, size: number) {
  const slots = hexSlots(n).map((p) => ({ x: p.x * size, y: p.y * size }));
  const xs = [0, ...slots.map((p) => p.x)];
  const ys = [0, ...slots.map((p) => p.y)];
  // Yatayda köşeye (R), dikeyde kenara (R·√3/2) kadar taşar
  const padX = size * 1.05;
  const padY = size * (Math.sqrt(3) / 2) * 1.05;
  const minX = Math.min(...xs) - padX;
  const maxX = Math.max(...xs) + padX;
  const minY = Math.min(...ys) - padY;
  const maxY = Math.max(...ys) + padY;
  const offsetX = -minX;
  const offsetY = -minY;
  return {
    width: maxX - minX,
    height: maxY - minY,
    center: { x: offsetX, y: offsetY },
    nodes: slots.map((p) => ({ x: p.x + offsetX, y: p.y + offsetY })),
  };
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

/** Altıgen kutusunun en/boy oranı — genişlik 2R, yükseklik √3R */
export const HEX_RATIO = 2 / Math.sqrt(3);
