"use client";

import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { isChoiceMod, type Metric, type MetricMod } from "@/lib/analytics";
import { metricOf } from "./use-category-metrics";
import { ChipRow } from "./chip-row";

/**
 * Metrik seçici satırı — modlar önce, "Girdi" (sayım) en sonda.
 * Varsayılan seçim ilk moddur (bkz. useCategoryMetrics).
 *
 * countFirst: "Girdi" başta. Dönem analizinin kategori detayı böyle açılıyor —
 * kategoriye ilk bakışta "hangi kaleme ne kadar girmişim" görülsün, özelliğin
 * ayrıntısına sonra inilsin.
 *
 * asRow: tek sıra, yatay kaydırılan renkli satır (ChipRow) — neye bakıldığı
 * satırın renginden de okunur. Özellikler kendi renginde (colorOfMod),
 * "Girdi" kategorinin renginde.
 */
export function MetricChips({
  mods,
  metric,
  color,
  onChange,
  countFirst = false,
  asRow = false,
  colorOfMod,
}: {
  mods: MetricMod[];
  metric: Metric;
  color: string;
  onChange: (m: Metric) => void;
  countFirst?: boolean;
  asRow?: boolean;
  /** Kapsül rengi — verilmezse hepsi `color` */
  colorOfMod?: (id: string) => string;
}) {
  const t = useT();
  const count = {
    key: "__count__",
    label: t("list.entry"),
    active: metric.type === "count",
    color,
    pick: (): Metric => ({ type: "count" }),
  };
  const modChips = mods.map((m) => ({
    key: m.id,
    label: !isChoiceMod(m) && m.unit ? `${m.name} (${m.unit})` : m.name,
    active: metric.type !== "count" && metric.mod.id === m.id,
    color: colorOfMod?.(m.id) ?? color,
    pick: () => metricOf(m),
  }));
  const chips = countFirst ? [count, ...modChips] : [...modChips, count];
  if (asRow) {
    return (
      <ChipRow
        items={chips.map((c) => ({
          key: c.key,
          label: c.label,
          color: c.color,
          active: c.active,
          onPick: () => onChange(c.pick()),
        }))}
      />
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((c) => (
        <MetricChip
          key={c.key}
          label={c.label}
          active={c.active}
          color={color}
          onTap={() => onChange(c.pick())}
        />
      ))}
    </div>
  );
}

function MetricChip({
  label,
  active,
  color,
  onTap,
}: {
  label: string;
  active: boolean;
  color: string;
  onTap: () => void;
}) {
  return (
    <button
      onClick={onTap}
      className={cn(
        "rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors",
        active
          ? "text-foreground"
          : "border-border bg-card text-muted-foreground hover:text-foreground"
      )}
      style={
        active
          ? { borderColor: `${color}70`, backgroundColor: `${color}18` }
          : undefined
      }
    >
      {label}
    </button>
  );
}
