import {
  Hash,
  ListChecks,
  ToggleLeft,
  Type,
  CalendarClock,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { EntryValueType } from "@/types";

/**
 * Ölçülerin ilkel türleri. Bir ölçü = ilkel tür + yapılandırma
 * (Sayı → birim; Çoktan Seçmeli → isim + seçenekler).
 */
export const MEASURE_KINDS: EntryValueType[] = [
  "number",
  "select",
  "boolean",
  "text",
  "datetime-range",
];

export const MEASURE_KIND_META: Record<
  EntryValueType,
  { icon: LucideIcon; label: string; hint: string }
> = {
  number: {
    icon: Hash,
    label: "Sayı",
    hint: "Sayısal değer ve birim — km, dk, ₺, kcal...",
  },
  select: {
    icon: ListChecks,
    label: "Çoktan Seçmeli",
    hint: "İsim ver, seçenekleri sırala — Evet/Hayır/Belki gibi",
  },
  boolean: {
    icon: ToggleLeft,
    label: "Evet / Hayır",
    hint: "İki durumlu: yapıldı ya da yapılmadı",
  },
  text: {
    icon: Type,
    label: "Metin",
    hint: "Serbest kısa not",
  },
  "datetime-range": {
    icon: CalendarClock,
    label: "Tarih Aralığı",
    hint: "Başlangıç → bitiş (uyku, seyahat...)",
  },
};

export function measureSummary(t: {
  valueType?: EntryValueType;
  unit?: string;
  choices?: string[];
}): string {
  const vt = t.valueType ?? "number";
  if (vt === "number") return t.unit ? `birim: ${t.unit}` : "birimsiz";
  if (vt === "select") return t.choices?.length ? t.choices.join(" · ") : "seçeneksiz";
  return MEASURE_KIND_META[vt].label;
}
