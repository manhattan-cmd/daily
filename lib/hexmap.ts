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
 *  - Merkez hücre kökün (bulunulan yer).
 *  - Her çocuk bir başkent alıyor; ilk altısı merkeze bitişik halkada,
 *    sonrakiler dışarıda. Başkentler eşit açılara oturuyor.
 *  - Ülkeler başkentten büyüyor: sırayla, herkes bir hücre alarak. Bir ülke
 *    kendi alt ağacı kadar hücre alıyor — ne eksik ne fazla — ve her yeni
 *    hücre kendi toprağına bitişik seçiliyor, yani ülke hep tek parça.
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

/** İki açı arasındaki en kısa fark */
function angDiff(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return Math.abs(d);
}

export function hexMapLayout(root: HexSeed, size: number): HexMap {
  const kids = root.children ?? [];
  const demand = kids.map(countAll);
  const total = 1 + demand.reduce((a, b) => a + b, 0);

  // Yeterli halka: 1 + 3R(R+1) hücre. Büyümeye pay bırakılıyor, dar bir
  // tahtada ülkeler birbirini kilitleyebiliyor.
  let R = 1;
  while (1 + 3 * R * (R + 1) < total) R++;
  let plan = attempt(R + 1);
  for (let extra = 2; !plan && extra <= 6; extra++) plan = attempt(R + extra);

  /** Başkentleri koy, ülkeleri büyüt. Tahta yetmezse null. */
  function attempt(rings: number) {
    const grid = cellsWithin(rings);
    const owner = new Map<string, number>();
    owner.set(key(0, 0), -1);

    // Başkentler HEPSİNİN sığdığı en küçük halkaya diziliyor. Altıdan çok
    // kategoride bir kısmı içeri bir kısmı dışarı konunca içerideki ülke
    // kuşatılıp büyüyemiyordu; hepsi aynı halkada olunca herkesin iki yanı
    // ve dışı açık kalıyor, iç halkayı da büyürken kendileri dolduruyor.
    let capRing = 1;
    while (6 * capRing < kids.length) capRing++;
    const capitals: string[] = [];
    for (let i = 0; i < kids.length; i++) {
      const want = -Math.PI / 2 + (2 * Math.PI * i) / kids.length;
      let best: string | null = null;
      let bestScore = Infinity;
      for (const [q, r] of grid) {
        const k = key(q, r);
        if (owner.has(k)) continue;
        const ring = hexDist(q, r);
        if (ring === 0) continue;
        const p = toPx(q, r, 1);
        // Başkent halkası baskın; o halkada istenen açıya en yakın hücre
        const score =
          Math.abs(ring - capRing) * 10 + angDiff(Math.atan2(p.y, p.x), want);
        if (score < bestScore) {
          bestScore = score;
          best = k;
        }
      }
      if (!best) return null;
      owner.set(best, i);
      capitals.push(best);
    }

    const sets = capitals.map((k) => new Set([k]));
    const need = demand.map((d) => d - 1);
    let progress = true;
    while (need.some((n) => n > 0) && progress) {
      progress = false;
      for (let i = 0; i < kids.length; i++) {
        if (need[i] <= 0) continue;
        const cap = capitals[i].split(",").map(Number);
        const capAngle = Math.atan2(
          toPx(cap[0], cap[1], 1).y,
          toPx(cap[0], cap[1], 1).x
        );
        let best: string | null = null;
        let bestScore = Infinity;
        for (const ck of sets[i]) {
          const [cq, cr] = ck.split(",").map(Number);
          for (const [dq, dr] of DIRS) {
            const q = cq + dq;
            const r = cr + dr;
            const k = key(q, r);
            if (owner.has(k) || hexDist(q, r) > rings) continue;
            const p = toPx(q, r, 1);
            // Başkente yakın, başkentin yönünden sapmayan hücre önce:
            // ülkeler dışa doğru düzgün açılıyor, birbirine dolanmıyor
            const score =
              hexDist(q - cap[0], r - cap[1]) * 4 +
              angDiff(Math.atan2(p.y, p.x), capAngle) * 2 +
              hexDist(q, r) * 0.2;
            if (score < bestScore - 1e-9) {
              bestScore = score;
              best = k;
            }
          }
        }
        if (!best) {
          // Ülke kuşatıldı: bitişik boş hücresi kalmadı. Bitişiklik güzellik,
          // ama kalemin haritada YER BULMASI şart — en yakın boş hücreye
          // taşınıyor. Tahta yeterince genişken bu duruma düşülmüyor.
          let far = Infinity;
          const [cq, cr] = capitals[i].split(",").map(Number);
          for (const [q, r] of grid) {
            const k = key(q, r);
            if (owner.has(k)) continue;
            const d = hexDist(q - cq, r - cr);
            if (d < far) {
              far = d;
              best = k;
            }
          }
          if (!best) continue;
        }
        owner.set(best, i);
        sets[i].add(best);
        need[i]--;
        progress = true;
      }
    }
    return need.some((n) => n > 0) ? null : { owner, sets, capitals };
  }

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
    const cap = plan?.capitals[i];
    // Başkenti olmayan ülke olmamalı; olursa o dal haritaya girmiyor ama
    // ekran da çökmüyor (eskiden burada tanımsız hücre patlıyordu)
    if (!cap) return;
    put(kid.id, cap);
    placeSub(kid, plan!.sets[i] ?? new Set<string>());
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
