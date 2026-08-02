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

/** Yerel takvim gününü koru — toISOString UTC'ye çevirip günü kaydırır */
function offsetDate(entryDate: string, offset: number): string {
  const d = new Date(entryDate + "T00:00:00");
  d.setDate(d.getDate() + offset);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

const SIDES = {
  start: { label: "Başlangıç", offset: -1, time: "23:00" },
  end: { label: "Bitiş", offset: 0, time: "07:00" },
} as const;

type Side = keyof typeof SIDES;

export function DateTimeRangeInput({
  value,
  onChange,
  entryDate,
  disabled = false,
}: DateTimeRangeInputProps) {
  const parsed = useMemo(() => parseDTR(value), [value]);
  // Çark iki panelin altında, kartın tamamı kadar geniş açılır — panelin
  // içine sıkıştırıldığında sütunlar 80px'e düşüyor ve çark gibi durmuyordu
  const [editing, setEditing] = useState<Side | null>(null);

  const duration = useMemo(
    () => calcDTRDuration(parsed.start, parsed.end),
    [parsed.start, parsed.end]
  );

  function update(key: Side, newVal: string) {
    onChange(stringifyDTR({ ...parsed, [key]: newVal }));
  }

  function openPicker(side: Side) {
    if (disabled) return;
    // Boşken varsayılanla aç: çarkta hemen bir değer dönsün, kullanıcı ondan
    // ayarlasın (boş çark neyin seçili olduğunu göstermiyordu)
    if (!parsed[side]) {
      const cfg = SIDES[side];
      update(side, `${offsetDate(entryDate, cfg.offset)}T${cfg.time}`);
    }
    setEditing((cur) => (cur === side ? null : side));
  }

  const editingValue = editing ? parsed[editing] : "";
  const [editingDate = "", editingTime = ""] = editingValue.split("T");

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="grid grid-cols-2 divide-x divide-border">
        <DateTimePanel
          side="start"
          icon={<Moon className="h-3 w-3" />}
          value={parsed.start}
          onChange={(v) => update("start", v)}
          entryDate={entryDate}
          open={editing === "start"}
          onOpen={() => openPicker("start")}
          disabled={disabled}
        />
        <DateTimePanel
          side="end"
          icon={<Sun className="h-3 w-3" />}
          value={parsed.end}
          onChange={(v) => update("end", v)}
          entryDate={entryDate}
          open={editing === "end"}
          onOpen={() => openPicker("end")}
          disabled={disabled}
        />
      </div>

      {editing && !disabled && (
        <TimeWheel
          key={editing}
          label={`${SIDES[editing].label} saati`}
          time={editingTime}
          onChange={(t) => update(editing, `${editingDate}T${t}`)}
          onClose={() => setEditing(null)}
        />
      )}

      {/* Süre / ipucu satırı */}
      <div className="flex items-center gap-2 border-t border-border/60 bg-muted/10 px-4 py-2.5">
        {duration ? (
          <>
            <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary/50" />
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

function DateTimePanel({
  side,
  icon,
  value,
  onChange,
  entryDate,
  open,
  onOpen,
  disabled = false,
}: {
  side: Side;
  icon: React.ReactNode;
  value: string; // "YYYY-MM-DDTHH:MM" ya da ""
  onChange: (v: string) => void;
  entryDate: string;
  open: boolean;
  onOpen: () => void;
  disabled?: boolean;
}) {
  const cfg = SIDES[side];
  const [datePart = "", timePart = ""] = value.split("T");

  const chips = [-1, 0, 1].map((o) => {
    const d = offsetDate(entryDate, o);
    return { date: d, label: shortDate(d) };
  });

  function selectDate(d: string) {
    onChange(`${d}T${timePart || cfg.time}`);
  }

  const hasValue = !!(datePart && timePart);

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center gap-1.5 text-muted-foreground/50">
        {icon}
        <span className="text-[9px] font-bold uppercase tracking-[0.15em]">
          {cfg.label}
        </span>
      </div>

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

      {/* Saat — dokununca altta çark açılır (native picker kaba) */}
      <button
        type="button"
        disabled={disabled}
        onClick={onOpen}
        aria-label={`${cfg.label} saatini seç`}
        aria-expanded={open}
        className={cn(
          "w-full bg-transparent text-left outline-none",
          "text-[1.85rem] font-bold leading-tight tabular-nums",
          "cursor-pointer transition-colors",
          hasValue ? "text-foreground" : "text-muted-foreground/30",
          open && "text-primary",
          disabled && "cursor-not-allowed opacity-50"
        )}
      >
        {timePart || "--:--"}
      </button>
    </div>
  );
}

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = Array.from({ length: 12 }, (_, i) =>
  String(i * 5).padStart(2, "0")
);

/** Satır yüksekliği ve görünen satır sayısı (tek sayı olmalı — orta bant) */
const ITEM = 34;
const VISIBLE = 5;
const PAD = ITEM * ((VISIBLE - 1) / 2);
/** Üst/alt solma — düz listeyi silindir gibi gösteren asıl numara */
const FADE =
  "linear-gradient(to bottom, transparent, #000 26%, #000 74%, transparent)";

/**
 * Saat çarkı — iki kaydırmalı sütun (saat + dakika, 5 dk adım), kartın tam
 * genişliğinde. Kaydırma yakalamalı (scroll-snap): ortadaki banda gelen değer
 * anında seçilir, onay butonu yok. Native time picker'ın hantal
 * Temizle/İptal/Ayarla penceresinin yerine geçer.
 */
function TimeWheel({
  label,
  time,
  onChange,
  onClose,
}: {
  label: string;
  time: string;
  onChange: (t: string) => void;
  onClose: () => void;
}) {
  const [hour = "", minute = ""] = time.split(":");
  // Kayıtlı dakika 5'in katı değilse (eski kayıt/elle giriş) listeye eklenir
  const minutes = useMemo(() => {
    if (!minute || MINUTES.includes(minute)) return MINUTES;
    return [...MINUTES, minute].sort();
  }, [minute]);

  return (
    <div className="border-t border-border/60 bg-muted/10 px-4 pb-3 pt-2.5">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-muted-foreground/50">
          {label}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full bg-white/8 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-white/12 hover:text-foreground"
        >
          Tamam
        </button>
      </div>

      <div className="relative flex justify-center gap-2">
        {/* Seçim bandı — çarkın okuma penceresi */}
        <div
          className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 rounded-lg bg-primary/10 ring-1 ring-inset ring-primary/25"
          style={{ height: ITEM }}
        />
        <WheelColumn
          values={HOURS}
          value={hour}
          onChange={(v) => onChange(`${v}:${minute || "00"}`)}
          ariaLabel="Saat"
        />
        <span className="self-center text-lg font-bold text-muted-foreground/40">
          :
        </span>
        <WheelColumn
          values={minutes}
          value={minute}
          onChange={(v) => onChange(`${hour || "00"}:${v}`)}
          ariaLabel="Dakika"
        />
      </div>
    </div>
  );
}

function WheelColumn({
  values,
  value,
  onChange,
  ariaLabel,
}: {
  values: string[];
  value: string;
  onChange: (v: string) => void;
  ariaLabel: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const index = Math.max(0, values.indexOf(value));
  // Bu sütunun kendi yazdığı son değer — dışarıdan gelen değişikliği ayırt edip
  // kullanıcı kaydırırken çarkı geri sarmamak için
  const committed = useRef(value);
  const mounted = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!mounted.current) {
      mounted.current = true;
      el.scrollTop = index * ITEM; // açılışta seçiliyi ortala
      committed.current = value;
      return;
    }
    if (committed.current === value) return; // kaydırmanın kendi sonucu
    el.scrollTo({ top: index * ITEM, behavior: "smooth" });
    committed.current = value;
  }, [index, value]);

  function handleScroll() {
    const el = ref.current;
    if (!el) return;
    const i = Math.min(
      values.length - 1,
      Math.max(0, Math.round(el.scrollTop / ITEM))
    );
    const v = values[i];
    if (v === committed.current) return;
    committed.current = v;
    navigator.vibrate?.(4);
    onChange(v);
  }

  return (
    <div
      ref={ref}
      onScroll={handleScroll}
      role="listbox"
      aria-label={ariaLabel}
      tabIndex={0}
      className="no-scrollbar w-16 snap-y snap-mandatory overflow-y-auto overscroll-contain"
      style={{
        height: ITEM * VISIBLE,
        maskImage: FADE,
        WebkitMaskImage: FADE,
      }}
    >
      <div style={{ height: PAD }} />
      {values.map((v) => (
        <button
          key={v}
          type="button"
          role="option"
          aria-selected={v === value}
          onClick={() =>
            ref.current?.scrollTo({
              top: values.indexOf(v) * ITEM,
              behavior: "smooth",
            })
          }
          style={{ height: ITEM }}
          className={cn(
            "flex w-full snap-center items-center justify-center tabular-nums transition-all duration-150",
            v === value
              ? "scale-110 text-base font-bold text-foreground"
              : "text-sm text-muted-foreground/50"
          )}
        >
          {v}
        </button>
      ))}
      <div style={{ height: PAD }} />
    </div>
  );
}
