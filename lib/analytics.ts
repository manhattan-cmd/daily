/**
 * Analiz sayfası yardımcıları — tarih pencereleri, gün anahtarları, sayı biçimleme.
 * Tüm hesaplar yerel saatte; gün anahtarı YYYY-MM-DD.
 */

import type { EntryType, Mod } from "@/types";

export type RangeKey = "bugun" | "hafta" | "7" | "30" | "ay" | "yil" | "tum";

export const RANGE_LABELS: Record<RangeKey, string> = {
  bugun: "Bugün",
  hafta: "Bu Hafta",
  "7": "7 Gün",
  "30": "30 Gün",
  ay: "Bu Ay",
  yil: "Bu Yıl",
  tum: "Tümü",
};

export const isRangeKey = (s: string | null | undefined): s is RangeKey =>
  !!s && s in RANGE_LABELS;

export function startOfDayMs(d: Date): number {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

/** Pazartesi başlangıçlı hafta */
export function weekStartMs(now: Date): number {
  const x = new Date(now);
  x.setHours(0, 0, 0, 0);
  const back = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - back);
  return x.getTime();
}

export function monthStartMs(now: Date): number {
  return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
}

/** Bugün dahil son n günün başlangıcı */
export function lastNDaysStartMs(n: number, now: Date): number {
  const x = new Date(now);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - (n - 1));
  return x.getTime();
}

/** Aralığın başlangıcı; "tum" için 0 döner — çağıran, seriyi ilk girdiye kıstırmalı
 * (bkz. resolveSeriesWindow) */
export function rangeStartMs(range: RangeKey, now: Date): number {
  switch (range) {
    case "bugun":
      return startOfDayMs(now);
    case "hafta":
      return weekStartMs(now);
    case "ay":
      return monthStartMs(now);
    case "yil":
      return new Date(now.getFullYear(), 0, 1).getTime();
    case "tum":
      return 0;
    default:
      return lastNDaysStartMs(Number(range), now);
  }
}

export function dayKey(t: number): string {
  const d = new Date(t);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export const SHORT_MONTHS = [
  "Oca", "Şub", "Mar", "Nis", "May", "Haz",
  "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara",
];

export const FULL_MONTHS = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

export type DayBucket = {
  key: string;
  /** Kısa eksen etiketi: 6 Tem */
  label: string;
  /** Ayın ilk günü / aralığın ilk kovası için ay adı da eklenir, diğerleri sade gün numarası */
  axisLabel: string;
  /** Eksen etiketinin altındaki ikinci satır (örn. haftanın tarih aralığı) */
  axisSub?: string;
  /** Tooltip'teki uzun etiket: 29 Haziran Pzt */
  full: string;
  value: number;
  /** Kovanın dönem sayfası anahtarı (d-/w-/m-) — bar tıklamasıyla o dönemin analizine gidilir */
  periodKey?: string;
};

/** Seri grafiğinin kova granülerliği — pencere büyüdükçe kovalar kabalaşır */
export type Granularity = "day" | "week" | "month";

export const GRANULARITY_TITLES: Record<Granularity, string> = {
  day: "Günlük",
  week: "Haftalık",
  month: "Aylık",
};

export function chooseGranularity(startMs: number, endMs: number): Granularity {
  const days = (endMs - startMs) / 86400000;
  if (days <= 35) return "day";
  if (days <= 200) return "week";
  return "month";
}

/** Bir anın ait olduğu kovanın anahtarı — buildSeriesBuckets'ın key'leriyle eşleşir */
export function bucketKeyOf(t: number, g: Granularity): string {
  if (g === "day") return dayKey(t);
  if (g === "week") return dayKey(weekStartMs(new Date(t)));
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** [startMs, endMs) penceresini granülerliğe göre boş kovalara böler; her kova
 * kendi dönem sayfası anahtarını (periodKey) taşır */
export function buildSeriesBuckets(
  startMs: number,
  endMs: number,
  g: Granularity
): DayBucket[] {
  const out: DayBucket[] = [];
  const first = new Date(startMs);
  let cur =
    g === "day"
      ? startOfDayMs(first)
      : g === "week"
        ? weekStartMs(first)
        : new Date(first.getFullYear(), first.getMonth(), 1).getTime();
  let lastMonth = -1;
  let lastYear = -1;
  let guard = 0;
  while (cur < endMs && guard++ < 1000) {
    const d = new Date(cur);
    let next: number;
    if (g === "month") {
      next = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
    } else {
      // DST kaymalarına karşı günü normalize et
      const nd = new Date(cur);
      nd.setDate(nd.getDate() + (g === "week" ? 7 : 1));
      nd.setHours(0, 0, 0, 0);
      next = nd.getTime();
    }
    const key = bucketKeyOf(cur, g);

    if (g === "month") {
      // Yıl değiştiğinde eksene kısa yıl eklenir: Oca 26
      const axisLabel =
        d.getFullYear() !== lastYear
          ? `${SHORT_MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`
          : SHORT_MONTHS[d.getMonth()];
      lastYear = d.getFullYear();
      out.push({
        key,
        label: `${SHORT_MONTHS[d.getMonth()]} ${d.getFullYear()}`,
        axisLabel,
        full: d.toLocaleDateString("tr-TR", { month: "long", year: "numeric" }),
        value: 0,
        periodKey: `m-${key}`,
      });
    } else {
      const label = `${d.getDate()} ${SHORT_MONTHS[d.getMonth()]}`;
      // Ay değiştiğinde eksende ay adı, aynı ay içinde sade gün numarası (kalabalığı azaltır)
      const axisLabel = d.getMonth() !== lastMonth ? label : `${d.getDate()}`;
      lastMonth = d.getMonth();
      if (g === "week") {
        const lastDay = new Date(cur);
        lastDay.setDate(lastDay.getDate() + 6);
        out.push({
          key,
          label,
          axisLabel,
          full: `${d.getDate()} ${SHORT_MONTHS[d.getMonth()]} – ${lastDay.getDate()} ${SHORT_MONTHS[lastDay.getMonth()]}`,
          value: 0,
          periodKey: `w-${key}`,
        });
      } else {
        out.push({
          key,
          label,
          axisLabel,
          full: d.toLocaleDateString("tr-TR", {
            day: "numeric",
            month: "long",
            weekday: "short",
          }),
          value: 0,
          periodKey: `d-${key}`,
        });
      }
    }
    cur = next;
  }
  return out;
}

/**
 * Hafta/ay/yıl dönemlerinde seri tüm dönemi kapsayınca (gelecek kovalar 0'la yer
 * tutar) ekseni sadeleştirir ve grafiğin altına dönem bağlamını veren başlığı üretir:
 * hafta → sade gün numaraları + altta ay adı; ay → "1. Hafta" + altında tarih aralığı
 * + altta ay adı; yıl → 12 ay adı + altta yıl. Kovaları yerinde günceller.
 */
/** Seri grafiğinin eksen/caption çerçevesi — DailyBarChart'a aynen geçirilir */
export type SeriesFrame = { caption: string; showAllTicks?: boolean };

/**
 * Gün kovalı serilerde ekseni sadeleştirir: kovalara sade gün numarası yazılır,
 * ay bağlamı grafiğin altındaki caption'a taşınır ("Temmuz", "Haziran – Temmuz").
 * Kovaları yerinde günceller.
 */
export function frameDailySeries(buckets: DayBucket[]): SeriesFrame {
  const months: string[] = [];
  for (const b of buckets) {
    const [, m, d] = b.key.split("-").map(Number);
    b.axisLabel = String(d);
    const name = FULL_MONTHS[m - 1];
    if (!months.includes(name)) months.push(name);
  }
  return { caption: months.join(" – ") };
}

export function framePeriodSeries(
  kind: "week" | "month" | "year",
  periodStart: number,
  buckets: DayBucket[]
): SeriesFrame {
  if (kind === "week") {
    return { ...frameDailySeries(buckets), showAllTicks: true };
  }
  if (kind === "month") {
    buckets.forEach((b, i) => {
      const [y, m, d] = b.key.split("-").map(Number);
      const s = new Date(y, m - 1, d);
      const e = new Date(y, m - 1, d + 6);
      b.axisLabel = `${i + 1}. Hafta`;
      b.axisSub =
        s.getMonth() === e.getMonth()
          ? `${s.getDate()}–${e.getDate()} ${SHORT_MONTHS[e.getMonth()]}`
          : `${s.getDate()} ${SHORT_MONTHS[s.getMonth()]}–${e.getDate()} ${SHORT_MONTHS[e.getMonth()]}`;
    });
    return {
      caption: FULL_MONTHS[new Date(periodStart).getMonth()],
      showAllTicks: true,
    };
  }
  for (const b of buckets) {
    const [, m] = b.key.split("-").map(Number);
    b.axisLabel = SHORT_MONTHS[m - 1];
  }
  return {
    caption: String(new Date(periodStart).getFullYear()),
    showAllTicks: true,
  };
}

/** Seri penceresini çöz: rangeStart=0 (Tümü) ilk girdiye kıstırılır, granülerlik pencereden seçilir */
export function resolveSeriesWindow(
  rangeStart: number,
  minOccurred: number | undefined,
  now: Date
): { startMs: number; endMs: number; granularity: Granularity } {
  const endMs = now.getTime() + 1;
  const startMs =
    rangeStart > 0
      ? rangeStart
      : startOfDayMs(new Date(minOccurred ?? now.getTime()));
  return { startMs, endMs, granularity: chooseGranularity(startMs, endMs) };
}

/**
 * Aktif günlerden seri hesabı — güncel seri bugün ya da dünden geriye kesintisiz
 * gün sayısı (bugün henüz girdi yoksa dünkü seri "sürüyor" sayılır), rekor seri
 * en uzun ardışık blok. Gün anahtarları YYYY-MM-DD (yerel).
 */
export function computeStreaks(
  activeDayKeys: Iterable<string>,
  now: Date = new Date()
): { current: number; best: number } {
  // Yerel gece yarısı ms → gün indeksi; DST kaymaları (±1 saat) yuvarlamayla emilir
  const toIdx = (key: string): number | null => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
    if (!m) return null;
    return Math.round(new Date(+m[1], +m[2] - 1, +m[3]).getTime() / 86400000);
  };
  const days = [...new Set(activeDayKeys)]
    .map(toIdx)
    .filter((d): d is number => d !== null)
    .sort((a, b) => a - b);
  if (!days.length) return { current: 0, best: 0 };

  let best = 1;
  let run = 1;
  for (let i = 1; i < days.length; i++) {
    run = days[i] === days[i - 1] + 1 ? run + 1 : 1;
    if (run > best) best = run;
  }

  const todayIdx = Math.round(startOfDayMs(now) / 86400000);
  const lastIdx = days[days.length - 1];
  let current = 0;
  if (lastIdx === todayIdx || lastIdx === todayIdx - 1) {
    current = 1;
    for (let i = days.length - 2; i >= 0; i--) {
      if (days[i] === days[i + 1] - 1) current++;
      else break;
    }
  }
  return { current, best };
}

/** tr-TR sayı biçimi; büyük sayılar kompakt (12,9 B) */
export function fmtNum(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 10000) {
    return n.toLocaleString("tr-TR", {
      notation: "compact",
      maximumFractionDigits: 1,
    });
  }
  return n.toLocaleString("tr-TR", {
    maximumFractionDigits: abs >= 100 ? 0 : 1,
  });
}

export function parseNumeric(value: string): number {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

/** "datetime-range" moduna ait JSON değerinden süreyi saat cinsinden çıkarır */
export function dtrDurationHours(raw: string): number {
  if (!raw) return 0;
  try {
    const { start, end } = JSON.parse(raw) as { start?: string; end?: string };
    if (!start || !end) return 0;
    const diff = new Date(end).getTime() - new Date(start).getTime();
    return diff > 0 ? diff / 3600000 : 0;
  } catch {
    return 0;
  }
}

/** Seçeneklerin tamamı sayısal mı (1–5 Skala gibi) — ortalama alınabilir modlar */
export function isNumericChoiceSet(choices?: string[]): boolean {
  return (
    !!choices?.length &&
    choices.every((c) => c.trim() !== "" && Number.isFinite(parseFloat(c)))
  );
}

/** Girdi listesinde tek satırlık tarih+saat: "7 Tem · 14:20" */
export function fmtEntryDateTime(t: number): string {
  const d = new Date(t);
  const date = `${d.getDate()} ${SHORT_MONTHS[d.getMonth()]}`;
  const time = d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  return `${date} · ${time}`;
}

/**
 * id'den başlayıp parentId zincirini tırmanır.
 * stopId verilmezse en tepedeki (parentId'siz) ataya kadar çıkar — kategori kırılımında kullanılır.
 * stopId verilirse stopId'nin doğrudan çocuğunda durur (ya da id'nin kendisi stopId ise onu döner)
 * — alt kategori kırılımında kullanılır (kendi ağacının bir kademe altını gruplar).
 */
export function bucketAncestorId(
  id: string,
  subById: Map<string, { id: string; parentId?: string }>,
  stopId?: string
): string | undefined {
  if (stopId !== undefined && id === stopId) return stopId;
  let cur = subById.get(id);
  if (!cur) return undefined;
  let hops = 0;
  while (hops < 20) {
    const atBoundary =
      stopId !== undefined ? cur.parentId === stopId : !cur.parentId;
    if (atBoundary) return cur.id;
    if (!cur.parentId) return cur.id;
    const parent = subById.get(cur.parentId);
    if (!parent) return cur.id;
    cur = parent;
    hops++;
  }
  return cur.id;
}

/** number (para, miktar...) ve duration (tarih-saat aralığı) → toplam + ortalama;
 * scale (sayısal skala, örn. 1–5 puanlama) → yalnızca ortalama, toplamak anlamsız */
export type ModKind = "number" | "duration" | "scale";
export type NumericMod = { id: string; name: string; unit: string; kind: ModKind };

/** Seçili metrik: girdi sayısı ya da sayısal bir modun toplamı/ortalaması */
export type Metric = { type: "count" } | { type: "mod"; mod: NumericMod };

/** scale modlarda toplamın hiç anlamı yok (örn. 5 günün puanları toplanmaz); diğerlerinde ikisi de faydalı */
export type DisplayMode = "avg" | "both";
export const displayModeOf = (kind: ModKind): DisplayMode =>
  kind === "scale" ? "avg" : "both";

export function sumOrAvg(values: number[], kind: ModKind): number {
  if (!values.length) return 0;
  const total = values.reduce((a, b) => a + b, 0);
  return kind === "scale" ? total / values.length : total;
}

export function average(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

/** KPI kutucuklarında ikinci satırda gösterilecek etiket — hangi rakamın ne olduğunu netleştirir */
export function statSub(
  displayMode: DisplayMode,
  avgValue: number | undefined,
  unit: string
): string | undefined {
  if (displayMode === "avg") return "Ortalama";
  if (avgValue !== undefined) {
    return `Ort. ${fmtNum(avgValue)}${unit ? ` ${unit}` : ""}`;
  }
  return undefined;
}

/** Bir Mod + ölçüsünü (EntryType) sayısal metrik adayına sınıflandırır; ölçülemezse null */
export function classifyNumericMod(
  mod: Mod,
  type: EntryType | undefined
): NumericMod | null {
  const vt = type?.valueType ?? "number";
  if (vt === "number") {
    return { id: mod.id, name: mod.name, unit: type?.unit ?? "", kind: "number" };
  }
  if (vt === "datetime-range") {
    return { id: mod.id, name: mod.name, unit: "sa", kind: "duration" };
  }
  if (vt === "select" && isNumericChoiceSet(type?.choices)) {
    return { id: mod.id, name: mod.name, unit: "", kind: "scale" };
  }
  return null;
}
