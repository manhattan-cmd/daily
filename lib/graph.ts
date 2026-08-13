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
 * Yerleşim bir KUVVET DENGESİ (Obsidian'ın grafiği gibi), ama itiş herkese
 * aynı şiddette değil — AKRABALIĞA göre:
 *
 *   - Farklı kategoriden iki kalem birbirini sert iter,
 *   - Aynı kategorinin farklı alt dalları orta,
 *   - Kardeşler en yumuşak.
 *
 * Buna bir de DAL YUVASI ekleniyor: her kategori merkez çevresinde kendi
 * yönünü alıyor (pay büyüklüğüne göre), uzaklığı kendi kalabalığına göre
 * belirleniyor ve üyeleri oraya doğru hafifçe çekiliyor. Sonuç: her kategori
 * ayrı bir küme, kümeler birbirine karışmıyor, küme içinde ağacın şekli
 * duruyor.
 *
 * İki yol denendi ve ikisi de bırakıldı: (1) ışınsal halka — her dal yaprak
 * sayısı kadar açı alıyor, en dıştaki halka bütün yaprakların sığacağı
 * çevreye kadar büyüyordu; harita kocaman oluyor, pencereye sığdırılınca
 * hiçbir şey okunmuyordu. (2) anasının yönünde dar koni — alan daraldı ama
 * dallar birbirinin içinden geçiyor, harita düğüm yumağına dönüyordu.
 *
 * Rastgelelik yok: başlangıç konumları ve sapmalar kimlikten türetiliyor,
 * tur sayısı sabit. Aynı yapı her açılışta aynı yerde duruyor — dolaşırken
 * yer değiştiren bir harita güven vermiyordu.
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
  /** Bağlı olduğu kategori (birinci kademe atası); kökte boş */
  branch: string;
  r: number;
  x: number;
  y: number;
}

/** Ana ile çocuk arasındaki yay boyu — derinleştikçe kısalıyor */
function stepOf(depth: number): number {
  return [36, 28, 22, 17][Math.min(depth, 3)];
}

/**
 * İki kalem birbirini ne kadar itsin? Kural bu haritanın belkemiği:
 * yabancılar sert, akrabalar yumuşak iter. Böylece kategoriler ayrı kümeler
 * hâlinde durur, küme içinde kardeşler sıkışabilir.
 */
function kinship(a: Placed, b: Placed): number {
  if (a.parentId && a.parentId === b.parentId) return 0.66;
  if (a.branch && a.branch === b.branch) return 0.95;
  return 1.9;
}

export function graphLayout(root: GraphSeed): GraphLayout {
  const all: Placed[] = [];
  const rootR = nodeRadius(root.kind, (root.children ?? []).length);
  const childCount = (s: GraphSeed) => (s.children ?? []).length;
  const countAll = (s: GraphSeed): number =>
    1 + (s.children ?? []).reduce((n, k) => n + countAll(k), 0);

  // ── Dal yuvaları ───────────────────────────────────────────────────────
  // Her kategori merkez çevresinde kendi yönünü alıyor: pay, kalabalığıyla
  // orantılı. Uzaklığı da kalabalığından geliyor — büyük dal daha uzağa
  // oturuyor ki kendi içinde açılacak yeri olsun.
  const branches = root.children ?? [];
  const sizes = branches.map(countAll);
  const totalSize = sizes.reduce((a, b) => a + b, 0) || 1;
  const anchor = new Map<string, Point>();
  let acc = 0;
  branches.forEach((b, i) => {
    const share = sizes[i] / totalSize;
    const mid = acc + share / 2;
    acc += share;
    const a = -Math.PI / 2 + mid * Math.PI * 2;
    const dist = rootR + 28 + 17 * Math.sqrt(sizes[i]);
    anchor.set(b.id, { x: Math.cos(a) * dist, y: Math.sin(a) * dist });
  });

  // ── Başlangıç konumları ────────────────────────────────────────────────
  // Denge kendi yerini bulacak ama işe yakın bir yerden başlamak hem daha
  // az turda oturuyor hem de sonucu belirli kılıyor: her düğüm kendi dal
  // yuvasının çevresine, kimliğinden gelen sabit bir sapmayla konuyor.
  const walk = (node: GraphSeed, depth: number, parentId: string, branch: string) => {
    const r = nodeRadius(node.kind, childCount(node));
    const home = anchor.get(branch);
    const spread = 12 + 14 * depth;
    all.push({
      seed: node,
      depth,
      parentId,
      branch,
      r,
      x: (home?.x ?? 0) + jitter(node.id, 1) * spread,
      y: (home?.y ?? 0) + jitter(node.id, 2) * spread,
    });
    for (const kid of node.children ?? [])
      walk(kid, depth + 1, node.id, depth === 0 ? kid.id : branch);
  };
  walk(root, 0, "", "");
  all[0].x = 0;
  all[0].y = 0;

  // ── Denge ──────────────────────────────────────────────────────────────
  // Üç kuvvet: hat yayları (çocuk anasının dibinde dursun), akrabalık
  // ölçekli itiş (yabancı dallar birbirine karışmasın), ve dal yuvası
  // çekimi (küme dağılmasın). Tur sayısı sabit, soğuma çizelgesi sabit.
  const byIdRaw = new Map(all.map((p) => [p.seed.id, p]));
  const ROUNDS = 220;
  for (let pass = 0; pass < ROUNDS; pass++) {
    const alpha = 0.85 * (1 - pass / ROUNDS) ** 1.4 + 0.05;

    // Yaylar
    for (const p of all) {
      if (p.depth === 0) continue;
      const parent = byIdRaw.get(p.parentId);
      if (!parent) continue;
      const dx = p.x - parent.x;
      const dy = p.y - parent.y;
      const d = Math.hypot(dx, dy) || 0.01;
      const want = parent.r + p.r + stepOf(p.depth - 1);
      const f = (d - want) * 0.22 * alpha;
      const ux = dx / d;
      const uy = dy / d;
      p.x -= ux * f;
      p.y -= uy * f;
      if (parent.depth > 0) {
        parent.x += ux * f * 0.5;
        parent.y += uy * f * 0.5;
      }
    }

    // İtiş — akrabalığa göre
    for (let i = 0; i < all.length; i++)
      for (let j = i + 1; j < all.length; j++) {
        const a = all[i];
        const b = all[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 0.01;
        const reach = (a.r + b.r + 48) * kinship(a, b);
        if (d > reach) continue;
        const f = ((reach - d) / reach) * 9 * kinship(a, b) * alpha;
        const ux = dx / d;
        const uy = dy / d;
        if (a.depth > 0) {
          a.x -= ux * f;
          a.y -= uy * f;
        }
        if (b.depth > 0) {
          b.x += ux * f;
          b.y += uy * f;
        }
      }

    // Dal yuvası çekimi — küme kendi yerinde kalsın
    for (const p of all) {
      if (p.depth === 0) continue;
      const home = anchor.get(p.branch);
      if (!home) continue;
      p.x += (home.x - p.x) * 0.035 * alpha;
      p.y += (home.y - p.y) * 0.035 * alpha;
    }
  }

  // ── Son söz: hiçbir disk bir diğerine girmesin ─────────────────────────
  // Denge yumuşak bir kuvvet; kalabalık kümede birkaç piksel binme kalabiliyor.
  // Burası sert kural: çakışan iki disk kalan farkı yarı yarıya paylaşıp
  // açılıyor. Kök yerinden oynamıyor, merkez merkez kalsın.
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
  pushApart(80);

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
    // Ad bu yöne yazılıyor: ANASINDAN dışa doğru. Merkezden bakınca doğru
    // görünen yön, kümenin içinde kalan bir düğümde yanlış tarafı gösteriyor
    // — komşusunun üstüne yazıyordu.
    angle: (() => {
      const parent = byIdRaw.get(p.parentId);
      const dx = p.x - (parent?.x ?? 0);
      const dy = p.y - (parent?.y ?? 0);
      return Math.hypot(dx, dy) < 0.01
        ? Math.atan2(p.y, p.x)
        : Math.atan2(dy, dx);
    })(),
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
