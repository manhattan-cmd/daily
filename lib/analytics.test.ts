import { describe, expect, it } from "vitest";
import {
  bucketAncestorId,
  bucketKeyOf,
  buildSeriesBuckets,
  chooseGranularity,
  computeStreaks,
  dayKey,
  fmtNum,
  parseNumeric,
  startOfDayMs,
  weekStartMs,
} from "./analytics";
import type { SubCategory } from "@/types";

const at = (y: number, m: number, d: number, h = 12) =>
  new Date(y, m - 1, d, h).getTime();

describe("gün ve hafta sınırları", () => {
  it("dayKey yerel günü verir — UTC'ye kaymaz", () => {
    // Gece 23:30: UTC'ye çevrilse ertesi güne kayardı
    expect(dayKey(at(2026, 7, 15, 23))).toBe("2026-07-15");
    expect(dayKey(at(2026, 7, 15, 0))).toBe("2026-07-15");
  });

  it("startOfDayMs gece yarısına iner", () => {
    const d = new Date(startOfDayMs(new Date(at(2026, 7, 15, 17))));
    expect([d.getHours(), d.getMinutes(), d.getSeconds()]).toEqual([0, 0, 0]);
  });

  it("weekStartMs pazartesiyi verir — pazar dahil", () => {
    // 19 Temmuz 2026 pazar → haftanın başı 13 Temmuz pazartesi
    const mon = new Date(weekStartMs(new Date(at(2026, 7, 19))));
    expect(mon.getDay()).toBe(1);
    expect(mon.getDate()).toBe(13);
  });
});

describe("seri kovaları", () => {
  it("gün kovası her günü kapsar, aralık uçları dahil", () => {
    const b = buildSeriesBuckets(at(2026, 7, 1, 0), at(2026, 7, 8, 0), "day");
    expect(b).toHaveLength(7);
    expect(b[0].key).toBe(bucketKeyOf(at(2026, 7, 1), "day"));
  });

  it("bucketKeyOf aynı gün için aynı, farklı gün için farklı anahtar", () => {
    expect(bucketKeyOf(at(2026, 7, 15, 1), "day")).toBe(
      bucketKeyOf(at(2026, 7, 15, 23), "day")
    );
    expect(bucketKeyOf(at(2026, 7, 15), "day")).not.toBe(
      bucketKeyOf(at(2026, 7, 16), "day")
    );
  });

  it("hafta kovasında aynı haftanın günleri birleşir", () => {
    // 13 (pzt) ve 19 (paz) Temmuz aynı hafta
    expect(bucketKeyOf(at(2026, 7, 13), "week")).toBe(
      bucketKeyOf(at(2026, 7, 19), "week")
    );
    expect(bucketKeyOf(at(2026, 7, 19), "week")).not.toBe(
      bucketKeyOf(at(2026, 7, 20), "week")
    );
  });

  it("pencere büyüdükçe kova kabalaşır", () => {
    const day = chooseGranularity(at(2026, 7, 1), at(2026, 7, 10));
    const long = chooseGranularity(at(2020, 1, 1), at(2026, 7, 1));
    expect(day).toBe("day");
    expect(["month", "week"]).toContain(long);
  });
});

describe("computeStreaks", () => {
  const keys = (...ds: number[]) =>
    new Set(ds.map((d) => dayKey(at(2026, 7, d))));

  it("bugüne kadar kesintisiz gün sayısını verir", () => {
    const s = computeStreaks(keys(13, 14, 15), new Date(at(2026, 7, 15)));
    expect(s.current).toBe(3);
    expect(s.best).toBeGreaterThanOrEqual(3);
  });

  it("dün biten seri de güncel sayılır (bugün henüz girilmemiş)", () => {
    const s = computeStreaks(keys(13, 14), new Date(at(2026, 7, 15)));
    expect(s.current).toBe(2);
  });

  it("iki gün önce kopan seri güncel değildir", () => {
    const s = computeStreaks(keys(10, 11), new Date(at(2026, 7, 15)));
    expect(s.current).toBe(0);
    expect(s.best).toBe(2);
  });

  it("boş küme sıfır verir", () => {
    const s = computeStreaks(new Set(), new Date(at(2026, 7, 15)));
    expect(s.current).toBe(0);
    expect(s.best).toBe(0);
  });
});

describe("bucketAncestorId — kırılım gruplaması", () => {
  const sub = (id: string, parentId?: string): SubCategory => ({
    id,
    categoryId: "c",
    ...(parentId ? { parentId } : {}),
    name: id,
    order: 1,
    createdAt: 0,
    updatedAt: 0,
  });
  // kök: a → b → c
  const map = new Map<string, SubCategory>([
    ["a", sub("a")],
    ["b", sub("b", "a")],
    ["c", sub("c", "b")],
  ]);

  it("stopId yokken en üst ataya toplar", () => {
    expect(bucketAncestorId("c", map)).toBe("a");
    expect(bucketAncestorId("a", map)).toBe("a");
  });

  it("stopId verilince onun BİR ALT kademesine toplar", () => {
    expect(bucketAncestorId("c", map, "a")).toBe("b");
  });

  it("odağın kendi girdileri kendi id'sinde kalır", () => {
    expect(bucketAncestorId("a", map, "a")).toBe("a");
  });

  it("kapsam dışındaki kalem gruplanmaz", () => {
    expect(bucketAncestorId("yok", map)).toBeUndefined();
  });
});

describe("sayı biçimi", () => {
  it("büyük sayılar kompaktlaşır ama küçükler bozulmaz", () => {
    expect(fmtNum(42)).toBe("42");
    expect(fmtNum(1234)).toMatch(/1[.,]?2/);
    expect(fmtNum(0)).toBe("0");
  });

  it("parseNumeric virgüllü ve boş değerleri kaldırır", () => {
    expect(parseNumeric("12.5")).toBeCloseTo(12.5);
    expect(parseNumeric("")).toBe(0);
    expect(parseNumeric("abc")).toBe(0);
  });
});
