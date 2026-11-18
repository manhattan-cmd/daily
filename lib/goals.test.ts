import { describe, expect, it } from "vitest";
import {
  addDays,
  daysBetween,
  doneKey,
  shiftRange,
  occurrencesBetween,
  occursOn,
  planReminders,
  reminderId,
  repeatFromDays,
  repeatShape,
  weekOf,
} from "./goals";

// 2026-11-16 pazartesi
const MON = "2026-11-16";

describe("hedef takvimi", () => {
  it("tek günlük hedef yalnız kendi gününde", () => {
    const g = { date: MON };
    expect(occursOn(g, MON)).toBe(true);
    expect(occursOn(g, addDays(MON, 1))).toBe(false);
  });

  it("her gün: başlangıçtan önce yok, sonra her gün", () => {
    const g = { date: MON, repeat: { kind: "daily" as const } };
    expect(occursOn(g, addDays(MON, -1))).toBe(false);
    expect(occurrencesBetween(g, addDays(MON, -3), addDays(MON, 6))).toHaveLength(7);
  });

  it("haftanın belirli günleri ve bitiş günü", () => {
    // pazartesi, çarşamba, cuma; ikinci haftanın çarşambasında biter
    const g = { date: MON, repeat: { kind: "weekly" as const, days: [1, 3, 5] }, until: addDays(MON, 9) };
    expect(occurrencesBetween(g, MON, addDays(MON, 20))).toEqual([
      "2026-11-16",
      "2026-11-18",
      "2026-11-20",
      "2026-11-23",
      "2026-11-25",
    ]);
  });

  it("gün seçiminden tekrar", () => {
    expect(repeatFromDays([])).toBeUndefined();
    expect(repeatFromDays([0, 1, 2, 3, 4, 5, 6])).toEqual({ kind: "daily" });
    expect(repeatShape(repeatFromDays([5, 4, 3, 2, 1])!)).toBe("weekdays");
    expect(repeatShape(repeatFromDays([6, 0])!)).toBe("weekend");
    expect(repeatShape(repeatFromDays([1, 4])!)).toBe("custom");
  });

  it("hafta pazartesiden başlar", () => {
    expect(weekOf("2026-11-22")[0]).toBe(MON); // pazar
    expect(weekOf(MON)[6]).toBe("2026-11-22");
  });

  it("uyku aralığı hedefin gününe taşınır, gece yarısı korunur", () => {
    const raw = JSON.stringify({ start: "2026-11-15T23:30", end: "2026-11-16T07:00" });
    expect(JSON.parse(shiftRange(raw, daysBetween(MON, "2026-11-20")))).toEqual({
      start: "2026-11-19T23:30",
      end: "2026-11-20T07:00",
    });
    expect(shiftRange(raw, 0)).toBe(raw);
    expect(shiftRange("bozuk", 3)).toBe("bozuk");
  });

  it("yaz saati geçişinde gün kaymaz", () => {
    expect(addDays("2026-03-28", 2)).toBe("2026-03-30");
    expect(addDays("2026-10-24", 2)).toBe("2026-10-26");
  });
});

describe("hatırlatmalar", () => {
  const now = new Date(2026, 10, 16, 9, 0).getTime(); // pazartesi 09:00
  const goal = { id: "g1", date: MON, repeat: { kind: "daily" as const }, remindAt: "10:00" };

  it("her gün için ayrı bildirim, saati geçen gün yok", () => {
    const plan = planReminders([goal], new Set(), now, 3);
    expect(plan.map((p) => p.date)).toEqual(["2026-11-16", "2026-11-17", "2026-11-18"]);
    const late = new Date(2026, 10, 16, 11, 0).getTime();
    expect(planReminders([goal], new Set(), late, 3).map((p) => p.date)).toEqual([
      "2026-11-17",
      "2026-11-18",
    ]);
  });

  it("yapılmış günün bildirimi kurulmaz", () => {
    const plan = planReminders([goal], new Set([doneKey("g1", MON)]), now, 2);
    expect(plan.map((p) => p.date)).toEqual(["2026-11-17"]);
  });

  it("hatırlatması olmayan hedef ve sınır", () => {
    const quiet = { ...goal, id: "g2", remindAt: undefined };
    expect(planReminders([quiet], new Set(), now, 5)).toHaveLength(0);
    expect(planReminders([goal], new Set(), now, 30, 4)).toHaveLength(4);
  });

  it("kimlik sabit, pozitif ve günler arasında farklı", () => {
    const a = reminderId("g1", MON);
    expect(a).toBe(reminderId("g1", MON));
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThan(2 ** 31);
    expect(reminderId("g1", addDays(MON, 1))).not.toBe(a);
  });
});
