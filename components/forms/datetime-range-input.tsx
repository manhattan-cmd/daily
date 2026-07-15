"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { SHORT_MONTHS } from "@/lib/analytics";

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
  const [pickerOpen, setPickerOpen] = useState(false);

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

  /** Seçici sütunundan saat/dakika seçimi — eksik parça varsayılandan tamamlanır */
  function pickTime(part: "h" | "m", val: string) {
    const [h = "", m = ""] = timePart.split(":");
    const hh = part === "h" ? val : h || defaultTime.split(":")[0];
    const mm = part === "m" ? val : m || "00";
    selectTime(`${hh}:${mm}`);
    // Dakika seçimi akışı tamamlar; saat seçiminde dakika için açık kalır
    if (part === "m") setPickerOpen(false);
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

      {/* Saat — dokununca özel saat/dakika seçici açılır (native picker kaba) */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setPickerOpen((o) => !o)}
        aria-label={`${label} saatini seç`}
        aria-expanded={pickerOpen}
        className={cn(
          "w-full text-left bg-transparent outline-none",
          "text-[1.85rem] font-bold tabular-nums leading-tight",
          "cursor-pointer transition-colors",
          hasValue ? "text-foreground" : "text-muted-foreground/30",
          pickerOpen && "text-primary",
          disabled && "cursor-not-allowed opacity-50"
        )}
      >
        {timePart || "--:--"}
      </button>

      {pickerOpen && !disabled && (
        <TimeWheel
          hour={timePart.split(":")[0] ?? ""}
          minute={timePart.split(":")[1] ?? ""}
          onPick={pickTime}
        />
      )}
    </div>
  );
}

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = Array.from({ length: 12 }, (_, i) =>
  String(i * 5).padStart(2, "0")
);

/**
 * Kart içi saat seçici — iki kaydırmalı sütun (saat + dakika, 5 dk adım).
 * Native time picker'ın hantal Temizle/İptal/Ayarla penceresinin yerine geçer;
 * seçim anında uygulanır, onay butonu yok. Açılışta seçili değerler ortalanır.
 */
function TimeWheel({
  hour,
  minute,
  onPick,
}: {
  hour: string;
  minute: string;
  onPick: (part: "h" | "m", val: string) => void;
}) {
  // Kayıtlı dakika 5'in katı değilse (eski kayıt/elle giriş) listeye eklenir
  const minutes = useMemo(() => {
    if (!minute || MINUTES.includes(minute)) return MINUTES;
    return [...MINUTES, minute].sort();
  }, [minute]);

  return (
    <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted/30 p-1">
      <WheelColumn values={HOURS} selected={hour} onPick={(v) => onPick("h", v)} />
      <WheelColumn
        values={minutes}
        selected={minute}
        onPick={(v) => onPick("m", v)}
      />
    </div>
  );
}

function WheelColumn({
  values,
  selected,
  onPick,
}: {
  values: string[];
  selected: string;
  onPick: (v: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Açılışta seçili değeri sütunun ortasına getir
  useEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>("[data-selected=true]");
    if (el && ref.current) {
      ref.current.scrollTop =
        el.offsetTop - ref.current.clientHeight / 2 + el.clientHeight / 2;
    }
  }, []);

  return (
    <div
      ref={ref}
      className="h-36 overflow-y-auto overscroll-contain rounded-lg [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {values.map((v) => {
        const isSel = v === selected;
        return (
          <button
            key={v}
            type="button"
            data-selected={isSel}
            onClick={() => onPick(v)}
            className={cn(
              "block w-full rounded-lg py-1.5 text-center text-sm tabular-nums transition-colors",
              isSel
                ? "bg-primary/20 font-bold text-foreground"
                : "text-muted-foreground/60 hover:bg-muted/60 hover:text-foreground"
            )}
          >
            {v}
          </button>
        );
      })}
    </div>
  );
}
