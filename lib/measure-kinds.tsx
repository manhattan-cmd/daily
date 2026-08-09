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
    labelKey: "measure.range",
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
