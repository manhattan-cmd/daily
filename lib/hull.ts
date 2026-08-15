/**
 * Adacık sınırı — bir küme diski saran kapalı hat.
 *
 * Kalabalık haritada ağaç kendiliğinden takımadaya dönüşüyor: merkezin
 * çevresinde birbirinden ayrık kümeler. O kümeye bir SINIR çizilince harita
 * düğüm yığını olmaktan çıkıp ülkelere ayrılmış bir kıtaya benziyor — ve
 * asıl önemlisi, dokunulacak yer artık nokta değil ALAN oluyor. Bin küsur
 * düğümlü bir haritayla ancak böyle baş edilebiliyor.
 *
 * Sınır disklere TEĞET: her diskin çevresinden noktalar örnekleniyor ve
 * hepsinin dışbükey kabuğu alınıyor. Yalnız merkezlerin kabuğunu almak
 * yetmiyordu — kenardaki bir diskin yarısı sınırın dışında kalıyordu.
 * Dışbükeylik bilinçli: takımyıldız sınırları da böyle, ve bir kümeyi
 * saran en sade kapalı hat bu.
 */

export interface HullPoint {
  x: number;
  y: number;
}

export interface Disc extends HullPoint {
  r: number;
}

/**
 * Dışbükey kabuk — Andrew'un monoton zinciri. Saat yönünün tersine sıralı
 * köşeler döner; doğrusal (aradaki) noktalar atılır.
 */
export function convexHull(pts: HullPoint[]): HullPoint[] {
  if (pts.length < 3) return pts.slice();
  const p = pts.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: HullPoint, a: HullPoint, b: HullPoint) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

  const half = (src: HullPoint[]): HullPoint[] => {
    const out: HullPoint[] = [];
    for (const q of src) {
      while (
        out.length >= 2 &&
        cross(out[out.length - 2], out[out.length - 1], q) <= 0
      )
        out.pop();
      out.push(q);
    }
    out.pop(); // son nokta diğer yarının başı
    return out;
  };
  return half(p).concat(half(p.slice().reverse()));
}

/**
 * Disklere teğet kabuk. Her disk `samples` noktayla temsil ediliyor;
 * sekizden az örnekte kabuk köşeli çıkıyor ve disklerin omuzları taşıyor.
 */
export function discHull(discs: Disc[], pad = 0, samples = 12): HullPoint[] {
  const pts: HullPoint[] = [];
  for (const d of discs) {
    const r = d.r + pad;
    for (let i = 0; i < samples; i++) {
      const a = (i / samples) * Math.PI * 2;
      pts.push({ x: d.x + Math.cos(a) * r, y: d.y + Math.sin(a) * r });
    }
  }
  return convexHull(pts);
}

/**
 * Kabuğu yumuşak kapalı bir yola çevirir: her köşeden geçmek yerine kenar
 * ortalarını birleştirip köşeyi kontrol noktası yapıyoruz. Çokgen köşeleri
 * sivri duruyordu; ülke sınırı gibi durması için yuvarlanmaları gerekiyor.
 * Yumuşatma köşeleri biraz içeri çektiği için `discHull`'a verilen payın
 * birkaç piksel olması şart.
 */
export function smoothClosedPath(hull: HullPoint[]): string {
  const f = (p: HullPoint) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
  const n = hull.length;
  if (n === 0) return "";
  if (n < 3) {
    // İki noktaya inen bir kabuk çizilecek bir alan değil
    return `M ${f(hull[0])} L ${f(hull[n - 1])}`;
  }
  const mid = (a: HullPoint, b: HullPoint) => ({
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  });
  let d = `M ${f(mid(hull[n - 1], hull[0]))}`;
  for (let i = 0; i < n; i++) {
    const cur = hull[i];
    const next = hull[(i + 1) % n];
    d += ` Q ${f(cur)} ${f(mid(cur, next))}`;
  }
  return `${d} Z`;
}

/**
 * Dışbükey çokgeni bir yarı düzleme kırpar (Sutherland–Hodgman).
 * Doğru `origin`den `dx,dy` yönünde geçiyor; `sign` hangi yanın kalacağını
 * söylüyor (+1 sol, −1 sağ — açının arttığı yön "sol").
 */
function clipHalf(
  poly: HullPoint[],
  origin: HullPoint,
  dx: number,
  dy: number,
  sign: number
): HullPoint[] {
  const side = (p: HullPoint) =>
    sign * (dx * (p.y - origin.y) - dy * (p.x - origin.x));
  const out: HullPoint[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const sa = side(a);
    const sb = side(b);
    if (sa >= 0) out.push(a);
    if (sa >= 0 !== sb >= 0) {
      const t = sa / (sa - sb);
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return out;
}

/**
 * Kabuğu, `origin`den çıkan iki ışının arasındaki DİLİME kırpar.
 *
 * Adacık sınırlarının birbirine girmemesi bununla garanti ediliyor. Dışbükey
 * kabuk komşusunun girintisine taşabiliyor ve iki ülke üst üste biniyordu;
 * oysa yerleşim dalları merkezden bakınca zaten ayrı açı dilimlerine
 * koyuyor. Her adacık kendi dilimine kırpılınca bölgeler kesişemez hale
 * geliyor — kırpılan kenarlar da merkeze bakan düz hatlar oluyor, yani
 * komşu ülkeler ortak sınır paylaşıyormuş gibi duruyor.
 *
 * Dilim yarım turdan genişse kırpma yapılmıyor: o zaman iki yarı düzlemin
 * kesişimi dilimi vermiyor ve şekil yanlış kesiliyor.
 */
export function clipToWedge(
  poly: HullPoint[],
  origin: HullPoint,
  fromAngle: number,
  toAngle: number
): HullPoint[] {
  const TAU = Math.PI * 2;
  const span = ((toAngle - fromAngle) % TAU + TAU) % TAU;
  if (span <= 0 || span >= Math.PI) return poly;
  const a = clipHalf(poly, origin, Math.cos(fromAngle), Math.sin(fromAngle), 1);
  if (a.length < 3) return a;
  return clipHalf(a, origin, Math.cos(toAngle), Math.sin(toAngle), -1);
}

/** Noktaların kapladığı kutu */
export function boundsOf(pts: HullPoint[]) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of pts) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  return { x0, y0, x1, y1 };
}
