"use client";

import { useMemo } from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

const SHORT_MONTHS = [
  "Oca", "Şub", "Mar", "Nis", "May", "Haz",
  "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara",
];

function shortDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return `${d.getDate()} ${SHORT_MONTHS[d.getMonth()]}`;
}

export function parseDTR(raw: string): { start: string; end: string } {
  if (!raw) return { start: "", end: "" };
  try {
    return JSON.parse(raw);
  } catch {
    return { start: "", end: "" };
  }
}

export function stringifyDTR(v: { start: string; end: string }): string {
  return JSON.stringify(v);
}

export function calcDTRDuration(start: string, end: string): string | null {
  if (!start || !end) return null;
  const diff = new Date(end).getTime() - new Date(start).getTime();
  if (diff <= 0) return null;
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h === 0) return `${m} dakika`;
  if (m === 0) return `${h} saat`;
  return `${h} saat ${m} dakika`;
}

export function formatDTRDisplay(raw: string): string {
  const { start, end } = parseDTR(raw);
  const st = start?.split("T")[1]?.slice(0, 5);
  const et = end?.split("T")[1]?.slice(0, 5);
  if (st && et) return `${st} – ${et}`;
  if (st) return st;
  if (et) return et;
  return "—";
}

interface DateTimeRangeInputProps {
  value: string;
  onChange: (v: string) => void;
  entryDate: string; // "YYYY-MM-DD"
  disabled?: boolean;
}

export function DateTimeRangeInput({
  value,
  onChange,
  entryDate,
  disabled = false,
}: DateTimeRangeInputProps) {
  const parsed = useMemo(() => parseDTR(value), [value]);

  const duration = useMemo(
    () => calcDTRDuration(parsed.start, parsed.end),
    [parsed.start, parsed.end]
  );

  function update(key: "start" | "end", newVal: string) {
    onChange(stringifyDTR({ ...parsed, [key]: newVal }));
  }

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="grid grid-cols-2 divide-x divide-border">
        <DateTimePanel
          label="Başlangıç"
          icon={<Moon className="h-3 w-3" />}
          value={parsed.start}
          onChange={(v) => update("start", v)}
          entryDate={entryDate}
          defaultOffset={-1}
          defaultTime="23:00"
          disabled={disabled}
        />
        <DateTimePanel
          label="Bitiş"
          icon={<Sun className="h-3 w-3" />}
          value={parsed.end}
          onChange={(v) => update("end", v)}
          entryDate={entryDate}
          defaultOffset={0}
          defaultTime="07:00"
          disabled={disabled}
        />
      </div>

      {/* Duration / hint row */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-t border-border/60 bg-muted/10">
        {duration ? (
          <>
            <div className="h-1.5 w-1.5 rounded-full bg-primary/50 shrink-0" />
            <span className="text-xs text-muted-foreground">{duration}</span>
          </>
        ) : (
          <span className="text-xs text-muted-foreground/40">
            Başlangıç ve bitiş girilince süre hesaplanır
          </span>
        )}
      </div>
    </div>
  );
}

interface DateTimePanelProps {
  label: string;
  icon: React.ReactNode;
  value: string; // "YYYY-MM-DDTHH:MM" or ""
  onChange: (v: string) => void;
  entryDate: string;
  defaultOffset: number;
  defaultTime: string;
  disabled?: boolean;
}

function DateTimePanel({
  label,
  icon,
  value,
  onChange,
  entryDate,
  defaultOffset,
  defaultTime,
  disabled = false,
}: DateTimePanelProps) {
  const [datePart = "", timePart = ""] = value.split("T");

  function offsetDate(offset: number): string {
    // Yerel takvim gününü koru — toISOString UTC'ye çevirip günü kaydırır
    const d = new Date(entryDate + "T00:00:00");
    d.setDate(d.getDate() + offset);
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${mm}-${dd}`;
  }

  const chips = [
    { date: offsetDate(-1), label: shortDate(offsetDate(-1)) },
    { date: offsetDate(0), label: shortDate(offsetDate(0)) },
    { date: offsetDate(1), label: shortDate(offsetDate(1)) },
  ];

  function selectDate(d: string) {
    const t = timePart || defaultTime;
    onChange(`${d}T${t}`);
  }

  function selectTime(t: string) {
    if (!t) return;
    const d = datePart || offsetDate(defaultOffset);
    onChange(`${d}T${t}`);
  }

  const hasValue = !!(datePart && timePart);

  return (
    <div className="p-4 flex flex-col gap-3">
      {/* Label */}
      <div className="flex items-center gap-1.5 text-muted-foreground/50">
        {icon}
        <span className="text-[9px] font-bold uppercase tracking-[0.15em]">
          {label}
        </span>
      </div>

      {/* Date chips */}
      <div className="flex gap-1">
        {chips.map((chip) => (
          <button
            key={chip.date}
            type="button"
            disabled={disabled}
            onClick={() => selectDate(chip.date)}
            className={cn(
              "flex-1 rounded-lg py-1 text-[9px] font-semibold tracking-tight transition-all",
              datePart === chip.date
                ? "bg-primary/90 text-white shadow-sm"
                : "bg-muted/40 text-muted-foreground/60 hover:bg-muted hover:text-foreground"
            )}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {/* Time input */}
      <div className="relative">
        <input
          type="time"
          value={timePart}
          disabled={disabled}
          onChange={(e) => selectTime(e.target.value)}
          style={{ colorScheme: "dark" }}
          className={cn(
            "w-full bg-transparent border-none outline-none",
            "text-[1.85rem] font-bold tabular-nums leading-tight",
            "cursor-pointer transition-colors",
            "[&::-webkit-datetime-edit]:leading-none",
            "[&::-webkit-datetime-edit-text]:text-muted-foreground/60",
            "[&::-webkit-calendar-picker-indicator]:opacity-20",
            "[&::-webkit-calendar-picker-indicator]:invert",
            "[&::-webkit-calendar-picker-indicator]:cursor-pointer",
            hasValue ? "text-foreground" : "text-muted-foreground/30",
            disabled && "cursor-not-allowed opacity-50"
          )}
        />
      </div>
    </div>
  );
}
