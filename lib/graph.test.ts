import { describe, expect, it } from "vitest";
import { graphLayout, nodeRadius, type GraphSeed } from "./graph";

/** kısa yazım: sub("a", sub("b"), mod("m")) */
const sub = (id: string, ...children: GraphSeed[]): GraphSeed => ({
  id,
  kind: "sub",
  children,
});
const cat = (id: string, ...children: GraphSeed[]): GraphSeed => ({
  id,
  kind: "cat",
  children,
});
const mod = (id: string): GraphSeed => ({ id, kind: "mod" });
const root = (...children: GraphSeed[]): GraphSeed => ({
  id: "root",
  kind: "root",
  children,
});

/** Örnek ağaç: kalabalık bir kategori, tek çocuklu bir kategori, kılcallar */
const SAMPLE = root(
  cat(
    "spor",
    sub("kosu", sub("sabah"), sub("parkur"), mod("kosu:sure"), mod("kosu:km")),
    sub("yuzme", mod("yuzme:sure")),
    sub("fitness"),
    sub("yuruyus")
  ),
  cat("hobi", sub("gitar")),
  cat("egitim", sub("kitap", mod("kitap:sayfa")), sub("ders"))
);

const flat = (s: GraphSeed): GraphSeed[] => [
  s,
  ...(s.children ?? []).flatMap(flat),
];

describe("nodeRadius", () => {
  it("boy sırası: kök > kategori > alt kategori > özellik", () => {
    expect(nodeRadius("root", 0)).toBeGreaterThan(nodeRadius("cat", 0));
    expect(nodeRadius("cat", 0)).toBeGreaterThan(nodeRadius("sub", 0));
    expect(nodeRadius("sub", 0)).toBeGreaterThan(nodeRadius("mod", 0));
  });

  it("çocuk sayısıyla büyür ama hiyerarşi sırası bozulmaz", () => {
    expect(nodeRadius("cat", 4)).toBeGreaterThan(nodeRadius("cat", 1));
    expect(nodeRadius("sub", 4)).toBeGreaterThan(nodeRadius("sub", 1));
    // Kalabalık bir alt kategori bile kategorisinden iri görünmemeli
    for (const c of [0, 1, 4, 9, 40])
      expect(nodeRadius("sub", c)).toBeLessThan(nodeRadius("cat", c));
    expect(nodeRadius("sub", 999)).toBeLessThan(nodeRadius("cat", 999));
  });
});

describe("graphLayout", () => {
  it("çocuksuz kök yalnız kendini kaplar", () => {
    const l = graphLayout(root());
    expect(l.nodes).toHaveLength(0);
    expect(l.edges).toHaveLength(0);
    expect(l.width).toBeGreaterThan(l.coreR * 2);
  });

  it("kök hariç her düğüm ve her kenar yerleşir", () => {
    const l = graphLayout(SAMPLE);
    const n = flat(SAMPLE).length - 1;
    expect(l.nodes).toHaveLength(n);
    expect(l.edges).toHaveLength(n);
    for (const e of l.edges) {
      expect(e.path.startsWith("M ")).toBe(true);
      expect(e.path).toContain("Q");
    }
  });

  it("derinlik arttıkça merkezden uzaklaşır", () => {
    const l = graphLayout(SAMPLE);
    const dist = (id: string) => {
      const n = l.byId.get(id)!;
      return Math.hypot(n.x - l.center.x, n.y - l.center.y);
    };
    expect(dist("kosu")).toBeGreaterThan(dist("spor"));
    expect(dist("sabah")).toBeGreaterThan(dist("kosu"));
    expect(dist("kosu:sure")).toBeGreaterThan(dist("kosu"));
  });

  it("kalabalık dal daha geniş yelpaze açar", () => {
    const l = graphLayout(SAMPLE);
    const spread = (ids: string[]) => {
      const as = ids.map((i) => l.byId.get(i)!.angle);
      return Math.max(...as) - Math.min(...as);
    };
    // Spor'un dört alt kalemi ile Eğitim'in ikisi
    expect(spread(["kosu", "yuzme", "fitness", "yuruyus"])).toBeGreaterThan(
      spread(["kitap", "ders"])
    );
  });

  it("hiçbir disk bir diğerine girmez", () => {
    const trees = [
      SAMPLE,
      root(cat("a"), cat("b")),
      root(...Array.from({ length: 9 }, (_, i) => cat("c" + i, sub("s" + i)))),
      root(
        cat(
          "tek",
          sub("z", sub("zz", sub("zzz", mod("m1"), mod("m2"), mod("m3"))))
        )
      ),
      root(
        ...Array.from({ length: 4 }, (_, i) =>
          cat(
            "k" + i,
            ...Array.from({ length: 6 }, (_, j) => sub(`k${i}s${j}`, mod(`k${i}m${j}`)))
          )
        )
      ),
    ];
    for (const t of trees) {
      const l = graphLayout(t);
      const discs = [
        { x: l.center.x, y: l.center.y, r: l.coreR },
        ...l.nodes,
      ];
      for (let i = 0; i < discs.length; i++)
        for (let j = i + 1; j < discs.length; j++) {
          const a = discs[i];
          const b = discs[j];
          const gap = Math.hypot(a.x - b.x, a.y - b.y) - a.r - b.r;
          expect(gap).toBeGreaterThan(-0.5);
        }
    }
  });

  it("her şey kutunun içinde kalır", () => {
    const l = graphLayout(SAMPLE);
    for (const n of l.nodes) {
      expect(n.x - n.r).toBeGreaterThanOrEqual(0);
      expect(n.y - n.r).toBeGreaterThanOrEqual(0);
      expect(n.x + n.r).toBeLessThanOrEqual(l.width);
      expect(n.y + n.r).toBeLessThanOrEqual(l.height);
    }
  });

  it("kutu içeriğe oturur — bir yana yığılan ağaç boşluk bırakmaz", () => {
    // Tek dallı ağaç: tüm içerik yukarı doğru gider, kutu da öyle olmalı
    const l = graphLayout(root(cat("tek", sub("a", sub("b")))));
    const discs = [{ x: l.center.x, y: l.center.y, r: l.coreR }, ...l.nodes];
    const left = Math.min(...discs.map((d) => d.x - d.r));
    const right = Math.max(...discs.map((d) => d.x + d.r));
    const top = Math.min(...discs.map((d) => d.y - d.r));
    const bottom = Math.max(...discs.map((d) => d.y + d.r));
    // Her kenarda yalnız etiket payı kadar boşluk kalır
    expect(left).toBeCloseTo(l.width - right, 5);
    expect(top).toBeCloseTo(l.height - bottom, 5);
    expect(left).toBeLessThan(70);
    expect(top).toBeLessThan(40);
  });

  it("aynı ağaç aynı yerleşimi verir — harita dolaşırken oynamaz", () => {
    expect(graphLayout(SAMPLE)).toEqual(graphLayout(SAMPLE));
  });
});
