"use client";

import { cn } from "@/lib/utils";
import type { Metric, NumericMod } from "@/lib/analytics";

/**
 * Metrik seçici satırı — modlar önce, "Girdi" (sayım) her zaman en sonda.
 * Varsayılan seçim ilk moddur (bkz. useCategoryMetrics).
 */
export function MetricChips({
  numericMods,
  metric,
  color,
  onChange,
}: {
  numericMods: NumericMod[];
  metric: Metric;
  color: string;
  onChange: (m: Metric) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {numericMods.map((m) => (
        <MetricChip
          key={m.id}
          label={m.unit ? `${m.name} (${m.unit})` : m.name}
          active={metric.type === "mod" && metric.mod.id === m.id}
          color={color}
          onTap={() => onChange({ type: "mod", mod: m })}
        />
      ))}
      <MetricChip
        label="Girdi"
        active={metric.type === "count"}
        color={color}
        onTap={() => onChange({ type: "count" })}
      />
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
