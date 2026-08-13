import { describe, expect, it } from "vitest";
import {
  graphLayout,
  labelBox,
  nodeRadius,
  type GraphSeed,
  type PlacedNode,
} from "./graph";

/** kısa yazım: cat("spor", sub("kosu", sub("sabah"))) */
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
const root = (...children: GraphSeed[]): GraphSeed => ({
  id: "root",
  kind: "root",
  children,
});

/** Örnek ağaç: kalabalık bir kategori, tek çocuklu bir kategori, iki kademe */
const SAMPLE = root(
  cat(
    "spor",
    sub("kosu", sub("sabah"), sub("parkur"), sub("kosu:sure"), sub("kosu:km")),
    sub("yuzme", sub("yuzme:sure")),
    sub("fitness"),
    sub("yuruyus")
  ),
  cat("hobi", sub("gitar")),
  cat("egitim", sub("kitap", sub("kitap:sayfa")), sub("ders"))
);

const flat = (s: GraphSeed): GraphSeed[] => [
  s,
  ...(s.children ?? []).flatMap(flat),
];

describe("nodeRadius", () => {
  it("boy sırası: kök > kategori > alt kategori", () => {
    expect(nodeRadius("root", 0)).toBeGreaterThan(nodeRadius("cat", 0));
    expect(nodeRadius("cat", 0)).toBeGreaterThan(nodeRadius("sub", 0));
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
          sub("z", sub("zz", sub("zzz", sub("m1"), sub("m2"), sub("m3"))))
        )
      ),
      root(
        ...Array.from({ length: 4 }, (_, i) =>
          cat(
            "k" + i,
            ...Array.from({ length: 6 }, (_, j) => sub(`k${i}s${j}`, sub(`k${i}m${j}`)))
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

  it("kutu içeriğe oturur — boşluğa kutu harcanmıyor", () => {
    // Kutu artık adlar yerleştikten SONRA onları da kapsayacak kadar
    // büyütülüyor; bu yüzden simetrik değil, ama her kenarda içeriğe değecek
    // kadar dar. Eskiden sabit bir kenar payı vardı: dar kalınca uzun adlar
    // kırpılıyor, geniş verilince harita boşuna küçülüyordu.
    for (const t of [root(cat("tek", sub("a", sub("b")))), SAMPLE]) {
      const l = graphLayout(t);
      const edges: number[][] = [
        [l.center.x - l.coreR, l.center.y - l.coreR, l.center.x + l.coreR, l.center.y + l.coreR],
        ...l.nodes.map((n) => [n.x - n.r, n.y - n.r, n.x + n.r, n.y + n.r]),
      ];
      const left = Math.min(...edges.map((e) => e[0]));
      const top = Math.min(...edges.map((e) => e[1]));
      const right = Math.max(...edges.map((e) => e[2]));
      const bottom = Math.max(...edges.map((e) => e[3]));
      expect(left).toBeGreaterThanOrEqual(0);
      expect(top).toBeGreaterThanOrEqual(0);
      expect(right).toBeLessThanOrEqual(l.width);
      expect(bottom).toBeLessThanOrEqual(l.height);
      // Diskler kutuya değmiyorsa aradaki fark yalnız adların payı kadardır
      expect(left).toBeLessThan(90);
      expect(top).toBeLessThan(60);
    }
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
    // Sınır 520'ydi; düğümler arası boşluk 9'dan 14'e çıkınca (harita fazla
    // sıkışık duruyordu) kutu da bir miktar büyüdü. Havayla alan arasındaki
    // pazarlık burada duruyor.
    expect(l.width).toBeLessThan(580);
    expect(l.height).toBeLessThan(580);
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

describe("adlar da yerleşimin parçası", () => {
  /** Çizim tarafındaki yerleşimin aynısı — kutunun ekrandaki yeri */
  const boxOf = (n: PlacedNode, text: string) => {
    const { w, h } = labelBox(n.kind, text);
    const g = 4 + n.labelGap;
    const d = n.r + g;
    const c = n.r * 0.71 + g;
    switch (n.label) {
      case "right":
        return { x0: n.x + d, y0: n.y - h / 2, x1: n.x + d + w, y1: n.y + h / 2 };
      case "left":
        return { x0: n.x - d - w, y0: n.y - h / 2, x1: n.x - d, y1: n.y + h / 2 };
      case "bottom":
        return { x0: n.x - w / 2, y0: n.y + d, x1: n.x + w / 2, y1: n.y + d + h };
      case "top":
        return { x0: n.x - w / 2, y0: n.y - d - h, x1: n.x + w / 2, y1: n.y - d };
      case "br":
        return { x0: n.x + c, y0: n.y + c, x1: n.x + c + w, y1: n.y + c + h };
      case "bl":
        return { x0: n.x - c - w, y0: n.y + c, x1: n.x - c, y1: n.y + c + h };
      case "tr":
        return { x0: n.x + c, y0: n.y - c - h, x1: n.x + c + w, y1: n.y - c };
      default:
        return { x0: n.x - c - w, y0: n.y - c - h, x1: n.x - c, y1: n.y - c };
    }
  };
  type Box = ReturnType<typeof boxOf>;
  const area = (a: Box, b: Box) =>
    Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) *
    Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));

  const named = (t: GraphSeed) => {
    const m = new Map<string, string>();
    const walk = (s: GraphSeed) => {
      m.set(s.id, s.label ?? "");
      (s.children ?? []).forEach(walk);
    };
    walk(t);
    return m;
  };

  /** Adları olan gerçekçi bir ağaç */
  const NAMED = root(
    cat(
      "c1",
      sub("s1", sub("s3"), sub("s4"), sub("s5")),
      sub("s6", sub("s7"), sub("s8")),
      sub("s9", sub("s10"), sub("s11")),
      sub("s13")
    ),
    cat("c2", sub("s14", sub("m1")), sub("s15", sub("m2")), sub("s16")),
    cat("c3", sub("s19"), sub("s20"), sub("s21")),
    cat("c4", sub("s22"), sub("s23"))
  );
  /** Ağaca gerçekçi uzunlukta adlar tak */
  const withNames = (t: GraphSeed, i = { n: 0 }): GraphSeed => {
    const words = [
      "Harcamalar",
      "Market",
      "Yemek",
      "Toplu taşıma",
      "Sabah koşusu",
      "Su",
      "Elektrik faturası",
      "Kitap",
    ];
    return {
      ...t,
      label: t.kind === "root" ? "" : words[i.n++ % words.length],
      children: (t.children ?? []).map((k) => withNames(k, i)),
    };
  };

  /**
   * Kalabalık bir kümede her adayın da bir şeye değdiği olabiliyor; o zaman
   * en az değen seçiliyor. Kalan temas bir köşe teması: 20px² ≈ 4x5px'lik
   * bir kesişme, gölgeli yazıda göze görünmüyor. Vaadimiz "hiç değmesin"
   * değil, "okumayı bozacak biçimde binmesin".
   */
  const TOL = 20;

  it("hiçbir ad başka bir adın ya da bir diskin üstüne binmiyor", () => {
    // Bir ara yazılar ve şekiller birbirine giriyordu: yerleşim yalnız
    // diskleri hesaba katıyor, ad diskin dışına körlemesine yazılıyordu.
    // Artık ad da kutusuyla hesaba katılıyor ve sekiz adaydan en az çakışanı
    // seçiliyor.
    // Adı olan ağaçlarla: kutunun eni ada bağlı olduğu için adsız bir ağaç
    // bu kuralı sınamıyor
    for (const tree of [withNames(SAMPLE), withNames(NAMED)]) {
      const l = graphLayout(tree);
      const names = named(tree);
      const boxes = l.nodes
        .filter((n) => n.labelled)
        .map((n) => ({ n, b: boxOf(n, names.get(n.id) ?? "") }));
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++)
          expect(area(boxes[i].b, boxes[j].b)).toBeLessThan(TOL);
        for (const d of [
          { x: l.center.x, y: l.center.y, r: l.coreR },
          ...l.nodes,
        ]) {
          if (d === boxes[i].n) continue;
          expect(
            area(boxes[i].b, {
              x0: d.x - d.r,
              y0: d.y - d.r,
              x1: d.x + d.r,
              y1: d.y + d.r,
            })
          ).toBeLessThan(TOL);
        }
      }
    }
  });
});

describe("yasa: sektör ve halka hapsi", () => {
  /** İki doğru parçası kesişiyor mu (uç paylaşımı sayılmaz) */
  const crosses = (
    a1: { x: number; y: number },
    a2: { x: number; y: number },
    b1: { x: number; y: number },
    b2: { x: number; y: number }
  ) => {
    const side = (
      p: { x: number; y: number },
      q: { x: number; y: number },
      r: { x: number; y: number }
    ) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
    const d1 = side(b1, b2, a1);
    const d2 = side(b1, b2, a2);
    const d3 = side(a1, a2, b1);
    const d4 = side(a1, a2, b2);
    return (
      ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
    );
  };

  const TREES: GraphSeed[] = [
    SAMPLE,
    root(
      cat("harcama", sub("market"), sub("yemek", sub("kafe"), sub("restoran")), sub("fatura", sub("su"), sub("net")), sub("kira")),
      cat("spor", sub("kosu", sub("sabah")), sub("yuzme"), sub("salon")),
      cat("egitim", sub("okuma"), sub("kurs")),
      cat("saglik", sub("uyku"))
    ),
    root(...Array.from({ length: 9 }, (_, i) => cat("k" + i, sub("a" + i), sub("b" + i)))),
    root(cat("tek", sub("z", sub("zz", sub("zzz"))))),
  ];

  it("hiçbir hat bir diğerini kesmiyor", () => {
    // Serbest kuvvet dengesinde hatlar birbirinin üstünden atlıyordu; bu
    // yasanın asıl vaadi bu. Sektörler ayrık, sektör içindeki itiş de sırayı
    // bozmuyor — kesişme geometrik olarak imkânsız.
    for (const t of TREES) {
      const l = graphLayout(t);
      const pos = (id: string) =>
        id === t.id ? l.center : l.byId.get(id)!;
      const segs = l.nodes.map((n) => ({
        id: n.id,
        pid: n.parentId,
        a: pos(n.parentId),
        b: { x: n.x, y: n.y },
      }));
      for (let i = 0; i < segs.length; i++)
        for (let j = i + 1; j < segs.length; j++) {
          // Ortak uçlu hatlar (ana-çocuk, kardeş) sayılmaz
          if (
            segs[i].id === segs[j].pid ||
            segs[j].id === segs[i].pid ||
            segs[i].pid === segs[j].pid
          )
            continue;
          expect(
            crosses(segs[i].a, segs[i].b, segs[j].a, segs[j].b)
          ).toBe(false);
        }
    }
  });

  it("kademe = halka: kategorinin İÇİNDE aynı derinlik aynı uzaklıkta", () => {
    // "Hangisi kategori hangisi alt kategori" sorusunun cevabı bu. Halkalar
    // kategoriye özel: küresel halkada en kalabalık dal halkayı dışarı itiyor,
    // seyrek dalın alt kalemleri de boşuna uzaklaşıyordu. Kategoriler yine
    // ortak birinci halkada — o mesaj korunuyor.
    for (const t of TREES) {
      const l = graphLayout(t);
      const branchOf = new Map<string, string>();
      const walk = (s: GraphSeed, depth: number, b: string) => {
        branchOf.set(s.id, b);
        for (const k of s.children ?? [])
          walk(k, depth + 1, depth === 0 ? k.id : b);
      };
      walk(t, 0, "");
      const dist = (n: PlacedNode) =>
        Math.hypot(n.x - l.center.x, n.y - l.center.y);

      // Kategoriler ortak halkada
      const cats = l.nodes.filter((n) => n.depth === 1).map(dist);
      expect(Math.max(...cats) - Math.min(...cats)).toBeLessThan(8);

      // Her kategorinin içinde: aynı derinlik aynı halkada, dış halka uzakta
      for (const b of new Set(l.nodes.map((n) => branchOf.get(n.id)!))) {
        const mine = l.nodes.filter((n) => branchOf.get(n.id) === b);
        const rings = new Map<number, number[]>();
        for (const n of mine)
          rings.set(n.depth, [...(rings.get(n.depth) ?? []), dist(n)]);
        const ordered = [...rings.entries()].sort((a, c) => a[0] - c[0]);
        for (const [, ds] of ordered)
          expect(Math.max(...ds) - Math.min(...ds)).toBeLessThan(8);
        for (let i = 1; i < ordered.length; i++)
          expect(Math.min(...ordered[i][1])).toBeGreaterThan(
            Math.max(...ordered[i - 1][1])
          );
      }
    }
  });

  it("her kalem kendi kategorisinin diliminde kalıyor", () => {
    const t = TREES[1];
    const l = graphLayout(t);
    const branchOf = new Map<string, string>();
    const walk = (s: GraphSeed, depth: number, b: string) => {
      branchOf.set(s.id, b);
      for (const k of s.children ?? []) walk(k, depth + 1, depth === 0 ? k.id : b);
    };
    walk(t, 0, "");
    // Bir kategorinin bütün üyelerinin açı aralığı, başka bir kategorininkiyle
    // örtüşmemeli
    const spans = new Map<string, { lo: number; hi: number }>();
    for (const n of l.nodes) {
      const b = branchOf.get(n.id)!;
      const a = Math.atan2(n.y - l.center.y, n.x - l.center.x);
      const cur = spans.get(b);
      spans.set(b, {
        lo: Math.min(cur?.lo ?? a, a),
        hi: Math.max(cur?.hi ?? a, a),
      });
    }
    const list = [...spans.values()].sort((a, b) => a.lo - b.lo);
    for (let i = 1; i < list.length; i++)
      expect(list[i].lo).toBeGreaterThanOrEqual(list[i - 1].hi - 1e-6);
  });
});
