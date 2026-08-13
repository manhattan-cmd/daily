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
 * YASA: iki hapis ve iki kuvvet.
 *
 *   1. SEKTÖR HAPSİ — her kategori merkez çevresinde kendi açı dilimini
 *      alır ve hiçbir üyesi o dilimden çıkamaz. Dilimler ayrık olduğu için
 *      farklı kategorilerin hatları birbirini KESEMEZ.
 *   2. HALKA HAPSİ — kademe = halka. Kategoriler birinci halkada, alt
 *      kategoriler ikincide, torunlar üçüncüde. "Hangisi kategori, hangisi
 *      alt kategori" sorusu bakışta cevaplanır.
 *   3. ÇEKİM — her kalem anasının açısına çekilir, hat kısa ve düz kalır.
 *   4. İTİŞ — aynı halkadaki komşular açı ekseninde birbirini iter; itiş
 *      sırayı asla bozmaz, o yüzden bir sektörün İÇİNDE de hatlar kesişmez.
 *
 * Halkanın yarıçapı iki kuraldan büyük olanıdır: bir önceki halkayla arada
 * disklerin ve bir satır yazının sığacağı yer kalsın; ve o halkadaki kalemler
 * kendi sektörlerinin yayına yan yana sığsın. Yani harita ancak gerektiği
 * kadar büyür.
 *
 * Üç yol denendi ve bırakıldı: (1) ışınsal halka, yaprak sayısına göre açı —
 * en dıştaki halka bütün yaprakların sığacağı çevreye kadar büyüyor, harita
 * pencereye sığmıyordu. (2) anasının yönünde dar koni — alan daraldı ama
 * dallar birbirinin içinden geçiyordu. (3) serbest kuvvet dengesi (akrabalık
 * ölçekli itiş + dal yuvası) — kümeler ayrıldı ama hiçbir garanti yoktu:
 * hatlar birbirinin üstünden atlıyor, kademeler karışıyordu. Serbest denge
 * "genelde iyi" verir; bu harita "her zaman doğru"ya ihtiyaç duyuyor.
 *
 * Rastgelelik yok: sıralar ve sapmalar kimlikten türetiliyor. Aynı yapı her
 * açılışta aynı yerde duruyor — dolaşırken yer değiştiren bir harita güven
 * vermiyordu.
 *
 * Boy neyi söylüyor: kök > kategori > alt kategori. Kategorinin ve
 * alt kategorinin çapı kendi çocuk sayısıyla da biraz büyüyor. Kullanım
 * sıklığı buraya karışmıyor — o, hattın kalınlığı ve parlaklığıyla
 * anlatılıyor (çizim tarafında).
 */

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
  /** Adı yazılıyor mu — bu haritada hepsinin adı var */
  labelled: boolean;
  /** Adın diskten fazladan uzaklığı (px) — sıkışık yerde biraz itiliyor */
  labelGap: number;
}

export interface GraphEdge {
  /** Çocuğun kimliği — kenar ona aittir */
  id: string;
  parentId: string;
  path: string;
  width: number;
  /** Çocuğun derinliği: gövdeye yakın kenar daha kalın */
  depth: number;
  /** Hattın iki ucu — çizim renk geçişini bu eksene kuruyor */
  from: Point;
  to: Point;
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
const GAP = 14;

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
  const maxDepth = kids.reduce((d, p) => Math.max(d, p.depth), 0);
  const at = (d: number) => kids.filter((p) => p.depth === d);

  /**
   * Bir kalemin halkada kapladığı yarım yer (px). Diskin yarıçapı, aralık
   * payı, bir de adın eninden bir pay: uzun adlı kalem yanına daha çok yer
   * ister, yoksa yazılar komşusunun üstüne düşüyor.
   */
  const slot = (p: Placed) =>
    p.r + GAP / 2 + labelBox(p.seed.kind, p.seed.label ?? "").w * 0.22;

  // ── 1. SEKTÖR HAPSİ ────────────────────────────────────────────────────
  // Her kategori merkez çevresinde kendi açı dilimini alıyor ve hiçbir üyesi
  // o dilimden çıkamıyor. Dilimler ayrık olduğu için farklı kategorilerin
  // hatları BİRBİRİNİ KESEMİYOR — serbest kuvvet dengesinde bu garanti yoktu,
  // dallar birbirinin üstünden atlıyordu.
  //
  // Pay, kategorinin EN KALABALIK halkasına göre: asıl yer isteyen şey bir
  // kademede yan yana durması gereken kalem sayısı.
  const branches = root.children ?? [];
  const widthOf = (b: GraphSeed) => {
    let width = 1;
    for (let d = 2; d <= maxDepth; d++)
      width = Math.max(
        width,
        kids.filter((p) => p.branch === b.id && p.depth === d).length
      );
    return width;
  };
  const widths = branches.map(widthOf);
  const totalWidth = widths.reduce((a, b) => a + b, 0) || 1;
  const sector = new Map<string, { from: number; to: number; mid: number }>();
  {
    // Küçük kategoriler de nefes alsın: hiçbiri toplamın altıda birinden az
    // pay almasın diye taban pay eklenip yeniden normalleniyor
    const floor = 0.55 / Math.max(1, branches.length);
    const shares = widths.map((w) =>
      Math.max(floor, w / totalWidth)
    );
    const sum = shares.reduce((a, b) => a + b, 0);
    let acc = -Math.PI / 2 - (shares[0] / sum) * Math.PI;
    branches.forEach((b, i) => {
      const span = (shares[i] / sum) * Math.PI * 2;
      sector.set(b.id, { from: acc, to: acc + span, mid: acc + span / 2 });
      acc += span;
    });
  }

  // ── 2. HALKA HAPSİ ─────────────────────────────────────────────────────
  // Kademe = halka. Kategoriler birinci halkada, alt kategoriler ikincide,
  // torunlar üçüncüde. "Hangisi kategori hangisi alt kategori" sorusu
  // böylece bakışta cevaplanıyor; serbest dengede kademeler birbirine
  // karışıyordu.
  //
  // Halkalar KATEGORİYE ÖZEL. Küresel halka denendi: en kalabalık kategori
  // halkayı dışarı itiyor, üç alt kalemi olan kategori de aynı uzaklığa
  // uymak zorunda kalıyordu — hatlar boşuna uzuyor, ortada koca bir boşluk
  // kalıyordu. Artık her kategori kendi halkasını kendi kalabalığından
  // çıkarıyor: seyrek dalın alt kalemleri dibinde duruyor.
  //
  // Yarıçap iki kuraldan büyük olanı: (a) bir önceki halkayla arasında
  // disklerin ve bir satır yazının sığacağı yer kalsın, (b) o halkadaki
  // kalemler kendi sektörünün yayına yan yana sığsın.
  const BAND = 18;
  /** Halkalar SEKTÖRE ÖZEL: [kategori id][derinlik] → yarıçap */
  const ring = new Map<string, number[]>();
  // Birinci halka ortak: bütün kategoriler gövdenin hemen dibinde, aynı
  // uzaklıkta. "Bunlar kategori" mesajı buradan geliyor.
  const catMax = at(1).reduce((m, p) => Math.max(m, p.r), 0);
  const R1 = rootR + catMax + BAND;
  for (const b of branches) {
    const s = sector.get(b.id)!;
    const span = s.to - s.from;
    const rs = [0, R1];
    for (let d = 2; d <= maxDepth; d++) {
      const mine = at(d).filter((p) => p.branch === b.id);
      if (!mine.length) {
        rs[d] = rs[d - 1];
        continue;
      }
      const prevMax = at(d - 1)
        .filter((p) => p.branch === b.id)
        .reduce((m, p) => Math.max(m, p.r), 0);
      const curMax = mine.reduce((m, p) => Math.max(m, p.r), 0);
      const arc = mine.reduce((sum, p) => sum + slot(p) * 2, 0);
      rs[d] = Math.max(rs[d - 1] + prevMax + curMax + BAND, arc / span);
    }
    ring.set(b.id, rs);
  }
  const R = (p: Placed) => ring.get(p.branch)?.[p.depth] ?? R1;

  // ── 3. AÇI: ana ile aynı hizada, kardeşle çakışmadan ───────────────────
  // Her kalem anasının açısına ÇEKİLİYOR (hat kısa ve düz kalsın), aynı
  // halkadaki komşular ise birbirini İTİYOR (üst üste binmesin). İkisi tek
  // boyutlu bir problem: sıralamayı bozmadan çözülüyor, sıra korunduğu için
  // aynı sektörün içinde de hatlar kesişmiyor.
  const angle = new Map<string, number>();
  for (let d = 1; d <= maxDepth; d++) {
    for (const b of branches) {
      const s = sector.get(b.id)!;
      const mine = at(d).filter((p) => p.branch === b.id);
      if (!mine.length) continue;
      // Sıra: ananın açısına göre; böylece çocuklar analarıyla aynı sırada
      const want = (p: Placed) =>
        d === 1 ? s.mid : angle.get(p.parentId) ?? s.mid;
      const order = mine
        .map((p, i) => ({ p, i, want: want(p) }))
        .sort((a, c) => a.want - c.want || a.i - c.i);
      const half = order.map(({ p }) => slot(p) / R(p));
      const pos = order.map(({ want }) => want);
      // İki yönlü itiş: soldan sağa ve sağdan sola. Sıra hiç değişmiyor.
      for (let pass = 0; pass < 4; pass++) {
        for (let i = 0; i < pos.length; i++) {
          const lo =
            i === 0
              ? s.from + half[i]
              : pos[i - 1] + half[i - 1] + half[i];
          pos[i] = Math.max(pos[i], lo);
        }
        for (let i = pos.length - 1; i >= 0; i--) {
          const hi =
            i === pos.length - 1
              ? s.to - half[i]
              : pos[i + 1] - half[i + 1] - half[i];
          pos[i] = Math.min(pos[i], hi);
        }
      }
      order.forEach(({ p }, i) => angle.set(p.seed.id, pos[i]));
    }
  }

  // ── Konumlar ───────────────────────────────────────────────────────────
  // Halkalar tam çember olsa harita çarka benziyor; yarıçapa kimlikten gelen
  // ufak bir sapma ekleniyor. Sapma banttan küçük, hiçbir garantiyi bozmuyor.
  for (const p of kids) {
    const a = angle.get(p.seed.id) ?? 0;
    const rr = R(p) + jitter(p.seed.id, 7) * 3.5;
    p.x = Math.cos(a) * rr;
    p.y = Math.sin(a) * rr;
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
    n.labelled = true;
    size.set(n.id, labelBox(n.kind, labelOf.get(n.id) ?? ""));
  }
  // İlk geçiş yalnız kendinden ÖNCEKİ adları görüyor; sonraki geçişler
  // hepsini görüp yeniden seçiyor. Böylece sonradan gelen bir ad yüzünden
  // sıkışan erken bir ad da yer değiştirebiliyor.
  for (let round = 0; round < 3; round++)
    for (const n of order) if (n.labelled) chooseSide(n);

  // ── Kutuyu adlara göre büyüt ───────────────────────────────────────────
  // Kutu önce yalnız disklere göre hesaplanıyor; adlar yerleştikten sonra
  // dışarı taşan varsa kutu o kadar büyüyor ve her şey kaydırılıyor. Sabit
  // bir kenar payı vermek iki türlü de yanlıştı: dar kalınca "Sabah koşusu"
  // pencerede kırpılıyordu, geniş verince harita boşuna küçülüyordu.
  {
    let l = 0;
    let t = 0;
    let r = width0;
    let b = height0;
    for (const n of nodes) {
      if (!n.labelled) continue;
      const { w, h } = labelBox(n.kind, labelOf.get(n.id) ?? "");
      const box = boxFor(n, n.label, w, h, n.labelGap);
      l = Math.min(l, box.x0);
      t = Math.min(t, box.y0);
      r = Math.max(r, box.x1);
      b = Math.max(b, box.y1);
    }
    const dx = -l;
    const dy = -t;
    if (dx || dy)
      for (const n of nodes) {
        n.x += dx;
        n.y += dy;
      }
    center.x += dx;
    center.y += dy;
    width0 = r - l;
    height0 = b - t;
  }

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
      from,
      to,
    };
  });

  return {
    width: width0,
    height: height0,
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
