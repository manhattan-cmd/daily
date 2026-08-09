import { describe, expect, it } from "vitest";
import { hexLayout, hexSlots } from "./hex";

/** Yönü okunur bir etikete çevir (ekran koordinatı: y aşağı) */
function label(p: { x: number; y: number }): string {
  const e = 1e-6;
  const v = Math.abs(p.x) < e ? "" : p.x > 0 ? "sağ" : "sol";
  const h = Math.abs(p.y) < e ? "" : p.y > 0 ? "alt" : "üst";
  return [h, v].filter(Boolean).join("-") || "merkez";
}
const labels = (n: number) => hexSlots(n).map(label).sort();

describe("hexSlots — kullanıcının tarif ettiği düzen", () => {
  it("1 çocuk tam alta", () => {
    expect(labels(1)).toEqual(["alt"]);
  });

  it("2 çocuk alt sağ ve alt sola", () => {
    expect(labels(2)).toEqual(["alt-sağ", "alt-sol"]);
  });

  it("3 çocuk alt sağ, alt sol ve üste", () => {
    expect(labels(3)).toEqual(["alt-sağ", "alt-sol", "üst"]);
  });

  it("4 çocuk kelebek — iki alt iki üst, tam alt/üst boş", () => {
    expect(labels(4)).toEqual(["alt-sağ", "alt-sol", "üst-sağ", "üst-sol"]);
  });

  it("5 çocuk kelebek + tam alt", () => {
    expect(labels(5)).toEqual(["alt", "alt-sağ", "alt-sol", "üst-sağ", "üst-sol"]);
  });

  it("6 çocuk altı kenarın hepsi", () => {
    expect(labels(6)).toEqual([
      "alt",
      "alt-sağ",
      "alt-sol",
      "üst",
      "üst-sağ",
      "üst-sol",
    ]);
  });

  it("7. çocuk aşağıdaki boşluğa girer", () => {
    const slots = hexSlots(7);
    expect(slots).toHaveLength(7);
    const seventh = slots[6];
    // Tam altta ve ilk halkadan daha uzakta
    expect(Math.abs(seventh.x)).toBeLessThan(1e-6);
    expect(seventh.y).toBeCloseTo(2 * Math.sqrt(3), 5);
  });
});

describe("hexSlots — geometri", () => {
  it("boş girdide boş döner", () => {
    expect(hexSlots(0)).toEqual([]);
    expect(hexSlots(-2)).toEqual([]);
  });

  it("her yuva merkeze eşit uzaklıkta (ilk halka)", () => {
    for (let n = 1; n <= 6; n++) {
      for (const p of hexSlots(n)) {
        expect(Math.hypot(p.x, p.y)).toBeCloseTo(Math.sqrt(3), 5);
      }
    }
  });

  it("yuvalar üst üste binmez", () => {
    for (let n = 1; n <= 18; n++) {
      const keys = hexSlots(n).map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`);
      expect(new Set(keys).size).toBe(n);
    }
  });

  it("düzen sola-sağa simetrik", () => {
    for (const n of [2, 4, 6]) {
      const sumX = hexSlots(n).reduce((a, p) => a + p.x, 0);
      expect(sumX).toBeCloseTo(0, 6);
    }
  });
});

describe("hexLayout", () => {
  it("merkez ve yuvalar kutunun içinde kalır", () => {
    for (const n of [1, 3, 6, 9, 14]) {
      const l = hexLayout(n, 40);
      expect(l.center.x).toBeGreaterThanOrEqual(0);
      expect(l.center.y).toBeGreaterThanOrEqual(0);
      for (const p of l.nodes) {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(l.width);
        expect(p.y).toBeLessThanOrEqual(l.height);
      }
    }
  });

  it("çocuk yoksa tek altıgenlik kutu", () => {
    const l = hexLayout(0, 40);
    expect(l.nodes).toEqual([]);
    expect(l.width).toBeCloseTo(84, 0);
    expect(l.height).toBeCloseTo(72.7, 0);
  });

  it("çocuk arttıkça kutu büyür", () => {
    expect(hexLayout(9, 40).height).toBeGreaterThan(hexLayout(3, 40).height);
  });
});
