import { describe, expect, it } from "vitest";
import { hexMapLayout, type HexSeed } from "./hexmap";

const SIZE = 40;

const n = (id: string, ...children: HexSeed[]): HexSeed => ({ id, children });

/** Kök: 4 kategori; biri kalabalık ve iki kademe derin */
const BOARD = n(
  "root",
  n(
    "harcamalar",
    n("market", n("manav"), n("kasap")),
    n("fatura"),
    n("ulasim"),
    n("kira")
  ),
  n("hobiler", n("gitar"), n("kitap")),
  n("beslenme", n("kahvalti"), n("ogle"), n("aksam")),
  n("spor")
);

const flat = (s: HexSeed): HexSeed[] => [s, ...(s.children ?? []).flatMap(flat)];

/** Eksenel komşuluk */
const adjacent = (
  a: { q: number; r: number },
  b: { q: number; r: number }
) => {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2 === 1;
};

describe("hexMapLayout", () => {
  const m = hexMapLayout(BOARD, SIZE);

  it("her kalem tam bir hücre alıyor, hücre paylaşılmıyor", () => {
    expect(m.cells).toHaveLength(flat(BOARD).length);
    const seen = new Set(m.cells.map((c) => `${c.q},${c.r}`));
    expect(seen.size).toBe(m.cells.length);
    for (const s of flat(BOARD)) expect(m.byId.has(s.id)).toBe(true);
  });

  it("kök merkezde", () => {
    const c = m.byId.get("root")!;
    expect(c.q).toBe(0);
    expect(c.r).toBe(0);
    expect(c.x).toBeCloseTo(m.center.x, 5);
    expect(c.y).toBeCloseTo(m.center.y, 5);
  });

  it("başkent ülkesinin ORTASINDA — üst kalem hep altlarının merkezinde", () => {
    const cost = (c: { q: number; r: number }, own: typeof m.cells) =>
      own.reduce(
        (s, o) =>
          s +
          (Math.abs(c.q - o.q) +
            Math.abs(c.r - o.r) +
            Math.abs(c.q - o.q + c.r - o.r)) /
            2,
        0
      );
    for (const t of new Set(m.cells.map((c) => c.territory).filter(Boolean))) {
      const own = m.cells.filter((c) => c.territory === t);
      const cap = m.byId.get(t)!;
      // Başkentin kendi hücrelerine toplam uzaklığı en küçük olan hücre
      expect(cost(cap, own)).toBe(Math.min(...own.map((c) => cost(c, own))));
    }
  });

  it("tahta deliksiz — bir hücre doluysa daha içteki her hücre de dolu", () => {
    const occ = new Set(m.cells.map((c) => `${c.q},${c.r}`));
    const hd = (q: number, r: number) =>
      (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2;
    const maxRing = Math.max(...m.cells.map((c) => hd(c.q, c.r)));
    for (let ring = 0; ring < maxRing; ring++)
      for (let q = -ring; q <= ring; q++)
        for (let r = Math.max(-ring, -q - ring); r <= Math.min(ring, -q + ring); r++)
          if (hd(q, r) === ring) expect(occ.has(`${q},${r}`)).toBe(true);
  });

  it("kıta tek parça — her hücre bir diğerine bitişik", () => {
    const seen = new Set([m.cells[0]]);
    const queue = [m.cells[0]];
    while (queue.length) {
      const cur = queue.shift()!;
      for (const o of m.cells)
        if (!seen.has(o) && adjacent(cur, o)) {
          seen.add(o);
          queue.push(o);
        }
    }
    expect(seen.size).toBe(m.cells.length);
  });

  it("ülke kendi alt ağacı kadar hücre alıyor", () => {
    const count = (t: string) =>
      m.cells.filter((c) => c.territory === t).length;
    expect(count("harcamalar")).toBe(flat(BOARD.children![0]).length);
    expect(count("hobiler")).toBe(3);
    expect(count("spor")).toBe(1);
    // Merkez kimsenin toprağı değil
    expect(count("")).toBe(1);
  });

  it("her ülke tek parça", () => {
    for (const t of new Set(m.cells.map((c) => c.territory))) {
      const own = m.cells.filter((c) => c.territory === t);
      const seen = new Set([own[0]]);
      const queue = [own[0]];
      while (queue.length) {
        const cur = queue.shift()!;
        for (const o of own)
          if (!seen.has(o) && adjacent(cur, o)) {
            seen.add(o);
            queue.push(o);
          }
      }
      expect(seen.size).toBe(own.length);
    }
  });

  it("yer varken çocuk anasının komşusuna oturuyor", () => {
    // Altıgenin altı komşusu var; kalabalık bir ana hepsini dolduramaz.
    // Kural şu: çocuk ya anasına bitişik, ya da ananın ülke içindeki bütün
    // komşuları çoktan doludur.
    const taken = new Set(m.cells.map((c) => `${c.q},${c.r}`));
    const inTerritory = (q: number, r: number, t: string) =>
      m.cells.some((c) => c.q === q && c.r === r && c.territory === t);
    const walk = (s: HexSeed) => {
      const p = m.byId.get(s.id)!;
      for (const ch of s.children ?? []) {
        const c = m.byId.get(ch.id)!;
        if (!adjacent(p, c)) {
          const free = [
            [1, 0],
            [0, 1],
            [-1, 1],
            [-1, 0],
            [0, -1],
            [1, -1],
          ].filter(
            ([dq, dr]) =>
              inTerritory(p.q + dq, p.r + dr, c.territory) &&
              !taken.has(`${p.q + dq},${p.r + dr}`)
          );
          expect(free).toHaveLength(0);
        }
        walk(ch);
      }
    };
    walk(BOARD);
    // Aile birlikte: torunlar analarının dibinde
    expect(adjacent(m.byId.get("market")!, m.byId.get("manav")!)).toBe(true);
    expect(adjacent(m.byId.get("market")!, m.byId.get("kasap")!)).toBe(true);
  });

  it("her ülkenin kalın bir sınırı var; tek hücrelik ülkede altı kenar", () => {
    const spor = m.borders.find((b) => b.territory === "spor")!;
    expect(spor.path.match(/M /g)).toHaveLength(6);
    for (const b of m.borders) expect(b.path.length).toBeGreaterThan(0);
  });

  it("her şey kutunun içinde", () => {
    for (const c of m.cells) {
      expect(c.x - SIZE).toBeGreaterThanOrEqual(-0.01);
      expect(c.y - SIZE).toBeGreaterThanOrEqual(-SIZE);
      expect(c.x + SIZE).toBeLessThanOrEqual(m.width + 0.01);
      expect(c.y + SIZE).toBeLessThanOrEqual(m.height + SIZE);
    }
  });

  it("altıdan fazla kategori de yerleşiyor", () => {
    const many = n("root", ...Array.from({ length: 11 }, (_, i) => n("k" + i)));
    const l = hexMapLayout(many, SIZE);
    expect(l.cells).toHaveLength(12);
    expect(new Set(l.cells.map((c) => `${c.q},${c.r}`)).size).toBe(12);
  });

  /**
   * Kalabalık tahtalar. Bir kez şu hatayla çıktık: altıdan çok kategoride
   * başkentlerin bir kısmı iç bir kısmı dış halkaya düşüyor, içerideki ülke
   * kuşatılıp büyüyemiyor, yerleşim boş dönüyor ve ekran çöküyordu
   * ("this page couldn't load"). Artık başkentler hepsinin sığdığı tek
   * halkaya diziliyor; burası o hatanın nöbetçisi.
   */
  it.each([
    ["on kategori, her biri iki alt kalem", 10, 2],
    ["yedi kategori, birer alt kalem", 7, 1],
    ["on dört kategori, çocuksuz", 14, 0],
    ["yirmi kategori, üçer alt kalem", 20, 3],
  ])("kalabalık tahta yerleşiyor: %s", (_label, cats, subs) => {
    const tree = n(
      "root",
      ...Array.from({ length: cats }, (_, i) =>
        n("k" + i, ...Array.from({ length: subs }, (_, j) => n(`k${i}s${j}`)))
      )
    );
    const l = hexMapLayout(tree, SIZE);
    expect(l.cells).toHaveLength(flat(tree).length);
    expect(new Set(l.cells.map((c) => `${c.q},${c.r}`)).size).toBe(
      l.cells.length
    );
    // Kıta deliksiz
    const occ = new Set(l.cells.map((c) => `${c.q},${c.r}`));
    const hd = (q: number, r: number) =>
      (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2;
    const maxRing = Math.max(...l.cells.map((c) => hd(c.q, c.r)));
    for (let ring = 0; ring < maxRing; ring++)
      for (let q = -ring; q <= ring; q++)
        for (let r = Math.max(-ring, -q - ring); r <= Math.min(ring, -q + ring); r++)
          if (hd(q, r) === ring) expect(occ.has(`${q},${r}`)).toBe(true);
    // Her ülke tek parça kalıyor
    for (const t of new Set(l.cells.map((c) => c.territory))) {
      const own = l.cells.filter((c) => c.territory === t);
      const seen = new Set([own[0]]);
      const queue = [own[0]];
      while (queue.length) {
        const cur = queue.shift()!;
        for (const o of own)
          if (!seen.has(o) && adjacent(cur, o)) {
            seen.add(o);
            queue.push(o);
          }
      }
      expect(seen.size).toBe(own.length);
    }
  });

  it("yalnız kök: tek hücre", () => {
    const l = hexMapLayout(n("root"), SIZE);
    expect(l.cells).toHaveLength(1);
    expect(l.width).toBeGreaterThan(0);
  });

  it("aynı ağaç aynı haritayı veriyor", () => {
    expect(hexMapLayout(BOARD, SIZE).cells).toEqual(
      hexMapLayout(BOARD, SIZE).cells
    );
  });
});
