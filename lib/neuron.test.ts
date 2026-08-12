import { describe, expect, it } from "vitest";
import { coreRadius, neuronLayout } from "./neuron";

const BASE = 20;

describe("coreRadius — çekirdek çocuk sayısıyla büyür", () => {
  it("çocuksuz kalem taban boyunda", () => {
    expect(coreRadius(0, BASE)).toBe(BASE);
  });

  it("dallandıkça büyür ama doğrusal değil (karekök)", () => {
    const r1 = coreRadius(1, BASE);
    const r4 = coreRadius(4, BASE);
    const r16 = coreRadius(16, BASE);
    expect(r1).toBeGreaterThan(BASE);
    expect(r4).toBeGreaterThan(r1);
    expect(r16).toBeGreaterThan(r4);
    // 16 çocuklu, 4 çocuklunun iki katı kadar BÜYÜMEZ — kalabalık kalem
    // ekranı yutmasın diye artış sönümlü
    expect(r16 - BASE).toBeLessThan(2 * (r4 - BASE) + 1e-9);
  });
});

describe("neuronLayout", () => {
  it("çocuksuz gövde yalnız kendini kaplar", () => {
    const l = neuronLayout([], BASE);
    expect(l.nodes).toHaveLength(0);
    expect(l.width).toBeGreaterThan(0);
    expect(l.height).toBeGreaterThan(0);
  });

  it("her çocuk için bir çekirdek ve bir dendrit üretir", () => {
    const l = neuronLayout([0, 2, 5], BASE);
    expect(l.nodes).toHaveLength(3);
    for (const n of l.nodes) {
      expect(n.path.startsWith("M ")).toBe(true);
      expect(n.path).toContain("Q");
      expect(n.r).toBeGreaterThan(0);
    }
  });

  it("çok çocuklu kalemin çekirdeği daha büyük", () => {
    const l = neuronLayout([0, 6], BASE);
    expect(l.nodes[1].r).toBeGreaterThan(l.nodes[0].r);
  });

  it("gövde sayfadaki en büyük disk", () => {
    for (const counts of [[0], [0, 6], [4, 9, 0, 2], [1, 1, 1, 1, 1, 1, 1]]) {
      const l = neuronLayout(counts, BASE);
      for (const n of l.nodes) expect(l.coreR).toBeGreaterThan(n.r);
    }
  });

  it("çekirdekler birbirine girmez", () => {
    for (const counts of [
      [0, 0],
      [0, 0, 0],
      [3, 0, 1, 7, 2],
      [2, 2, 2, 2],
      [0, 3, 0, 3, 0, 3],
      Array(8).fill(2),
      Array(9).fill(1),
      Array(12).fill(0),
    ]) {
      const l = neuronLayout(counts, BASE);
      for (let i = 0; i < l.nodes.length; i++) {
        for (let j = i + 1; j < l.nodes.length; j++) {
          const a = l.nodes[i];
          const b = l.nodes[j];
          const gap = Math.hypot(a.x - b.x, a.y - b.y) - a.r - b.r;
          expect(gap).toBeGreaterThan(-0.5);
        }
      }
    }
  });

  it("her şey kutunun içinde kalır", () => {
    const l = neuronLayout([4, 0, 2, 9], BASE);
    for (const n of l.nodes) {
      expect(n.x - n.r).toBeGreaterThanOrEqual(0);
      expect(n.y - n.r).toBeGreaterThanOrEqual(0);
      expect(n.x + n.r).toBeLessThanOrEqual(l.width);
      expect(n.y + n.r).toBeLessThanOrEqual(l.height);
    }
    expect(l.center.x - l.coreR).toBeGreaterThanOrEqual(0);
    expect(l.center.y - l.coreR).toBeGreaterThanOrEqual(0);
  });

  it("aynı girdi aynı yerleşimi verir — harita dolaşırken oynamaz", () => {
    const a = neuronLayout([2, 0, 5, 1], BASE);
    const b = neuronLayout([2, 0, 5, 1], BASE);
    expect(a).toEqual(b);
  });
});
