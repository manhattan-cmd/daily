/**
 * Devre şehri yerleşimi — saf hesap, tuvalden ve React'ten bağımsız (yerleşim
 * denemeleri Node'da bu dosyayı doğrudan koşturuyor).
 *
 * Her kalem bir "blok": yerel eksende u dışarı (merkezden uzağa), v yana.
 * Blokların giriş noktası üst kalemin iç kenarındaki pad; bloğun iç kenarından
 * o pad'e giden yatay yol hep boş — üst blok izini oraya kadar uzatabilir.
 *
 * İki blok biçimi var:
 *  - tarak: çocuklar dış kenarda alt alta, üst kalem onların hizasında.
 *  - göbek: üst kalem ortada, çocukları üç yanında — üstte ve altta birer sıra
 *    (onların ağacı dikine büyür), dışta bir sütun. Kalabalık kalem böylece
 *    upuzun bir sütun yerine kareye yakın bir mahalle oluyor.
 * Her kalem için ikisinden hangisi daha toplu (küçük ve kareye yakın) ise o
 * seçiliyor; göbekte çocukların üç yana bölünüşü de aynı ölçüyle seçiliyor.
 *
 * Bütün izler yatay, dikey ya da 45°; bir kalemin izleri iç içe şeritlerde,
 * kesişmiyor.
 */

export type Pt = [number, number];
/** Kart kenarındaki bacak/pad: konum ve dışa bakan yön */
export type Pin = { p: Pt; d: Pt };
export type CityCard = {
  id: string;
  cx: number;
  cy: number;
  w: number;
  h: number;
  /** Renk şeridinin karşı yönü: +1 şerit solda, -1 sağda */
  sx: number;
  kids: string[];
  pins: Pin[];
  pad: Pin | null;
};
export type CityTrace = { from: string; to: string; pts: Pt[] };
export type City = {
  cards: Map<string, CityCard>;
  traces: CityTrace[];
  bounds: { x0: number; y0: number; x1: number; y1: number };
};
export type CityInput = {
  roots: string[];
  kids: (id: string) => string[];
  isCat: (id: string) => boolean;
  withRoot: boolean;
};
export type CityOpts = {
  /** göbek biçimi: hiç, gerektiğinde, her zaman (çocuk sayısı hubMin ve üstüyse) */
  hub: "off" | "auto" | "force";
  hubMin: number;
  /** tarakta üst kalem çocuklarının ortasında (yoksa ilk çocuğun hizasında) */
  center: boolean;
  /** göbeğin üst/alt sırası: kartın ortasına göre ya da iç kenarından dışa */
  rowAlign: "center" | "inner";
  /** göbeğin iç kenarına da çocuk dizilsin (girişin üstü ve altı) */
  inner: boolean;
};
export const CITY_OPTS: CityOpts = { hub: "auto", hubMin: 4, center: true, rowAlign: "center", inner: true };

export const ROOT = "__root";
export const ROOT_W = 96;
export const ROOT_H = 56;
export const CW = 116;
export const CHAMF = 6;
const PIN = 6;
const LANE = 5;
const ROW_GAP = 12;
const SIDE_GAP = 14;
const BLOCK_GAP = 26;

type V2 = [number, number];
type LCard = { id: string; c: V2; hu: number; hv: number; fwd: V2; kids: string[]; pins: Pin[]; pad: Pin | null };
type Blk = { cards: LCard[]; traces: CityTrace[]; u0: number; u1: number; v0: number; v1: number; e: V2 };
/** Eksen dönüşümü: çocuğun (u, v) noktası → o + u·a + v·b */
type Tf = { o: V2; a: V2; b: V2 };

const tp = (t: Tf, p: V2): V2 => [t.o[0] + p[0] * t.a[0] + p[1] * t.b[0], t.o[1] + p[0] * t.a[1] + p[1] * t.b[1]];
const tv = (t: Tf, p: V2): V2 => [p[0] * t.a[0] + p[1] * t.b[0], p[0] * t.a[1] + p[1] * t.b[1]];
const blank = (): Blk => ({ cards: [], traces: [], u0: Infinity, u1: -Infinity, v0: Infinity, v1: -Infinity, e: [0, 0] });
const grow = (b: Blk, u0: number, v0: number, u1: number, v1: number) => {
  b.u0 = Math.min(b.u0, u0, u1);
  b.u1 = Math.max(b.u1, u0, u1);
  b.v0 = Math.min(b.v0, v0, v1);
  b.v1 = Math.max(b.v1, v0, v1);
};

/** Çocuk bloğunu dönüştürüp ekle; dönen değer çocuğun girişi (yeni eksende) */
function emit(out: Blk, b: Blk, t: Tf, dry: boolean): V2 {
  const p0 = tp(t, [b.u0, b.v0]);
  const p1 = tp(t, [b.u1, b.v1]);
  grow(out, p0[0], p0[1], p1[0], p1[1]);
  if (!dry) {
    const swap = t.a[0] === 0;
    for (const c of b.cards)
      out.cards.push({
        ...c,
        c: tp(t, c.c),
        hu: swap ? c.hv : c.hu,
        hv: swap ? c.hu : c.hv,
        fwd: tv(t, c.fwd),
        pins: c.pins.map((q) => ({ p: tp(t, q.p), d: tv(t, q.d) })),
        pad: c.pad && { p: tp(t, c.pad.p), d: tv(t, c.pad.d) },
      });
    for (const r of b.traces) out.traces.push({ ...r, pts: r.pts.map((q) => tp(t, q)) });
  }
  return tp(t, b.e);
}

/** n izin şeritleri için gereken boşluk */
const fanGap = (n: number) => 2 * CHAMF + 10 + Math.max(0, n - 1) * LANE;

/** Yukarı ve aşağı kıvrılan iz sayısı (şerit grupları) */
function groups(ends: { pv: number; cv: number }[]) {
  let up = 0;
  let down = 0;
  for (const { pv, cv } of ends) {
    if (cv < pv - 0.5) up++;
    else if (cv > pv + 0.5) down++;
  }
  return Math.max(up, down);
}

/**
 * Bacaklardan (pu, pv) çocuk girişlerine (cu, cv): u boyunca çık, şeritte v
 * boyunca yürü, u boyunca girişe otur. Şeritler [pu, inner] aralığında —
 * nearPin ise bacaklara, değilse girişlere yakın. İç içe; hiçbiri kesişmiyor.
 */
function fan(pu: number, inner: number, ends: { pv: number; cv: number; cu: number }[], nearPin: boolean): V2[][] {
  const lane = ends.map(() => 0);
  const idx = ends.map((_, i) => i);
  // hizada olmayan her iz kendi şeridinde — küçük bir kayma bile komşu bacağın
  // izini kesebiliyor
  // iç içelik bacak sırasına göre: yukarı kıvrılanlarda en üstteki, aşağı
  // kıvrılanlarda en alttaki bacağa en yakın şerit
  const up = idx.filter((i) => ends[i].cv < ends[i].pv - 0.5).sort((x, y) => ends[x].pv - ends[y].pv);
  const down = idx.filter((i) => ends[i].cv > ends[i].pv + 0.5).sort((x, y) => ends[y].pv - ends[x].pv);
  for (const g of [up, down]) {
    const room = inner - pu - 2 * CHAMF - 10;
    const step = g.length > 1 ? Math.min(LANE, room / (g.length - 1)) : 0;
    const start = nearPin ? pu + CHAMF + 4 : inner - CHAMF - 4 - (g.length - 1) * step;
    g.forEach((i, k) => (lane[i] = start + k * step));
  }
  return ends.map(({ pv, cv, cu }, i) => {
    const tail: V2[] = cu > inner + 0.5 ? [[cu, cv]] : [];
    if (!lane[i]) return [[pu, pv], [inner, cv], ...tail];
    const lu = lane[i];
    const s = Math.sign(cv - pv);
    const r = Math.min(CHAMF, Math.abs(cv - pv) / 2);
    return [[pu, pv], [lu - r, pv], [lu, pv + s * r], [lu, cv - s * r], [lu + r, cv], [inner, cv], ...tail];
  });
}

/** n bacağın kenar boyunca yerleri (merkez etrafında) */
const spread = (n: number, len: number, mid: number) => {
  const s = n > 1 ? Math.min(PIN, (len - 14) / (n - 1)) : 0;
  return Array.from({ length: n }, (_, i) => mid + (i - (n - 1) / 2) * s);
};

/** Bloğun tutarlılığı: küçük ve kareye yakın olan daha iyi */
const cost = (b: Blk) => {
  const W = b.u1 - b.u0;
  const H = b.v1 - b.v0;
  return W * H * Math.sqrt(Math.max(W, H) / Math.max(1, Math.min(W, H)));
};

export function layoutCity(inp: CityInput, opts: CityOpts = CITY_OPTS): City {
  const memo = new Map<string, Blk>();

  /** Çocukları alt alta (v boyunca) diz; dönen: her birinin v kayması ve girişinin v'si */
  const stack = (K: Blk[], gap: number) => {
    const vo: number[] = [];
    let cur = 0;
    for (const b of K) {
      vo.push(cur - b.v0);
      cur += b.v1 - b.v0 + gap;
    }
    return { vo, ev: K.map((b, i) => vo[i] + b.e[1]), len: K.length ? cur - gap : 0 };
  };

  const comb = (id: string, horiz: boolean, kids: string[], dry: boolean): Blk => {
    const base = inp.isCat(id) ? 34 : 28;
    const K = kids.map((k) => lay(k, horiz));
    const n = K.length;
    const Lu = horiz ? CW : base;
    const Lv = horiz ? Math.max(base, 12 + (n - 1) * PIN) : CW;
    const out = blank();
    grow(out, 0, -Lv / 2, Lu, Lv / 2);
    const { vo, ev } = stack(K, horiz ? ROW_GAP : SIDE_GAP);
    const mid = n ? (opts.center ? (ev[0] + ev[n - 1]) / 2 : ev[0]) : 0;
    const pv = spread(n, Lv, 0);
    const gap = Math.max(horiz ? 48 : 34, fanGap(groups(ev.map((v, i) => ({ pv: pv[i], cv: v - mid })))));
    const inner = Lu + gap;
    const ends = K.map((b, i) => {
      const e = emit(out, b, { o: [inner - b.u0, vo[i] - mid], a: [1, 0], b: [0, 1] }, dry);
      return { pv: pv[i], cv: e[1], cu: e[0] };
    });
    if (!dry) {
      out.cards.push({
        id,
        c: [Lu / 2, 0],
        hu: Lu / 2,
        hv: Lv / 2,
        fwd: [1, 0],
        kids,
        pins: pv.map((v) => ({ p: [Lu, v], d: [1, 0] })),
        pad: { p: [0, 0], d: [-1, 0] },
      });
      fan(Lu, inner, ends, true).forEach((pts, i) => out.traces.push({ from: id, to: kids[i], pts }));
    }
    return out;
  };

  /**
   * Göbek: kalem ortada, çocukları dört yanında. Saat yönünde: iç kenarın üstü
   * (girişten yukarı mI), üst sıra (nT), dış sütun (kalan), alt sıra (nB), iç
   * kenarın altı (aşağıdan girişe mI). Giriş izi iç sütunun ortasındaki
   * koridordan geçiyor.
   */
  const hub = (id: string, horiz: boolean, kids: string[], nT: number, nB: number, mI: number, dry: boolean): Blk => {
    const base = inp.isCat(id) ? 34 : 28;
    const n = kids.length;
    const IU = kids.slice(0, mI);
    const T = kids.slice(mI, mI + nT);
    const O = kids.slice(mI + nT, n - nB - mI);
    const B = kids.slice(n - nB - mI, n - mI).reverse();
    const IL = kids.slice(n - mI).reverse();
    const KT = T.map((k) => lay(k, !horiz));
    const KO = O.map((k) => lay(k, horiz));
    const KB = B.map((k) => lay(k, !horiz));
    const KIU = IU.map((k) => lay(k, horiz));
    const KIL = IL.map((k) => lay(k, horiz));
    const nO = KO.length;
    const sib = horiz ? ROW_GAP : SIDE_GAP;
    const Lu = horiz ? CW : Math.max(base, 12 + (Math.max(nT, nB) - 1) * PIN);
    const Lv = horiz ? Math.max(base, 12 + (nO - 1) * PIN, 2 * mI * PIN + 14) : Math.max(CW, 2 * mI * PIN + 14);
    const out = blank();
    grow(out, 0, -Lv / 2, Lu, Lv / 2);
    const pins: Pin[] = [];
    const later: (() => void)[] = [];

    // Dış sütun — tarak gibi, ortalı
    const so = stack(KO, sib);
    const midO = nO ? (so.ev[0] + so.ev[nO - 1]) / 2 : 0;
    const pvO = spread(nO, Lv, 0);
    const gapO = Math.max(horiz ? 48 : 34, fanGap(groups(so.ev.map((v, i) => ({ pv: pvO[i], cv: v - midO })))));
    const innerO = Lu + gapO;
    const endsO = KO.map((b, i) => {
      const e = emit(out, b, { o: [innerO - b.u0, so.vo[i] - midO], a: [1, 0], b: [0, 1] }, dry);
      return { pv: pvO[i], cv: e[1], cu: e[0] };
    });
    const oTop = nO ? midO : 0; // dış sütunun merkez çizgisinin üstüne uzanımı
    const oBot = nO ? so.len - midO : 0;
    if (nO) later.push(() => fan(Lu, innerO, endsO, true).forEach((pts, i) => out.traces.push({ from: id, to: O[i], pts })));

    // İç sütun: girişin üstünde ve altında, ağaçları içe doğru (u → -u)
    const CORR = 10;
    let iTop = 0;
    let iBot = 0;
    const inner = (K: Blk[], ids: string[], side: -1 | 1) => {
      if (!K.length) return 0;
      const pv = K.map((_, k) => side * PIN * (k + 1));
      let cur = side * CORR;
      const vo = K.map((b) => {
        const o = side < 0 ? cur - b.v1 : cur - b.v0;
        cur += side * (b.v1 - b.v0 + sib);
        return o;
      });
      const g = Math.max(horiz ? 48 : 34, fanGap(K.length));
      // yerel eksen u' = -u: çocuğun iç kenarı girişten g kadar uzakta
      const ends = K.map((b, i) => {
        const e = emit(out, b, { o: [-(g - b.u0), vo[i]], a: [-1, 0], b: [0, 1] }, dry);
        return { pv: pv[i], cv: e[1], cu: -e[0] };
      });
      if (!dry) {
        for (const v of pv) pins.push({ p: [0, v], d: [-1, 0] });
        later.push(() =>
          fan(0, g, ends, true).forEach((pts, i) => out.traces.push({ from: id, to: ids[i], pts: pts.map(([a, b]) => [-a, b] as V2) }))
        );
      }
      return Math.abs(cur) - sib;
    };
    iTop = inner(KIU, IU, -1);
    iBot = inner(KIL, IL, 1);

    // Üst ve alt sıralar: çocuklar yan yana, ağaçları merkezden dikine uzaklaşıyor
    const row = (K: Blk[], ids: string[], side: -1 | 1) => {
      const n = K.length;
      if (!n) return;
      const gap = horiz ? SIDE_GAP : ROW_GAP;
      const W = K.reduce((a, b) => a + b.v1 - b.v0, 0) + (n - 1) * gap;
      const start = opts.rowAlign === "center" ? Lu / 2 - W / 2 : 0;
      const xo: number[] = [];
      let cur = start;
      for (const b of K) {
        xo.push(cur - b.v0);
        cur += b.v1 - b.v0 + gap;
      }
      const pu = spread(n, Lu, Lu / 2);
      const band = fanGap(groups(K.map((b, i) => ({ pv: pu[i], cv: xo[i] + b.e[1] }))));
      // yan sütunların üstüne taşıyorsa onları aşacak kadar uzakta
      let d = Lv / 2 + Math.max(band, 22);
      if (nO && start + W > Lu + 0.5) d = Math.max(d, (side < 0 ? oTop : oBot) + 8 + band);
      if (mI && start < -0.5) d = Math.max(d, (side < 0 ? iTop : iBot) + 8 + band);
      // çocuğun u'su → merkezden uzağa (side yönünde v), v'si → +u
      const ends = K.map((b, i) => {
        const e = emit(out, b, { o: [xo[i], side * (d - b.u0)], a: [0, side], b: [1, 0] }, dry);
        return { pv: pu[i], cv: e[0], cu: side * e[1] };
      });
      if (dry) return;
      for (const u of pu) pins.push({ p: [u, (side * Lv) / 2], d: [0, side] });
      // yerel eksende (u' = merkezden uzaklık, v' = u) çizip geri çevir
      fan(Lv / 2, d, ends, false).forEach((pts, i) =>
        out.traces.push({ from: id, to: ids[i], pts: pts.map(([a, b]) => [b, side * a] as V2) })
      );
    };
    row(KT, T, -1);
    row(KB, B, 1);
    if (!dry) {
      for (const v of pvO) pins.push({ p: [Lu, v], d: [1, 0] });
      out.cards.push({ id, c: [Lu / 2, 0], hu: Lu / 2, hv: Lv / 2, fwd: [1, 0], kids, pins, pad: { p: [0, 0], d: [-1, 0] } });
      later.forEach((f) => f());
    }
    return out;
  };

  const lay = (id: string, horiz: boolean): Blk => {
    const key = id + (horiz ? "|h" : "|v");
    const hit = memo.get(key);
    if (hit) return hit;
    const kids = inp.kids(id);
    let best: Blk;
    if (!kids.length) {
      const base = inp.isCat(id) ? 34 : 28;
      const [Lu, Lv] = horiz ? [CW, base] : [base, CW];
      best = blank();
      grow(best, 0, -Lv / 2, Lu, Lv / 2);
      best.cards.push({ id, c: [Lu / 2, 0], hu: Lu / 2, hv: Lv / 2, fwd: [1, 0], kids, pins: [], pad: { p: [0, 0], d: [-1, 0] } });
    } else {
      const n = kids.length;
      let pick: [number, number, number] | null = null;
      let bestCost = opts.hub === "force" && n >= opts.hubMin ? Infinity : cost(comb(id, horiz, kids, true));
      if (opts.hub !== "off" && n >= opts.hubMin) {
        // sıralar birbirine yakın (fark en çok 1), iç kenarın iki yarısı eşit
        // denemelerde seçilen bölüşümler hep bu sınırların içinde kaldı
        const aMax = Math.ceil(n / 3) + 1;
        const mMax = opts.inner ? Math.ceil(n / 4) + 1 : 0;
        for (let a = 0; a <= Math.min(n, aMax); a++)
          for (let c = Math.max(0, a - 1); c <= a + 1 && a + c <= n; c++)
            for (let m = 0; m <= mMax && a + c + 2 * m <= n; m++) {
              if (a + c + m === 0) continue;
              const k = cost(hub(id, horiz, kids, a, c, m, true));
              if (k < bestCost - 1) {
                bestCost = k;
                pick = [a, c, m];
              }
            }
      }
      best = pick ? hub(id, horiz, kids, pick[0], pick[1], pick[2], false) : comb(id, horiz, kids, false);
    }
    memo.set(key, best);
    return best;
  };

  // ─── Şehir: bloklar dört caddeye ─────────────────────────────────────────
  const { roots, withRoot } = inp;
  const blocks = roots.map((rid) => {
    const b = lay(rid, true);
    return { rid, b, U: b.u1 - b.u0, V: b.v1 - b.v0 };
  });
  type Bk = (typeof blocks)[number];
  type Arm = "E" | "W" | "N" | "S";
  const order: Arm[] = ["E", "W", "N", "S"];
  const arms: Record<Arm, [Bk[], Bk[]]> = { E: [[], []], W: [[], []], N: [[], []], S: [[], []] };
  // Doğu/batıda blok cadde boyunca U kadar, kuzey/güneyde V kadar yer tutuyor
  const along = (b: Bk, a: Arm) => (a === "E" || a === "W" ? b.U : b.V) + BLOCK_GAP;

  if (withRoot && blocks.length) {
    // Sekiz yuva (4 cadde × 2 yaka). Şehrin dört yöndeki uzanımı aşağıdaki
    // yerleşimle aynı hesaplanıyor; en uzun kol en kısa, toplam en küçük olsun.
    const slotArm = (k: number) => order[k >> 1];
    const extent = (asg: number[]) => {
      const len = Array(8).fill(0);
      const cnt = Array(8).fill(0);
      const tall = Array(8).fill(0);
      const wide = Array(8).fill(0);
      asg.forEach((k, i) => {
        const b = blocks[i];
        len[k] += along(b, slotArm(k));
        cnt[k]++;
        tall[k] = Math.max(tall[k], b.V);
        wide[k] = Math.max(wide[k], b.U);
      });
      // E=0,1  W=2,3  N=4,5  S=6,7 ; yaka 0 = üst/sol
      const off = (s: number) => ROOT_H / 2 + 12 + Math.max(cnt[s], cnt[2 + s]) * LANE;
      const band = [0, 1].map((s) => Math.max(ROOT_H / 2, off(s) + Math.max(tall[s], tall[2 + s])));
      const reach = (k: number) => 24 + cnt[k] * LANE + wide[k];
      const startN = Math.max(band[0] + 30, ROOT_H / 2 + 30);
      const startS = Math.max(band[1] + 30, ROOT_H / 2 + 30);
      const R = [
        Math.max(ROOT_W / 2 + 34 + Math.max(len[0], len[1]), reach(5), reach(7)),
        Math.max(ROOT_W / 2 + 34 + Math.max(len[2], len[3]), reach(4), reach(6)),
        Math.max(band[0], cnt[4] + cnt[5] ? startN + Math.max(len[4], len[5]) : 0),
        Math.max(band[1], cnt[6] + cnt[7] ? startS + Math.max(len[6], len[7]) : 0),
      ];
      // bir yakada 4'ten çok kategori kökün kenarından taşar
      const crowd = cnt.reduce((a, c) => a + Math.max(0, c - 3), 0) * 2000;
      // dört caddenin her biri en az bir kategori alsın (blok yeterse)
      const empty = [0, 2, 4, 6].filter((k) => cnt[k] + cnt[k + 1] === 0).length;
      const need = Math.max(0, 4 - blocks.length);
      return Math.max(...R) * 2 + R.reduce((a, r) => a + r, 0) * 0.5 + crowd + Math.max(0, empty - need) * 2000;
    };
    // İlk tahmin: büyükten küçüğe en kısa yuvaya; sonra taşı/değiştir iyileştirmesi
    const asg = blocks.map(() => 0);
    const idx = blocks.map((_, i) => i).sort((x, y) => blocks[y].V * blocks[y].U - blocks[x].V * blocks[x].U);
    const fill = Array(8).fill(0);
    for (const i of idx) {
      let best = 0;
      for (let k = 1; k < 8; k++)
        if (fill[k] + along(blocks[i], slotArm(k)) < fill[best] + along(blocks[i], slotArm(best))) best = k;
      asg[i] = best;
      fill[best] += along(blocks[i], slotArm(best));
    }
    let cur = extent(asg);
    for (let pass = 0, better = true; better && pass < 40; pass++) {
      better = false;
      for (let i = 0; i < asg.length; i++) {
        for (let k = 0; k < 8; k++) {
          const was = asg[i];
          if (k === was) continue;
          asg[i] = k;
          const c = extent(asg);
          if (c < cur - 0.5) {
            cur = c;
            better = true;
          } else asg[i] = was;
        }
        for (let j = i + 1; j < asg.length; j++) {
          if (asg[i] === asg[j]) continue;
          [asg[i], asg[j]] = [asg[j], asg[i]];
          const c = extent(asg);
          if (c < cur - 0.5) {
            cur = c;
            better = true;
          } else [asg[i], asg[j]] = [asg[j], asg[i]];
        }
      }
    }
    asg.forEach((k, i) => arms[slotArm(k)][k & 1].push(blocks[i]));
  }

  const world = blank();
  const rootPins: Pin[] = [];
  /** Bloğu dünyaya koy: iç köşesi (ox, oy), u → sx yönünde x, v → sy yönünde y */
  const put = (bk: Bk, ox: number, oy: number, sx: number, sy: number) =>
    emit(world, bk.b, { o: [ox - sx * bk.b.u0, oy - sy * bk.b.v0], a: [sx, 0], b: [0, sy] }, false);
  const chamfered = (pts: Pt[]): Pt[] => {
    const res: Pt[] = [pts[0]];
    for (let i = 1; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i - 1];
      const [bx, by] = pts[i];
      const [cx, cy] = pts[i + 1];
      const l1 = Math.hypot(bx - ax, by - ay);
      const l2 = Math.hypot(cx - bx, cy - by);
      const r = Math.min(CHAMF, l1 / 2, l2 / 2);
      if (r < 0.5) {
        res.push(pts[i]);
        continue;
      }
      res.push([bx - ((bx - ax) / l1) * r, by - ((by - ay) / l1) * r]);
      res.push([bx + ((cx - bx) / l2) * r, by + ((cy - by) / l2) * r]);
    }
    res.push(pts[pts.length - 1]);
    return res;
  };

  if (!withRoot) {
    if (blocks[0]) put(blocks[0], 0, 0, 1, 1);
  } else {
    // Ortadaki bant: doğu ve batı caddelerinin blokları
    const bandOff = (s: number) => ROOT_H / 2 + 12 + Math.max(arms.E[s].length, arms.W[s].length) * LANE;
    const bandH = [0, 0];
    for (const a of ["E", "W"] as const) {
      const dx = a === "E" ? 1 : -1;
      for (const s of [0, 1]) {
        const sy = s === 0 ? -1 : 1;
        const list = arms[a][s];
        let cursor = ROOT_W / 2 + 34;
        list.forEach((b, i) => {
          const oy = sy * bandOff(s);
          const e = put(b, dx * cursor, oy, dx, sy);
          bandH[s] = Math.max(bandH[s], bandOff(s) + b.V);
          // Cadde: kökten şeritte dışarı, bloğun önünde dikine, pad'e
          const rank = list.length - 1 - i;
          const laneY = sy * (8 + rank * LANE);
          const start: Pt = [dx * (ROOT_W / 2), laneY];
          const vx = dx * (cursor - 12);
          rootPins.push({ p: start, d: [dx, 0] });
          world.traces.push({ from: ROOT, to: b.rid, pts: chamfered([start, [vx, laneY], [vx, e[1]], e]) });
          cursor += b.U + BLOCK_GAP;
        });
      }
    }
    // Kuzey ve güney: bandın dışından başlayan dikey caddeler
    for (const a of ["N", "S"] as const) {
      const dy = a === "N" ? -1 : 1;
      const band = bandH[a === "N" ? 0 : 1] + 30;
      for (const s of [0, 1]) {
        const sx = s === 0 ? -1 : 1;
        const list = arms[a][s];
        const ox = sx * (14 + list.length * LANE + 10);
        let cursor = Math.max(band, ROOT_H / 2 + 30);
        list.forEach((b, i) => {
          const e = put(b, ox, dy * cursor, sx, dy);
          const rank = list.length - 1 - i;
          const laneX = sx * (8 + rank * LANE);
          const start: Pt = [laneX, (dy * ROOT_H) / 2];
          rootPins.push({ p: start, d: [0, dy] });
          world.traces.push({ from: ROOT, to: b.rid, pts: chamfered([start, [laneX, e[1]], e]) });
          cursor += b.V + BLOCK_GAP;
        });
      }
    }
  }

  const cards = new Map<string, CityCard>();
  for (const c of world.cards)
    cards.set(c.id, {
      id: c.id,
      cx: c.c[0],
      cy: c.c[1],
      w: 2 * c.hu,
      h: 2 * c.hv,
      sx: c.fwd[0] !== 0 ? Math.sign(c.fwd[0]) : 1,
      kids: c.kids,
      pins: c.pins,
      pad: c.pad,
    });
  if (withRoot) cards.set(ROOT, { id: ROOT, cx: 0, cy: 0, w: ROOT_W, h: ROOT_H, sx: 1, kids: roots, pins: rootPins, pad: null });
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const c of cards.values()) {
    x0 = Math.min(x0, c.cx - c.w / 2 - 20);
    x1 = Math.max(x1, c.cx + c.w / 2 + 20);
    y0 = Math.min(y0, c.cy - c.h / 2 - 20);
    y1 = Math.max(y1, c.cy + c.h / 2 + 20);
  }
  if (!cards.size) x0 = y0 = x1 = y1 = 0;
  return { cards, traces: world.traces, bounds: { x0, y0, x1, y1 } };
}
