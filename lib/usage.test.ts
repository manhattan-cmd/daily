import { describe, expect, it } from "vitest";
import {
  USAGE_WINDOW_DAYS,
  levelRatio,
  usageLevel,
  usageSince,
} from "./usage";

describe("usageLevel", () => {
  it("hiç girdi yoksa sıfırıncı basamak", () => {
    expect(usageLevel(0)).toBe(0);
    expect(usageLevel(-3)).toBe(0);
  });

  it("alışkanlık dilinde beş basamak", () => {
    expect(usageLevel(1)).toBe(1); // ara sıra
    expect(usageLevel(2)).toBe(1);
    expect(usageLevel(3)).toBe(2); // ayda birkaç
    expect(usageLevel(7)).toBe(2);
    expect(usageLevel(8)).toBe(3); // haftada iki
    expect(usageLevel(19)).toBe(3);
    expect(usageLevel(20)).toBe(4); // neredeyse her gün
    expect(usageLevel(400)).toBe(4);
  });

  it("basamak arttıkça oran artıyor, sınırlar 0 ve 1", () => {
    expect(levelRatio(0)).toBe(0);
    expect(levelRatio(4)).toBe(1);
    for (let l = 1; l <= 4; l++)
      expect(levelRatio(l as 1)).toBeGreaterThan(levelRatio((l - 1) as 0));
  });
});

describe("usageSince", () => {
  it("pencere tam otuz gün geriye gidiyor", () => {
    const now = Date.UTC(2026, 7, 31);
    const since = usageSince(now);
    expect((now - since) / (24 * 60 * 60 * 1000)).toBe(USAGE_WINDOW_DAYS);
  });
});
