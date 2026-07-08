"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarRange } from "lucide-react";
import { dayKey } from "@/lib/analytics";
import {
  customPeriod,
  dayPeriod,
  monthPeriod,
  weekPeriod,
  yearPeriod,
} from "@/lib/period";

/** yyyy-mm-dd inputunu yerel Date'e çevir (Date.parse UTC varsayar, kullanma) */
function parseInputDate(v: string): Date | null {
  const [y, m, d] = v.split("-").map(Number);
  if (!y || !m || !d) return null;
  const date = new Date(y, m - 1, d);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Özel dönem seçici — hızlı kısayollar (dün, geçen hafta...) ya da serbest
 * tarih aralığıyla /analytics/period/[key] dönem analiz sayfasına gider.
 */
export function PeriodJump() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const now = Date.now();
  const [startStr, setStartStr] = useState(() => dayKey(now - 6 * 86400000));
  const [endStr, setEndStr] = useState(() => dayKey(now));

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const go = (key: string) => {
    setOpen(false);
    router.push(`/analytics/period/${key}`);
  };

  const d = new Date(now);
  const quick: { label: string; key: string }[] = [
    { label: "Dün", key: dayPeriod(now - 86400000).key },
    { label: "Geçen Hafta", key: weekPeriod(now - 7 * 86400000).key },
    {
      label: "Geçen Ay",
      key: monthPeriod(new Date(d.getFullYear(), d.getMonth() - 1, 1).getTime()).key,
    },
    {
      label: "Geçen Yıl",
      key: yearPeriod(new Date(d.getFullYear() - 1, 0, 1).getTime()).key,
    },
  ];

  const submit = () => {
    const a = parseInputDate(startStr);
    const b = parseInputDate(endStr);
    if (!a || !b) return;
    const [s, e] = a.getTime() <= b.getTime() ? [a, b] : [b, a];
    const key =
      dayKey(s.getTime()) === dayKey(e.getTime())
        ? dayPeriod(s.getTime()).key
        : customPeriod(s.getTime(), e.getTime()).key;
    go(key);
  };

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-3.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <CalendarRange className="h-3.5 w-3.5" />
        Özel
      </button>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-64 rounded-2xl border border-border bg-card p-3 shadow-xl">
          <div className="mb-2 flex flex-wrap gap-1.5">
            {quick.map((q) => (
              <button
                key={q.key}
                type="button"
                onClick={() => go(q.key)}
                className="rounded-lg border border-border bg-muted/50 px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {q.label}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-2">
            <label className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
              Başlangıç
              <input
                type="date"
                value={startStr}
                max={dayKey(now)}
                onChange={(e) => setStartStr(e.target.value)}
                className="rounded-lg border border-border bg-muted/50 px-2 py-1.5 text-xs text-foreground [color-scheme:dark]"
              />
            </label>
            <label className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
              Bitiş
              <input
                type="date"
                value={endStr}
                max={dayKey(now)}
                onChange={(e) => setEndStr(e.target.value)}
                className="rounded-lg border border-border bg-muted/50 px-2 py-1.5 text-xs text-foreground [color-scheme:dark]"
              />
            </label>
            <button
              type="button"
              onClick={submit}
              className="mt-1 rounded-xl bg-primary/15 border border-primary/60 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-primary/25"
            >
              Analiz Et
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
