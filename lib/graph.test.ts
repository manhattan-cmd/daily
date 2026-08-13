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

  it("kategoriler gövdenin dışında, dalın kendisi merkezden uzakta", () => {
    // Kuvvet dengesinde çocuk anasının ÇEVRESİNE yerleşiyor, illa dışına
    // değil — bir kılcal anasından biraz içeride kalabilir. Kuralın kendisi
    // "derinleştikçe uzaklaş" değil, "çocuk anasının dibinde" (aşağıdaki
    // hat testi). Merkezden uzaklık yalnız kategoriler için garanti.
    const l = graphLayout(SAMPLE);
    const dist = (id: string) => {
      const n = l.byId.get(id)!;
      return Math.hypot(n.x - l.center.x, n.y - l.center.y);
    };
    for (const id of ["spor", "hobi", "egitim"])
      expect(dist(id)).toBeGreaterThan(l.coreR + l.byId.get(id)!.r);
    // Dalın altı, dalın kendisinden daha derinde: ortalama uzaklık artıyor
    const avg = (ids: string[]) =>
      ids.reduce((s, i) => s + dist(i), 0) / ids.length;
    expect(avg(["sabah", "parkur"])).toBeGreaterThan(dist("spor"));
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

describe("derli toplu — harita pencereye sığmak için küçültülmemeli", () => {
  /**
   * Bir ara yerleşim ışınsal halkaydı: en dıştaki halka bütün yaprakların
   * sığacağı çevreye kadar büyüdüğü için harita 600px'i aşıyor, telefon
   * penceresine sığdırılırken yarı yarıya küçülüyor ve hiçbir şey
   * okunmuyordu. Burası o hatanın nöbetçisi: gerçekçi ağaçlar telefon
   * genişliğine yakın bir kutuda durmalı.
   */
  it("otuz düğümlük gerçekçi ağaç dar bir kutuya sığıyor", () => {
    const big = root(
      cat(
        "harcama",
        sub("market"),
        sub("yemek", sub("kafe"), sub("restoran"), sub("paket")),
        sub("ulasim", sub("yakit"), sub("toplu")),
        sub("fatura", sub("elektrik"), sub("su"), sub("internet")),
        sub("kira")
      ),
      cat("spor", sub("yuruyus"), sub("kosu"), sub("bisiklet"), sub("salon", sub("agirlik"))),
      cat("egitim", sub("okuma"), sub("kurs"), sub("pratik")),
      cat("saglik", sub("uyku"), sub("su2"), sub("ilac"))
    );
    const l = graphLayout(big);
    expect(l.nodes.length).toBe(28);
    expect(l.width).toBeLessThan(520);
    expect(l.height).toBeLessThan(520);
  });

  it("hat kısa: her çocuk anasının dibinde durur", () => {
    const l = graphLayout(SAMPLE);
    for (const n of l.nodes) {
      const p =
        n.parentId === "root" ? l.center : l.byId.get(n.parentId)!;
      const d = Math.hypot(n.x - p.x, n.y - p.y);
      const pr = n.parentId === "root" ? l.coreR : l.byId.get(n.parentId)!.r;
      expect(d).toBeLessThan(pr + n.r + 90);
    }
  });
});

describe("kümeleme — akrabalık ölçekli itiş", () => {
  /** Bir düğümün bağlı olduğu kategori (birinci kademe ata) */
  const branchMap = (t: GraphSeed) => {
    const m = new Map<string, string>();
    const walk = (s: GraphSeed, depth: number, branch: string) => {
      m.set(s.id, branch);
      for (const k of s.children ?? [])
        walk(k, depth + 1, depth === 0 ? k.id : branch);
    };
    walk(t, 0, "");
    return m;
  };

  it("her kalemin en yakın komşusu kendi kategorisinden", () => {
    // Haritanın asıl vaadi bu: kategoriler ayrı kümeler hâlinde duruyor.
    // Bir ara dallar birbirinin içinden geçiyordu ve harita yumak gibiydi.
    const l = graphLayout(SAMPLE);
    const branch = branchMap(SAMPLE);
    for (const a of l.nodes) {
      let best = Infinity;
      let bestId = "";
      for (const b of l.nodes) {
        if (a.id === b.id) continue;
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < best) {
          best = d;
          bestId = b.id;
        }
      }
      expect(branch.get(bestId)).toBe(branch.get(a.id));
    }
  });

  it("yabancı kategoriler kendi içindekilerden çok daha uzak", () => {
    const l = graphLayout(SAMPLE);
    const branch = branchMap(SAMPLE);
    let same = 0;
    let sameN = 0;
    let cross = 0;
    let crossN = 0;
    for (let i = 0; i < l.nodes.length; i++)
      for (let j = i + 1; j < l.nodes.length; j++) {
        const a = l.nodes[i];
        const b = l.nodes[j];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (branch.get(a.id) === branch.get(b.id)) {
          same += d;
          sameN++;
        } else {
          cross += d;
          crossN++;
        }
      }
    expect(cross / crossN).toBeGreaterThan((same / sameN) * 2);
  });
});
