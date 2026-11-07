"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  Moon,
  Sun,
} from "lucide-react";
import { cn, toLocalDateTimeValue, toLocalDateValue } from "@/lib/utils";
import { intlTag, useT, type MessageKey } from "@/lib/i18n";
import { useSkin } from "@/lib/skin";
import {
  colorSkin,
  FIELD_TONES,
  type FieldTone,
  type FieldToneSkin,
} from "@/components/forms/field-tone";

function shortDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  // Etkin dilde ("8 Eki" / "Oct 8") — eskiden ay adı hep İngilizceydi
  return d.toLocaleDateString(intlTag(), { day: "numeric", month: "short" });
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

/**
 * Bir aralığın SAATLERİNİ başka bir güne taşır — yeni uyku girdisi son
 * uykunun saatleriyle dolu gelsin diye. Bitiş girilen güne oturur;
 * başlangıç, eski kayıttaki gün farkı korunarak geriye (23:30'da yatan dün,
 * 00:30'da yatan aynı gün). Fark okunamazsa ya da tuhafsa varsayılan 1 gün.
 */
export function carryDTR(raw: string, entryDate: string): string {
  const { start, end } = parseDTR(raw);
  const [sd = "", st = ""] = (start ?? "").split("T");
  const [ed = "", et = ""] = (end ?? "").split("T");
  if (!st && !et) return "";
  let gap = SIDES.end.offset - SIDES.start.offset;
  if (sd && ed) {
    const d = Math.round(
      (new Date(ed + "T00:00:00").getTime() - new Date(sd + "T00:00:00").getTime()) /
        86400000
    );
    if (Number.isFinite(d) && d >= 0 && d <= 2) gap = d;
  }
  return stringifyDTR({
    start: st ? `${offsetDate(entryDate, -gap)}T${st}` : "",
    end: et ? `${entryDate}T${et}` : "",
  });
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
  tone?: FieldTone;
  /** Sabit ton yerine serbest renk (sıradan girdide kategori rengi). Yalnız
   *  pencerenin kabuğunu ve alt şeridini boyar; içerideki vurgular (seçili
   *  gün kapsülü, çark bandı) uygulamanın ana renginde kalır — kategori
   *  renkleri koyu olabiliyor, seçili kapsülün okunurluğu ona bırakılamaz. */
  color?: string;
}

/** Yerel takvim gününü koru — toISOString UTC'ye çevirip günü kaydırır */
function offsetDate(entryDate: string, offset: number): string {
  const d = new Date(entryDate + "T00:00:00");
  d.setDate(d.getDate() + offset);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Etiketler anahtar olarak durur; dile göre çözümleme render sırasında olur */
const SIDES = {
  start: { labelKey: "datetime.start", offset: -1, time: "23:00" },
  end: { labelKey: "datetime.end", offset: 0, time: "07:00" },
} as const satisfies Record<
  string,
  { labelKey: MessageKey; offset: number; time: string }
>;

type Side = keyof typeof SIDES;

/** Aralığın dakikası — iki uç da girili ve bitiş sonra değilse null */
function rangeMinutes(start: string, end: string): number | null {
  if (!start || !end) return null;
  const diff = new Date(end).getTime() - new Date(start).getTime();
  return diff > 0 ? Math.floor(diff / 60000) : null;
}

/** Bir ucun gününü kaydır — boşsa girdinin gününden ve varsayılan saatten */
function stepped(value: string, side: Side, entryDate: string, delta: number): string {
  const cfg = SIDES[side];
  const [datePart = "", timePart = ""] = value.split("T");
  const base = datePart || offsetDate(entryDate, cfg.offset);
  return `${offsetDate(base, delta)}T${timePart || cfg.time}`;
}

/** Brütal fişlerin künye rengi: yatış gece moru, kalkış gün doğumu */
const BRUT_HEAD: Record<Side, string> = { start: "#b9a6ff", end: "#ffb38a" };

export function DateTimeRangeInput({
  value,
  onChange,
  entryDate,
  disabled = false,
  tone = "default",
  color,
}: DateTimeRangeInputProps) {
  const t = useT();
  const brutal = useSkin() === "brutal";
  const skin = FIELD_TONES[tone];
  const cs = color ? colorSkin(color) : null;
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

  // Brütal: iki fiş (yatış · kalkış) ve altında süre etiketi — bkz. BrutalSide
  if (brutal) {
    const mins = rangeMinutes(parsed.start, parsed.end);
    const h = mins === null ? 0 : Math.floor(mins / 60);
    const m = mins === null ? 0 : mins % 60;
    const durText =
      mins === null
        ? null
        : h === 0
          ? t("sleep.durM", { m })
          : m === 0
            ? t("sleep.durH", { h })
            : t("sleep.durHM", { h, m });
    return (
      <div data-dtr="" className={cn("flex flex-col gap-2.5", disabled && "opacity-50")}>
        <div className="relative grid grid-cols-2 gap-3.5">
          {(["start", "end"] as const).map((side) => (
            <BrutalSide
              key={side}
              side={side}
              value={parsed[side]}
              onChange={(v) => update(side, v)}
              entryDate={entryDate}
              open={editing === side}
              onOpen={() => openPicker(side)}
              disabled={disabled}
            />
          ))}
          {/* İki fişi bağlayan ok — aralığın yönü */}
          <span
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-[41px] z-10 flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-full border-2 border-[#111] bg-white text-[#111]"
          >
            <ArrowRight className="h-3 w-3" strokeWidth={3} />
          </span>
        </div>

        {editing && !disabled && (
          <TimeWheel
            key={editing}
            brutal
            label={t("datetime.sideTime", { side: t(SIDES[editing].labelKey) })}
            time={editingTime}
            onChange={(t) => update(editing, `${editingDate}T${t}`)}
            onClose={() => setEditing(null)}
          />
        )}

        {durText && (
          <span
            data-dtr-duration=""
            className="inline-flex items-center gap-1.5 self-center rounded-lg border-2 border-[#111] bg-[#111] px-2.5 py-1 text-[12.5px] font-black uppercase leading-4 tracking-wide text-white"
          >
            <Clock className="h-3.5 w-3.5" strokeWidth={2.75} />
            {durText}
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn("overflow-hidden rounded-2xl border", !cs && skin.shell)}
      style={{
        borderColor: cs ? cs.shellBorder : skin.shellBorder,
        background: cs ? cs.shellBg : undefined,
      }}
    >
      <div className={cn("grid grid-cols-2 divide-x", skin.divide)}>
        <DateTimePanel
          side="start"
          icon={<Moon className="h-3 w-3" />}
          value={parsed.start}
          onChange={(v) => update("start", v)}
          entryDate={entryDate}
          open={editing === "start"}
          onOpen={() => openPicker("start")}
          disabled={disabled}
          skin={skin}
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
          skin={skin}
        />
      </div>

      {editing && !disabled && (
        <TimeWheel
          key={editing}
          label={t("datetime.sideTime", { side: t(SIDES[editing].labelKey) })}
          time={editingTime}
          onChange={(t) => update(editing, `${editingDate}T${t}`)}
          onClose={() => setEditing(null)}
          skin={skin}
        />
      )}

      {/* Süre satırı — yalnız iki uç da girilince. Boşken duran "başlangıç ve
          bitiş girilince süre hesaplanır" ipucu kullanıcı isteğiyle kalktı. */}
      {duration && (
        <div
          className={cn(
            "flex items-center gap-2 border-t px-4 py-2.5",
            !cs && skin.strip
          )}
          style={{
            borderTopColor: cs ? cs.lineBorder : skin.lineBorder,
            background: cs ? cs.stripBg : undefined,
          }}
        >
          <div
            className={cn("h-1.5 w-1.5 shrink-0 rounded-full", !cs && skin.dot)}
            style={cs ? { background: cs.dot } : undefined}
          />
          <span className="text-xs text-muted-foreground">{duration}</span>
        </div>
      )}
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
  skin,
}: {
  side: Side;
  icon: React.ReactNode;
  value: string; // "YYYY-MM-DDTHH:MM" ya da ""
  onChange: (v: string) => void;
  entryDate: string;
  open: boolean;
  onOpen: () => void;
  disabled?: boolean;
  skin: FieldToneSkin;
}) {
  const t = useT();
  const cfg = SIDES[side];
  const [datePart = "", timePart = ""] = value.split("T");

  /** Gün bir adım ileri/geri — boşsa girdinin gününden başlar */
  const stepDate = (delta: number) => onChange(stepped(value, side, entryDate, delta));

  const hasValue = !!(datePart && timePart);
  const shownDate = datePart || offsetDate(entryDate, cfg.offset);

  /*
   * Kibar düzen: başlık · saat (yumuşak bir kutuda, ince rakam) · gün
   * adımlayıcı. Eskiden kalın, kocaman rakamlar ve yana kayan bir gün
   * kapsülleri şeridi vardı; iki sütun yan yana ağır ve kalabalık duruyordu.
   * Gün çoğu zaman doğru geliyor (başlangıç dün, bitiş bugün) — o yüzden tek
   * satırlık bir "‹ 11 Eyl ›" yeterli.
   */
  return (
    <div className="flex flex-col gap-2 px-2 py-3">
      <div className="flex items-center gap-1.5 px-0.5 text-muted-foreground/60">
        {icon}
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em]">
          {t(cfg.labelKey)}
        </span>
      </div>

      {/* Saat — dokununca altta çark açılır (native picker kaba) */}
      <button
        type="button"
        disabled={disabled}
        onClick={onOpen}
        aria-label={t("datetime.pickSideTime", { side: t(cfg.labelKey) })}
        aria-expanded={open}
        className={cn(
          "w-full rounded-xl bg-[var(--sf-2)] px-3 py-2 text-left outline-none ring-1 ring-inset transition-colors",
          "text-[22px] font-semibold leading-tight tabular-nums tracking-tight",
          hasValue ? "text-foreground" : "text-muted-foreground/35",
          open ? cn("ring-current", skin.open) : "ring-transparent",
          disabled && "cursor-not-allowed opacity-50"
        )}
      >
        {timePart || "--:--"}
      </button>

      {/* Gün — tek satır adımlayıcı */}
      <div
        role="group"
        aria-label={t("datetime.pickDate")}
        className="flex items-center justify-between gap-0.5"
      >
        <button
          type="button"
          disabled={disabled}
          onClick={() => stepDate(-1)}
          aria-label={t("datetime.prevDay")}
          className="flex h-7 w-5 shrink-0 items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-[var(--sf-2)] hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        {/* Tek satır: dar ekranda ay alta düşüyordu */}
        <span
          className={cn(
            "min-w-0 whitespace-nowrap text-[12px] font-medium tabular-nums",
            datePart ? "text-muted-foreground" : "text-muted-foreground/40"
          )}
        >
          {shortDate(shownDate)}
        </span>
        <button
          type="button"
          disabled={disabled}
          onClick={() => stepDate(1)}
          aria-label={t("datetime.nextDay")}
          className="flex h-7 w-5 shrink-0 items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-[var(--sf-2)] hover:text-foreground"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

/**
 * Brütal fiş — aralığın bir ucu. Ana sayfanın kart dili (bkz. entry-block):
 * üstte renkli künye (sembol + Başlangıç/Bitiş), ortada büyük saat, kesikli
 * çizginin altında gün adımlayıcı. Eskiden klasik temanın gri kutusu
 * duruyordu: saat gri zeminde soluk, oklar ince, gün silik — Brütal formun
 * geri kalanından kopuk görünüyordu. Açıkken fiş gölgesine oturur ve saat
 * çarkın bandıyla aynı sarıya döner (hangi ucun ayarlandığı belli olsun).
 */
function BrutalSide({
  side,
  value,
  onChange,
  entryDate,
  open,
  onOpen,
  disabled = false,
}: {
  side: Side;
  value: string;
  onChange: (v: string) => void;
  entryDate: string;
  open: boolean;
  onOpen: () => void;
  disabled?: boolean;
}) {
  const t = useT();
  const cfg = SIDES[side];
  const [datePart = "", timePart = ""] = value.split("T");
  const label = t(cfg.labelKey);
  const Icon = side === "start" ? Moon : Sun;
  const shown = new Date(
    (datePart || offsetDate(entryDate, cfg.offset)) + "T00:00:00"
  ).toLocaleDateString(intlTag(), { day: "numeric", month: "short", weekday: "short" });

  const step = (delta: number) => onChange(stepped(value, side, entryDate, delta));
  const stepBtn =
    "flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-[1.5px] border-[#111] bg-white text-[#111] active:translate-x-px active:translate-y-px disabled:cursor-not-allowed";

  return (
    <div
      data-dtr-side={side}
      className={cn(
        "min-w-0 overflow-hidden rounded-[14px] border-2 border-[#111] bg-white text-[#111] transition-[transform,box-shadow] duration-150",
        open ? "translate-x-[2px] translate-y-[2px] shadow-none" : "shadow-[3px_3px_0_#111]"
      )}
    >
      <div
        className="flex items-center gap-1.5 border-b-2 border-[#111] px-2 py-[3px]"
        style={{ background: BRUT_HEAD[side] }}
      >
        <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={2.6} />
        <span className="truncate text-[10.5px] font-black uppercase leading-4 tracking-[0.08em]">
          {label}
        </span>
      </div>

      {/* Saat — dokununca altta çark açılır */}
      <button
        type="button"
        disabled={disabled}
        onClick={onOpen}
        aria-label={t("datetime.pickSideTime", { side: label })}
        aria-expanded={open}
        className={cn(
          "block w-full py-1.5 text-center text-[30px] font-black leading-[38px] tabular-nums tracking-tight outline-none transition-colors disabled:cursor-not-allowed",
          !timePart && "text-[#111]/25"
        )}
        style={{ background: open ? "#ffd23f" : "#ffffff" }}
      >
        {timePart || "--:--"}
      </button>

      {/* Gün — kesikli çizginin altında, tek satır adımlayıcı */}
      <div
        role="group"
        aria-label={t("datetime.pickDate")}
        className="flex items-center gap-1 border-t-2 border-dashed border-[#111] px-1.5 py-1.5"
      >
        <button
          type="button"
          disabled={disabled}
          onClick={() => step(-1)}
          aria-label={t("datetime.prevDay")}
          className={stepBtn}
        >
          <ChevronLeft className="h-3.5 w-3.5" strokeWidth={3} />
        </button>
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-center text-[12px] font-extrabold leading-4 tabular-nums",
            !datePart && "text-[#111]/40"
          )}
        >
          {shown}
        </span>
        <button
          type="button"
          disabled={disabled}
          onClick={() => step(1)}
          aria-label={t("datetime.nextDay")}
          className={stepBtn}
        >
          <ChevronRight className="h-3.5 w-3.5" strokeWidth={3} />
        </button>
      </div>
    </div>
  );
}

/**
 * Tek tarih+saat alanı — girdi düzenlemedeki t("datetime.title"). Yerini aldığı
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
  const t = useT();
  const [datePart = "", timePart = ""] = value.split("T");
  const [wheelOpen, setWheelOpen] = useState(false);

  const today = toLocalDateValue();
  const relative =
    datePart === today
      ? t("datetime.today")
      : datePart === offsetDate(today, -1)
        ? t("datetime.yesterday")
        : datePart === offsetDate(today, 1)
          ? t("datetime.tomorrow")
          : null;

  const pretty = datePart
    ? new Date(datePart + "T00:00:00").toLocaleDateString(intlTag(), {
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
          label={t("selection.previousDay")}
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
            aria-label={t("datetime.pickDate")}
            onChange={(e) =>
              e.target.value && onChange(`${e.target.value}T${timePart}`)
            }
            className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
          />
        </div>
        <StepButton
          side="right"
          label={t("selection.nextDay")}
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
            className="rounded-full bg-[var(--sf-3)] px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-[var(--sf-4)] hover:text-foreground"
          >
            Şimdi
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => setWheelOpen((o) => !o)}
            aria-label={t("datetime.pickTime")}
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
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground/60 transition-colors hover:bg-[var(--sf-2)] hover:text-foreground disabled:opacity-30"
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
  skin = FIELD_TONES.default,
  brutal = false,
}: {
  label: string;
  time: string;
  onChange: (t: string) => void;
  onClose: () => void;
  /** Uyku aralığında 5 dk yeter; tek girdi saatinde dakika birebir seçilir */
  minuteStep?: 1 | 5;
  skin?: FieldToneSkin;
  /** Brütal fişlerin altında: kendi çerçeveli kartı (bkz. BrutalSide) */
  brutal?: boolean;
}) {
  const [hour = "", minute = ""] = time.split(":");
  // Kayıtlı dakika adıma denk gelmiyorsa (eski kayıt/elle giriş) listeye eklenir
  const minutes = useMemo(() => {
    const base = minuteStep === 1 ? ALL_MINUTES : MINUTES;
    if (!minute || base.includes(minute)) return base;
    return [...base, minute].sort();
  }, [minute, minuteStep]);

  return (
    <div
      data-time-wheel=""
      className={cn(
        "px-4 pb-3 pt-2.5",
        brutal
          ? "rounded-[14px] border-2 border-[#111] bg-white shadow-[3px_3px_0_#111]"
          : cn("border-t", skin.strip)
      )}
      style={brutal ? undefined : { borderTopColor: skin.lineBorder }}
    >
      <div className="mb-1.5 flex items-center justify-between">
        <span
          className={
            brutal
              ? "text-[10.5px] font-black uppercase tracking-[0.08em] text-[#111]"
              : "text-[9px] font-bold uppercase tracking-[0.15em] text-muted-foreground/50"
          }
        >
          {label}
        </span>
        <button
          type="button"
          onClick={onClose}
          className={
            brutal
              ? "rounded-lg border-2 border-[#111] bg-white px-2.5 py-0.5 text-[11px] font-black uppercase text-[#111] shadow-[2px_2px_0_#111] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
              : "rounded-full bg-[var(--sf-3)] px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-[var(--sf-4)] hover:text-foreground"
          }
        >
          Tamam
        </button>
      </div>

      <div className="relative flex justify-center gap-2">
        {/* Seçim bandı — çarkın okuma penceresi. Sütunlar `relative` ile
            bandın üstünde: band konumlu olduğu için yoksa rakamların üstüne
            çiziliyordu (Brütal temada bant siyah dolu, saat hiç görünmüyordu) */}
        <div
          data-wheel-band
          className={cn(
            "pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 rounded-lg ring-1 ring-inset",
            skin.band
          )}
          style={{ height: ITEM }}
        />
        <WheelColumn
          values={HOURS}
          value={hour}
          onChange={(v) => onChange(`${v}:${minute || "00"}`)}
          ariaLabel="Saat"
        />
        <span className="relative self-center text-lg font-bold text-muted-foreground/40">
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

/**
 * Çark döngüsel: liste birkaç kez çoğaltılır, kaydırma dinince görünmeden orta
 * kopyaya geri sarılır. 23'ten sonra 00, 00'dan geriye 23 gelir — düz listede
 * kullanıcı uçlara çarpıp duruyordu, gece saatleri seçmek iki uç arasında
 * gidip gelmek demekti. Tek sayı olsun ki ortada gerçek bir kopya olsun.
 */
const REPEAT = 9;
/** Kaydırma bittiğine karar verme süresi — ivme sönene kadar sarma ertelenir */
const SETTLE_MS = 160;

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
  const len = values.length;
  const items = useMemo(
    () => Array.from({ length: REPEAT * len }, (_, i) => values[i % len]),
    [values, len]
  );
  // Orta kopyanın başı — açılışta ve geri sarmada buraya konumlanılır
  const mid = Math.floor(REPEAT / 2) * len;
  const index = Math.max(0, values.indexOf(value));
  // Bu sütunun kendi yazdığı son değer — dışarıdan gelen değişikliği ayırt edip
  // kullanıcı kaydırırken çarkı geri sarmamak için
  const committed = useRef(value);
  const mounted = useRef(false);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!mounted.current) {
      mounted.current = true;
      el.scrollTop = (mid + index) * ITEM; // açılışta seçiliyi ortala
      committed.current = value;
      return;
    }
    if (committed.current === value) return; // kaydırmanın kendi sonucu
    // Çoğaltılmış listede değer birden çok yerde: en yakın kopyaya git, yoksa
    // çark bir tur atıyor
    const cur = Math.round(el.scrollTop / ITEM);
    const base = Math.floor(cur / len) * len;
    const target = [base - len + index, base + index, base + len + index]
      .filter((i) => i >= 0 && i < items.length)
      .reduce((a, b) => (Math.abs(a - cur) <= Math.abs(b - cur) ? a : b));
    el.scrollTo({ top: target * ITEM, behavior: "smooth" });
    committed.current = value;
  }, [index, value, len, mid, items.length]);

  useEffect(
    () => () => {
      if (settle.current) clearTimeout(settle.current);
    },
    []
  );

  function handleScroll() {
    const el = ref.current;
    if (!el) return;
    const i = Math.min(
      items.length - 1,
      Math.max(0, Math.round(el.scrollTop / ITEM))
    );
    const v = items[i];
    if (v !== committed.current) {
      committed.current = v;
      navigator.vibrate?.(4);
      onChange(v);
    }
    // Kaydırma dinince uçtaki kopyadan ortadakine sessizce dön: aynı değer,
    // aynı görüntü, ama önde ve arkada yeniden yol var. Döngü hissi buradan.
    if (settle.current) clearTimeout(settle.current);
    settle.current = setTimeout(() => {
      const cur = ref.current;
      if (!cur) return;
      const j = Math.round(cur.scrollTop / ITEM);
      if (j >= len && j < items.length - len) return;
      cur.scrollTop = (mid + (((j % len) + len) % len)) * ITEM;
    }, SETTLE_MS);
  }

  return (
    <div
      ref={ref}
      onScroll={handleScroll}
      role="listbox"
      aria-label={ariaLabel}
      tabIndex={0}
      className="no-scrollbar relative w-16 snap-y snap-mandatory overflow-y-auto overscroll-contain"
      style={{
        height: ITEM * VISIBLE,
        maskImage: FADE,
        WebkitMaskImage: FADE,
      }}
    >
      <div style={{ height: PAD }} />
      {items.map((v, i) => (
        <button
          key={i}
          type="button"
          role="option"
          aria-selected={v === value}
          onClick={() => ref.current?.scrollTo({ top: i * ITEM, behavior: "smooth" })}
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
