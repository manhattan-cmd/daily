"use client";

import { useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getMonthDaySummary } from "@/lib/db/queries";
import { cn } from "@/lib/utils";

const MONTHS_TR = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];
const WEEKDAYS = ["Pt", "Sa", "Çr", "Pe", "Cu", "Ct", "Pz"];

export default function CalendarPage() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  const summary = useLiveQuery(
    () => getMonthDaySummary(year, month),
    [year, month]
  );

  function prevMonth() {
    if (month === 0) { setYear((y) => y - 1); setMonth(11); }
    else setMonth((m) => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setYear((y) => y + 1); setMonth(0); }
    else setMonth((m) => m + 1);
  }

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayJS = new Date(year, month, 1).getDay(); // 0=Sun
  const firstDayMon = firstDayJS === 0 ? 6 : firstDayJS - 1; // Mon=0

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDayMon; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const isCurrentMonth =
    year === today.getFullYear() && month === today.getMonth();

  function dateStr(day: number) {
    return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  return (
    <div className="flex flex-col pt-10 pb-4">
      {/* Month navigation */}
      <div className="flex items-center justify-between mb-8">
        <button
          onClick={prevMonth}
          className="h-10 w-10 flex items-center justify-center rounded-2xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          aria-label="Önceki ay"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>

        <div className="text-center">
          <h1 className="text-xl font-semibold tracking-tight">
            {MONTHS_TR[month]}
          </h1>
          <p className="text-sm text-muted-foreground tabular-nums">{year}</p>
        </div>

        <button
          onClick={nextMonth}
          className="h-10 w-10 flex items-center justify-center rounded-2xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          aria-label="Sonraki ay"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 mb-1">
        {WEEKDAYS.map((d) => (
          <div
            key={d}
            className="flex items-center justify-center py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-y-1">
        {cells.map((day, i) => {
          if (!day) return <div key={`e-${i}`} className="aspect-square" />;

          const isToday = isCurrentMonth && day === today.getDate();
          const info = summary?.get(day);
          const colors = info?.colors ?? [];
          const hasEntries = !!info;

          return (
            <Link
              key={day}
              href={`/calendar/${dateStr(day)}`}
              aria-label={
                hasEntries
                  ? `${day} ${MONTHS_TR[month]} · ${info!.count} girdi`
                  : `${day} ${MONTHS_TR[month]}`
              }
              className={cn(
                "relative flex aspect-square flex-col items-center justify-center rounded-2xl transition-all active:scale-95",
                isToday
                  ? "bg-foreground text-background"
                  : hasEntries
                    ? "bg-white/[0.04] hover:bg-white/[0.08]"
                    : "hover:bg-muted/60"
              )}
            >
              <span
                className={cn(
                  "text-sm leading-none",
                  isToday
                    ? "font-semibold text-background"
                    : hasEntries
                      ? "font-medium text-foreground"
                      : "text-muted-foreground/40"
                )}
              >
                {day}
              </span>

              {/* O gün dokunulan kategorilerin renkleri — en çok girdisi olan başta */}
              {colors.length > 0 && (
                <span className="absolute bottom-[5px] flex items-center gap-[3px]">
                  {colors.map((c, ci) => (
                    <span
                      key={ci}
                      className="h-[4px] w-[4px] rounded-full"
                      style={{
                        backgroundColor: c,
                        // Beyaz "bugün" zemininde açık renkler kaybolmasın
                        boxShadow: isToday ? `0 0 0 0.5px ${c}` : undefined,
                      }}
                    />
                  ))}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
