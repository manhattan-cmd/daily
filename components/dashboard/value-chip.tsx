"use client";

import type { EntryType } from "@/types";
import { cn } from "@/lib/utils";
import { calcDTRDuration, parseDTR } from "@/components/forms/datetime-range-input";

/**
 * Girdi kartlarındaki değer rozeti — tek kaynak. Girdi kartı ve paralel girdi
 * kartı aynı rozeti farklı ölçü/yuvarlaklıkla çiziyordu; aynı listede yan yana
 * durduklarından iki ayrı dil gibi okunuyordu.
 *
 * `color` verilirse zemin kategorinin renginden türer: rozet kartın üstünde
 * yüzen gri bir kutu değil, kartın kendi parçası gibi durur.
 */
export function ValueChip({
  value,
  label,
  entryType,
  color,
}: {
  value: string;
  label: string;
  entryType: EntryType;
  color?: string;
}) {
  const vt = entryType.valueType ?? "number";

  // Renkli zemin: kategori renginin çok düşük opaklıkta örtüsü + ince halka.
  // Renk yoksa nötr gri (yerleşik akışlar, renksiz bağlamlar).
  const tint = color
    ? {
        backgroundColor: `${color}1a`,
        boxShadow: `inset 0 0 0 1px ${color}24`,
      }
    : undefined;
  const baseCls = cn(
    "flex gap-1 rounded-lg px-2 py-1 leading-none",
    !color && "bg-muted/80"
  );

  if (vt === "datetime-range") {
    const { start, end } = parseDTR(value);
    const startTime = start?.split("T")[1]?.slice(0, 5);
    const endTime = end?.split("T")[1]?.slice(0, 5);
    const duration = calcDTRDuration(start, end);
    const shortDuration = duration
      ? duration
          .replace(" saat", "s")
          .replace(" dakika", "dk")
          .replace("s dk", "s")
      : null;

    return (
      <div className={cn(baseCls, "items-center")} style={tint}>
        {startTime && (
          <span className="text-[13px] font-semibold tabular-nums">{startTime}</span>
        )}
        {startTime && endTime && (
          <span className="text-[11px] text-muted-foreground">→</span>
        )}
        {endTime && (
          <span className="text-[13px] font-semibold tabular-nums">{endTime}</span>
        )}
        {shortDuration && (
          <span className="ml-0.5 text-[11px] text-muted-foreground">
            · {shortDuration}
          </span>
        )}
        {!startTime && !endTime && (
          <span className="text-[11px] text-muted-foreground">{label}</span>
        )}
      </div>
    );
  }

  let display = value;
  if (vt === "boolean") display = value === "true" ? "Yes" : "No";

  return (
    <div className={cn(baseCls, "items-baseline")} style={tint}>
      <span className="text-[13px] font-semibold tabular-nums">{display}</span>
      {vt === "number" && entryType.unit && (
        <span className="text-[11px] text-muted-foreground">{entryType.unit}</span>
      )}
      <span className="ml-0.5 text-[11px] text-muted-foreground">{label}</span>
    </div>
  );
}
