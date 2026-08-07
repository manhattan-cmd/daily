"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { RANGE_LABELS, type RangeKey } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import { useT, type MessageKey } from "@/lib/i18n";

const RANGES: RangeKey[] = ["bugun", "hafta", "7", "30", "ay", "yil", "tum"];
const SHORT_KEYS: Record<RangeKey, MessageKey> = {
  bugun: "nav.today",
  hafta: "range.week",
  "7": "range.week",
  "30": "range.month",
  ay: "range.month",
  yil: "range.year",
  tum: "insights.all",
};

/** Kart başlığının köşesine gömülen küçük süre seçici — kartın kendi bağımsız aralığı için */
export function RangePicker({
  value,
  onChange,
}: {
  value: RangeKey;
  onChange: (r: RangeKey) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-0.5 rounded-lg border border-border bg-muted/50 px-2 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        {t(SHORT_KEYS[value])}
        <ChevronDown className="h-3 w-3" />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-24 overflow-hidden rounded-xl border border-border bg-card shadow-xl">
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => {
                onChange(r);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center px-3 py-2 text-xs transition-colors hover:bg-muted",
                value === r ? "font-semibold text-foreground" : "text-muted-foreground"
              )}
            >
              {RANGE_LABELS[r]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
