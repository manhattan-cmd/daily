/**
 * Bağ haritası yerleşimi — uygulamanın kendi mantığının resmi.
 *
 * Ortada bulunulan yer duruyor; ona bağlı olan HER ŞEY tek bakışta görünüyor:
 * kategoriler gövdeden ayrılıyor, alt kategoriler kendi kategorilerinden
 * saçaklanıyor. Bir düğüme dokununca merkez o oluyor ve aynı resim onun
 * ağacı için yeniden kuruluyor. (Özellikler bir ara en uçta kılcal düğüm
 * olarak duruyordu; harita kalabalıklaşıyordu ve onlara başka bir dil
 * aranıyor — bu haritada yerleri yok.)
 *
 * YASA: SALKIM. Her kalem çocuklarını kendi çevresine saçaklandırır; bir
 * dal büyüdükçe KENDİ salkımı içinde büyür, ne komşusunu ne merkezi
 * ilgilendirir. Bağlar kısadır, seyrek dal anasının dibinde durur.
 *
 *   1. Her salkımın bir EN'i (anasının yönüne dik yayılım) ve bir BOY'u
 *      vardır; ikisi de aşağıdan yukarı hesaplanır. Bir ana, çocuğuna o
 *      çocuğun KENDİ salkımının eni kadar yer ayırır.
 *   2. Mesafe yereldir: önce en kısa hâli denenir (yarıçaplar + adım);
 *      çocuklar o mesafede koniye sığmıyorsa yalnız o salkım açılır.
 *   3. Kardeşlerin enleri örtüşmez, alt salkım da anasının payının içinde
 *      kalır — iki dal birbirinin alanına giremez, hatlar KESİŞMEZ.
 *   4. Koni tam çember değildir: geriye, anasına dönüş yolu boş bırakılır.
 *
 * Dört yol denendi ve bırakıldı: (1) ışınsal halka, yaprak sayısına göre açı
 * — en dıştaki halka bütün yaprakların sığacağı çevreye kadar büyüyor,
 * harita pencereye sığmıyordu. (2) anasının yönünde dar koni — alan daraldı
 * ama dallar birbirinin içinden geçiyordu. (3) serbest kuvvet dengesi
 * (akrabalık ölçekli itiş + dal yuvası) — kümeler ayrıldı ama hiçbir garanti
 * yoktu; hatlar birbirinin üstünden atlıyordu. (4) sektör + halka hapsi —
 * garantiler geldi ama halka küresel olduğu için en kalabalık kategori bütün
 * haritayı dışarı itiyor, seyrek dalın bağı boşuna uzuyor, ortada koca bir
 * boşluk kalıyordu. Salkımda uzaklık yerel olduğu için o sorun kökten yok.
 *
 *
 * Boy neyi söylüyor: kök > kategori > alt kategori. Kategorinin ve alt
 * kategorinin çapı kendi çocuk sayısıyla da biraz büyüyor. Kullanım sıklığı
 * buraya karışmıyor — o, hattın PARLAKLIĞIYLA anlatılıyor (çizim tarafında).
 * Kalınlıkla anlatmak yanlış çıktı: kalınlaşan hat bağ olmaktan çıkıp bir
 * boruya dönüşüyor, ağ da sinir değil damar gibi duruyordu.
 *
 * Rastgelelik yok: sapmalar kimlikten türetiliyor. Aynı yapı her açılışta
 * aynı yerde duruyor — dolaşırken yer değiştiren bir harita güven vermiyordu.
 */

import {
  boundsOf,
  clipToWedge,
  discHull,
  smoothClosedPath,
  type HullPoint,
} from "./hull";

export interface Point {
  x: number;
  y: number;
}

export type GraphKind = "root" | "cat" | "sub";

/** Yerleşime verilen ağaç — sırası korunur */
export interface GraphSeed {
  id: string;
  kind: GraphKind;
  /** Ekranda yazacak ad — etiket kutusunun eni bundan kestiriliyor */
  label?: string;
  children?: GraphSeed[];
}

/**
 * Adın diskin hangi yanına yazıldığı. Dört ana yön çakışmayı çözmeye
 * yetmiyordu; köşeler de aday, sıkışık kümede yazıya yer açıyorlar.
 */
export type LabelSide =
  | "right"
  | "left"
  | "bottom"
  | "top"
  | "br"
  | "bl"
  | "tr"
  | "tl";

export interface PlacedNode extends Point {
  id: string;
  kind: GraphKind;
  /** Kök 0 */
  depth: number;
  parentId: string;
  r: number;
  /** Merkezden bakış açısı (radyan) — etiket yönü için işe yarar */
  angle: number;
  /** Adın yazılacağı yan — çakışmayan taraf seçiliyor */
  label: LabelSide;
  /** Adı yazılıyor mu — takımadada yalnız adacık başlarının adı var */
  labelled: boolean;
  /**
   * Adı iri mi yazılıyor. Seyrek haritada kademe belirler (kategori iri,
   * kalem ufak); takımadada adacık başları irileşiyor — orada onlar birer
   * yer adı, haritanın tek yazısı.
   */
  labelBig: boolean;
  /** Adın diskten fazladan uzaklığı (px) — sıkışık yerde biraz itiliyor */
  labelGap: number;
}

export interface GraphEdge {
  /** Çocuğun kimliği — kenar ona aittir */
  id: string;
  parentId: string;
  path: string;
  /**
   * Kılcal kalınlık (px). Bir ara bağ, gövdede 13px'e varan sivrilen bir
   * DOLGU şeridiydi; ağ sinir değil damar gibi duruyordu. Bağ bir boru
   * değil, iki şeyin birbirine değdiğini söyleyen ince bir iz: kalınlık
   * yalnız kademeyi fısıldıyor, gerisini parlaklık söylüyor (çizim tarafı
   * bunu kullanıma göre biraz daha kalınlaştırıyor).
   */
  width: number;
  /** Çocuğun derinliği: gövdeye yakın kenar bir tık kalın */
  depth: number;
  /** Hattın iki ucu — çizim renk geçişini bu eksene kuruyor */
  from: Point;
  to: Point;
}

/**
 * Bir adacık: merkezin doğrudan bir çocuğu ve onun bütün soyu. Kalabalık
 * haritada dokunulan şey artık düğüm değil bu ALAN — sınırın içinde
 * herhangi bir yere dokunmak adacığın başına giriyor.
 */
export interface GraphIsland {
  /** Adacık başının kimliği — sınıra dokununca açılan yer */
  id: string;
  /** Sınırın kapalı, yumuşatılmış yolu (dolgu ve dokunma alanı) */
  path: string;
  /**
   * Sınırın çokgen hali — dışbükey. Çizim `path`i kullanıyor; bu, iki
   * ülkenin kesişmediğini sınayabilmek için duruyor (yumuşatma çokgenin
   * dışına taşmıyor, o yüzden çokgende kesişme yoksa yolda da yoktur).
   */
  hull: Point[];
  /** Adın yazılacağı nokta — sınırın merkezden UZAK yanında, dışarıda */
  labelAt: Point;
  /** Adın punto boyu — adacık ne kadar genişse o kadar iri */
  fontSize: number;
  /** Kaç düğüm kapsıyor — çizim bunu okumuyor, ayıklamak isteyen için */
  count: number;
}

export interface GraphLayout {
  width: number;
  height: number;
  /**
   * Harita takımadaya döndü mü: adlar yalnız adacık başlarında. Çizim bunu
   * biliyor olmalı — o adlar orada tek başına duruyor ve daha iri yazılıyor.
   */
  archipelago: boolean;
  center: Point;
  /** Merkezdeki gövdenin yarıçapı */
  coreR: number;
  /** Adacık sınırları — yalnız takımada halinde dolu */
  islands: GraphIsland[];
  /** Kök hariç tüm düğümler (kök merkezde ayrıca çiziliyor) */
  nodes: PlacedNode[];
  byId: Map<string, PlacedNode>;
  edges: GraphEdge[];
}

/** Diskler arasında bırakılan en az boşluk (px) */
const GAP = 14;

/**
 * TAKIMADA EŞİĞİ — bu sayıdan çok düğümü olan haritada adlar yalnız
 * ADACIK BAŞLARINA yazılıyor (merkezin doğrudan çocukları: kökte
 * kategoriler, bir dalın içinde o dalın kalemleri).
 *
 * Kalabalık harita zaten kendiliğinden şuna dönüşüyor: merkezin çevresinde
 * birbirinden ayrık takımadalar. Her adı yazmaya çalışmak o resmi bozuyordu —
 * yazılar birbirinin üstüne biniyor, harita okunmuyor ve üstelik yerleşimin
 * neredeyse bütün zamanı oraya gidiyor (her ad sekiz yan × beş uzaklık
 * denenip bütün disklere ve önce yerleşmiş adlara çakışması ölçülüyor).
 *
 * Adacığın adı yazılınca resim şunu söylüyor: "burası Harcamalar, ve içi
 * bu kadar dolu." İçindekini görmek için adacığa dokunmak yetiyor — dokununca
 * zaten o adacık merkeze gelip büyüyor ve orada bütün adlar yazılı.
 */
const ARCHIPELAGO_FROM = 70;

/**
 * Adacık sınırının en dıştaki disklere bıraktığı pay (px). Dar tutuluyor:
 * yerleşim disklerin çakışmamasını garanti ediyor ama KABUKLARIN
 * çakışmamasını edemiyor. Taşma dilim kırpmasıyla kesiliyor (clipToWedge),
 * o yüzden pay cömert olabiliyor: sınır disklere yapışık durmuyor.
 */
const ISLAND_PAD = 10;
/**
 * Adacık adının puntosu iki ölçünün küçüğü:
 *
 *   TUVALE göre — harita pencereye sığdırılırken ad da onunla küçülüyor,
 *   yani hangi ölçekte bakılırsa bakılsın ad EKRANDA aynı boyda duruyor.
 *   Sabit punto verilseydi bin düğümlü haritada toz tanesi olurdu.
 *
 *   ADACIĞA göre — küçük adacığın adı da küçük. Yoksa üç düğümlü bir
 *   ülkenin adı kendi sınırından taşıyor ve komşusunun üstüne düşüyor.
 */
const ISLAND_FONT_OF_CANVAS = 0.022;
const ISLAND_FONT_OF_ISLAND = 0.18;
/** Tek düğümlü bir adacıkta bile ad okunur kalsın */
const ISLAND_FONT_MIN = 12;

/**
 * Adacık adının kaplayacağı en. Yerleşim tarayıcıda ölçüm yapamıyor; çizim
 * tarafındaki puntoyla aynı kestirimi kullanıyoruz (bkz. labelBox).
 */
function islandLabelWidth(text: string, fontSize: number): number {
  return Math.max(fontSize, text.trim().length * fontSize * 0.55);
}

/**
 * Adın kapladığı kutu. Yerleşim tarayıcıda ölçüm yapamadığı için harf
 * genişliği punto üzerinden kestiriliyor; çizim tarafındaki sınıflarla aynı
 * puntolar ve aynı en sınırları kullanılıyor (bkz. GraphCell).
 */
export function labelBox(kind: GraphKind, text: string): { w: number; h: number } {
  const [font, maxW, line] =
    kind === "cat" ? [10.5, 78, 12.5] : [9, 68, 10.5];
  const wide = Math.max(10, text.trim().length * font * 0.55);
  const w = Math.min(maxW, wide);
  const lines = Math.min(2, Math.max(1, Math.ceil(wide / maxW)));
  return { w, h: lines * line + 2 };
}

/**
 * Kutu kenar payı — yalnız başlangıç payı. Adlar yerleştikten sonra dışarı
 * taşan varsa kutu zaten o kadar büyütülüyor, o yüzden burası dar tutulabilir.
 */
const PAD_X = 16;
const PAD_Y = 14;

/** Düğüm çapı türden gelir; kategori ve alt kategori çocuk sayısıyla büyür */
export function nodeRadius(kind: GraphKind, childCount: number): number {
  const c = Math.max(0, childCount);
  switch (kind) {
    case "root":
      return 25;
    case "cat":
      return Math.min(26, 17 + 3.2 * Math.sqrt(c));
    case "sub":
      return Math.min(15, 10 + 2 * Math.sqrt(c));
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

export function graphLayout(root: GraphSeed): GraphLayout {
  const all: Placed[] = [];
  const rootR = nodeRadius(root.kind, (root.children ?? []).length);
  const childCount = (s: GraphSeed) => (s.children ?? []).length;

  // ── Ağacı düz listeye aç ───────────────────────────────────────────────
  const labelOf = new Map<string, string>();
  const walk = (
    node: GraphSeed,
    depth: number,
    parentId: string,
    branch: string
  ) => {
    labelOf.set(node.id, node.label ?? "");
    all.push({
      seed: node,
      depth,
      parentId,
      branch,
      r: nodeRadius(node.kind, childCount(node)),
      x: 0,
      y: 0,
    });
    for (const kid of node.children ?? [])
      walk(kid, depth + 1, node.id, depth === 0 ? kid.id : branch);
  };
  walk(root, 0, "", "");
  const byIdRaw = new Map(all.map((p) => [p.seed.id, p]));
  const kids = all.filter((p) => p.depth > 0);

  /**
   * Kalabalık harita: düğümlerin tek tek adı yazılmıyor. Ad ADACIĞA ait
   * oluyor — sınırının dışına, adacığın boyuyla orantılı bir puntoyla.
   * Böylece harita ne kadar küçültülürse küçültülsün ad okunur kalıyor:
   * ikisi birlikte ölçekleniyor.
   */
  const archipelago = kids.length > ARCHIPELAGO_FROM;

  /**
   * Bir kalemin halkada kapladığı yarım yer (px). Diskin yarıçapı, aralık
   * payı, bir de adın eninden bir pay: uzun adlı kalem yanına daha çok yer
   * ister, yoksa yazılar komşusunun üstüne düşüyor. Adı yazılmayan kalem o
   * payı istemiyor — takımadada adacıklar bu yüzden derli toplu duruyor.
   */
  const slot = (p: Placed) =>
    p.r +
    GAP / 2 +
    (archipelago ? 0 : labelBox(p.seed.kind, p.seed.label ?? "").w * 0.22);

  // ── YASA: SALKIM ───────────────────────────────────────────────────────
  // Halka mantığı bırakıldı. Her kalem çocuklarını KENDİ çevresine
  // saçaklandırıyor: bir dal büyüdükçe kendi salkımı içinde büyüyor, ne
  // komşusunu ne merkezi ilgilendiriyor. Bağlar kısa, kalabalık dal kendi
  // içinde açılıyor, seyrek dal anasının dibinde duruyor.
  //
  // Ölçü şu: her salkımın bir EN'i (anasının yönüne dik yayılım) ve bir
  // BOY'u (o yöndeki uzunluk) var, ikisi de aşağıdan yukarı hesaplanıyor.
  // Bir ana, çocuklarına o çocuğun kendi salkımının eni kadar yer ayırıyor.
  // "Yan yana dizilirler" varsayımıyla hesaplayınca sekiz kategorili tahtada
  // mesafe üç katına çıkıyordu — salkımda çocuklar anayı SARIYOR, o yüzden
  // koni geniş ve mesafe kısa.
  //
  // Kesişme yasağı buradan: kardeşlerin enleri örtüşmüyor, alt salkım da
  // anasının payının içinde kalıyor. İki dal birbirinin alanına giremiyor.
  const STEP = 24;
  /** Bir salkımın açılabileceği koni. Kalanı anasına dönüş yolu için boş. */
  const CONE = 5.0;

  interface Fan {
    /** Ana ile çocuklar arasındaki mesafe */
    L: number;
    /** Çocukların anasının yönüne göre açıları */
    angles: number[];
    /** Salkımın eni (yöne dik yarı yayılım) ve boyu (yön doğrultusunda) */
    lat: number;
    len: number;
  }
  const fan = new Map<string, Fan>();
  // Çocuk listesi bir kez kuruluyor. Her düğüm için bütün listeyi süzmek
  // ağaç büyüdükçe karesel bir maliyetti; sıra aynı kalıyor (kids zaten
  // ağacı önden dolaşarak kuruldu).
  const kidsBy = new Map<string, Placed[]>();
  for (const c of kids) {
    const arr = kidsBy.get(c.parentId);
    if (arr) arr.push(c);
    else kidsBy.set(c.parentId, [c]);
  }
  const kidsOf = (p: Placed) => kidsBy.get(p.seed.id) ?? [];

  const measure = (p: Placed, cone: number): { lat: number; len: number } => {
    const mine = kidsOf(p);
    const own = { lat: slot(p), len: p.r + GAP / 2 };
    if (!mine.length) return own;

    const ms = mine.map((c) => measure(c, CONE));
    const maxKidR = mine.reduce((m, c) => Math.max(m, c.r), 0);
    // Mesafe: kısa olan kazanır; çocuklar o mesafede koniye sığmıyorsa
    // yalnız BU salkım açılıyor
    const need = ms.reduce((a, m) => a + 2 * m.lat, 0);
    const L = Math.max(p.r + maxKidR + STEP, need / cone);

    // Açılar: her çocuk kendi eni kadar pay alıyor, artan yer eşit bölüşülüyor
    const span = need / L;
    const spare = Math.max(0, cone - span) / mine.length;
    const angles: number[] = [];
    let acc = -(span + spare * mine.length) / 2;
    mine.forEach((c, i) => {
      const w = (2 * ms[i].lat) / L + spare;
      angles.push(acc + w / 2 + jitter(c.seed.id, 8) * spare * 0.25);
      acc += w;
    });

    // Salkımın kapladığı yer: 90°'yi geçen çocuk yana değil geriye taşar,
    // o yüzden en fazla L kadar en tutar
    let lat = own.lat;
    let len = own.len;
    mine.forEach((m, i) => {
      const a = angles[i];
      const side = Math.abs(a) < Math.PI / 2 ? L * Math.abs(Math.sin(a)) : L;
      lat = Math.max(lat, side + ms[i].lat);
      len = Math.max(len, L * Math.cos(a) + ms[i].len);
    });
    fan.set(p.seed.id, { L, angles, lat, len });
    return { lat, len };
  };

  const angle = new Map<string, number>();
  const place = (p: Placed, dir: number) => {
    const f = fan.get(p.seed.id);
    if (!f) return;
    kidsOf(p).forEach((c, i) => {
      const a = dir + f.angles[i];
      const dist = f.L * (1 + jitter(c.seed.id, 9) * 0.05);
      c.x = p.x + Math.cos(a) * dist;
      c.y = p.y + Math.sin(a) * dist;
      angle.set(c.seed.id, a);
      place(c, a);
    });
  };

  {
    const core = all[0];
    core.x = 0;
    core.y = 0;
    // Kökün çevresi tamamen boş: koni tam çember
    measure(core, Math.PI * 2);
    place(core, -Math.PI / 2);
  }

  // ── Son söz: hiçbir disk bir diğerine girmesin ─────────────────────────
  // Salkımın en/boy ölçüsü yaklaşık: 90°'yi aşarak geriye kıvrılan bir alt
  // salkım komşusuna birkaç piksel değebiliyor. Burası o teması açıyor —
  // düğüm ANASININ YÖNÜNDE dışarı kayıyor, yani hattın açısı korunuyor ve
  // kesişme doğmuyor.
  for (let pass = 0; pass < 30; pass++) {
    let moved = false;
    for (let i = 0; i < all.length; i++)
      for (let j = i + 1; j < all.length; j++) {
        const a = all[i];
        const b = all[j];
        const want = a.r + b.r + GAP;
        const d = Math.hypot(b.x - a.x, b.y - a.y);
        if (d >= want) continue;
        // Dıştaki (anasından uzak olan) kayar; kök hiç kımıldamaz
        const out = b.depth >= a.depth ? b : a;
        const parent = byIdRaw.get(out.parentId);
        if (!parent) continue;
        const ux = out.x - parent.x;
        const uy = out.y - parent.y;
        const len = Math.hypot(ux, uy) || 1;
        const push = want - d;
        const shift = (p: Placed, by: number) => {
          p.x += (ux / len) * by;
          p.y += (uy / len) * by;
          for (const c of kidsOf(p)) shift(c, by);
        };
        shift(out, push);
        moved = true;
      }
    if (!moved) break;
  }
  // ── Kutu ───────────────────────────────────────────────────────────────
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
  let width0 = maxX - minX + PAD_X * 2;
  let height0 = maxY - minY + PAD_Y * 2;

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
    // Aşağıdaki geçişte belirleniyor
    label: "bottom" as LabelSide,
    labelled: false,
    labelBig: p.seed.kind === "cat",
    labelGap: 0,
  }));

  // ── Adların yeri ───────────────────────────────────────────────────────
  // Yazılar da yerleşimin parçası. Her ad diskin dört yanından birine
  // konabiliyor; hangi yana konacağı, o kutunun BAŞKA disklere ve ÖNCE
  // yerleşmiş adlara ne kadar bindiğine bakılarak seçiliyor. Sıra sabit
  // (önce kategoriler, sonra kimliğe göre): sonuç belirli.
  //
  // Kılcalların adı yalnız seyrek haritada yazılıyor — geniş bakışta
  // yüzlerce olabiliyorlar ve harita yazı yığınına dönüyor.
  const discs = [{ x: center.x, y: center.y, r: rootR }, ...nodes];
  const boxFor = (
    n: PlacedNode,
    side: LabelSide,
    w: number,
    h: number,
    extra = 0
  ) => {
    const gap = 4 + extra;
    const d = n.r + gap;
    // Köşelerde disk çeperine 45°'de değiliyor
    const c = n.r * 0.71 + gap;
    switch (side) {
      case "right":
        return { x0: n.x + d, y0: n.y - h / 2, x1: n.x + d + w, y1: n.y + h / 2 };
      case "left":
        return { x0: n.x - d - w, y0: n.y - h / 2, x1: n.x - d, y1: n.y + h / 2 };
      case "bottom":
        return { x0: n.x - w / 2, y0: n.y + d, x1: n.x + w / 2, y1: n.y + d + h };
      case "top":
        return { x0: n.x - w / 2, y0: n.y - d - h, x1: n.x + w / 2, y1: n.y - d };
      case "br":
        return { x0: n.x + c, y0: n.y + c, x1: n.x + c + w, y1: n.y + c + h };
      case "bl":
        return { x0: n.x - c - w, y0: n.y + c, x1: n.x - c, y1: n.y + c + h };
      case "tr":
        return { x0: n.x + c, y0: n.y - c - h, x1: n.x + c + w, y1: n.y - c };
      default:
        return { x0: n.x - c - w, y0: n.y - c - h, x1: n.x - c, y1: n.y - c };
    }
  };
  const overlap = (
    b: { x0: number; y0: number; x1: number; y1: number },
    c: { x0: number; y0: number; x1: number; y1: number }
  ) =>
    Math.max(0, Math.min(b.x1, c.x1) - Math.max(b.x0, c.x0)) *
    Math.max(0, Math.min(b.y1, c.y1) - Math.max(b.y0, c.y0));

  const order = [...nodes].sort(
    (a, b) => a.depth - b.depth || (a.id < b.id ? -1 : 1)
  );
  const size = new Map<string, { w: number; h: number }>();
  const chosen = new Map<string, { x0: number; y0: number; x1: number; y1: number }>();
  /** Bir düğüm için en az çakışan yanı seç (kendi kutusu hesaba katılmadan) */
  const chooseSide = (n: PlacedNode) => {
    const { w, h } = size.get(n.id)!;
    // Yönü anasından dışa bakan yan önce denensin: harita o dili konuşuyor
    const cos = Math.cos(n.angle);
    const sin = Math.sin(n.angle);
    const preferred: LabelSide =
      Math.abs(cos) > Math.abs(sin)
        ? cos > 0
          ? "right"
          : "left"
        : sin > 0
          ? "bottom"
          : "top";
    const sides: LabelSide[] = [
      preferred,
      ...([
        "right",
        "left",
        "bottom",
        "top",
        "br",
        "bl",
        "tr",
        "tl",
      ] as LabelSide[]).filter((s) => s !== preferred),
    ];
    let best: LabelSide = preferred;
    let bestGap = 0;
    let bestCost = Infinity;
    sides.forEach((side, i) => {
      // Yan seçilse de sıkışık bir yerde ad hâlâ değebiliyor; o zaman
      // diskten birkaç piksel daha uzağa itiliyor. Hattı uzatmak, adı
      // komşusunun üstüne bırakmaktan iyi.
      for (const extra of [0, 5, 11, 18, 26]) {
        const box = boxFor(n, side, w, h, extra);
        let cost = i * 3 + extra * 0.35;
        for (const d of discs) {
          if (d === n) continue;
          cost +=
            overlap(box, {
              x0: d.x - d.r,
              y0: d.y - d.r,
              x1: d.x + d.r,
              y1: d.y + d.r,
            }) * 3;
        }
        for (const [id, t] of chosen) if (id !== n.id) cost += overlap(box, t);
        if (cost < bestCost) {
          bestCost = cost;
          best = side;
          bestGap = extra;
        }
      }
    });
    n.label = best;
    n.labelGap = bestGap;
    chosen.set(n.id, boxFor(n, best, w, h, bestGap));
  };

  for (const n of order) {
    // Takımadada düğümlerin tek tek adı yok: ad adacığın, sınırının
    // dışında duruyor. Düğümler adsız birer nokta — adacığın ne kadar
    // dolu olduğunu şekilleriyle söylüyorlar.
    n.labelled = !archipelago;
    if (n.labelled)
      size.set(n.id, labelBox(n.labelBig ? "cat" : "sub", labelOf.get(n.id) ?? ""));
  }
  // İlk geçiş yalnız kendinden ÖNCEKİ adları görüyor; sonraki geçişler
  // hepsini görüp yeniden seçiyor. Böylece sonradan gelen bir ad yüzünden
  // sıkışan erken bir ad da yer değiştirebiliyor.
  for (let round = 0; round < 3; round++)
    for (const n of order) if (n.labelled) chooseSide(n);

  // ── Adacıklar ──────────────────────────────────────────────────────────
  // Bir adacık = merkezin bir doğrudan çocuğu ve onun bütün soyu. Sınır
  // disklere teğet bir kabuk (lib/hull.ts); ad sınırın MERKEZDEN UZAK
  // yanında, dışarıda duruyor — o yan hep boş, çünkü adacığın merkeze
  // bakan tarafında bağlandığı hat var.
  //
  // Punto adacığın enine bağlı: harita pencereye sığdırılırken ad da
  // onunla birlikte küçülüyor, yani hangi ölçekte bakılırsa bakılsın ad
  // adacığa göre aynı ağırlıkta duruyor. Sabit punto verilseydi bin
  // düğümlü haritada okunmaz, on düğümlüde ise adacığı ezerdi.
  interface RawIsland {
    id: string;
    hull: HullPoint[];
    labelAt: Point;
    fontSize: number;
    count: number;
  }
  const islandsRaw: RawIsland[] = [];
  /** Adların puntosu buna göre — kutu adlarla büyümeden ÖNCEKİ hali yeter */
  const canvasDiag = Math.hypot(width0, height0);
  if (archipelago) {
    const branchOf = new Map(kids.map((p) => [p.seed.id, p.branch]));
    const groups = new Map<string, PlacedNode[]>();
    for (const n of nodes) {
      const b = branchOf.get(n.id);
      if (!b) continue;
      const arr = groups.get(b);
      if (arr) arr.push(n);
      else groups.set(b, [n]);
    }
    // ── Dilimler ─────────────────────────────────────────────────────────
    // Kabuk dışbükey olduğu için komşusunun girintisine taşabiliyor ve iki
    // ülke üst üste biniyordu. Oysa yerleşim dalları merkezden bakınca
    // zaten ayrı açı dilimlerine koyuyor (SALKIM yasası). Her adacığı kendi
    // dilimine kırpınca bölgeler KESİŞEMEZ hale geliyor.
    //
    // Sınırın nereden geçeceği: iki komşunun açısal uçları arasında boşluk
    // varsa tam ortasından — böylece kimseden bir şey kesilmiyor. Uçlar
    // örtüşüyorsa merkez açılarının ortasından, yani zarar iki tarafa eşit
    // bölünüyor.
    const TAU = Math.PI * 2;
    const norm = (a: number) => ((a % TAU) + TAU) % TAU;
    const raw = [...groups].map(([id, members]) => {
      const hull = discHull(
        members.map((m) => ({ x: m.x, y: m.y, r: m.r })),
        ISLAND_PAD
      );
      // Yön ortalaması vektörle: açıların ortalaması sarmalda yanlış çıkıyor
      let sx = 0;
      let sy = 0;
      for (const m of members) {
        sx += m.x - center.x;
        sy += m.y - center.y;
      }
      const mid = Math.atan2(sy, sx);
      let lo = 0;
      let hi = 0;
      for (const p of hull) {
        // Merkez açıya göre sapma — [-π, π] aralığına indiriliyor
        const d = norm(Math.atan2(p.y - center.y, p.x - center.x) - mid + Math.PI) - Math.PI;
        lo = Math.min(lo, d);
        hi = Math.max(hi, d);
      }
      return { id, members, hull, mid, lo: mid + lo, hi: mid + hi };
    });
    raw.sort((a, b) => norm(a.mid) - norm(b.mid));
    /** i. adacıkla bir sonrakinin arasındaki sınır açısı */
    const edgeAt = raw.map((cur, i) => {
      const next = raw[(i + 1) % raw.length];
      if (raw.length < 2) return cur.mid + Math.PI;
      const gap = norm(next.lo - cur.hi);
      // Boşluk varsa ortasından; yoksa merkez açıların ortasından
      return gap > 0 && gap < Math.PI
        ? cur.hi + gap / 2
        : cur.mid + norm(next.mid - cur.mid) / 2;
    });

    for (let i = 0; i < raw.length; i++) {
      const { id, members } = raw[i];
      const hull =
        raw.length < 3
          ? raw[i].hull
          : clipToWedge(
              raw[i].hull,
              center,
              edgeAt[(i - 1 + raw.length) % raw.length],
              edgeAt[i]
            );
      if (hull.length < 3) continue;
      const bb = boundsOf(hull);
      const islandDiag = Math.hypot(bb.x1 - bb.x0, bb.y1 - bb.y0);
      const fontSize = Math.max(
        ISLAND_FONT_MIN,
        Math.min(
          canvasDiag * ISLAND_FONT_OF_CANVAS,
          islandDiag * ISLAND_FONT_OF_ISLAND
        )
      );
      // Adacığın ağırlık merkezinden dışa bakan yön
      const gx = members.reduce((s, m) => s + m.x, 0) / members.length;
      const gy = members.reduce((s, m) => s + m.y, 0) / members.length;
      const vx = gx - center.x;
      const vy = gy - center.y;
      const vl = Math.hypot(vx, vy) || 1;
      const ux = vx / vl;
      const uy = vy / vl;
      // Sınırın o yöndeki en uç noktası + bir pay + yazının yarısı
      let reach = 0;
      for (const p of hull)
        reach = Math.max(reach, (p.x - gx) * ux + (p.y - gy) * uy);
      const out = reach + fontSize * 0.9;
      islandsRaw.push({
        id,
        hull,
        labelAt: { x: gx + ux * out, y: gy + uy * out },
        fontSize,
        count: members.length,
      });
    }
  }

  // ── Kutuyu adlara göre büyüt ───────────────────────────────────────────
  // Kutu önce yalnız disklere göre hesaplanıyor; adlar yerleştikten sonra
  // dışarı taşan varsa kutu o kadar büyüyor ve her şey kaydırılıyor. Sabit
  // bir kenar payı vermek iki türlü de yanlıştı: dar kalınca "Sabah koşusu"
  // pencerede kırpılıyordu, geniş verince harita boşuna küçülüyordu.
  // Takımadada aynı hesap adacık adları için dönüyor.
  {
    let l = 0;
    let t = 0;
    let r = width0;
    let b = height0;
    for (const n of nodes) {
      if (!n.labelled) continue;
      const { w, h } = labelBox(n.labelBig ? "cat" : "sub", labelOf.get(n.id) ?? "");
      const box = boxFor(n, n.label, w, h, n.labelGap);
      l = Math.min(l, box.x0);
      t = Math.min(t, box.y0);
      r = Math.max(r, box.x1);
      b = Math.max(b, box.y1);
    }
    for (const isl of islandsRaw) {
      const w = islandLabelWidth(labelOf.get(isl.id) ?? "", isl.fontSize);
      const h = isl.fontSize * 1.3;
      l = Math.min(l, isl.labelAt.x - w / 2);
      t = Math.min(t, isl.labelAt.y - h / 2);
      r = Math.max(r, isl.labelAt.x + w / 2);
      b = Math.max(b, isl.labelAt.y + h / 2);
    }
    const dx = -l;
    const dy = -t;
    if (dx || dy) {
      for (const n of nodes) {
        n.x += dx;
        n.y += dy;
      }
      for (const isl of islandsRaw) {
        isl.labelAt = { x: isl.labelAt.x + dx, y: isl.labelAt.y + dy };
        isl.hull = isl.hull.map((p) => ({ x: p.x + dx, y: p.y + dy }));
      }
    }
    center.x += dx;
    center.y += dy;
    width0 = r - l;
    height0 = b - t;
  }

  const islands: GraphIsland[] = islandsRaw.map((isl) => ({
    id: isl.id,
    path: smoothClosedPath(isl.hull),
    hull: isl.hull,
    labelAt: isl.labelAt,
    fontSize: isl.fontSize,
    count: isl.count,
  }));

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const posOf = (id: string): Point =>
    id === root.id ? center : byId.get(id) ?? center;
  const radiusOf = (id: string) =>
    id === root.id ? rootR : byId.get(id)?.r ?? 0;

  // ── Hatlar ─────────────────────────────────────────────────────────────
  // Düz çizgi tekerlek parmağı gibi duruyordu; her hat kimliğinden gelen
  // sabit bir kavis alıyor. Kavis ÖLÇÜLÜ: eskiden hattın beşte birine varan
  // bir yay atıyordu ve kalın şeritle birleşince ağ damar gibi kıvrılıyordu.
  // İnce izde az bir eğrilik zaten yetiyor — çizgi diri duruyor ama yol
  // gözle takip edilebiliyor.
  //
  // Uçlar disklerin İÇİNE giriyor ama artık yalnız çeperin altına: düğümler
  // üstte çizildiği için hat oradan çıkmış gibi kaynıyor, disk yarı saydam
  // olduğundan yüzünün altından geçen çizgi de görünmüyor.
  const edges: GraphEdge[] = nodes.map((n) => {
    const p0 = posOf(n.parentId);
    const p1 = { x: n.x, y: n.y };
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const len = Math.hypot(dx, dy) || 1;
    const bend = jitter(n.id, 5) * Math.min(15, len * 0.14);
    const ctl = {
      x: (p0.x + p1.x) / 2 - (dy / len) * bend,
      y: (p0.y + p1.y) / 2 + (dx / len) * bend,
    };
    const from = toward(p0, ctl, radiusOf(n.parentId) * 0.92);
    const to = toward(p1, ctl, n.r * 0.92);
    const s = (p: Point) => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
    return {
      id: n.id,
      parentId: n.parentId,
      path: `M ${s(from)} Q ${s(ctl)} ${s(to)}`,
      // Kademeler arasında ancak yarım piksellik bir fark var: hiyerarşi
      // sezilsin ama hiçbir hat "boru" olmasın
      width: Math.max(0.75, 1.75 - 0.3 * n.depth),
      depth: n.depth,
      from,
      to,
    };
  });

  return {
    width: width0,
    height: height0,
    archipelago,
    islands,
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
