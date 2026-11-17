import { describe, expect, it } from "vitest";
import type { Entry, EntryValue, Mod } from "@/types";
import {
  averageOfDays,
  buildRecords,
  byDay,
  dayChanges,
  emotionLevels,
  emotionPairs,
  emotionCounts,
  highlights,
  isMoodModName,
  levelDistribution,
  levelSlot,
  linkStats,
  partStats,
  pickMoodMods,
  quadrantCounts,
  quadrantsOf,
  scaleOf,
  sleepNights,
  sleepVsMood,
  weekdayStats,
} from "./mood-analytics";

const mod = (id: string, name: string, choices: string[]): Mod =>
  ({ id, name, valueType: "select", choices, createdAt: 0, updatedAt: 0 }) as unknown as Mod;
const HAP = mod("hap", "Happiness", ["1", "2", "3", "4", "5"]);
const EMO = mod("emo", "Emotions", ["Happy", "Calm", "Sad", "Tired"]);

const at = (d: number, h: number) => new Date(2026, 9, d, h, 0).getTime();
const entry = (id: string, d: number, h: number, notes?: string): Entry =>
  ({ id, subcategoryId: "s", occurredAt: at(d, h), createdAt: 0, updatedAt: 0, notes }) as Entry;
const val = (entryId: string, modId: string, value: string): EntryValue =>
  ({ id: `${entryId}-${modId}-${value}`, entryId, modId, value, updatedAt: 0 }) as EntryValue;

describe("pickMoodMods", () => {
  it("yerleşik adları tanır", () => {
    expect(pickMoodMods([EMO, HAP])).toEqual({ scale: HAP, emotion: EMO });
  });
  it("adı değişmişse biçimden bulur", () => {
    const s = mod("s", "Keyif", ["1", "2", "3"]);
    const e = mod("e", "Hisler", ["Happy", "Sad", "Nostaljik"]);
    expect(pickMoodMods([e, s])).toEqual({ scale: s, emotion: e });
  });
  it("yerleşik adlar özel sayfaya ait", () => {
    expect(isMoodModName("Happiness")).toBe(true);
    expect(isMoodModName("Enerji")).toBe(false);
  });
});

describe("skala", () => {
  it("seçeneklerden basamaklar, yoksa 1–5", () => {
    expect(scaleOf(HAP)).toEqual({ values: [1, 2, 3, 4, 5], min: 1, max: 5 });
    expect(scaleOf(undefined).max).toBe(5);
  });
  it("ortalamayı en yakın basamağa oturtur", () => {
    const s = scaleOf(HAP);
    expect(levelSlot(3.4, s)).toEqual({ index: 2, total: 5 });
    expect(levelSlot(3.6, s)).toEqual({ index: 3, total: 5 });
    expect(levelSlot(9, s).index).toBe(4);
  });
});

describe("kayıtlar ve günler", () => {
  const entries = [entry("a", 1, 9), entry("b", 1, 21, "  uzun gün  "), entry("c", 2, 20), entry("d", 4, 10)];
  const values = [
    val("a", "hap", "2"),
    val("a", "emo", "Tired|70"),
    val("a", "emo", "Sad"),
    val("b", "hap", "4"),
    val("b", "emo", "Happy"),
    val("c", "hap", "5"),
    val("c", "emo", "Happy"),
    val("c", "emo", "Calm"),
    // d: yalnız duygu, mutluluk yok
    val("d", "emo", "Calm"),
  ];
  const recs = buildRecords(entries, values, "hap", "emo");

  it("yoğunluğu ayıklar, notu kırpar, mutluluğu sayıya çevirir", () => {
    expect(recs[0]).toMatchObject({ id: "a", level: 2, emotions: ["Tired", "Sad"] });
    expect(recs[1].notes).toBe("uzun gün");
    expect(recs[3].level).toBeNull();
  });

  it("gün ortalaması günün kayıtlarından, dönem ortalaması günlerden", () => {
    const days = byDay(recs);
    expect(days.map((d) => d.day)).toEqual(["2026-10-01", "2026-10-02", "2026-10-04"]);
    expect(days[0]).toMatchObject({ avg: 3, min: 2, max: 4 });
    expect(days[2].avg).toBeNull();
    // Kayıt ortalaması (2+4+5)/3 = 3,67 olurdu; gün ortalaması (3+5)/2 = 4
    expect(averageOfDays(days)).toBe(4);
  });

  it("dağılım, duygu sayıları ve bölgeler", () => {
    expect(levelDistribution(recs, scaleOf(HAP))).toEqual([0, 1, 0, 1, 1]);
    expect(emotionCounts(recs)).toEqual([
      ["Calm", 2],
      ["Happy", 2],
      ["Sad", 1],
      ["Tired", 1],
    ]);
    expect(quadrantCounts([...emotionCounts(recs), ["Nostaljik", 3]])).toEqual({
      tense: 0,
      lively: 2,
      low: 2,
      serene: 2,
      other: 3,
    });
  });
});

describe("öne çıkan günler", () => {
  const d = (day: string, avg: number | null, n = 1) => ({
    day,
    avg,
    min: avg,
    max: avg,
    records: Array.from({ length: n }, (_, i) => ({ id: day + i, at: 0, day, level: avg, emotions: [] })),
  });
  it("üç günden azsa ya da hepsi eşitse yok", () => {
    expect(highlights([d("a", 3), d("b", 4)])).toBeNull();
    expect(highlights([d("a", 3), d("b", 3), d("c", 3)])).toBeNull();
  });
  it("eşitlikte çok kayıtlı, sonra yakın gün", () => {
    const h = highlights([d("2026-10-01", 5), d("2026-10-02", 5, 2), d("2026-10-03", 2), d("2026-10-04", 2), d("2026-10-05", null)]);
    expect(h?.best.day).toBe("2026-10-02");
    expect(h?.worst.day).toBe("2026-10-04");
  });
});

describe("duygu ilişkileri ve ritimler", () => {
  const r = (id: string, d: number, h: number, level: number | null, emotions: string[]) => ({
    id,
    at: at(d, h),
    day: `2026-10-${String(d).padStart(2, "0")}`,
    level,
    emotions,
  });
  const recs = [
    r("a", 5, 8, 2, ["Tired", "Stressed"]),
    r("b", 5, 20, 4, ["Tired", "Calm"]),
    r("c", 6, 9, 1, ["Tired", "Stressed", "Sad"]),
    r("d", 7, 13, 5, ["Happy", "Calm"]),
    r("e", 8, 23, 3, ["Tired", "Stressed"]),
    r("f", 9, 14, null, ["Calm", "Nostaljik"]),
  ];

  it("bölgeler haritada olmayanı saymaz", () => {
    expect(quadrantsOf(recs)).toEqual({ tense: 3, lively: 1, low: 5, serene: 3 });
  });

  it("duygunun kayıtlarının ortalaması, eşikle", () => {
    // Tired: 2, 4, 1, 3 → 2,5; Calm'ın mutluluklu iki kaydı var, eşiğin altında
    expect(emotionLevels(recs, 4)).toEqual([{ name: "Tired", avg: 2.5, n: 4 }]);
    expect(emotionLevels(recs, 2).map((x) => x.name)).toEqual(["Calm", "Tired", "Stressed"]);
  });

  it("çiftler ve karışık kayıtlar", () => {
    const p = emotionPairs(recs, 3);
    expect(p.pairs).toEqual([{ a: "Stressed", b: "Tired", n: 3 }]);
    expect(p.multi).toBe(6);
    // b Yorgun + Sakin: karışık. f Sakin + Nostaljik: Nostaljik haritada yok, karışık sayılmaz
    expect(p.mixed).toBe(1);
  });

  it("haftanın günleri pazartesiden", () => {
    const w = weekdayStats(byDay(recs));
    // 5 Ekim 2026 pazartesi
    expect(w[0]).toEqual({ avg: 3, n: 1 });
    expect(w[4]).toEqual({ avg: null, n: 0 });
  });

  it("günün dilimleri", () => {
    const p = partStats(recs);
    expect(p.morning).toMatchObject({ n: 2, avg: 1.5 });
    expect(p.night).toMatchObject({ n: 1, avg: 3 });
    expect(p.noon.n).toBe(1);
  });

  it("dalgalanma yalnız art arda kayıtlı günlerde", () => {
    const ch = dayChanges(byDay(recs));
    // 5→6: 3→1, 6→7: 1→5, 7→8: 5→3; 9 Ekim'de mutluluk yok
    expect(ch.map((c) => c.v)).toEqual([2, 4, 2]);
    expect(ch[1]).toMatchObject({ day: "2026-10-07", from: 1, to: 5 });
  });
});

describe("uyku ve öteki kayıtlar", () => {
  const sl = (id: string, d: number, bedH: number, hours: number): Entry => {
    const end = new Date(2026, 9, d, 7, 0).getTime();
    return { id, subcategoryId: "u", occurredAt: end, createdAt: 0, updatedAt: 0, _range: { start: end - hours * 3600000, end, bedH } } as unknown as Entry;
  };
  const range = (e: Entry) => {
    const r = (e as unknown as { _range: { start: number; end: number } })._range;
    return val(e.id, "dur", JSON.stringify({ start: new Date(r.start).toISOString(), end: new Date(r.end).toISOString() }));
  };
  const nights = [sl("n1", 5, 23, 5.5), sl("n2", 6, 23, 7.5), sl("n3", 6, 13, 1), sl("n4", 7, 23, 8.5)];
  const values = [...nights.map(range), val("n1", "q", "2"), val("n4", "q", "5")];

  it("gece uyanılan güne bağlanır, öğle uykusu geceyi ezmez", () => {
    const m = sleepNights(nights, values, "q");
    expect([...m.keys()]).toEqual(["2026-10-05", "2026-10-06", "2026-10-07"]);
    expect(m.get("2026-10-06")!.hours).toBe(7.5);
    expect(m.get("2026-10-05")!.quality).toBe(2);
    expect(m.get("2026-10-06")!.quality).toBeNull();
  });

  it("ertesi günün ortalaması kovalara göre", () => {
    const day = (d: number, avg: number | null) => ({ day: `2026-10-0${d}`, avg, min: avg, max: avg, records: [] });
    const r = sleepVsMood([day(5, 2), day(6, 4), day(7, 5), day(8, 3)], sleepNights(nights, values, "q"));
    expect(r.paired).toBe(3);
    expect(r.duration.map((x) => x.n)).toEqual([1, 0, 1, 1]);
    expect(r.short).toEqual({ avg: 2, n: 1 });
    expect(r.long).toEqual({ avg: 4.5, n: 2 });
    expect(r.quality).toEqual([
      { q: 2, avg: 2, n: 1 },
      { q: 5, avg: 5, n: 1 },
    ]);
  });

  it("var − yok farkı yalnız 3 gün var ve 3 gün yokken", () => {
    const days = [5, 4, 4, 2, 2, 3, null].map((avg, i) => ({ day: `d${i}`, avg, min: avg, max: avg, records: [] }));
    const [koşu, kahve] = linkStats(days, [
      { id: "koşu", days: new Set(["d0", "d1", "d2", "d6"]) },
      { id: "kahve", days: new Set(["d0", "d1"]) },
    ]);
    // var: 5, 4, 4 → 4,33; yok: 2, 2, 3 → 2,33 (d6 ruh halsiz, sayılmaz)
    expect(koşu.withN).toBe(3);
    expect(koşu.withoutN).toBe(3);
    expect(koşu.diff).toBeCloseTo(2);
    expect(kahve.diff).toBeNull();
  });
});
