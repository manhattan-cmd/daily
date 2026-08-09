import {
  Hash,
  ListChecks,
  ToggleLeft,
  Type,
  CalendarClock,
  Gauge,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { isScaleChoices, type EntryValueType } from "@/types";
import { translate, type MessageKey } from "@/lib/i18n";

/**
 * Kullanıcıya gösterilen ölçüm türleri. Depolamadan tek farkı "skala":
 * ayrı bir valueType değil, seçenekleri sayı olan bir "select". Analiz bu
 * kuralı zaten tanıyor (toplamaz, ortalar); burada da tek kural çalışsın diye
 * ayrı bir tür icat etmiyoruz, yalnız ayrı gösteriyoruz.
 */
export type MeasureUiKind = EntryValueType | "scale";

export const MEASURE_UI_KINDS: MeasureUiKind[] = [
  "number",
  "scale",
  "boolean",
  "select",
  "datetime-range",
  "text",
];

export function uiKindOf(m: {
  valueType?: EntryValueType;
  choices?: string[];
}): MeasureUiKind {
  const vt = m.valueType ?? "number";
  return vt === "select" && isScaleChoices(m.choices) ? "scale" : vt;
}

/**
 * Skala sınırları. Üst sınır keyfi değil: her basamak girdi ekranında bir
 * düğme, 21'den fazlası telefon ekranında okunmaz bir duvara dönüşüyor.
 * Alt sınır 2 — tek basamaklı skala seçim değil.
 */
export const SCALE_MIN_STEPS = 2;
export const SCALE_MAX_STEPS = 21;

/** min..max arasını basamaklara aç (sınırlar dahil) */
export function scaleChoices(min: number, max: number): string[] {
  const lo = Math.round(min);
  const hi = Math.round(max);
  if (hi <= lo) return [String(lo), String(lo + 1)];
  const capped = Math.min(hi, lo + SCALE_MAX_STEPS - 1);
  return Array.from({ length: capped - lo + 1 }, (_, i) => String(lo + i));
}

/** Kayıtlı basamaklardan aralığı geri oku (düzenlemeye açarken) */
export function scaleRangeOf(choices?: string[]): { min: number; max: number } {
  const nums = (choices ?? []).map(Number).filter(Number.isFinite);
  if (nums.length < 2) return { min: 1, max: 5 };
  return { min: Math.min(...nums), max: Math.max(...nums) };
}

export const MEASURE_KIND_META: Record<
  MeasureUiKind,
  { icon: LucideIcon; labelKey: MessageKey; hintKey: MessageKey }
> = {
  number: { icon: Hash, labelKey: "measure.number", hintKey: "measure.numberHint" },
  scale: { icon: Gauge, labelKey: "measure.scale", hintKey: "measure.scaleHint" },
  boolean: {
    icon: ToggleLeft,
    labelKey: "measure.boolean",
    hintKey: "measure.booleanHint",
  },
  select: {
    icon: ListChecks,
    labelKey: "measure.select",
    hintKey: "measure.selectHint",
  },
  "datetime-range": {
    icon: CalendarClock,
    labelKey: "measure.dateRange",
    hintKey: "measure.rangeHint",
  },
  text: { icon: Type, labelKey: "measure.text", hintKey: "measure.textHint" },
};

/** Özelliğin ölçümünün tek satırlık özeti — "Sayı · dk", "Skala 1–5" */
export function measureSummary(m: {
  valueType?: EntryValueType;
  unit?: string;
  choices?: string[];
}): string {
  const kind = uiKindOf(m);
  const label = translate(MEASURE_KIND_META[kind].labelKey);
  if (kind === "number") return m.unit ? `${label} · ${m.unit}` : label;
  if (kind === "scale") {
    const c = m.choices ?? [];
    return `${label} ${c[0]}–${c[c.length - 1]}`;
  }
  if (kind === "select") return m.choices?.length ? m.choices.join(" · ") : label;
  return label;
}
