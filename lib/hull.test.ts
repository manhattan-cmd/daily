import { describe, expect, it } from "vitest";
import {
  boundsOf,
  clipToWedge,
  convexHull,
  discHull,
  smoothClosedPath,
  type HullPoint,
} from "./hull";

/** Nokta çokgenin içinde mi (dışbükey, saat yönünün tersine sıralı) */
function inside(poly: HullPoint[], p: HullPoint, tol = 1e-6): boolean {
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    if (cross < -tol) return false;
  }
  return true;
}

describe("convexHull", () => {
  it("kareye kapanır, içteki nokta düşer", () => {
    const h = convexHull([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
      { x: 5, y: 5 },
    ]);
    expect(h).toHaveLength(4);
    expect(h.some((p) => p.x === 5 && p.y === 5)).toBe(false);
  });

  it("üçten az noktada olduğu gibi döner", () => {
    expect(convexHull([{ x: 1, y: 2 }])).toHaveLength(1);
    expect(convexHull([])).toHaveLength(0);
  });
});

describe("discHull", () => {
  it("her diski içine alır — merkezlerin kabuğu yetmiyordu", () => {
    const discs = [
      { x: 0, y: 0, r: 20 },
      { x: 100, y: 0, r: 8 },
      { x: 50, y: 80, r: 14 },
    ];
    const hull = discHull(discs, 0, 24);
    for (const d of discs)
      // Diskin çeperindeki noktalar da sınırın içinde kalmalı
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        const p = { x: d.x + Math.cos(a) * d.r, y: d.y + Math.sin(a) * d.r };
        expect(inside(hull, p, 0.5)).toBe(true);
      }
  });

  it("pay kadar dışarı açılır", () => {
    const a = boundsOf(discHull([{ x: 0, y: 0, r: 10 }], 0));
    const b = boundsOf(discHull([{ x: 0, y: 0, r: 10 }], 12));
    expect(b.x1 - b.x0).toBeGreaterThan(a.x1 - a.x0 + 20);
  });
});

describe("clipToWedge", () => {
  const origin = { x: 0, y: 0 };
  const square = [
    { x: 10, y: -50 },
    { x: 90, y: -50 },
    { x: 90, y: 50 },
    { x: 10, y: 50 },
  ];

  it("dilimin dışında kalan kısmı keser", () => {
    const clipped = clipToWedge(square, origin, -0.2, 0.2);
    expect(clipped.length).toBeGreaterThanOrEqual(3);
    // Kalan her nokta dilimin içinde
    for (const p of clipped) {
      const a = Math.atan2(p.y, p.x);
      expect(a).toBeGreaterThanOrEqual(-0.2 - 1e-6);
      expect(a).toBeLessThanOrEqual(0.2 + 1e-6);
    }
  });

  it("yarım turdan geniş dilimde kırpmıyor — iki yarı düzlem dilimi vermez", () => {
    expect(clipToWedge(square, origin, -2, 2)).toEqual(square);
  });

  it("komşu dilimler kesişmez", () => {
    const a = clipToWedge(square, origin, -0.6, 0);
    const b = clipToWedge(square, origin, 0, 0.6);
    // İki bölgenin ortak iç noktası yok
    for (const p of a) expect(inside(b, p, -1e-3)).toBe(false);
  });
});

describe("smoothClosedPath", () => {
  it("kapalı yol üretir", () => {
    const d = smoothClosedPath([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ]);
    expect(d.startsWith("M ")).toBe(true);
    expect(d.endsWith("Z")).toBe(true);
    expect(d).toContain("Q");
  });

  it("boş kabukta boş yol", () => {
    expect(smoothClosedPath([])).toBe("");
  });
});
