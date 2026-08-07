import { describe, expect, it } from "vitest";
import {
  dayPeriod,
  monthPeriod,
  parsePeriodKey,
  periodProgress,
  shiftPeriod,
  weekPeriod,
  yearPeriod,
} from "./period";

/** 15 Temmuz 2026, Çarşamba, 13:30 — yerel saat */
const WED = new Date(2026, 6, 15, 13, 30).getTime();

describe("dönem sınırları", () => {
  it("gün: yerel gece yarısından ertesi gece yarısına", () => {
    const p = dayPeriod(WED);
    expect(new Date(p.start).getHours()).toBe(0);
    expect(p.end - p.start).toBe(86400000);
    expect(p.key).toBe("d-2026-07-15");
  });

  it("hafta: pazartesi başlar, 7 gün sürer", () => {
    const p = weekPeriod(WED);
    // 15 Temmuz 2026 çarşamba → hafta 13 Temmuz pazartesi
    expect(new Date(p.start).getDay()).toBe(1);
    expect(new Date(p.start).getDate()).toBe(13);
    expect(p.end - p.start).toBe(7 * 86400000);
    expect(p.key).toBe("w-2026-07-13");
  });

  it("ay: ayın 1'inden sonraki ayın 1'ine", () => {
    const p = monthPeriod(WED);
    expect(new Date(p.start).getDate()).toBe(1);
    expect(new Date(p.start).getMonth()).toBe(6);
    expect(new Date(p.end).getMonth()).toBe(7);
    expect(p.key).toBe("m-2026-07");
  });

  it("yıl: 1 Ocak'tan ertesi yılın 1 Ocak'ına", () => {
    const p = yearPeriod(WED);
    expect(new Date(p.start).getMonth()).toBe(0);
    expect(new Date(p.start).getDate()).toBe(1);
    expect(new Date(p.end).getFullYear()).toBe(2027);
    expect(p.key).toBe("y-2026");
  });

  it("pencereler bitişik: bir dönemin sonu sonrakinin başlangıcı", () => {
    const july = monthPeriod(WED);
    const august = shiftPeriod(july, 1)!;
    expect(august.start).toBe(july.end);
  });
});

describe("parsePeriodKey", () => {
  it("ürettiği anahtarı geri okur", () => {
    for (const p of [
      dayPeriod(WED),
      weekPeriod(WED),
      monthPeriod(WED),
      yearPeriod(WED),
    ]) {
      const back = parsePeriodKey(p.key);
      expect(back, p.key).not.toBeNull();
      expect(back!.start).toBe(p.start);
      expect(back!.end).toBe(p.end);
      expect(back!.kind).toBe(p.kind);
    }
  });

  it("tanımadığı anahtarda null döner", () => {
    expect(parsePeriodKey("saçma")).toBeNull();
    expect(parsePeriodKey("m-2026-13")).toBeNull();
    expect(parsePeriodKey("")).toBeNull();
  });

  it("özel aralıkta bitiş günü DAHİLDİR", () => {
    const p = parsePeriodKey("c-2026-07-01_2026-07-03");
    expect(p).not.toBeNull();
    // 1,2,3 Temmuz = 3 gün
    expect((p!.end - p!.start) / 86400000).toBe(3);
  });
});

describe("periodProgress", () => {
  it("geçmiş dönem tamamlanmış sayılır", () => {
    const june = monthPeriod(new Date(2026, 5, 10).getTime());
    const pr = periodProgress(june, new Date(2026, 6, 15));
    expect(pr.inProgress).toBe(false);
    expect(pr.elapsedDays).toBe(pr.totalDays);
    expect(pr.totalDays).toBe(30);
  });

  it("devam eden dönemde geçen gün bugünü kapsar", () => {
    const july = monthPeriod(WED);
    const pr = periodProgress(july, new Date(WED));
    expect(pr.inProgress).toBe(true);
    // 15 Temmuz'da ayın 15 günü geçmiş sayılır (bugün dahil)
    expect(pr.elapsedDays).toBe(15);
    expect(pr.totalDays).toBe(31);
  });

  it("gelecekteki dönemde geçen gün sıfırdan küçük olmaz", () => {
    const next = monthPeriod(new Date(2026, 8, 1).getTime());
    const pr = periodProgress(next, new Date(WED));
    expect(pr.elapsedDays).toBeGreaterThanOrEqual(0);
  });
});

describe("shiftPeriod", () => {
  it("ay sınırında yıl atlar", () => {
    const dec = monthPeriod(new Date(2026, 11, 5).getTime());
    const jan = shiftPeriod(dec, 1)!;
    expect(new Date(jan.start).getFullYear()).toBe(2027);
    expect(new Date(jan.start).getMonth()).toBe(0);
  });

  it("ileri-geri simetrik", () => {
    const p = weekPeriod(WED);
    const back = shiftPeriod(shiftPeriod(p, 1)!, -1)!;
    expect(back.start).toBe(p.start);
  });

  it('"tümü" kaydırılamaz', () => {
    const all = parsePeriodKey("all")!;
    expect(shiftPeriod(all, 1)).toBeNull();
  });
});
