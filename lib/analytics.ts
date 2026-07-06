/**
 * Analiz sayfası yardımcıları — tarih pencereleri, gün anahtarları, sayı biçimleme.
 * Tüm hesaplar yerel saatte; gün anahtarı YYYY-MM-DD.
 */

export type RangeKey = "7" | "30" | "ay";

export const RANGE_LABELS: Record<RangeKey, string> = {
  "7": "7 Gün",
  "30": "30 Gün",
  ay: "Bu Ay",
};

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

export function rangeStartMs(range: RangeKey, now: Date): number {
  if (range === "ay") return monthStartMs(now);
  return lastNDaysStartMs(Number(range), now);
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

export type DayBucket = {
  key: string;
  /** Kısa eksen etiketi: 6 Tem */
  label: string;
  /** Ayın ilk günü / aralığın ilk kovası için ay adı da eklenir, diğerleri sade gün numarası */
  axisLabel: string;
  /** Tooltip'teki uzun etiket: 29 Haziran Pzt */
  full: string;
  value: number;
};

/** startMs'ten bugüne (dahil) boş gün kovaları */
export function buildDayBuckets(startMs: number, now: Date): DayBucket[] {
  const out: DayBucket[] = [];
  const end = startOfDayMs(now);
  let lastMonth = -1;
  for (let t = startMs; t <= end; t += 86400000) {
    // DST kaymalarına karşı günü normalize et
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    const key = dayKey(d.getTime());
    if (out.length && out[out.length - 1].key === key) continue;
    const label = `${d.getDate()} ${SHORT_MONTHS[d.getMonth()]}`;
    // Ay değiştiğinde eksende ay adını göster, aynı ay içinde sade gün numarası (kalabalığı azaltır)
    const axisLabel = d.getMonth() !== lastMonth ? label : `${d.getDate()}`;
    lastMonth = d.getMonth();
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
    });
  }
  return out;
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
