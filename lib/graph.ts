/**
 * Bağ haritası yerleşimi — uygulamanın kendi mantığının resmi.
 *
 * Ortada bulunulan yer duruyor; ona bağlı olan HER ŞEY tek bakışta görünüyor:
 * kategoriler gövdeden ayrılıyor, alt kategoriler kendi kategorilerinden
 * saçaklanıyor, girdisi olan kalemlerin özellikleri en uçta kılcal gibi
 * duruyor. Yani "kategori → alt kategori → özellik" zinciri anlatılmıyor,
 * doğrudan gösteriliyor. Bir düğüme dokununca merkez o oluyor ve aynı resim
 * onun ağacı için yeniden kuruluyor.
 *
 * Yerleşim ışınsal HALKA değil, YAYILAN bir sinir yığını. Önce halka
 * denendi: her dal yaprak sayısı kadar açı alıyordu, dolayısıyla en dıştaki
 * halka bütün yaprakların sığacağı çevreye kadar büyüyordu — harita kocaman
 * oluyor, pencereye sığdırmak için küçültülünce de hiçbir şey okunmuyordu.
 * Şimdi her dal, anasının BAKTIĞI YÖNDE dar bir koni içinde açılıyor;
 * mesafeler derinlikle kısalıyor ve düğümler birbirini itip yer açıyor.
 * Sonuç hem çok daha küçük bir alan, hem de düzgün bir çarkın değil dağınık
 * bir sinir ağının görüntüsü.
 *
 * Dağınıklık rastgele DEĞİL: her sapma düğümün kimliğinden türetiliyor, yani
 * aynı yapı her açılışta aynı yerde duruyor. Dolaşırken yer değiştiren bir
 * harita güven vermiyordu.
 *
 * Boy neyi söylüyor: kök > kategori > alt kategori > özellik. Kategorinin ve
 * alt kategorinin çapı kendi çocuk sayısıyla da biraz büyüyor. Kullanım
 * sıklığı buraya karışmıyor — o, hattın kalınlığı ve parlaklığıyla
 * anlatılıyor (çizim tarafında).
 */

export interface Point {
  x: number;
  y: number;
}

export type GraphKind = "root" | "cat" | "sub" | "mod";

/** Yerleşime verilen ağaç — sırası korunur */
export interface GraphSeed {
  id: string;
  kind: GraphKind;
  children?: GraphSeed[];
}

export interface PlacedNode extends Point {
  id: string;
  kind: GraphKind;
  /** Kök 0 */
  depth: number;
  parentId: string;
  r: number;
  /** Merkezden bakış açısı (radyan) — etiket yönü için işe yarar */
  angle: number;
}

export interface GraphEdge {
  /** Çocuğun kimliği — kenar ona aittir */
  id: string;
  parentId: string;
  path: string;
  width: number;
  /** Çocuğun derinliği: gövdeye yakın kenar daha kalın */
  depth: number;
}

export interface GraphLayout {
  width: number;
  height: number;
  center: Point;
  /** Merkezdeki gövdenin yarıçapı */
  coreR: number;
  /** Kök hariç tüm düğümler (kök merkezde ayrıca çiziliyor) */
  nodes: PlacedNode[];
  byId: Map<string, PlacedNode>;
  edges: GraphEdge[];
}

/** Diskler arasında bırakılan en az boşluk (px) */
const GAP = 9;
/**
 * Kutu kenar payı. Adlar diskin DIŞINA yazıldığı için pay yatayda geniş:
 * yandaki düğümlerin yazısı kutunun dışına taşarsa pencere onu kırpıyor
 * ("Sabah koşusu" → "koşusu"). Dikeyde tek satır yettiği için dar.
 */
const PAD_X = 54;
const PAD_Y = 24;

/** Düğüm çapı türden gelir; kategori ve alt kategori çocuk sayısıyla büyür */
export function nodeRadius(kind: GraphKind, childCount: number): number {
  const c = Math.max(0, childCount);
  switch (kind) {
    case "root":
      return 25;
    case "cat":
      return Math.min(24, 14 + 3.4 * Math.sqrt(c));
    case "sub":
      return Math.min(17, 10 + 2.4 * Math.sqrt(c));
    case "mod":
      return 4.5;
  }
}

/** Kimlikten türeyen sabit tohum — aynı düğüm hep aynı sapmayı alır */
function seedOf(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
/** Tohumdan −1..1 arası sabit bir sapma */
function jitter(id: string, salt: number): number {
  const h = seedOf(id + ":" + salt);
  return (h % 2000) / 1000 - 1;
}

interface Placed {
  seed: GraphSeed;
  depth: number;
  parentId: string;
  r: number;
  x: number;
  y: number;
  /** Bu düğümün dışa bakış yönü — çocukları bu yönde açılıyor */
  dir: number;
}

/**
 * Bir düğümün çocuklarının açıldığı koni. Kökte tam çember; aşağıda dar bir
 * yelpaze — sinir ucu geriye doğru dallanmaz, ileri doğru saçaklanır.
 */
function coneOf(depth: number, n: number): number {
  if (depth === 0) return Math.PI * 2;
  return Math.min(Math.PI * 1.15, 0.75 + 0.42 * n);
}

/** Ana ile çocuk arasındaki boşluk — derinleştikçe kısalıyor */
function stepOf(depth: number): number {
  return [34, 27, 21, 17][Math.min(depth, 3)];
}

export function graphLayout(root: GraphSeed): GraphLayout {
  const all: Placed[] = [];
  const rootR = nodeRadius(root.kind, (root.children ?? []).length);

  const walk = (
    node: GraphSeed,
    depth: number,
    parentId: string,
    x: number,
    y: number,
    dir: number,
    r: number
  ) => {
    all.push({ seed: node, depth, parentId, r, x, y, dir });
    const kids = node.children ?? [];
    if (!kids.length) return;
    const cone = coneOf(depth, kids.length);
    // Tam çemberde ilk ve son çocuk çakışmasın diye pay bir eksik bölünür
    const denom = depth === 0 ? kids.length : Math.max(1, kids.length - 1);
    kids.forEach((kid, i) => {
      const kr = nodeRadius(kid.kind, (kid.children ?? []).length);
      const t = kids.length === 1 ? 0.5 : i / denom;
      const base =
        depth === 0
          ? -Math.PI / 2 + t * Math.PI * 2
          : dir - cone / 2 + t * cone;
      // Sapmalar dağınıklığı veriyor: açı biraz kayıyor, mesafe biraz
      // değişiyor. Kimlikten türedikleri için harita her açılışta aynı.
      const a = base + jitter(kid.id, 1) * (cone / kids.length) * 0.28;
      const dist =
        (r + kr + stepOf(depth)) * (1 + jitter(kid.id, 2) * 0.16);
      const nx = x + Math.cos(a) * dist;
      const ny = y + Math.sin(a) * dist;
      walk(kid, depth + 1, node.id, nx, ny, a + jitter(kid.id, 3) * 0.2, kr);
    });
  };
  walk(root, 0, "", 0, 0, -Math.PI / 2, rootR);

  // ── İtiş: üst üste binen diskler birbirini açıyor ───────────────────────
  // Koni yerleşimi sıkı ama kusursuz değil; kalabalık dallar birbirinin
  // üstüne binebiliyor. Sabit sayıda tur, sabit sırayla — sonuç yine
  // belirli. Kök yerinden oynamıyor, merkez merkez kalsın.
  const pushApart = (times: number) => {
    for (let pass = 0; pass < times; pass++) {
      let moved = false;
      for (let i = 0; i < all.length; i++)
        for (let j = i + 1; j < all.length; j++) {
          const a = all[i];
          const b = all[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const want = a.r + b.r + GAP;
          const d = Math.hypot(dx, dy);
          if (d >= want) continue;
          // Üst üste tam oturmuşlarsa kimliğe göre sabit bir yöne aç
          const ux =
            d > 0.01 ? dx / d : Math.cos(jitter(b.seed.id, 4) * Math.PI);
          const uy =
            d > 0.01 ? dy / d : Math.sin(jitter(b.seed.id, 4) * Math.PI);
          const push = (want - d) / 2 + 0.01;
          if (a.depth > 0) {
            a.x -= ux * push;
            a.y -= uy * push;
          }
          if (b.depth > 0) {
            b.x += ux * push;
            b.y += uy * push;
          }
          moved = true;
        }
      if (!moved) break;
    }
  };
  pushApart(70);

  // ── Toparlama: çocuk anasından fazla uzaklaştıysa geri çekiliyor ────────
  // İtiş dalları savurabiliyor; bu yay hattı kısa tutuyor, harita da dar
  // kalıyor. Çakışmayı bozmayacak kadar zayıf.
  const byIdRaw = new Map(all.map((p) => [p.seed.id, p]));
  for (let pass = 0; pass < 12; pass++)
    for (const p of all) {
      if (p.depth === 0) continue;
      const parent = byIdRaw.get(p.parentId);
      if (!parent) continue;
      const dx = p.x - parent.x;
      const dy = p.y - parent.y;
      const d = Math.hypot(dx, dy) || 1;
      const want = parent.r + p.r + stepOf(p.depth - 1);
      if (d <= want * 1.25) continue;
      const pull = (d - want * 1.25) * 0.35;
      p.x -= (dx / d) * pull;
      p.y -= (dy / d) * pull;
    }
  // Toparlama diskleri yeniden üst üste bindirmiş olabilir; son söz itişin
  pushApart(40);

  // ── Kutu ───────────────────────────────────────────────────────────────
  const kids = all.filter((p) => p.depth > 0);
  let minX = -rootR;
  let maxX = rootR;
  let minY = -rootR;
  let maxY = rootR;
  for (const p of kids) {
    minX = Math.min(minX, p.x - p.r);
    maxX = Math.max(maxX, p.x + p.r);
    minY = Math.min(minY, p.y - p.r);
    maxY = Math.max(maxY, p.y + p.r);
  }
  const center: Point = { x: -minX + PAD_X, y: -minY + PAD_Y };

  const nodes: PlacedNode[] = kids.map((p) => ({
    id: p.seed.id,
    kind: p.seed.kind,
    depth: p.depth,
    parentId: p.parentId,
    r: p.r,
    angle: Math.atan2(p.y, p.x),
    x: p.x + center.x,
    y: p.y + center.y,
  }));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const posOf = (id: string): Point =>
    id === root.id ? center : byId.get(id) ?? center;
  const radiusOf = (id: string) =>
    id === root.id ? rootR : byId.get(id)?.r ?? 0;

  // ── Hatlar ─────────────────────────────────────────────────────────────
  // Düz çizgi tekerlek parmağı gibi duruyordu; her hat kimliğinden gelen
  // sabit bir kavis alıyor. Uçlar disklerin İÇİNE giriyor: düğümler üstte
  // çizildiği için hat oradan çıkmış gibi kaynıyor, uç uca eklenmiş gibi
  // durmuyor.
  const edges: GraphEdge[] = nodes.map((n) => {
    const p0 = posOf(n.parentId);
    const p1 = { x: n.x, y: n.y };
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const len = Math.hypot(dx, dy) || 1;
    const bend = jitter(n.id, 5) * Math.min(26, len * 0.24);
    const ctl = {
      x: (p0.x + p1.x) / 2 - (dy / len) * bend,
      y: (p0.y + p1.y) / 2 + (dx / len) * bend,
    };
    const from = toward(p0, ctl, radiusOf(n.parentId) * 0.6);
    const to = toward(p1, ctl, n.r * 0.6);
    const s = (p: Point) => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
    return {
      id: n.id,
      parentId: n.parentId,
      path: `M ${s(from)} Q ${s(ctl)} ${s(to)}`,
      width: Math.max(0.9, 2.4 - 0.45 * n.depth),
      depth: n.depth,
    };
  });

  return {
    width: maxX - minX + PAD_X * 2,
    height: maxY - minY + PAD_Y * 2,
    center,
    coreR: rootR,
    nodes,
    byId,
    edges,
  };
}

/** p'den q yönünde d kadar ilerlemiş nokta */
function toward(p: Point, q: Point, d: number): Point {
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: p.x + (dx / len) * d, y: p.y + (dy / len) * d };
}
