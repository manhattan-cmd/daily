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
 * Yerleşim ışınsal ağaç: her dal, kendi YAPRAK sayısı kadar açı alıyor.
 * Kalabalık dal geniş bir yelpaze açıyor, tek çocuklu dal ince bir sap
 * kalıyor — halkalar da o yaprakların sığacağı çevreye göre büyüyor. Kural
 * belirli, rastgelelik yok: aynı yapı her açılışta aynı yerde duruyor.
 *
 * Boy neyi söylüyor: kök > kategori > alt kategori > özellik. Kategorinin ve
 * alt kategorinin çapı kendi çocuk sayısıyla da biraz büyüyor. Kullanım
 * sıklığı buraya karışmıyor — o parlaklıkla anlatılıyor (çizim tarafında).
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
  /** Eğrinin üç noktası — biyolojik deri bunlardan kendi şeridini kuruyor */
  from: Point;
  ctl: Point;
  to: Point;
  /** Uzantının gövde ucundaki ve uç noktadaki kalınlığı (px) */
  w0: number;
  w1: number;
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

/**
 * Diskler arasında bırakılan en az boşluk (px). Yalnız çakışmayı önlemekle
 * kalmıyor: her düğümün adı diskinin dışına yazılıyor, o satırın sığacağı
 * yer de buradan çıkıyor. Daha dar bir boşlukta adlar komşu halkanın
 * disklerine biniyordu.
 */
const GAP = 24;
/**
 * Kutu kenar payı. Adlar diskin DIŞINA yazıldığı için pay yatayda geniş:
 * yandaki düğümlerin yazısı kutunun dışına taşarsa pencere onu kırpıyor
 * ("Sabah koşusu" → "koşusu"). Dikeyde tek satır yettiği için dar.
 */
const PAD_X = 62;
const PAD_Y = 26;

/** Düğüm çapı türden gelir; kategori ve alt kategori çocuk sayısıyla büyür */
export function nodeRadius(kind: GraphKind, childCount: number): number {
  const c = Math.max(0, childCount);
  switch (kind) {
    case "root":
      return 28;
    case "cat":
      return Math.min(30, 16 + 4.6 * Math.sqrt(c));
    case "sub":
      return Math.min(22, 11 + 3.4 * Math.sqrt(c));
    case "mod":
      return 5;
  }
}

interface Meta {
  seed: GraphSeed;
  depth: number;
  /** Bu dalın altındaki yaprak sayısı — açı payı bundan */
  leaves: number;
  r: number;
  parentId: string;
}

export function graphLayout(root: GraphSeed): GraphLayout {
  const metas = new Map<string, Meta>();
  const walk = (s: GraphSeed, depth: number, parentId: string): number => {
    const kids = s.children ?? [];
    const m: Meta = {
      seed: s,
      depth,
      leaves: 1,
      r: nodeRadius(s.kind, kids.length),
      parentId,
    };
    metas.set(s.id, m);
    if (!kids.length) return 1;
    let leaves = 0;
    for (const k of kids) leaves += walk(k, depth + 1, s.id);
    m.leaves = leaves;
    return leaves;
  };
  walk(root, 0, "");

  const all = [...metas.values()];
  const maxDepth = all.reduce((d, m) => Math.max(d, m.depth), 0);
  const coreR = metas.get(root.id)!.r;
  const L = metas.get(root.id)!.leaves;

  // ── Halka yarıçapları ────────────────────────────────────────────────────
  // İki kural birlikte: (1) bir düğümün açı dilimi kendi çapını almalı —
  // dilim yaprak payından geldiği için bu, halkayı yaprak sayısı kadar
  // büyütür; (2) ardışık halkalar birbirine değmemeli. İkisi de sağlanınca
  // hiçbir disk bir diğerine giremiyor, bunu test de tutuyor.
  const ringR: number[] = [0];
  for (let d = 1; d <= maxDepth; d++) {
    const at = all.filter((m) => m.depth === d);
    let need = 0;
    for (const m of at)
      need = Math.max(need, ((2 * m.r + GAP) * L) / (2 * Math.PI * m.leaves));
    const prevMax = all
      .filter((m) => m.depth === d - 1)
      .reduce((r, m) => Math.max(r, m.r), 0);
    const curMax = at.reduce((r, m) => Math.max(r, m.r), 0);
    ringR[d] = Math.max(need, ringR[d - 1] + prevMax + curMax + GAP);
  }

  // ── Açı payları ──────────────────────────────────────────────────────────
  // Kök tam çemberi çocuklarına yaprak oranında bölüştürür; her çocuk kendi
  // dilimini kendi çocuklarına aynı kuralla böler. Açılar sarmalanmadan
  // (normalize edilmeden) taşınıyor: kenar eğrisi ana-çocuk açı farkını
  // kullanıyor, 2π atlaması olursa eğri ters tarafa dolanır.
  const angle = new Map<string, number>();
  const place = (id: string, start: number, span: number) => {
    const m = metas.get(id)!;
    angle.set(id, start + span / 2);
    let acc = start;
    for (const k of m.seed.children ?? []) {
      const km = metas.get(k.id)!;
      const w = span * (km.leaves / m.leaves);
      place(k.id, acc, w);
      acc += w;
    }
  };
  // İlk dal tam yukarıda başlasın diye kendi diliminin yarısı kadar geri alınır
  const firstKid = root.children?.[0];
  const firstHalf = firstKid
    ? Math.PI * (metas.get(firstKid.id)!.leaves / L)
    : 0;
  place(root.id, -Math.PI / 2 - firstHalf, 2 * Math.PI);

  const polar = (r: number, a: number): Point => ({
    x: Math.cos(a) * r,
    y: Math.sin(a) * r,
  });

  const raw = all
    .filter((m) => m.depth > 0)
    .map((m) => ({
      meta: m,
      p: polar(ringR[m.depth], angle.get(m.seed.id)!),
    }));

  // ── Kutu ─────────────────────────────────────────────────────────────────
  // Kutu içeriğe göre kırpılıyor, kare değil: dallar bir yana yığıldığında
  // (kalabalık kategori geniş yelpaze açar) kare kutu karşı tarafta kocaman
  // bir boşluk bırakıyor ve harita pencerede yana kaçmış görünüyordu.
  let minX = -coreR;
  let maxX = coreR;
  let minY = -coreR;
  let maxY = coreR;
  for (const { meta, p } of raw) {
    minX = Math.min(minX, p.x - meta.r);
    maxX = Math.max(maxX, p.x + meta.r);
    minY = Math.min(minY, p.y - meta.r);
    maxY = Math.max(maxY, p.y + meta.r);
  }
  const center: Point = { x: -minX + PAD_X, y: -minY + PAD_Y };

  const nodes: PlacedNode[] = raw.map(({ meta, p }) => ({
    id: meta.seed.id,
    kind: meta.seed.kind,
    depth: meta.depth,
    parentId: meta.parentId,
    r: meta.r,
    angle: angle.get(meta.seed.id)!,
    x: center.x + p.x,
    y: center.y + p.y,
  }));
  const byId = new Map(nodes.map((n) => [n.id, n]));

  // ── Kenarlar ─────────────────────────────────────────────────────────────
  // Denetim noktası anasının YÖNÜNDE duruyor: aynı analardan çıkan kenarlar
  // gövdenin dibinde demet oluyor, sonra kendi çocuğuna açılıyor. Sinir
  // ucu böyle dallanıyor; düz çizgi tekerlek parmağı gibi duruyordu.
  const edges: GraphEdge[] = raw.map(({ meta }, i) => {
    const child = byId.get(meta.seed.id)!;
    const pm = metas.get(meta.parentId)!;
    const ap = pm.depth === 0 ? child.angle : angle.get(meta.parentId)!;
    const rp = ringR[pm.depth];
    const ac = child.angle;
    const rc = ringR[meta.depth];
    // Kökten çıkan kenarlarda ana yön yok; dönüşümlü ufak bir kaçış veriliyor
    const lean = pm.depth === 0 ? (i % 2 === 0 ? 0.05 : -0.05) : 0.4;
    const ctl = polar(
      rp + (rc - rp) * 0.55,
      pm.depth === 0 ? ac + lean : ap + (ac - ap) * lean
    );
    // Uçlar disklerin KENARINA değil İÇİNE giriyor: gövdeler kenardan
    // sonra çizildiği için uzantı hücreden çıkmış gibi kaynıyor, uç uca
    // eklenmiş gibi durmuyor.
    const parentP = polar(rp, ap);
    const from = toward(parentP, ctl, pm.r * 0.55);
    const to = toward({ x: child.x - center.x, y: child.y - center.y }, ctl, meta.r * 0.55);
    // Kenar noktaları da kutuya taşınıyor — çizim hepsini aynı uzayda bekliyor
    const box = (p: Point): Point => ({ x: p.x + center.x, y: p.y + center.y });
    const f = box(from);
    const c = box(ctl);
    const tp = box(to);
    const s = (p: Point) => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
    return {
      id: meta.seed.id,
      parentId: meta.parentId,
      path: `M ${s(f)} Q ${s(c)} ${s(tp)}`,
      width: Math.max(0.9, 2.5 - 0.5 * meta.depth),
      depth: meta.depth,
      from: f,
      ctl: c,
      to: tp,
      // Uzantı gövdesinden ne kadar kalın çıkıyorsa uçta o kadar inceliyor:
      // kalınlık ana gövdenin çapına bağlı, incelik çocuğunkine
      w0: Math.min(12, Math.max(3.2, pm.r * 0.34)),
      w1: Math.max(1, meta.r * 0.24),
    };
  });

  return {
    width: maxX - minX + PAD_X * 2,
    height: maxY - minY + PAD_Y * 2,
    center,
    coreR,
    nodes,
    byId,
    edges,
  };
}

/** p'den q yönünde d kadar ilerlemiş nokta — kenarlar disklerin dışında dursun */
function toward(p: Point, q: Point, d: number): Point {
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: p.x + (dx / len) * d, y: p.y + (dy / len) * d };
}

// ─── Biyolojik deri ─────────────────────────────────────────────────────────
// Aynı iskelet, başka bir çizim dili. Sinir hücresinde hiçbir uzantı sabit
// kalınlıkta değil: gövdeden kalın çıkıp uca doğru inceliyor, üstünde
// dikenler var ve gövdenin kendisi de kusursuz bir daire değil. Aşağıdakiler
// bunun geometrisi — hepsi saf, aynı girdiye hep aynı şekli veriyor.

/** Dizgiden türetilen sabit tohum — aynı düğüm hep aynı şekli alsın */
function seedOf(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Küçük, deterministik sayı üreteci (mulberry32) */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const bez = (p0: Point, c: Point, p1: Point, t: number): Point => {
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * c.x + t * t * p1.x,
    y: u * u * p0.y + 2 * u * t * c.y + t * t * p1.y,
  };
};

/** Birim dik vektör — şeridin kalınlığı bu yöne açılıyor */
function normal(from: Point, to: Point): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: -dy / len, y: dx / len };
}

/**
 * Sivrilen uzantı: gövdede `w0`, uçta `w1` kalınlığında kapalı bir şerit.
 * SVG çizgisi sabit kalınlıkta olduğu için uzantı DOLGU olarak çiziliyor —
 * akson/dendrit görüntüsünün tamamı bu incelmeden geliyor.
 */
export function ribbonPath(
  from: Point,
  ctl: Point,
  to: Point,
  w0: number,
  w1: number
): string {
  const n0 = normal(from, ctl);
  const n1 = normal(ctl, to);
  const nc = normal(from, to);
  const h0 = w0 / 2;
  const h1 = w1 / 2;
  const hc = (h0 + h1) / 2;
  const at = (p: Point, n: Point, h: number, sign: number) =>
    `${(p.x + n.x * h * sign).toFixed(2)} ${(p.y + n.y * h * sign).toFixed(2)}`;
  return [
    `M ${at(from, n0, h0, 1)}`,
    `Q ${at(ctl, nc, hc, 1)} ${at(to, n1, h1, 1)}`,
    `L ${at(to, n1, h1, -1)}`,
    `Q ${at(ctl, nc, hc, -1)} ${at(from, n0, h0, -1)}`,
    "Z",
  ].join(" ");
}

/**
 * Dendrit dikenleri — uzantının üstünden çıkan kısa kıllar. Sinyalin
 * toplandığı yer onlar; haritada da uzantıyı "çizgi" olmaktan çıkarıp
 * dokulu bir şeye çeviriyorlar. Kısa uzantıda diken çıkmıyor.
 */
export function spinePaths(e: GraphEdge, count = 3): string[] {
  const len = Math.hypot(e.to.x - e.from.x, e.to.y - e.from.y);
  if (len < 46) return [];
  const rand = rng(seedOf(e.id));
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const t = 0.26 + (0.55 * (i + rand() * 0.7)) / count;
    const p = bez(e.from, e.ctl, e.to, t);
    const q = bez(e.from, e.ctl, e.to, Math.min(1, t + 0.02));
    const n = normal(p, q);
    const side = rand() < 0.5 ? 1 : -1;
    const l = 6 + rand() * 6;
    out.push(
      `M ${p.x.toFixed(2)} ${p.y.toFixed(2)} L ${(p.x + n.x * l * side).toFixed(2)} ${(p.y + n.y * l * side).toFixed(2)}`
    );
  }
  return out;
}

/**
 * Gövde (soma) — daire değil, hafifçe düzensiz kapalı bir şekil. Kusursuz
 * daire "düğüm" gibi duruyor; bu şekil "hücre" gibi duruyor. Sapma dar
 * tutuluyor: yerleşim disklerin çakışmadığını yarıçapa göre garanti ediyor,
 * şekil o yarıçapı belirgin biçimde aşarsa o garanti bozulur.
 */
export function blobPath(
  cx: number,
  cy: number,
  r: number,
  seed: string,
  points = 7
): string {
  const rand = rng(seedOf(seed));
  const pts: Point[] = [];
  for (let i = 0; i < points; i++) {
    const a = (i / points) * Math.PI * 2;
    const rr = r * (0.8 + rand() * 0.28);
    pts.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr });
  }
  const mid = (a: Point, b: Point): Point => ({
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  });
  const s = (p: Point) => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
  let d = `M ${s(mid(pts[points - 1], pts[0]))}`;
  for (let i = 0; i < points; i++)
    d += ` Q ${s(pts[i])} ${s(mid(pts[i], pts[(i + 1) % points]))}`;
  return d + " Z";
}
