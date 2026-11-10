import { describe, expect, it } from "vitest";
import {
  compareValues,
  comparisonWindows,
  freshLabels,
  hourProfile,
  insightOptions,
  linearTrend,
  moversOf,
  quartiles,
  rankAmong,
  resolveInsights,
  rhythmOf,
  tally,
  trendWindows,
  weekdayProfile,
  HISTORY_COUNT,
} from "./insights";
import { allPeriod, dayPeriod, monthPeriod, weekPeriod, yearPeriod } from "./period";

const day = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();

describe("trendWindows", () => {
  const at = (y: number, m: number, d: number, h = 12) => new Date(y, m, d, h).getTime();
  it("ayda günler — kayıtların başladığı günden bugüne, bugün süren", () => {
    const r = trendWindows(monthPeriod(at(2026, 10, 1)), at(2026, 10, 3, 9), at(2026, 10, 10, 15))!;
    expect(r.res).toBe("day");
    expect(r.wins).toHaveLength(8); // 3–10 Kas
    expect(r.wins[0].partial).toBe(false);
    expect(r.wins.at(-1)!.open).toBe(true);
    expect(r.wins.slice(0, -1).some((w) => w.open)).toBe(false);
  });
  it("yılda haftalar — kayıtlardan önceki haftalar yok, ortada başlayan ilk hafta yarım", () => {
    // 19 Ağu 2026 çarşamba
    const r = trendWindows(yearPeriod(at(2026, 0, 1)), at(2026, 7, 19), at(2026, 10, 10))!;
    expect(r.res).toBe("week");
    expect(r.wins[0].start).toBe(weekPeriod(at(2026, 7, 19)).start);
    expect(r.wins[0].partial).toBe(true);
    expect(r.wins[1].partial).toBe(false);
    expect(r.wins.at(-1)!.open).toBe(true);
  });
  it("yılın ilk haftası dönemin başında kırpılır", () => {
    // 1 Oca 2026 perşembe
    const r = trendWindows(yearPeriod(at(2026, 0, 1)), at(2026, 0, 1, 0), at(2026, 2, 1))!;
    expect(r.wins[0].start).toBe(at(2026, 0, 1, 0));
    expect(r.wins[0].partial).toBe(true);
  });
  it("biten dönemde süren kova yok; günde eğilim yok", () => {
    const r = trendWindows(monthPeriod(at(2026, 9, 1)), at(2026, 8, 1), at(2026, 10, 10))!;
    expect(r.wins).toHaveLength(31);
    expect(r.wins.some((w) => w.open || w.partial)).toBe(false);
    expect(trendWindows(dayPeriod(at(2026, 10, 10)), 0, at(2026, 10, 10))).toBeNull();
  });
});

describe("istatistik kataloğu", () => {
  it("türe uymayan okuma sunulmaz", () => {
    expect(insightOptions("presence")).not.toContain("trend");
    expect(insightOptions("rate")).not.toContain("typical");
    expect(insightOptions("choice")).toContain("movers");
    expect(insightOptions("number")).not.toContain("movers");
  });

  it("düzey ölçüsünde tahmin ve en yoğun gün yok", () => {
    const opts = insightOptions("number", { level: true });
    expect(opts).not.toContain("projection");
    expect(opts).not.toContain("peakDay");
    expect(opts).toContain("trend");
  });

  it("seçim yoksa varsayılan, varsa ayıklanıp katalog sırasında", () => {
    expect(resolveInsights(undefined, "number")).toEqual(["change", "history", "extremes", "typical", "weekday"]);
    // Ölçüye uymayan (movers) düşer, sıra katalogdan
    expect(resolveInsights(["weekday", "movers", "change"], "number")).toEqual(["change", "weekday"]);
    // Boş seçim = hepsi kaldırıldı
    expect(resolveInsights([], "number")).toEqual([]);
  });
});

describe("karşılaştırma pencereleri", () => {
  it("süren ayda önceki aylar aynı uzunlukta kırpılır", () => {
    const now = new Date(2026, 10, 10, 15, 0);
    const w = comparisonWindows(monthPeriod(now.getTime()), now);
    expect(w.prev).toHaveLength(HISTORY_COUNT.month);
    expect(w.trimmed).toBe(true);
    // Ekim'in ilk 9 gün 15 saati
    expect(w.prev[0].start).toBe(new Date(2026, 9, 1).getTime());
    expect(w.prev[0].end).toBe(new Date(2026, 9, 10, 15, 0).getTime());
    // Tahmin çizgisi geçen ayın tamamı
    expect(w.prevFull?.end).toBe(new Date(2026, 10, 1).getTime());
    expect(w.fetchEnd).toBe(new Date(2026, 10, 1).getTime());
  });

  it("biten haftada pencereler tam", () => {
    const now = new Date(2026, 10, 10);
    const p = weekPeriod(new Date(2026, 9, 14).getTime());
    const w = comparisonWindows(p, now);
    expect(w.trimmed).toBe(false);
    expect(w.prev[0].end).toBe(p.start);
    expect(w.prev[0].end - w.prev[0].start).toBe(p.end - p.start);
  });

  it("Tümü'nde 4 haftalık dilimler, ek okuma yok", () => {
    const now = new Date(2026, 10, 10, 9);
    const w = comparisonWindows(allPeriod(now), now);
    expect(w.blocks).toBe(true);
    expect(w.fetchStart).toBe(w.fetchEnd);
    expect(w.prev[0].end).toBe(w.cur.start);
    expect(Math.round((w.cur.end - w.cur.start) / 86400000)).toBe(28);
  });
});

describe("hesaplar", () => {
  it("fark: toplananda yüzde, ortalamada puan", () => {
    expect(compareValues(120, 100, { avgLike: false }).pct).toBeCloseTo(20);
    expect(compareValues(120, 0, { avgLike: false }).pct).toBeNull();
    expect(compareValues(3.6, 3.2, { avgLike: true }).points).toBeCloseTo(0.4);
    expect(compareValues(0.8, 0.6, { avgLike: true, rate: true }).points).toBeCloseTo(20);
  });

  it("sıralama: eşitler aynı sırada, en düşük ayrıca belli", () => {
    expect(rankAmong(10, [5, 8, 3])).toMatchObject({ rank: 1, of: 4, lowest: false });
    expect(rankAmong(5, [5, 8, 3]).rank).toBe(2);
    expect(rankAmong(1, [5, 8, 3])).toMatchObject({ rank: 4, lowest: true });
    expect(rankAmong(4, [2, 6]).avg).toBe(4);
  });

  it("eğilim: yön ve yatay eşiği", () => {
    const up = linearTrend([0, 1, 2, 3].map((x) => ({ x, y: 10 + x * 2 })));
    expect(up?.dir).toBe("up");
    expect(up?.slope).toBeCloseTo(2);
    const flat = linearTrend([0, 1, 2, 3].map((x) => ({ x, y: 100 + (x % 2) })));
    expect(flat?.dir).toBe("flat");
    expect(linearTrend([{ x: 0, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 3 }])).toBeNull();
    // Skalada dayanak aralığın genişliği, ortalama değil: ortalaması 0'a
    // yakın bir skalada 0,15 puanlık kıpırtı ortalamaya göre %50 olurdu
    const pts = [0, 1, 2, 3].map((x) => ({ x, y: 0.2 + x * 0.05 }));
    expect(linearTrend(pts)?.dir).toBe("up");
    expect(linearTrend(pts, 4)?.dir).toBe("flat");
  });

  it("çeyrekler", () => {
    expect(quartiles([1, 2, 3])).toBeNull();
    expect(quartiles([1, 2, 3, 4, 5])).toEqual({ min: 1, q1: 2, median: 3, q3: 4, max: 5 });
  });

  it("sayım: harf ve boşluk farkı katlanır, sık yazılan biçim görünür", () => {
    expect(tally(["Kahve", "kahve ", "Kahve", "Çay"], true)).toEqual([
      { label: "Kahve", count: 3 },
      { label: "Çay", count: 1 },
    ]);
  });

  it("haftanın günü: toplamda o günün sayısına bölünür", () => {
    // 2–15 Kasım 2026: iki hafta, Pazartesi 2 ve 9
    const start = day(2026, 11, 2, 0);
    const end = day(2026, 11, 16, 0);
    const pts = [
      { at: day(2026, 11, 2), v: 10 },
      { at: day(2026, 11, 9), v: 30 },
      { at: day(2026, 11, 4), v: 6 },
    ];
    const sum = weekdayProfile(pts, start, end, "sum");
    expect(sum[0]).toBe(20); // Pazartesi: 40 / 2
    expect(sum[2]).toBe(3); // Çarşamba: 6 / 2
    expect(sum[1]).toBe(0);
    const avg = weekdayProfile(pts, start, end, "avg");
    expect(avg[0]).toBe(20);
    expect(avg[1]).toBeNull();
  });

  it("günün saati: en yoğun bölüm ve pay", () => {
    const h = hourProfile([day(2026, 11, 2, 19), day(2026, 11, 3, 20), day(2026, 11, 4, 8)]);
    expect(h?.part).toBe("evening");
    expect(h?.share).toBeCloseTo(2 / 3);
    expect(hourProfile([])).toBeNull();
  });

  it("ritim: ortalama ara, en uzun boşluk, son kayıt", () => {
    const r = rhythmOf([day(2026, 11, 1), day(2026, 11, 2), day(2026, 11, 6)], day(2026, 11, 8));
    expect(r?.avgGap).toBe(2.5);
    expect(r?.longestGap).toBe(3);
    expect(r?.sinceLast).toBe(2);
    expect(rhythmOf([day(2026, 11, 1)], day(2026, 11, 2))).toBeNull();
  });

  it("değişen paylar ve ilk kez görülenler", () => {
    const m = moversOf(
      [{ choice: "Akşam", count: 5 }, { choice: "Öğle", count: 2 }],
      [{ choice: "Akşam", count: 2 }, { choice: "Öğle", count: 4 }, { choice: "Kahvaltı", count: 1 }]
    );
    expect(m.up).toEqual({ label: "Akşam", cur: 5, prev: 2 });
    expect(m.down).toEqual({ label: "Öğle", cur: 2, prev: 4 });
    expect(freshLabels(["Sushi", "kahve"], ["Kahve", "Çay"])).toEqual(["Sushi"]);
  });
});
