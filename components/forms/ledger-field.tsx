"use client";

import { useRef } from "react";
import { Link2, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ScaleInput } from "@/components/ui/scale-input";
import {
  DateTimeRangeInput,
  formatDTRDisplay,
} from "@/components/forms/datetime-range-input";
import type { CategoryModifierWithType } from "@/lib/db/queries";
import { isScaleChoices, type EntryValueType } from "@/types";
import { cn, toLocalDateValue } from "@/lib/utils";
import { useT } from "@/lib/i18n";

/** Alan dolu mu — evet/hayırda yalnız "evet" dolu sayılır (varsayılan "hayır") */
export function isFieldFilled(vt: EntryValueType, value: string): boolean {
  return vt === "boolean" ? value === "true" : value !== "";
}

/** Öneri ızgarasının yuva sayısı — öneri az da olsa hizalar değişmez */
const SUGGEST_SLOTS = 3;

/**
 * AÇIK DEFTER kutusu — girdi formunda bir özelliğin değeri.
 *
 * KURALLAR (her tür için aynı anatomi; yeni bir tür ya da durum bunları
 * bozmasın diye):
 *
 *  1. BAŞLIK satırında yalnız sembol, ad (+ birim) ve kaldır düğmesi. Değer
 *     ya da denetim BAŞLIĞA GİRMEZ — eskiden sayı ve evet/hayır başlığın
 *     sağındaydı; uzun adlı evet/hayır kutusunda ad ezilip kutu taşıyordu.
 *  2. DEĞER her türde başlığın ALTINDA, tam genişlikte bir GİRİŞ YUVASINDA:
 *     koyu zeminli, özelliğin renginde çerçeveli — "buraya yazılır" belli.
 *     Sayı, metin ve evet/hayır yuvası aynı yükseklikte (48 px).
 *  3. ÖNERİLER (son değerler) hep aynı ÜÇ yuvalı ızgarada, solda "Son"
 *     etiketiyle. Tek öneri sağa yaslı yalnız bir çip gibi "eksik", iki
 *     öneri kaymış duruyordu; ızgarada sayı ne olursa olsun hizalar aynı.
 *  4. Seçenekler iki sütunlu ızgara; evet/hayır iki eşit yarı; ölçek tam
 *     genişlikte bölmeli şerit; aralık kendi iki sütunlu seçicisi.
 *  5. RENK: kutu boşken özelliğin renginde hafif, doluyken güçlü; sembol
 *     doluyken dolu renkli daire. Değer o renkte yazılır.
 */
export function LedgerField({
  mod,
  icon: Icon,
  color,
  value,
  onChange,
  recent = [],
  isLocked = false,
  entryDate,
  entryOnly = false,
  onRemove,
  autoFocus = false,
}: {
  mod: CategoryModifierWithType;
  icon: LucideIcon;
  /** Özelliğin rengi */
  color: string;
  value: string;
  onChange: (v: string) => void;
  /** Bu kalemde son girilen değerler — tek dokunuşluk çipler */
  recent?: string[];
  /** Önceki paralel perspektiften gelen, değiştirilemeyen değer */
  isLocked?: boolean;
  entryDate?: string;
  /** Yalnız bu girdiye eklendi (yapıda yok) */
  entryOnly?: boolean;
  /** Yalnız bu girdiden çıkar */
  onRemove?: () => void;
  /** Yeni eklenen özellik: görünüme kaydır, yazı alanını odakla */
  autoFocus?: boolean;
}) {
  const t = useT();
  const vt = mod.entryType.valueType ?? "number";
  const label = mod.name ?? mod.entryType.name;
  const unit = mod.entryType.unit;
  const filled = isFieldFilled(vt, value);
  const scrolled = useRef(false);
  const onMount = (el: HTMLDivElement | null) => {
    if (!el || !autoFocus || scrolled.current) return;
    scrolled.current = true;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    // Seçici pencere kapanırken odak tuzağı autoFocus'u yutuyor
    const input = el.querySelector("input");
    if (input) setTimeout(() => input.focus(), 300);
  };

  /** Giriş yuvası — koyu zemin, özelliğin renginde çerçeve; odakta güçlenir */
  const well =
    "flex h-12 w-full items-center rounded-xl bg-black/25 px-3.5 ring-1 ring-inset transition-shadow focus-within:ring-2";
  const wellStyle = {
    ["--tw-ring-color" as string]: filled ? `${color}b3` : `${color}66`,
  };

  const lockedText =
    vt === "boolean"
      ? value === "true"
        ? t("entry.yes")
        : t("entry.no")
      : vt === "datetime-range"
        ? formatDTRDisplay(value)
        : value
          ? `${value}${unit ? ` ${unit}` : ""}`
          : "—";

  return (
    <div
      ref={onMount}
      data-ledger-field=""
      className="flex flex-col gap-2.5 rounded-2xl p-3 transition-[background-color,box-shadow] duration-300"
      style={
        filled
          ? { background: `${color}24`, boxShadow: `inset 0 0 0 1.5px ${color}8c` }
          : { background: `${color}0f`, boxShadow: `inset 0 0 0 1px ${color}2e` }
      }
    >
      {/* 1 — başlık: sembol, ad, birim, kaldır */}
      <div className="flex min-h-7 items-center gap-2.5">
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors"
          style={filled ? { background: color, color: "#fff" } : { background: `${color}33`, color }}
        >
          <Icon className="h-[15px] w-[15px]" strokeWidth={2.2} />
        </span>
        <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
          {/* Ad kesilmez: uzunsa ikinci satıra iner */}
          <span className="line-clamp-2 break-words text-[14px] font-semibold leading-5">{label}</span>
          {unit && <span className="shrink-0 text-xs text-muted-foreground">{unit}</span>}
        </span>
        {entryOnly && (
          <span
            className="shrink-0 rounded-full px-1.5 text-[10px] font-medium leading-4"
            style={{ background: `${color}24`, color }}
          >
            {t("entry.onlyThisEntry")}
          </span>
        )}
        {onRemove && !isLocked && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={t("entry.removeFromEntry")}
            title={t("entry.removeFromEntry")}
            className="-mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground/50 transition-colors hover:bg-[var(--sf-2)] hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* 2 — değer: başlığın altında, tam genişlik */}
      {isLocked ? (
        <div className={cn(well, "gap-2 text-[15px] font-semibold text-violet-200/90")} style={wellStyle}>
          <Link2 className="h-4 w-4 shrink-0 text-violet-300" />
          <span className="truncate">{lockedText}</span>
        </div>
      ) : vt === "number" ? (
        <label className={cn(well, "cursor-text gap-2")} style={wellStyle}>
          <input
            type="text"
            inputMode="decimal"
            value={value}
            onChange={(e) =>
              onChange(e.target.value.replace(",", ".").replace(/[^0-9.\-]/g, ""))
            }
            placeholder="0"
            aria-label={label}
            className="min-w-0 flex-1 bg-transparent font-mono text-[22px] font-bold outline-none placeholder:text-muted-foreground/35"
            style={filled ? { color } : undefined}
          />
          {unit && (
            <span className="shrink-0 font-mono text-[14px] font-semibold text-muted-foreground">
              {unit}
            </span>
          )}
        </label>
      ) : vt === "boolean" ? (
        <div
          className="grid h-12 grid-cols-2 gap-1 rounded-xl bg-black/25 p-1 ring-1 ring-inset"
          style={wellStyle}
        >
          {[false, true].map((yes) => {
            const on = (value === "true") === yes;
            return (
              <button
                key={String(yes)}
                type="button"
                onClick={() => onChange(yes ? "true" : "false")}
                aria-pressed={on}
                className={cn(
                  "rounded-lg text-[14px] font-bold transition-colors",
                  on
                    ? yes
                      ? "text-white"
                      : "bg-[var(--sf-4)] text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
                style={on && yes ? { background: color } : undefined}
              >
                {yes ? t("entry.yes") : t("entry.no")}
              </button>
            );
          })}
        </div>
      ) : vt === "text" ? (
        <label className={cn(well, "cursor-text")} style={wellStyle}>
          <input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={t("entry.textPlaceholder")}
            aria-label={label}
            className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground/50"
          />
        </label>
      ) : vt === "select" && isScaleChoices(mod.entryType.choices) ? (
        <ScaleInput
          choices={mod.entryType.choices ?? []}
          labels={mod.mod?.scaleLabels}
          value={value}
          onChange={onChange}
          color={color}
        />
      ) : vt === "select" ? (
        <div className="grid grid-cols-2 gap-1.5">
          {(mod.entryType.choices ?? []).map((choice) => {
            const on = value === choice;
            return (
              <button
                key={choice}
                type="button"
                onClick={() => onChange(on ? "" : choice)}
                aria-pressed={on}
                className={cn(
                  "flex h-10 min-w-0 items-center justify-center rounded-xl px-2 text-[13.5px] font-semibold transition-colors",
                  !on && "bg-black/25 text-muted-foreground ring-1 ring-inset hover:text-foreground"
                )}
                style={
                  on
                    ? { background: color, color: "#fff" }
                    : { ["--tw-ring-color" as string]: `${color}40` }
                }
              >
                <span className="truncate">{choice}</span>
              </button>
            );
          })}
        </div>
      ) : vt === "datetime-range" ? (
        <DateTimeRangeInput
          value={value}
          onChange={onChange}
          entryDate={entryDate ?? toLocalDateValue()}
        />
      ) : null}

      {/* 3 — öneriler: hep üç yuvalı ızgara */}
      {!isLocked && vt === "number" && recent.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="w-7 shrink-0 text-[11px] font-semibold text-muted-foreground">
            {t("entry.recentShort")}
          </span>
          <div className="grid min-w-0 flex-1 grid-cols-3 gap-1.5">
            {recent.slice(0, SUGGEST_SLOTS).map((r) => {
              const on = value === r;
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => onChange(on ? "" : r)}
                  className="flex h-8 min-w-0 items-center justify-center rounded-lg px-1 font-mono text-[12.5px] font-semibold transition-colors"
                  style={
                    on
                      ? { background: color, color: "#fff" }
                      : { background: `${color}1a`, color, boxShadow: `inset 0 0 0 1px ${color}38` }
                  }
                >
                  <span className="truncate">{r}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
