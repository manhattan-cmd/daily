/**
 * Nöron yerleşimi — ortada gövde (soma), çevresinde dendritlerle bağlı çocuklar.
 *
 * Altıgen ızgaradan farkı: hücreler EŞİT DEĞİL. Bir kalemin çekirdeği kendi
 * altındaki kalem sayısıyla büyüyor, yani ağaç "kaç dala ayrılıyor"u boyuyla
 * söylüyor; kullanım sıklığı ise parlaklıkla. Böylece kullanıcı tek bakışta
 * hem yapının şeklini hem alışkanlığının nereye yığıldığını görüyor.
 *
 * Yerleşim ızgara değil ama rastgele de değil: açılar eşit bölünür, yarıçap
 * çekirdeğin boyuna göre itilir (büyük çekirdek uzağa oturur ki komşusuna
 * değmesin) ve dallar dönüşümlü olarak hafifçe içeri/dışarı kaçar. Kural
 * belirli olduğu için aynı yapı her açılışta aynı görünür — dolaşırken yer
 * değiştiren bir harita güven vermiyordu.
 */

export interface Point {
  x: number;
  y: number;
}

export interface NeuronNode extends Point {
  /** Çekirdek yarıçapı (px) — çocuk sayısıyla büyür */
  r: number;
  /** Gövdeden bu çekirdeğe giden dendritin SVG yolu */
  path: string;
  /** Dendritin gövde ucundaki kalınlığı — çocuk sayısıyla artar */
  width: number;
}

export interface NeuronLayout {
  width: number;
  height: number;
  center: Point;
  /** Gövdenin yarıçapı */
  coreR: number;
  nodes: NeuronNode[];
}

/** Çekirdek yarıçapı: çocuksuz kalem taban boyunda, dallandıkça büyür. */
export function coreRadius(childCount: number, base: number): number {
  return base * (1 + 0.52 * Math.sqrt(Math.max(0, childCount)));
}

/**
 * Dendrit: gövdeden çekirdeğe giden hafif kavisli yol. Düz çizgi tekerlek
 * parmağı gibi duruyordu; kavis dönüşümlü yön değiştirince dallanma
 * organik okunuyor.
 */
function dendrite(from: Point, to: Point, bend: number): string {
  const mx = (from.x + to.x) / 2;
  const my = (from.y + to.y) / 2;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  // Orta noktayı doğrultuya dik itersek yay çıkar
  const cx = mx - (dy / len) * bend;
  const cy = my + (dx / len) * bend;
  return `M ${from.x.toFixed(2)} ${from.y.toFixed(2)} Q ${cx.toFixed(2)} ${cy.toFixed(2)} ${to.x.toFixed(2)} ${to.y.toFixed(2)}`;
}

/**
 * n çocuklu bir gövdenin yerleşimi.
 *
 * @param childCounts her çocuğun KENDİ çocuk sayısı — çekirdek boyu bundan
 * @param base çocuksuz bir çekirdeğin yarıçapı (px)
 */
export function neuronLayout(
  childCounts: number[],
  base: number
): NeuronLayout {
  const n = childCounts.length;
  if (n === 0) {
    const coreR = coreRadius(0, base) * 0.92;
    const pad = coreR * 1.6;
    return {
      width: pad * 2,
      height: pad * 2,
      center: { x: pad, y: pad },
      coreR,
      nodes: [],
    };
  }

  const radii = childCounts.map((c) => coreRadius(c, base));
  const maxR = Math.max(...radii);
  // Gövde sayfadaki EN BÜYÜK disktir. Kendi çocuk sayısıyla büyür ama bir
  // çocuğu ondan iri kalırsa "nerede olduğum" hissi kayboluyordu.
  const coreR = Math.max(
    coreRadius(Math.min(n, 6), base) * 0.92,
    maxR + base * 0.15
  );
  // Halka yarıçapı: komşu çekirdekler değmesin diye hem gövdeye hem
  // birbirlerine göre yer açılır. Az çocukta sıkışmasın diye taban pay var.
  const spread = Math.max(
    coreR + maxR + base * 1.5,
    (n * (maxR * 2.25)) / (2 * Math.PI) + maxR
  );

  // Tam yukarıdan başlayıp saat yönünde eşit bölünür; tek sayıda çocukta
  // simetri ekseni dikey kalsın diye başlangıç açısı -90°.
  //
  // Çift sayıda çocukta karşılıklı ikili gövdeyle aynı doğruya düşüyor ve
  // şekil "zincir" gibi okunuyordu; komşular dönüşümlü olarak azıcık
  // kaydırılınca dallanma canlanıyor. Kayma çocuk sayısıyla söner, yoksa
  // kalabalık halkada aralar kapanır.
  const skew = n % 2 === 0 ? (Math.PI / 8) * (2 / n) : 0;
  const nodes: NeuronNode[] = childCounts.map((_, i) => {
    const angle =
      -Math.PI / 2 + (i * 2 * Math.PI) / n + (i % 2 === 0 ? skew : -skew);
    // Dönüşümlü nefes payı — hepsi tam daire üstünde olursa tekerlek olur
    const breathe = i % 2 === 0 ? 1 : 0.86;
    const dist = spread * breathe;
    const p = { x: Math.cos(angle) * dist, y: Math.sin(angle) * dist };
    const r = radii[i];
    // Yol gövdenin ve çekirdeğin KENARINDAN başlayıp biter — çizgi
    // disklerin altına girmesin
    const ux = p.x / (Math.hypot(p.x, p.y) || 1);
    const uy = p.y / (Math.hypot(p.x, p.y) || 1);
    const from = { x: ux * coreR * 0.9, y: uy * coreR * 0.9 };
    const to = { x: p.x - ux * r * 0.9, y: p.y - uy * r * 0.9 };
    return {
      ...p,
      r,
      path: dendrite(from, to, (i % 2 === 0 ? 1 : -1) * dist * 0.14),
      width: Math.max(1.6, 1.4 + 0.5 * Math.sqrt(childCounts[i] + 1)),
    };
  });

  // Ad çekirdeğin ALTINDA yazılıyor; kutuya onun payı da eklenir
  const pad = base * 1.2 + 16;
  const xs = nodes.flatMap((p) => [p.x - p.r, p.x + p.r]);
  const ys = nodes.flatMap((p) => [p.y - p.r, p.y + p.r]);
  const minX = Math.min(-coreR, ...xs) - pad;
  const maxX = Math.max(coreR, ...xs) + pad;
  const minY = Math.min(-coreR, ...ys) - pad;
  const maxY = Math.max(coreR, ...ys) + pad;
  const offsetX = -minX;
  const offsetY = -minY;

  return {
    width: maxX - minX,
    height: maxY - minY,
    center: { x: offsetX, y: offsetY },
    coreR,
    nodes: nodes.map((p) => ({
      ...p,
      x: p.x + offsetX,
      y: p.y + offsetY,
      // Yollar gövde merkezliydi; kutuya taşınırken kaydırılır
      path: shiftPath(p.path, offsetX, offsetY),
    })),
  };
}

/** "M x y Q cx cy x2 y2" yolunu kaydır — yerleşim merkez sıfırda kuruluyor */
function shiftPath(d: string, dx: number, dy: number): string {
  const nums = d.match(/-?\d+(\.\d+)?/g);
  if (!nums || nums.length < 6) return d;
  const v = nums.map(Number);
  const s = (i: number) => (v[i] + (i % 2 === 0 ? dx : dy)).toFixed(2);
  return `M ${s(0)} ${s(1)} Q ${s(2)} ${s(3)} ${s(4)} ${s(5)}`;
}
