/**
 * Dönem (özel zaman penceresi) modeli — analiz sayfalarının URL'lenebilir zaman aralıkları.
 * Anahtar biçimleri: d-2026-07-08 (gün), w-2026-07-06 (hafta; pazartesi tarihiyle),
 * m-2026-07 (ay), y-2026 (yıl), c-2026-06-01_2026-07-08 (özel; bitiş dahil), all (tüm zamanlar).
 */

import { dayKey, startOfDayMs, weekStartMs } from "./analytics";

export type PeriodKind = "day" | "week" | "month" | "year" | "custom" | "all";

export interface Period {
  kind: PeriodKind;
  /** Pencere başlangıcı (dahil), epoch ms */
  start: number;
  /** Pencere sonu (hariç), epoch ms */
  end: number;
  /** URL segmenti */
  key: string;
  /** Başlıkta gösterilecek Türkçe etiket */
  label: string;
}

const DAY_MS = 86400000;

function parseYmd(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Gün eklerken DST kaymalarına karşı günü normalize et */
function addDays(t: number, n: number): number {
  const d = new Date(t);
  d.setDate(d.getDate() + n);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

const fmt = (t: number, opt: Intl.DateTimeFormatOptions) =>
  new Date(t).toLocaleDateString("tr-TR", opt);

export function dayPeriod(t: number): Period {
  const start = startOfDayMs(new Date(t));
  return {
    kind: "day",
    start,
    end: addDays(start, 1),
    key: `d-${dayKey(start)}`,
    label: fmt(start, {
      day: "numeric",
      month: "long",
      year: "numeric",
      weekday: "long",
    }),
  };
}

export function weekPeriod(t: number): Period {
  const start = weekStartMs(new Date(t));
  const last = addDays(start, 6);
  return {
    kind: "week",
    start,
    end: addDays(start, 7),
    key: `w-${dayKey(start)}`,
    label: `${fmt(start, { day: "numeric", month: "short" })} – ${fmt(last, {
      day: "numeric",
      month: "short",
    })} ${new Date(last).getFullYear()}`,
  };
}

export function monthPeriod(t: number): Period {
  const d = new Date(t);
  const start = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return {
    kind: "month",
    start,
    end: new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime(),
    key: `m-${d.getFullYear()}-${mm}`,
    label: fmt(start, { month: "long", year: "numeric" }),
  };
}

export function yearPeriod(t: number): Period {
  const y = new Date(t).getFullYear();
  return {
    kind: "year",
    start: new Date(y, 0, 1).getTime(),
    end: new Date(y + 1, 0, 1).getTime(),
    key: `y-${y}`,
    label: String(y),
  };
}

/** startT–endInclusiveT günlerini (ikisi de dahil) kapsayan özel aralık */
export function customPeriod(startT: number, endInclusiveT: number): Period {
  const start = startOfDayMs(new Date(startT));
  const endIncl = startOfDayMs(new Date(endInclusiveT));
  const sameYear =
    new Date(start).getFullYear() === new Date(endIncl).getFullYear();
  const label = `${fmt(start, {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  })} – ${fmt(endIncl, { day: "numeric", month: "short", year: "numeric" })}`;
  return {
    kind: "custom",
    start,
    end: addDays(endIncl, 1),
    key: `c-${dayKey(start)}_${dayKey(endIncl)}`,
    label,
  };
}

export function allPeriod(now: Date = new Date()): Period {
  return {
    kind: "all",
    start: 0,
    end: addDays(startOfDayMs(now), 1),
    key: "all",
    label: "Tüm Zamanlar",
  };
}

export function parsePeriodKey(
  key: string,
  now: Date = new Date()
): Period | null {
  if (key === "all") return allPeriod(now);
  if (key.length < 3 || key[1] !== "-") return null;
  const kind = key[0];
  const rest = key.slice(2);

  if (kind === "d") {
    const d = parseYmd(rest);
    return d ? dayPeriod(d.getTime()) : null;
  }
  if (kind === "w") {
    const d = parseYmd(rest);
    return d ? weekPeriod(d.getTime()) : null;
  }
  if (kind === "m") {
    const m = /^(\d{4})-(\d{2})$/.exec(rest);
    if (!m) return null;
    return monthPeriod(new Date(+m[1], +m[2] - 1, 1).getTime());
  }
  if (kind === "y") {
    if (!/^\d{4}$/.test(rest)) return null;
    return yearPeriod(new Date(+rest, 0, 1).getTime());
  }
  if (kind === "c") {
    const parts = rest.split("_");
    if (parts.length !== 2) return null;
    const a = parseYmd(parts[0]);
    const b = parseYmd(parts[1]);
    if (!a || !b || a.getTime() > b.getTime()) return null;
    return customPeriod(a.getTime(), b.getTime());
  }
  return null;
}

export interface PeriodProgress {
  /** Dönemin başından bugüne (bugün dahil) geçen takvim günü — perşembe günü hafta → 4 */
  elapsedDays: number;
  /** Pencerenin toplam gün sayısı */
  totalDays: number;
  /** Dönem hâlâ sürüyor mu (bugün pencerenin içinde) */
  inProgress: boolean;
}

/**
 * Dönemin "şu ana kadar" durumu — devam eden pencerelerde günlük ortalamanın
 * paydası elapsedDays'tir. "all" gibi başlangıcı belirsiz dönemlerde
 * effectiveStart (örn. ilk girdinin günü) verilmeli; verilmezse start kullanılır.
 */
export function periodProgress(
  p: Period,
  now: Date = new Date(),
  effectiveStart?: number
): PeriodProgress {
  const start = startOfDayMs(new Date(effectiveStart ?? p.start));
  const totalDays = Math.max(1, Math.round((p.end - start) / DAY_MS));
  const today = startOfDayMs(now);
  const nowMs = now.getTime();
  if (nowMs >= p.end) return { elapsedDays: totalDays, totalDays, inProgress: false };
  if (nowMs < start) return { elapsedDays: 0, totalDays, inProgress: false };
  const elapsedDays = Math.min(
    totalDays,
    Math.round((today - start) / DAY_MS) + 1
  );
  return { elapsedDays, totalDays, inProgress: true };
}

/** Önceki/sonraki dönem — custom'da aynı uzunlukta kaydırır; all'da yön yok (null) */
export function shiftPeriod(p: Period, dir: 1 | -1): Period | null {
  switch (p.kind) {
    case "day":
      return dayPeriod(addDays(p.start, dir));
    case "week":
      return weekPeriod(addDays(p.start, dir * 7));
    case "month": {
      const d = new Date(p.start);
      return monthPeriod(new Date(d.getFullYear(), d.getMonth() + dir, 1).getTime());
    }
    case "year":
      return yearPeriod(new Date(new Date(p.start).getFullYear() + dir, 0, 1).getTime());
    case "custom": {
      const days = Math.max(1, Math.round((p.end - p.start) / DAY_MS));
      const s = addDays(p.start, dir * days);
      return customPeriod(s, addDays(s, days - 1));
    }
    default:
      return null;
  }
}
