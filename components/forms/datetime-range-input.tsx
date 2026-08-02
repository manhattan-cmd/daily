"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock, Moon, Sun } from "lucide-react";
import { cn, toLocalDateTimeValue, toLocalDateValue } from "@/lib/utils";
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

/**
 * Tek tarih+saat alanı — girdi düzenlemedeki "Tarih & Saat". Yerini aldığı
 * `<input type="datetime-local">` hem çirkindi hem de tarayıcının hantal
 * penceresini açıyordu. Gün ok tuşlarıyla ileri/geri alınır, takvimden
 * seçilebilir, saat aynı çarkla ayarlanır (burada dakika adımı 1).
 */
export function DateTimeInput({
  value,
  onChange,
  disabled = false,
}: {
  value: string; // "YYYY-MM-DDTHH:mm"
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const [datePart = "", timePart = ""] = value.split("T");
  const [wheelOpen, setWheelOpen] = useState(false);

  const today = toLocalDateValue();
  const relative =
    datePart === today
      ? "Bugün"
      : datePart === offsetDate(today, -1)
        ? "Dün"
        : datePart === offsetDate(today, 1)
          ? "Yarın"
          : null;

  const pretty = datePart
    ? new Date(datePart + "T00:00:00").toLocaleDateString("tr-TR", {
        weekday: "long",
        day: "numeric",
        month: "long",
      })
    : "—";

  const shiftDay = (days: number) =>
    onChange(`${offsetDate(datePart, days)}T${timePart}`);

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      {/* Gün — oklarla bir gün ileri/geri, ortadan takvim */}
      <div className="flex items-center gap-1 px-2 py-2">
        <StepButton
          side="left"
          label="Önceki gün"
          disabled={disabled || !datePart}
          onClick={() => shiftDay(-1)}
        />
        <div className="relative min-w-0 flex-1 text-center">
          <div className="flex items-center justify-center gap-1.5">
            <span className="truncate text-sm font-semibold">{pretty}</span>
            {relative && (
              <span className="shrink-0 rounded-full bg-primary/15 px-1.5 py-px text-[10px] font-semibold text-primary">
                {relative}
              </span>
            )}
          </div>
          <span className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-muted-foreground/50">
            <CalendarDays className="h-3 w-3" />
            Takvimden seç
          </span>
          {/* Görünmez native tarih girişi — tüm alan tıklanabilir olsun diye */}
          <input
            type="date"
            value={datePart}
            disabled={disabled}
            aria-label="Tarih seç"
            onChange={(e) =>
              e.target.value && onChange(`${e.target.value}T${timePart}`)
            }
            className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
          />
        </div>
        <StepButton
          side="right"
          label="Sonraki gün"
          disabled={disabled || !datePart}
          onClick={() => shiftDay(1)}
        />
      </div>

      {/* Saat */}
      <div className="flex items-center justify-between border-t border-border/60 px-4 py-2">
        <div className="flex items-center gap-1.5 text-muted-foreground/50">
          <Clock className="h-3 w-3" />
          <span className="text-[9px] font-bold uppercase tracking-[0.15em]">
            Saat
          </span>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange(toLocalDateTimeValue(Date.now()))}
            className="rounded-full bg-white/8 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-white/12 hover:text-foreground"
          >
            Şimdi
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => setWheelOpen((o) => !o)}
            aria-label="Saati seç"
            aria-expanded={wheelOpen}
            className={cn(
              "text-[1.6rem] font-bold leading-none tabular-nums transition-colors",
              timePart ? "text-foreground" : "text-muted-foreground/30",
              wheelOpen && "text-primary",
              disabled && "cursor-not-allowed opacity-50"
            )}
          >
            {timePart || "--:--"}
          </button>
        </div>
      </div>

      {wheelOpen && !disabled && (
        <TimeWheel
          label="Saat"
          time={timePart}
          minuteStep={1}
          onChange={(t) => onChange(`${datePart}T${t}`)}
          onClose={() => setWheelOpen(false)}
        />
      )}
    </div>
  );
}

function StepButton({
  side,
  label,
  disabled,
  onClick,
}: {
  side: "left" | "right";
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground/60 transition-colors hover:bg-white/5 hover:text-foreground disabled:opacity-30"
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = Array.from({ length: 12 }, (_, i) =>
  String(i * 5).padStart(2, "0")
);
const ALL_MINUTES = Array.from({ length: 60 }, (_, i) =>
  String(i).padStart(2, "0")
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
  minuteStep = 5,
}: {
  label: string;
  time: string;
  onChange: (t: string) => void;
  onClose: () => void;
  /** Uyku aralığında 5 dk yeter; tek girdi saatinde dakika birebir seçilir */
  minuteStep?: 1 | 5;
}) {
  const [hour = "", minute = ""] = time.split(":");
  // Kayıtlı dakika adıma denk gelmiyorsa (eski kayıt/elle giriş) listeye eklenir
  const minutes = useMemo(() => {
    const base = minuteStep === 1 ? ALL_MINUTES : MINUTES;
    if (!minute || base.includes(minute)) return base;
    return [...base, minute].sort();
  }, [minute, minuteStep]);

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
