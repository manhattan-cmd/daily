"use client";

import { fmtNum } from "@/lib/analytics";
import { cn } from "@/lib/utils";

export type ShareRow = {
  id: string;
  name: string;
  color: string;
  value: number;
  /** Biçimlenmiş değer (birimli); yoksa fmtNum(value) */
  display?: string;
};

/**
 * Etiketli yatay pay barları — kimlik renkten değil, satırdaki isim + değer +
 * yüzdeden okunur (renk yalnızca süsler; CVD güvenliği için ikincil kodlama şart).
 */
export function ShareBars({
  rows,
  emptyText = "Bu aralıkta veri yok",
  onSelect,
}: {
  rows: ShareRow[];
  emptyText?: string;
  /** Verilirse satırlar tıklanabilir olur (örn. alt kategoriye drill-down) */
  onSelect?: (id: string) => void;
}) {
  const total = rows.reduce((s, r) => s + r.value, 0);
  if (!rows.length || total <= 0) {
    return (
      <p className="py-4 text-center text-xs text-muted-foreground/60">
        {emptyText}
      </p>
    );
  }
  const sorted = [...rows].sort((a, b) => b.value - a.value);

  return (
    <div className="flex flex-col gap-3">
      {sorted.map((r) => {
        const pct = (r.value / total) * 100;
        return (
          <button
            key={r.id}
            type="button"
            onClick={onSelect ? () => onSelect(r.id) : undefined}
            className={cn(
              "min-w-0 text-left",
              onSelect ? "cursor-pointer transition-opacity hover:opacity-70" : "cursor-default"
            )}
          >
            <div className="flex items-baseline gap-1.5 mb-1">
              <span
                className="h-1.5 w-1.5 rounded-full shrink-0 self-center"
                style={{ backgroundColor: r.color }}
              />
              <span className="text-xs font-medium truncate flex-1">
                {r.name}
              </span>
              <span className="text-xs font-semibold shrink-0">
                {r.display ?? fmtNum(r.value)}
              </span>
              <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums w-9 text-right">
                %{pct < 1 ? pct.toFixed(1) : Math.round(pct)}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full transition-[width] duration-300"
                style={{
                  width: `${Math.max(pct, 1.5)}%`,
                  backgroundColor: r.color,
                }}
              />
            </div>
          </button>
        );
      })}
    </div>
  );
}
