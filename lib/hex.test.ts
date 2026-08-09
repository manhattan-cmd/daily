import { describe, expect, it } from "vitest";
import { axialToPixel, hexBounds, hexRings, hexSpiral } from "./hex";

const key = (a: { q: number; r: number }) => `${a.q},${a.r}`;

describe("hexSpiral", () => {
  it("merkezden başlar", () => {
    expect(hexSpiral(1)).toEqual([{ q: 0, r: 0 }]);
  });

  it("ilk halka tam altı hücre", () => {
    const cells = hexSpiral(7);
    expect(cells).toHaveLength(7);
    expect(new Set(cells.map(key)).size).toBe(7);
  });

  it("hücreler asla üst üste binmez", () => {
    for (const n of [2, 5, 11, 19, 37, 61]) {
      const cells = hexSpiral(n);
      expect(cells).toHaveLength(n);
      expect(new Set(cells.map(key)).size).toBe(n);
    }
  });

  it("bir halkayı bitirmeden dışarı çıkmaz", () => {
    // 11 hücre: merkez + 6'lık halka tam + 4'ü ikinci halkada
    const dist = (a: { q: number; r: number }) =>
      (Math.abs(a.q) + Math.abs(a.q + a.r) + Math.abs(a.r)) / 2;
    const cells = hexSpiral(11);
    const byRing = cells.map(dist);
    expect(byRing.filter((d) => d === 0)).toHaveLength(1);
    expect(byRing.filter((d) => d === 1)).toHaveLength(6);
    expect(byRing.filter((d) => d === 2)).toHaveLength(4);
  });

  it("boş girdide boş döner", () => {
    expect(hexSpiral(0)).toEqual([]);
    expect(hexSpiral(-3)).toEqual([]);
  });
});

describe("hexRings", () => {
  it("halka sayısını doğru sayar", () => {
    expect(hexRings(1)).toBe(0);
    expect(hexRings(7)).toBe(1);
    expect(hexRings(8)).toBe(2);
    expect(hexRings(19)).toBe(2);
    expect(hexRings(20)).toBe(3);
  });
});

describe("axialToPixel", () => {
  it("merkez sıfırda", () => {
    expect(axialToPixel({ q: 0, r: 0 }, 30)).toEqual({ x: 0, y: 0 });
  });

  it("komşular bir altıgen aralığı uzakta", () => {
    const size = 30;
    const a = axialToPixel({ q: 0, r: 0 }, size);
    const b = axialToPixel({ q: 1, r: 0 }, size);
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    // Sivri tepeli altıgende komşu merkezleri arası √3·size
    expect(d).toBeCloseTo(Math.sqrt(3) * size, 5);
  });
});

describe("hexBounds", () => {
  it("tek hücre bir altıgen kadar yer kaplar", () => {
    const b = hexBounds(1, 30);
    expect(b.width).toBeCloseTo(69, 0);
    expect(b.height).toBeCloseTo(69, 0);
  });

  it("hücre sayısı arttıkça kutu büyür", () => {
    const small = hexBounds(7, 30);
    const big = hexBounds(19, 30);
    expect(big.width).toBeGreaterThan(small.width);
    expect(big.height).toBeGreaterThan(small.height);
  });

  it("ofset uygulanınca tüm hücreler kutunun içinde kalır", () => {
    const size = 28;
    const n = 14;
    const b = hexBounds(n, size);
    for (const cell of hexSpiral(n)) {
      const p = axialToPixel(cell, size);
      expect(p.x + b.offsetX).toBeGreaterThanOrEqual(0);
      expect(p.y + b.offsetY).toBeGreaterThanOrEqual(0);
      expect(p.x + b.offsetX).toBeLessThanOrEqual(b.width);
      expect(p.y + b.offsetY).toBeLessThanOrEqual(b.height);
    }
  });
});
