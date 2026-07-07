/**
 * Analiz sayfası yardımcıları — tarih pencereleri, gün anahtarları, sayı biçimleme.
 * Tüm hesaplar yerel saatte; gün anahtarı YYYY-MM-DD.
 */

import type { EntryType, Mod } from "@/types";

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
