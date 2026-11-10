/**
 * Analiz panosunun İstatistikler bölümü — hesapların saf çekirdeği.
 *
 * Kutular (StatTiles) dönemin tek rakamlarını veriyor: toplam, ortalama,
 * en yüksek. İstatistikler o rakamın BAĞLAMINI anlatıyor: öncekine göre ne
 * değişti, geçmişin içinde nerede, hangi gün ve saatte yoğunlaşıyor, ne
 * sıklıkla, en çok neyi tekrarlıyor. Kişisel takip uygulamalarının
 * (Daylio, Exist, Apple Sağlık, Loop) öne çıkardığı okumalar bunlar:
 * dönem karşılaştırması, kişisel ortalama (taban çizgisi), sıralama ve
 * rekor, haftanın günü, günün saati, seriler, sıklık.
 *
 * Her okuma ölçünün türüne göre sunuluyor (bkz. INSIGHTS_FOR): metne
 * "eğilim", evet/hayıra "tipik aralık" diye bir şey yok. Burada yalnız
 * hesap var; okumaların derlenmesi components/analytics/insight-data,
 * çizimi analysis-insights.
 */

import { dateFormatter } from "@/lib/utils";
import { intlTag, translate } from "@/lib/i18n";
import { startOfDayMs } from "@/lib/analytics";
import { periodShortLabel, shiftPeriod, type Period, type PeriodKind } from "@/lib/period";
import type { InsightKey, ModKindForAnalysis } from "@/types";

export type { InsightKey };

/** İstatistiklerin türü — özelliğin analiz türü ya da girdi sayısı */
export type InsightKind = ModKindForAnalysis | "count";

const DAY_MS = 86400000;

/**
 * Türe göre sunulan istatistikler; sıra panodaki sıradır.
 *
 * - Toplanabilenler (sayı, süre, girdi sayısı): karşılaştırma, sıralama,
 *   tahmin, en yoğun gün — "ne kadar" sorusu.
 * - Ortalaması alınanlar (skala, evet/hayır): toplam yok; karşılaştırma
 *   puanla, tahmin ve en yoğun gün yok.
 * - Etiketler (seçenek, metin): "ne kadar" yerine "ne" — en çok
 *   tekrarlanan, hiç seçilmeyen, ilk kez görülen, değişen paylar.
 */
export const INSIGHTS_FOR: Record<InsightKind, InsightKey[]> = {
  count: ["change", "history", "trend", "projection", "peakDay", "weekday", "hours", "rhythm", "streak"],
  number: ["change", "history", "trend", "projection", "extremes", "typical", "peakDay", "top", "weekday", "hours", "rhythm", "streak"],
  duration: ["change", "history", "trend", "projection", "extremes", "typical", "peakDay", "weekday", "hours", "rhythm", "streak"],
  scale: ["change", "history", "trend", "top", "rare", "extremes", "weekday", "hours", "rhythm", "streak"],
  rate: ["change", "history", "trend", "weekday", "hours", "rhythm", "streak"],
  presence: ["top", "fresh", "change", "history", "weekday", "hours", "rhythm", "streak"],
  choice: ["top", "movers", "rare", "fresh", "change", "weekday", "hours", "rhythm", "streak"],
};

/** Hiç seçim yapılmamış yerde açık gelenler — beş civarı, türün özü */
const DEFAULTS: Record<InsightKind, InsightKey[]> = {
  count: ["change", "history", "weekday", "hours", "rhythm"],
  number: ["change", "history", "extremes", "typical", "weekday"],
  duration: ["change", "history", "extremes", "typical", "weekday"],
  scale: ["change", "history", "top", "trend", "weekday"],
  rate: ["change", "history", "streak", "weekday"],
  presence: ["top", "fresh", "change", "rhythm"],
  choice: ["top", "movers", "rare", "fresh", "hours"],
};

/** Düzey ölçüsünde (kilo) toplam anlamsız: tahmin ve en yoğun gün yok */
const NOT_FOR_LEVEL: InsightKey[] = ["projection", "peakDay"];
const LEVEL_DEFAULTS: InsightKey[] = ["change", "trend", "extremes", "typical", "history"];

export type InsightCtx = { level?: boolean };

/** Bu ölçüde sunulan istatistikler (Düzenle menüsü) */
export function insightOptions(kind: InsightKind, ctx: InsightCtx = {}): InsightKey[] {
  const all = INSIGHTS_FOR[kind] ?? INSIGHTS_FOR.number;
  return ctx.level ? all.filter((k) => !NOT_FOR_LEVEL.includes(k)) : all;
}

/**
 * Panoda duranlar — kayıtlı seçim (ölçüye uymayanlar ayıklanır) ya da
 * türün varsayılanı. Sıra her zaman katalog sırası: seçim bir küme.
 */
export function resolveInsights(saved: InsightKey[] | undefined, kind: InsightKind, ctx: InsightCtx = {}): InsightKey[] {
  const opts = insightOptions(kind, ctx);
  const picked = saved ?? (ctx.level && kind === "number" ? LEVEL_DEFAULTS : DEFAULTS[kind] ?? DEFAULTS.number);
  return opts.filter((k) => picked.includes(k));
}

/* ------------------------------------------------------------------ */
/* Karşılaştırma pencereleri                                           */
/* ------------------------------------------------------------------ */

export type Win = { start: number; end: number; label: string };

/** Geçmişe kaç dönem bakılır — sıralama ve "ortalamana göre" bunlardan */
export const HISTORY_COUNT: Record<PeriodKind, number> = {
  day: 14,
  week: 12,
  month: 12,
  year: 5,
  custom: 6,
  all: 6,
};
/** "Tümü"nde karşılaştırma dilimi: 4 hafta */
export const BLOCK_DAYS = 28;

export type ComparisonWindows = {
  /** Bakılan pencere — "Tümü"nde son 4 hafta */
  cur: Win;
  /** Önceki pencereler, yakından uzağa; dönem sürüyorsa her biri AYNI
   *  uzunlukta kırpılmış (ayın 10'unda geçen ayın ilk 10 günü) */
  prev: Win[];
  /** Bir önceki dönemin TAMAMI — tahmindeki "geçen ay" çizgisi */
  prevFull: Win | null;
  /** Dönem sürüyor ve pencereler kırpıldı mı */
  trimmed: boolean;
  /** Önceki pencerelerin okunacağı aralık; "Tümü"nde veri zaten elde (boş) */
  fetchStart: number;
  fetchEnd: number;
  /** Tümü: pencereler dönemin kendi verisinden kesilir */
  blocks: boolean;
};

export function comparisonWindows(period: Period, now: Date = new Date()): ComparisonWindows {
  const nowMs = now.getTime();
  const n = HISTORY_COUNT[period.kind];
  if (period.kind === "all") {
    const end = startOfDayMs(now) + DAY_MS;
    const start = end - BLOCK_DAYS * DAY_MS;
    const prev: Win[] = [];
    for (let i = 1; i <= n; i++) {
      prev.push({
        start: start - i * BLOCK_DAYS * DAY_MS,
        end: start - (i - 1) * BLOCK_DAYS * DAY_MS,
        label: i === 1 ? translate("insights.prev4Weeks") : "",
      });
    }
    return {
      cur: { start, end, label: translate("insights.last4Weeks") },
      prev,
      prevFull: prev[0],
      trimmed: false,
      fetchStart: 0,
      fetchEnd: 0,
      blocks: true,
    };
  }
  const inProgress = nowMs >= period.start && nowMs < period.end;
  const elapsed = nowMs - period.start;
  // Süren dönemin bir öncesi adıyla değil "geçen hafta" diye anılır —
  // "2 Kas – 8 Kas" dar yerde kesiliyordu
  const lastKey = {
    day: "ins.prev.day",
    week: "ins.prev.week",
    month: "ins.prev.month",
    year: "ins.prev.year",
  } as const;
  const prev: Win[] = [];
  let prevFull: Win | null = null;
  let p: Period | null = period;
  for (let i = 0; i < n; i++) {
    p = p ? shiftPeriod(p, -1) : null;
    if (!p) break;
    const label =
      i === 0 && inProgress && period.kind !== "custom" ? translate(lastKey[period.kind]) : periodShortLabel(p, now);
    if (i === 0) prevFull = { start: p.start, end: p.end, label };
    prev.push({ start: p.start, end: inProgress ? Math.min(p.end, p.start + elapsed) : p.end, label });
  }
  return {
    cur: { start: period.start, end: period.end, label: periodShortLabel(period, now) },
    prev,
    prevFull,
    trimmed: inProgress,
    fetchStart: prev.length ? prev[prev.length - 1].start : period.start,
    fetchEnd: period.start,
    blocks: false,
  };
}

/* ------------------------------------------------------------------ */
/* Hesaplar                                                            */
/* ------------------------------------------------------------------ */

/** Bu pencere öncekine göre — toplananlarda yüzde, ortalamalarda puan */
export function compareValues(
  cur: number,
  prev: number,
  { avgLike, rate }: { avgLike: boolean; rate?: boolean }
): { pct: number | null; points: number | null; diff: number } {
  const diff = cur - prev;
  if (avgLike) return { pct: null, points: diff * (rate ? 100 : 1), diff };
  return { pct: prev > 0 ? (diff / prev) * 100 : null, points: null, diff };
}

/** Geçmiş pencereler arasında kaçıncı (1 = en yüksek); eşitler aynı sırada */
export function rankAmong(cur: number, others: number[]): { rank: number; of: number; avg: number; lowest: boolean } {
  const rank = 1 + others.filter((o) => o > cur).length;
  const avg = others.length ? others.reduce((a, b) => a + b, 0) / others.length : 0;
  return { rank, of: others.length + 1, avg, lowest: others.length > 0 && others.every((o) => o > cur) };
}

/**
 * En küçük kareler doğrusu. `rel` eğimin bütün aralık boyunca getirdiği
 * değişimin `ref`e oranı (toplananlarda ortalama, skalada aralığın
 * genişliği) — %5'in altı "yatay".
 */
export function linearTrend(
  pts: { x: number; y: number }[],
  ref?: number
): { slope: number; intercept: number; rel: number; dir: "up" | "down" | "flat" } | null {
  if (pts.length < 4) return null;
  const n = pts.length;
  const mx = pts.reduce((a, p) => a + p.x, 0) / n;
  const my = pts.reduce((a, p) => a + p.y, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (const p of pts) {
    sxy += (p.x - mx) * (p.y - my);
    sxx += (p.x - mx) ** 2;
  }
  if (!sxx) return null;
  const slope = sxy / sxx;
  const span = pts[n - 1].x - pts[0].x;
  const base = Math.abs(ref ?? my);
  const rel = base ? (slope * span) / base : 0;
  const dir = Math.abs(rel) < 0.05 ? "flat" : rel > 0 ? "up" : "down";
  return { slope, intercept: my - slope * mx, rel, dir };
}

/** Dörde bölen noktalar (doğrusal aradeğerleme) — en az 4 değer */
export function quartiles(nums: number[]): { min: number; q1: number; median: number; q3: number; max: number } | null {
  if (nums.length < 4) return null;
  const s = [...nums].sort((a, b) => a - b);
  const at = (q: number) => {
    const pos = (s.length - 1) * q;
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    return s[lo] + (s[hi] - s[lo]) * (pos - lo);
  };
  return { min: s[0], q1: at(0.25), median: at(0.5), q3: at(0.75), max: s[s.length - 1] };
}

/**
 * Değerlerin sayımı, çoktan aza. `fold` verilirse büyük/küçük harf ve
 * boşluk farkı yok sayılır ("kahve" ile "Kahve " bir) — en sık yazılan
 * biçimiyle gösterilir.
 */
export function tally(labels: string[], fold = false): { label: string; count: number }[] {
  const groups = new Map<string, { count: number; forms: Map<string, number> }>();
  for (const raw of labels) {
    const label = fold ? raw.trim() : raw;
    if (!label) continue;
    const key = fold ? label.toLocaleLowerCase() : label;
    const g = groups.get(key) ?? { count: 0, forms: new Map() };
    g.count++;
    g.forms.set(label, (g.forms.get(label) ?? 0) + 1);
    groups.set(key, g);
  }
  return [...groups.values()]
    .map((g) => ({
      label: [...g.forms.entries()].sort((a, b) => b[1] - a[1])[0][0],
      count: g.count,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/** Haftanın günü indeksi — Pazartesi 0 */
export const weekdayIndex = (t: number) => (new Date(t).getDay() + 6) % 7;

/**
 * Haftanın günlerine dağılım (Pzt…Paz).
 * - sum: o günlerin toplamı ÷ aralıktaki o gün sayısı (ayda 4 ya da 5
 *   pazartesi var; düz toplam beşli günü öne çıkarırdı)
 * - avg: o günlerdeki değerlerin ortalaması (skala, evet oranı)
 */
export function weekdayProfile(
  pts: { at: number; v: number }[],
  rangeStart: number,
  rangeEnd: number,
  mode: "sum" | "avg"
): (number | null)[] {
  const sums = Array(7).fill(0);
  const counts = Array(7).fill(0);
  for (const p of pts) {
    if (p.at < rangeStart || p.at >= rangeEnd) continue;
    const i = weekdayIndex(p.at);
    sums[i] += p.v;
    counts[i]++;
  }
  if (mode === "avg") return sums.map((s, i) => (counts[i] ? s / counts[i] : null));
  const days = Array(7).fill(0);
  for (let t = startOfDayMs(new Date(rangeStart)); t < rangeEnd; t = startOfDayMs(new Date(t + DAY_MS * 1.5))) {
    days[weekdayIndex(t)]++;
  }
  return sums.map((s, i) => (days[i] ? s / days[i] : null));
}

export type DayPart = "morning" | "afternoon" | "evening" | "night";
/** Günün bölümleri — sabah 05–12, öğle 12–17, akşam 17–22, gece 22–05 */
export const partOfHour = (h: number): DayPart =>
  h >= 5 && h < 12 ? "morning" : h >= 12 && h < 17 ? "afternoon" : h >= 17 && h < 22 ? "evening" : "night";

/** Girdilerin saatlere dağılımı ve en yoğun bölüm */
export function hourProfile(times: number[]): { hours: number[]; part: DayPart; share: number; peakHour: number } | null {
  if (!times.length) return null;
  const hours = Array(24).fill(0);
  for (const t of times) hours[new Date(t).getHours()]++;
  const parts: Record<DayPart, number> = { morning: 0, afternoon: 0, evening: 0, night: 0 };
  hours.forEach((c, h) => (parts[partOfHour(h)] += c));
  const part = (Object.keys(parts) as DayPart[]).sort((a, b) => parts[b] - parts[a])[0];
  const peakHour = hours.indexOf(Math.max(...hours));
  return { hours, part, share: parts[part] / times.length, peakHour };
}

/**
 * Ritim — kayıtlı günlerin arası. `avgGap` ilk ve son kayıt arasındaki
 * gün ÷ ara sayısı ("2,3 günde bir"), `longestGap` kayıtsız geçen en uzun
 * gün dizisi, `sinceLast` son kayıttan bugüne gün (0 = bugün).
 */
export function rhythmOf(
  dayStarts: number[],
  today: number
): { avgGap: number; longestGap: number; sinceLast: number; activeDays: number } | null {
  const days = [...new Set(dayStarts.map((t) => startOfDayMs(new Date(t))))].sort((a, b) => a - b);
  if (days.length < 2) return null;
  const diff = (a: number, b: number) => Math.round((b - a) / DAY_MS);
  let longestGap = 0;
  for (let i = 1; i < days.length; i++) longestGap = Math.max(longestGap, diff(days[i - 1], days[i]) - 1);
  return {
    avgGap: diff(days[0], days[days.length - 1]) / (days.length - 1),
    longestGap,
    sinceLast: Math.max(0, diff(days[days.length - 1], startOfDayMs(new Date(today)))),
    activeDays: days.length,
  };
}

/** Dağılımda en çok artan ve en çok azalan seçenek */
export function moversOf(
  cur: { choice: string; count: number }[],
  prev: { choice: string; count: number }[]
): { up?: { label: string; cur: number; prev: number }; down?: { label: string; cur: number; prev: number } } {
  const labels = new Set([...cur.map((r) => r.choice), ...prev.map((r) => r.choice)]);
  const c = new Map(cur.map((r) => [r.choice, r.count]));
  const p = new Map(prev.map((r) => [r.choice, r.count]));
  let up: { label: string; cur: number; prev: number } | undefined;
  let down: { label: string; cur: number; prev: number } | undefined;
  for (const label of labels) {
    const a = c.get(label) ?? 0;
    const b = p.get(label) ?? 0;
    if (a > b && (!up || a - b > up.cur - up.prev)) up = { label, cur: a, prev: b };
    if (a < b && (!down || b - a > down.prev - down.cur)) down = { label, cur: a, prev: b };
  }
  return { up, down };
}

/** Geçmişte hiç görülmemiş değerler — büyük/küçük harf farkı yok sayılır */
export function freshLabels(cur: string[], past: string[]): string[] {
  const seen = new Set(past.map((l) => l.trim().toLocaleLowerCase()));
  return tally(cur, true)
    .map((r) => r.label)
    .filter((l) => !seen.has(l.trim().toLocaleLowerCase()));
}

/* ------------------------------------------------------------------ */
/* Biçim                                                               */
/* ------------------------------------------------------------------ */

/** Haftanın günlerinin adları, Pazartesi'den — "Pzt" ya da "Pazartesi" */
export function weekdayNames(width: "short" | "long" = "short"): string[] {
  const f = dateFormatter(intlTag(), { weekday: width });
  // 1 Ocak 2024 Pazartesi
  return Array.from({ length: 7 }, (_, i) => f.format(new Date(2024, 0, 1 + i)));
}

/** "5 Kas Çar" — girdinin ve günün tarihi */
export function fmtInsightDate(t: number): string {
  return dateFormatter(intlTag(), { day: "numeric", month: "short", weekday: "short" }).format(new Date(t));
}
