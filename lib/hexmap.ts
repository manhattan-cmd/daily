/**
 * Petek haritası — Catan tahtası gibi tek bir kıta.
 *
 * Eskiden petek görünümü yalnız bulunulan kademeyi gösteriyordu: ortada
 * neredeysen o, çevresinde çocukları, gerisi kapalı. Burada harita AÇIK:
 * merkezde bulunulan yer, çevresinde çocuklarının her biri kendi ÜLKESİ
 * olarak duruyor ve o ülkenin bütün alt kalemleri de aynı haritada, kendi
 * başkentinin çevresinde. Ülke sınırları kalın çiziliyor, böylece "burası
 * Harcamalar'ın toprağı" tek bakışta okunuyor.
 *
 * Kurallar:
 *  - Tahta DELİKSİZ. Hücreler merkezden dışa sarmal sırayla dolduruluyor ve
 *    tam kalem sayısı kadar hücre kullanılıyor; yani içeride boş kalan bir
 *    göze asla düşülmüyor, kıta tek parça.
 *  - Merkez hücre kökün (bulunulan yer).
 *  - Her çocuk bir ülke: kendi alt ağacı kadar hücre, ne eksik ne fazla.
 *    Ülkeler merkezden çıkan açı dilimlerine göre paylaşılıyor, o yüzden
 *    her biri tek parça bir bölge oluyor.
 *  - BAŞKENT ülkenin ortasındaki hücre (medoid): üst kalem hep altlarının
 *    merkezinde durur. Önce başkent seçilip çevresi doldurulmuyor, tam
 *    tersi — önce toprak belli oluyor, sonra ortası başkent ilan ediliyor.
 *  - Kalemler ülkenin içine yerleşirken çocuk, mümkünse anasının komşusuna
 *    konuyor; ağacın şekli haritada da duruyor.
 *
 * Rastgelelik yok: aynı yapı her açılışta aynı haritayı veriyor.
 */

export interface Point {
  x: number;
  y: number;
}

/** Yerleşime verilen ağaç — sırası korunur */
export interface HexSeed {
  id: string;
  children?: HexSeed[];
}

export interface HexCell extends Point {
  /** Hücreye oturan kalemin kimliği */
  id: string;
  q: number;
  r: number;
  /** Kök 0, çocukları 1… — renk ve boyut bunu okuyor */
  depth: number;
  /** Hangi ülkenin toprağı; merkez hücrede boş */
  territory: string;
}

export interface HexBorder {
  territory: string;
  /** Ülkenin dış hattı — bitişik olmayan kenarların birleşimi */
  path: string;
}

export interface HexMap {
  width: number;
  height: number;
  center: Point;
  size: number;
  cells: HexCell[];
  byId: Map<string, HexCell>;
  borders: HexBorder[];
}

/**
 * Komşu yönleri, KENAR sırasıyla: i. yön, i. köşe ile (i+1). köşe arasındaki
 * kenarın dışına bakıyor (hexCorners 0°, 60°… çiziyor). Sınır çizimi bu
 * eşleşmeye dayanıyor.
 */
const DIRS: readonly [number, number][] = [
  [1, 0],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [0, -1],
  [1, -1],
];

const key = (q: number, r: number) => `${q},${r}`;
const hexDist = (q: number, r: number) =>
  (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2;

/** Eksenel koordinattan piksele (yatık altıgen: köşeler sağda ve solda) */
function toPx(q: number, r: number, size: number): Point {
  return { x: size * 1.5 * q, y: size * Math.sqrt(3) * (r + q / 2) };
}

function countAll(s: HexSeed): number {
  return 1 + (s.children ?? []).reduce((n, k) => n + countAll(k), 0);
}

/** R halkasına kadar bütün hücreler */
function cellsWithin(R: number): [number, number][] {
  const out: [number, number][] = [];
  for (let q = -R; q <= R; q++)
    for (let r = Math.max(-R, -q - R); r <= Math.min(R, -q + R); r++)
      out.push([q, r]);
  return out;
}

export function hexMapLayout(root: HexSeed, size: number): HexMap {
  const kids = root.children ?? [];
  const demand = kids.map(countAll);
  const total = 1 + demand.reduce((a, b) => a + b, 0);

  // ── Tahta: merkezden dışa sarmal, tam kalem sayısı kadar hücre ──────────
  // Deliksizliğin kaynağı bu: hücreler halka halka doluyor, bir dış hücre
  // ancak bütün iç hücreler dolduktan sonra kullanılıyor.
  let R = 1;
  while (1 + 3 * R * (R + 1) < total) R++;
  /** 0 = tam yukarı, saat yönünde artan açı (ekran koordinatı: y aşağı) */
  const angOf = (q: number, r: number) => {
    const p = toPx(q, r, 1);
    return (Math.atan2(p.y, p.x) + Math.PI * 2.5) % (Math.PI * 2);
  };
  const board = cellsWithin(R)
    .sort((a, b) => {
      const d = hexDist(a[0], a[1]) - hexDist(b[0], b[1]);
      return Math.abs(d) > 1e-9 ? d : angOf(a[0], a[1]) - angOf(b[0], b[1]);
    })
    .slice(0, total);

  // ── Bölüşüm: açı sırasına dizip ihtiyaç kadar bloklara kesmek ──────────
  // Hücreler açıya göre diziliyor (eşitlikte içteki önce) ve sıra, ülkelerin
  // alt ağaç boyu kadar ardışık bloklara kesiliyor. Blok = bir açı dilimi,
  // dilim de merkezden dışa uzanan bitişik bir bölge; ülke kendiliğinden tek
  // parça oluyor. İki yol denendi ve ikisi de ülkeyi bölüyordu: hücreyi tek
  // tek "en yakın ihtiyaçlı ülkeye" vermek, ve halka halka sayıyla
  // bölüştürmek (halkaların hücre sayısı farklı olduğu için dıştaki yay
  // içtekinin üstüne denk gelmiyor).
  const sorted = board
    .filter(([q, r]) => !(q === 0 && r === 0))
    .sort((a, b) => {
      const d = angOf(a[0], a[1]) - angOf(b[0], b[1]);
      return Math.abs(d) > 1e-9 ? d : hexDist(a[0], a[1]) - hexDist(b[0], b[1]);
    })
    .map(([q, r]) => key(q, r));

  // Kesim NEREDEN başlayacak? Aynı açıdaki hücreler merkezden dışa bir ışın
  // oluşturuyor; blok sınırı böyle bir ışının ortasına düşerse tek hücre
  // ülkesinden kopabiliyor. Liste açıca çembersel olduğu için başlangıcı
  // kaydırmak bambaşka bir kesim veriyor: hepsi denenip ülkeleri tek parça
  // bırakan ilk kesim seçiliyor.
  const nbrs = (k: string) => {
    const [q, r] = k.split(",").map(Number);
    return DIRS.map(([dq, dr]) => key(q + dq, r + dr));
  };
  const componentsOf = (set: Set<string>): Set<string>[] => {
    const left = new Set(set);
    const out: Set<string>[] = [];
    while (left.size) {
      const start = [...left][0];
      const comp = new Set([start]);
      const queue = [start];
      left.delete(start);
      while (queue.length) {
        const cur = queue.shift()!;
        for (const nb of nbrs(cur))
          if (left.has(nb)) {
            left.delete(nb);
            comp.add(nb);
            queue.push(nb);
          }
      }
      out.push(comp);
    }
    return out;
  };
  const onePiece = (set: Set<string>) =>
    set.size === 0 || componentsOf(set).length === 1;

  const cut = (offset: number) => {
    const sets: Set<string>[] = kids.map(() => new Set<string>());
    let at = 0;
    kids.forEach((_, i) => {
      for (let t = 0; t < demand[i] && at < sorted.length; t++, at++)
        sets[i].add(sorted[(offset + at) % sorted.length]);
    });
    return { sets, broken: sets.filter((s) => !onePiece(s)).length };
  };
  let sets = cut(0).sets;
  let bestBroken = cut(0).broken;
  for (let off = 0; bestBroken > 0 && off < sorted.length; off++) {
    const cand = cut(off);
    if (cand.broken < bestBroken) {
      bestBroken = cand.broken;
      sets = cand.sets;
    }
  }
  const owner = new Map<string, number>();
  owner.set(key(0, 0), -1);
  sets.forEach((set, i) => {
    for (const k of set) owner.set(k, i);
  });

  // ── Onarım: kopan hücreyi komşu ülkeyle takas et ───────────────────────
  // Açı kesimi çoğu tahtada tek parça ülkeler veriyor, ama dilimler çok
  // inceldiğinde (yirmi kategori gibi) aynı açıdaki "ışın" iki bloğa
  // bölünüyor ve bir hücre ülkesinden kopuyor. Burası onu yerine oturtuyor:
  // kopan hücre komşu ülkeye, o ülkenin ana parçaya değen bir hücresi de
  // buraya geçiyor. Takas ancak İKİ ülke de tek parça kalıyorsa yapılıyor.
  /** n elemanlı alt kümeler (küçük listeler için; arama tavanı var) */
  const combos = (list: string[], n: number): string[][] => {
    if (n === 0) return [[]];
    const out: string[][] = [];
    for (let i = 0; i <= list.length - n && out.length < 400; i++)
      for (const rest of combos(list.slice(i + 1), n - 1)) {
        out.push([list[i], ...rest]);
        if (out.length >= 400) break;
      }
    return out;
  };

  for (let round = 0; round < 40; round++) {
    let fixed = false;
    for (let i = 0; i < kids.length && !fixed; i++) {
      const comps = componentsOf(sets[i]).sort((a, b) => b.size - a.size);
      if (comps.length <= 1) continue;
      const main = comps[0];
      for (let ci = 1; ci < comps.length && !fixed; ci++) {
        const stray = [...comps[ci]];
        if (stray.length > 4) continue;
        // Kopan parçanın komşusu olan ülkeler; parça tümüyle onlardan birine
        // geçiyor, karşılığında ana parçaya değen hücrelerini veriyorlar
        const around = new Set<number>();
        for (const s of stray)
          for (const nb of nbrs(s)) {
            const j = owner.get(nb);
            if (j !== undefined && j >= 0 && j !== i) around.add(j);
          }
        for (const j of around) {
          const cands = [...sets[j]]
            .filter((k) => nbrs(k).some((x) => main.has(x)))
            .sort()
            .slice(0, 12);
          for (const give of combos(cands, stray.length)) {
            const si = new Set(sets[i]);
            const sj = new Set(sets[j]);
            for (const s of stray) {
              si.delete(s);
              sj.add(s);
            }
            for (const g of give) {
              sj.delete(g);
              si.add(g);
            }
            if (!onePiece(si) || !onePiece(sj)) continue;
            sets[i] = si;
            sets[j] = sj;
            for (const s of stray) owner.set(s, j);
            for (const g of give) owner.set(g, i);
            fixed = true;
            break;
          }
          if (fixed) break;
        }
      }
    }
    if (!fixed) break;
  }

  // ── Başkent: ülkenin ORTASINDAKİ hücre ─────────────────────────────────
  // Üst kalem hep altlarının merkezinde dursun diye toprak belli olduktan
  // sonra medoid seçiliyor: kendi ülkesinin bütün hücrelerine uzaklığı en
  // küçük olan hücre. Eskiden başkent kenarda kalıyordu, çünkü ülke ondan
  // dışa doğru büyüyordu.
  const capitals = sets.map((set) => {
    const list = [...set].sort();
    let best = list[0];
    let bestScore = Infinity;
    for (const k of list) {
      const [q, r] = k.split(",").map(Number);
      let sum = 0;
      for (const o of list) {
        const [oq, or_] = o.split(",").map(Number);
        sum += hexDist(q - oq, r - or_);
      }
      // Eşitlikte merkeze yakın olan: kıtanın içine bakan taraf
      const score = sum * 10 + hexDist(q, r);
      if (score < bestScore) {
        bestScore = score;
        best = k;
      }
    }
    return best;
  });

  // ── Kalemleri hücrelere otur ───────────────────────────────────────────
  const cellOf = new Map<string, string>();
  const used = new Set<string>();
  const put = (id: string, k: string) => {
    cellOf.set(id, k);
    used.add(k);
  };
  put(root.id, key(0, 0));

  /**
   * Kalemler ülkeye derinlik önceliğiyle yerleşiyor: bir çocuk konur konmaz
   * onun altı da yanına konuyor. Genişlik önceliğiyle denendi ve aile
   * dağılıyordu — kardeşler ananın bütün komşularını kapınca torunlara
   * uzak hücreler kalıyordu. Boş komşu yoksa ülkenin en yakın boş hücresi.
   */
  const placeSub = (node: HexSeed, set: Set<string>) => {
    const here = cellOf.get(node.id);
    if (!here) return;
    const [cq, cr] = here.split(",").map(Number);
    for (const ch of node.children ?? []) {
      let target: string | null = null;
      // Boş komşular arasından DIŞA doğru olanı: derinleştikçe merkezden
      // uzaklaşmak uygulamanın her yerindeki dil
      let bestOut = -Infinity;
      DIRS.forEach(([dq, dr]) => {
        const k = key(cq + dq, cr + dr);
        if (!set.has(k) || used.has(k)) return;
        const out = hexDist(cq + dq, cr + dr);
        if (out > bestOut) {
          bestOut = out;
          target = k;
        }
      });
      if (!target) {
        let bestD = Infinity;
        for (const k of [...set].sort()) {
          if (used.has(k)) continue;
          const [q, r] = k.split(",").map(Number);
          const d = hexDist(q - cq, r - cr);
          if (d < bestD) {
            bestD = d;
            target = k;
          }
        }
      }
      if (!target) continue;
      put(ch.id, target);
      placeSub(ch, set);
    }
  };

  kids.forEach((kid, i) => {
    const cap = capitals[i];
    // Başkenti olmayan ülke olmamalı; olursa o dal haritaya girmiyor ama
    // ekran da çökmüyor (eskiden burada tanımsız hücre patlıyordu)
    if (!cap) return;
    put(kid.id, cap);
    placeSub(kid, sets[i] ?? new Set<string>());
  });

  // ── Piksel ve kutu ─────────────────────────────────────────────────────
  const depthOf = new Map<string, number>();
  const territoryOf = new Map<string, string>();
  const walk = (s: HexSeed, depth: number, terr: string) => {
    depthOf.set(s.id, depth);
    territoryOf.set(s.id, terr);
    for (const k of s.children ?? [])
      walk(k, depth + 1, depth === 0 ? k.id : terr);
  };
  walk(root, 0, "");

  const raw = [...cellOf.entries()].map(([id, k]) => {
    const [q, r] = k.split(",").map(Number);
    return {
      id,
      q,
      r,
      p: toPx(q, r, size),
      depth: depthOf.get(id) ?? 0,
      territory: territoryOf.get(id) ?? "",
    };
  });

  const padX = size * 1.05;
  const padY = size * (Math.sqrt(3) / 2) * 1.05;
  const minX = Math.min(...raw.map((c) => c.p.x)) - padX;
  const maxX = Math.max(...raw.map((c) => c.p.x)) + padX;
  const minY = Math.min(...raw.map((c) => c.p.y)) - padY;
  const maxY = Math.max(...raw.map((c) => c.p.y)) + padY;
  const center: Point = { x: -minX, y: -minY };

  const cells: HexCell[] = raw.map((c) => ({
    id: c.id,
    q: c.q,
    r: c.r,
    x: c.p.x + center.x,
    y: c.p.y + center.y,
    depth: c.depth,
    territory: c.territory,
  }));
  const byId = new Map(cells.map((c) => [c.id, c]));

  // ── Sınırlar ───────────────────────────────────────────────────────────
  // Bir kenar, komşusu BAŞKA ülkedeyse sınırdır. Ülkenin bütün sınır
  // kenarları tek yolda birleşiyor — kalın çizilince kıta gibi duruyor.
  const ownerAt = new Map<string, string>();
  for (const c of cells) ownerAt.set(key(c.q, c.r), c.territory);
  const byTerr = new Map<string, HexCell[]>();
  for (const c of cells) {
    const arr = byTerr.get(c.territory) ?? [];
    arr.push(c);
    byTerr.set(c.territory, arr);
  }
  const corner = (c: HexCell, i: number): Point => ({
    x: c.x + size * Math.cos((Math.PI / 180) * 60 * i),
    y: c.y + size * Math.sin((Math.PI / 180) * 60 * i),
  });
  const borders: HexBorder[] = [...byTerr.entries()].map(([territory, list]) => {
    const parts: string[] = [];
    for (const c of list) {
      for (let e = 0; e < 6; e++) {
        const [dq, dr] = DIRS[e];
        if (ownerAt.get(key(c.q + dq, c.r + dr)) === territory) continue;
        const a = corner(c, e);
        const b = corner(c, (e + 1) % 6);
        parts.push(
          `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} L ${b.x.toFixed(2)} ${b.y.toFixed(2)}`
        );
      }
    }
    return { territory, path: parts.join(" ") };
  });

  return {
    width: maxX - minX,
    height: maxY - minY,
    center,
    size,
    cells,
    byId,
    borders,
  };
}
