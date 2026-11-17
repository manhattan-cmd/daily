import { describe, expect, it } from "vitest";
import type { Entry, EntryValue, Mod } from "@/types";
import {
  averageOfDays,
  buildRecords,
  byDay,
  emotionCounts,
  highlights,
  isMoodModName,
  levelDistribution,
  levelSlot,
  pickMoodMods,
  quadrantCounts,
  scaleOf,
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
