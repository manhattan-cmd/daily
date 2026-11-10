import { computeStreaks, dayKey, fmtNum, startOfDayMs, type DayBucket, type Granularity } from "@/lib/analytics";
import {
  compareValues,
  freshLabels,
  hourProfile,
  linearTrend,
  moversOf,
  quartiles,
  rankAmong,
  rhythmOf,
  tally,
  weekdayProfile,
  type ComparisonWindows,
  type DayPart,
  type InsightKind,
  type Win,
} from "@/lib/insights";
import type { Period, PeriodKind } from "@/lib/period";
import type { Entry, InsightKey } from "@/types";
import type { MetricCompute } from "./use-category-metrics";

/**
 * İstatistikler bölümünün okumaları — dönemin ve geçmişin girdilerinden,
 * seçili okumaya göre (bkz. lib/insights). Yalnız panoda duranlar
 * hesaplanır; hesaplanamayan (veri yetmeyen) okuma boş kalır, bölümde hiç
 * çizilmez.
 */

const DAY_MS = 86400000;
/** Gün şeridinde en çok bu kadar gün — daha uzun dönemlerde son günler */
const STRIP_DAYS = 56;

export type Pt = { x: number; y: number };
export type StripDay = { on: boolean; today: boolean };

export type InsightData = {
  /** Oran (evet/hayır) — değerler yüzde, farklar puan */
  rate: boolean;
  /** Ortalaması alınan ölçü (skala, oran, düzey) — farklar puan */
  avgLike: boolean;
  /**
   * Dönem sürüyor: karşılaştırılan geçmiş pencereler aynı uzunlukta
   * kırpıldı — ayda "ilk 10 gün" (sayı), günde "bu saate kadar" ("hour")
   */
  trimmed: number | "hour" | null;
  change?: {
    curLabel: string;
    prevLabel: string;
    cur: number;
    prev: number;
    hasPrev: boolean;
    pct: number | null;
    points: number | null;
    diff: number;
  };
  history?: {
    /** Eskiden yeniye; sonuncusu bu pencere. Verisiz ortalama penceresi null */
    values: (number | null)[];
    rank: number;
    of: number;
    lowest: boolean;
    avg: number;
    /** Ortalamadan fark — toplananlarda yüzde, ortalamalarda puan */
    vsPct: number | null;
    vsPoints: number | null;
    n: number;
    unit: PeriodKind;
  };
  trend?: {
    pts: Pt[];
    /** x ekseninin genişliği (kova sayısı) */
    span: number;
    slope: number;
    intercept: number;
    dir: "up" | "down" | "flat";
    per: Granularity;
  };
  projection?: { cur: number; projected: number; prevFull: number | null; prevLabel: string; kind: PeriodKind };
  extremes?: {
    max: { v: number; at: number; sub?: string };
    min: { v: number; at: number; sub?: string };
  };
  typical?: { min: number; q1: number; median: number; q3: number; max: number };
  peakDay?: { v: number; at: number; avgDay: number };
  top?: { rows: { label: string; count: number }[]; total: number; distinct: number; repeats: boolean };
  rare?: { least: { label: string; count: number }[]; never: string[] };
  fresh?: { labels: string[]; n: number; unit: PeriodKind; allBefore: boolean };
  movers?: ReturnType<typeof moversOf> & { prevLabel: string };
  /** basis: dönemin adı, ya da (kısa dönemde geçmişle birlikte) son kaç gün */
  weekday?: { values: (number | null)[]; mode: "sum" | "avg"; basis: string | number; best: number; worst: number };
  hours?: { hours: number[]; part: DayPart; share: number; peakHour: number; basis: string | number };
  rhythm?: { avgGap: number; longestGap: number; sinceLast: number | null; strip: StripDay[] };
  streak?: { current: number; best: number; active: number; elapsed: number; yes: boolean; strip: StripDay[] };
};

type Src = { entries: Entry[]; compute: MetricCompute };

const inWin = (list: Entry[], w: Win) => list.filter((e) => e.occurredAt >= w.start && e.occurredAt < w.end);

/** Aralığın günleri (son STRIP_DAYS), kayıtlı olanlar işaretli */
function stripOf(start: number, end: number, on: Set<string>, now: number): StripDay[] {
  const out: StripDay[] = [];
  const todayKey = dayKey(now);
  for (let t = startOfDayMs(new Date(start)); t < end; t = startOfDayMs(new Date(t + DAY_MS * 1.5))) {
    const k = dayKey(t);
    out.push({ on: on.has(k), today: k === todayKey });
  }
  return out.slice(-STRIP_DAYS);
}

export function buildInsights(p: {
  keys: InsightKey[];
  kind: InsightKind;
  /** Düzey ölçüsü (kilo) — toplamı anlamsız */
  level: boolean;
  period: Period;
  now: Date;
  progress: { elapsedDays: number; totalDays: number; inProgress: boolean };
  /** Dönemin girdileri ve okuması */
  cur: Src;
  /** Önceki pencerelerin girdileri — aynı özellik okunabildiyse; "Tümü"nde kullanılmaz */
  past: Src | null;
  windows: ComparisonWindows;
  buckets: DayBucket[];
  granularity: Granularity;
  /** Dönemin kısa adı ("bu ay", "Tüm zamanlar") — dağılımların dayanağı */
  periodLabel: string;
  /** Girdinin yeri — en yüksek girdinin altında */
  subLabelOf: (entryId: string) => string | undefined;
}): InsightData {
  const { keys, kind, level, period, now, progress, cur, windows } = p;
  const has = (k: InsightKey) => keys.includes(k);
  const nowMs = now.getTime();
  const c = cur.compute;
  const rate = c.isRate;
  const avgLike = c.isAvgLike;
  const additive = !avgLike;
  const out: InsightData = {
    rate,
    avgLike,
    trimmed: !windows.trimmed ? null : period.kind === "day" ? "hour" : progress.elapsedDays,
  };

  // Pencerenin rakamı: oranda evet payı, ötekilerde okumanın kendisi
  const H = (s: Src, list: Entry[]) => (s.compute.isRate ? s.compute.averageOf(list) : s.compute.aggregate(list));
  const filled = (s: Src, list: Entry[]) => s.compute.filledCount(list) > 0;

  // "Tümü"nde pencereler dönemin kendi verisinden kesilir (son 4 hafta)
  const curEntries = windows.blocks ? inWin(cur.entries, windows.cur) : cur.entries;
  const pastSrc: Src | null = windows.blocks ? cur : p.past;
  const isDay = period.kind === "day";

  if (has("change") && windows.prev[0]) {
    const prevEntries = pastSrc ? inWin(pastSrc.entries, windows.prev[0]) : [];
    const hasPrev = !!pastSrc && filled(pastSrc, prevEntries);
    const hasCur = filled(cur, curEntries);
    if (hasCur || (hasPrev && additive)) {
      const a = hasCur || additive ? H(cur, curEntries) : 0;
      const b = hasPrev ? H(pastSrc!, prevEntries) : 0;
      out.change = {
        curLabel: windows.cur.label,
        prevLabel: windows.prev[0].label,
        cur: a,
        prev: b,
        hasPrev,
        ...compareValues(a, b, { avgLike, rate }),
      };
    }
  }

  if (has("history") && pastSrc) {
    const series = [...windows.prev].reverse().map((w) => {
      const list = inWin(pastSrc.entries, w);
      const ok = filled(pastSrc, list);
      return { ok, v: ok ? H(pastSrc, list) : additive ? 0 : null };
    });
    // Kayıtların başladığı pencereden öncesi sıralamaya girmez — üç hafta
    // önce başlayan birinin "12 haftanın en yükseği" boş haftalardan çıkardı
    const first = series.findIndex((s) => s.ok);
    const kept = first < 0 ? [] : series.slice(first);
    const others = kept.map((s) => s.v).filter((v): v is number => v !== null);
    const curOk = filled(cur, curEntries);
    const v = curOk ? H(cur, curEntries) : additive ? 0 : null;
    if (others.length >= 2 && v !== null) {
      const r = rankAmong(v, others);
      out.history = {
        values: [...kept.map((s) => s.v), v],
        ...r,
        vsPct: !avgLike && r.avg > 0 ? ((v - r.avg) / r.avg) * 100 : null,
        vsPoints: avgLike ? (v - r.avg) * (rate ? 100 : 1) : null,
        n: others.length,
        unit: period.kind,
      };
    }
  }

  if (has("trend") && !isDay && p.buckets.length) {
    const pts: Pt[] = [];
    p.buckets.forEach((b, i) => {
      if ((b.start ?? 0) > nowMs) return;
      // Süren kova toplananlarda yarım — son nokta düşük çıkıp "azalıyor"
      // derdi; ortalamalarda yarım kova da ortalama
      if (additive && (b.end ?? 0) > nowMs) return;
      if (additive) pts.push({ x: i, y: b.value });
      else if (b.hasData) pts.push({ x: i, y: rate ? (b.avg ?? 0) : b.value });
    });
    const ref = rate ? 1 : c.scale ? Math.max(1, c.scale.max - c.scale.min) : undefined;
    const tr = linearTrend(pts, ref);
    if (tr) out.trend = { pts, span: p.buckets.length, ...tr, per: p.granularity };
  }

  if (
    has("projection") &&
    additive &&
    !level &&
    (period.kind === "week" || period.kind === "month" || period.kind === "year" || period.kind === "custom") &&
    progress.inProgress &&
    progress.elapsedDays >= 2 &&
    progress.totalDays > progress.elapsedDays
  ) {
    const sofar = H(cur, cur.entries);
    let prevFull: number | null = null;
    if (pastSrc && windows.prevFull) {
      const list = inWin(pastSrc.entries, windows.prevFull);
      if (filled(pastSrc, list)) prevFull = H(pastSrc, list);
    }
    if (sofar > 0) {
      out.projection = {
        cur: sofar,
        projected: (sofar / progress.elapsedDays) * progress.totalDays,
        prevFull,
        prevLabel: windows.prevFull?.label ?? "",
        kind: period.kind,
      };
    }
  }

  // Girdi başına değerler — en yüksek/düşük, tipik aralık, en sık sayı
  const numeric = kind === "number" || kind === "duration" || kind === "scale";
  const vals = numeric
    ? cur.entries.flatMap((e) => {
        const v = c.valueByEntry.get(e.id);
        return v === undefined ? [] : [{ id: e.id, at: e.occurredAt, v }];
      })
    : [];

  if (has("extremes") && vals.length >= 2) {
    // Eşitlikte en son girilen
    const max = vals.reduce((a, b) => (b.v > a.v || (b.v === a.v && b.at > a.at) ? b : a));
    const min = vals.reduce((a, b) => (b.v < a.v || (b.v === a.v && b.at > a.at) ? b : a));
    if (max.v !== min.v) {
      // Yer adı yalnız birden çok yer varsa — tek yerde her satırda aynı ad
      const subs = new Set(vals.map((x) => p.subLabelOf(x.id)));
      const sub = (id: string) => (subs.size > 1 ? p.subLabelOf(id) : undefined);
      out.extremes = {
        max: { v: max.v, at: max.at, sub: sub(max.id) },
        min: { v: min.v, at: min.at, sub: sub(min.id) },
      };
    }
  }

  if (has("typical")) {
    const q = quartiles(vals.map((x) => x.v));
    if (q && q.max > q.min) out.typical = q;
  }

  // Gün toplamları — en yoğun gün, ritim, seri
  const perDay = new Map<number, number>();
  const loggedDays = new Set<string>();
  const yesDays = new Set<string>();
  for (const e of cur.entries) {
    const a = c.amountOf(e.id);
    if (a === undefined) continue;
    // Seçenek süzgecinde o seçeneğin geçmediği girdi o günü doldurmaz
    if (c.isChoice && a === 0) continue;
    const d = startOfDayMs(new Date(e.occurredAt));
    perDay.set(d, (perDay.get(d) ?? 0) + a);
    loggedDays.add(dayKey(e.occurredAt));
    if (a > 0) yesDays.add(dayKey(e.occurredAt));
  }

  if (has("peakDay") && additive && !level && !isDay && perDay.size >= 2) {
    let peakAt = 0;
    let peak = -Infinity;
    let sum = 0;
    for (const [d, v] of perDay) {
      sum += v;
      if (v > peak || (v === peak && d > peakAt)) {
        peak = v;
        peakAt = d;
      }
    }
    if (peak > 0) out.peakDay = { v: peak, at: peakAt, avgDay: sum / perDay.size };
  }

  const labelKinds = kind === "choice" || kind === "presence";
  const curLabels = labelKinds ? curEntries.flatMap((e) => c.labelsOf(e.id)) : [];

  if (has("top")) {
    const rows =
      kind === "choice"
        ? c.distributionOf(cur.entries).map((r) => ({ label: r.choice, count: r.count }))
        : kind === "presence"
          ? tally(cur.entries.flatMap((e) => c.labelsOf(e.id)), true)
          : numeric
            ? tally(vals.map((x) => fmtNum(x.v)))
            : [];
    if (rows.length) {
      const total = rows.reduce((a, r) => a + r.count, 0);
      out.top = {
        rows: rows.slice(0, 3),
        total,
        distinct: rows.length,
        // Seçenekte tek seçim de bir şey anlatır; serbest değerde tekrar şart
        repeats: kind === "choice" || rows[0].count >= 2,
      };
    }
  }

  if (has("rare") && (kind === "choice" || kind === "scale")) {
    const counts =
      kind === "choice"
        ? c.distributionOf(cur.entries).map((r) => ({ label: r.choice, count: r.count }))
        : tally(vals.map((x) => fmtNum(x.v)));
    if (counts.length) {
      const options =
        kind === "scale"
          ? c.choiceOptions.map((o) => fmtNum(parseFloat(o))).filter((o) => o !== "NaN")
          : c.choiceOptions;
      const seen = new Set(counts.map((r) => r.label));
      const never = options.filter((o) => !seen.has(o));
      const top = counts[0].count;
      const least = [...counts]
        .reverse()
        .filter((r) => r.count < top)
        .slice(0, 2);
      if (never.length || least.length) out.rare = { least, never };
    }
  }

  if (has("fresh") && labelKinds) {
    const pastEntries = windows.blocks
      ? cur.entries.filter((e) => e.occurredAt < windows.cur.start)
      : (p.past?.entries ?? []);
    const pastLabels = pastSrc ? pastEntries.flatMap((e) => pastSrc.compute.labelsOf(e.id)) : [];
    if (pastLabels.length && curLabels.length) {
      out.fresh = {
        labels: freshLabels(curLabels, pastLabels),
        n: windows.prev.length,
        unit: period.kind,
        allBefore: windows.blocks,
      };
    }
  }

  if (has("movers") && kind === "choice" && pastSrc && windows.prev[0]) {
    const prevEntries = inWin(pastSrc.entries, windows.prev[0]);
    if (filled(pastSrc, prevEntries) && filled(cur, curEntries)) {
      out.movers = {
        ...moversOf(c.distributionOf(curEntries), pastSrc.compute.distributionOf(prevEntries)),
        prevLabel: windows.prev[0].label,
      };
    }
  }

  // Haftanın günü ve günün saati: dönem en az 4 hafta ise dönemin kendisi;
  // kısaysa (gün, hafta) geçmiş pencerelerle birlikte — tek haftada her
  // gün bir kez geçiyor, "en yoğun gün" o haftanın bir günü olurdu
  if (has("weekday") || has("hours")) {
    const firstAt = cur.entries.length ? Math.min(...cur.entries.map((e) => e.occurredAt)) : nowMs;
    const effStart = period.kind === "all" ? startOfDayMs(new Date(firstAt)) : period.start;
    const effEnd = Math.min(period.end, startOfDayMs(now) + DAY_MS);
    const long = (effEnd - effStart) / DAY_MS >= 27.5;
    const useP = !long && !!p.past && p.past.entries.length > 0;
    const pts: { at: number; v: number }[] = [];
    const push = (s: Src) => {
      for (const e of s.entries) {
        const a = s.compute.amountOf(e.id);
        if (a !== undefined) pts.push({ at: e.occurredAt, v: a });
      }
    };
    push(cur);
    if (useP) push(p.past!);
    // Geçmişle birlikte bakılınca aralık ilk kayıttan başlar: on iki ay
    // geriye okunsa da kayıtlar üç ay önce başladıysa "son 375 gün" yanlış
    // olurdu, gün başına ortalama da boş aylarla sulanırdı
    const firstPt = pts.length ? startOfDayMs(new Date(Math.min(...pts.map((x) => x.at)))) : effStart;
    const rangeStart = useP ? Math.max(windows.fetchStart, firstPt) : effStart;
    const days = Math.round((effEnd - rangeStart) / DAY_MS);
    const basisText = useP ? days : p.periodLabel;

    if (has("weekday") && days >= 14 && pts.length >= 5) {
      const mode = avgLike ? "avg" : "sum";
      const values = weekdayProfile(pts, rangeStart, effEnd, mode);
      const idx = values.map((v, i) => ({ v, i })).filter((x): x is { v: number; i: number } => x.v !== null);
      if (idx.length >= 2) {
        const best = idx.reduce((a, b) => (b.v > a.v ? b : a)).i;
        const worst = idx.reduce((a, b) => (b.v < a.v ? b : a)).i;
        if (best !== worst) out.weekday = { values, mode, basis: basisText, best, worst };
      }
    }
    if (has("hours")) {
      const times = pts.filter((x) => x.v !== 0 || !c.isChoice).map((x) => x.at);
      const h = times.length >= 4 ? hourProfile(times) : null;
      if (h) out.hours = { ...h, basis: basisText };
    }
  }

  if (has("rhythm") && !isDay) {
    const r = rhythmOf([...perDay.keys()], nowMs);
    if (r) {
      const firstDay = perDay.size ? Math.min(...perDay.keys()) : period.start;
      const start = period.kind === "all" ? firstDay : period.start;
      const end = Math.min(period.end, startOfDayMs(now) + DAY_MS);
      out.rhythm = {
        avgGap: r.avgGap,
        longestGap: r.longestGap,
        sinceLast: progress.inProgress || period.kind === "all" ? r.sinceLast : null,
        strip: stripOf(start, end, loggedDays, nowMs),
      };
    }
  }

  if (has("streak") && !isDay && loggedDays.size) {
    const days = rate ? yesDays : loggedDays;
    const st = computeStreaks(days, new Date(Math.min(nowMs, period.end - 1)));
    const firstDay = perDay.size ? Math.min(...perDay.keys()) : period.start;
    const start = period.kind === "all" ? firstDay : period.start;
    const end = Math.min(period.end, startOfDayMs(now) + DAY_MS);
    out.streak = {
      ...st,
      active: loggedDays.size,
      elapsed: progress.elapsedDays,
      yes: rate,
      strip: stripOf(start, end, days, nowMs),
    };
  }

  return out;
}
