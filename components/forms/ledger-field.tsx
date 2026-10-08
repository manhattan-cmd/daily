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

/**
 * AÇIK DEFTER satırı — girdi formunda bir özelliğin değeri.
 *
 * Bütün türler aynı kalıpta: solda özelliğin sembolü (kendi renginde küçük
 * daire), adı; sayı ve evet/hayır değeri satırın sağında, ölçek, seçenek,
 * metin ve aralık satırın altında. Satır hiç kapanmaz — eskiden her özellik
 * kapalı geliyordu, açıp "Bitti"ye basmak üç özellikli kalemde 6 dokunuştu.
 *
 * RENK DOLDUKÇA GELİR: boş satır sakin (nötr zemin), değer girilince satır
 * özelliğin kendi renginde hafifçe boyanır ve değer o renkte yazılır. Form
 * ilk açıldığında gökkuşağı değil; dolduran kişi neyi doldurduğunu renkten
 * görür.
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
      className="rounded-2xl px-3 py-2.5 transition-[background-color,box-shadow] duration-300"
      style={
        filled
          ? { background: `${color}24`, boxShadow: `inset 0 0 0 1.5px ${color}8c` }
          : { background: `${color}0f`, boxShadow: `inset 0 0 0 1px ${color}2e` }
      }
    >
      <div className="flex min-h-8 items-center gap-2.5">
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors"
          style={filled ? { background: color, color: "#fff" } : { background: `${color}33`, color }}
        >
          <Icon className="h-[15px] w-[15px]" strokeWidth={2.2} />
        </span>
        <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-1.5">
          <span className="truncate text-[14px] font-semibold leading-5">{label}</span>
          {unit && vt !== "number" && (
            <span className="text-xs text-muted-foreground">{unit}</span>
          )}
          {entryOnly && (
            <span
              className="rounded-full px-1.5 text-[10px] font-medium leading-4"
              style={{ background: `${color}24`, color }}
            >
              {t("entry.onlyThisEntry")}
            </span>
          )}
        </span>

        {isLocked ? (
          <span className="flex shrink-0 items-center gap-1 text-[13px] font-semibold text-violet-300/90">
            <Link2 className="h-3.5 w-3.5" />
            {lockedText}
          </span>
        ) : vt === "number" ? (
          <label className="flex shrink-0 items-baseline gap-1">
            <input
              type="text"
              inputMode="decimal"
              value={value}
              onChange={(e) =>
                onChange(e.target.value.replace(",", ".").replace(/[^0-9.\-]/g, ""))
              }
              placeholder="0"
              aria-label={label}
              className="min-w-[2ch] max-w-[9ch] bg-transparent text-right font-mono text-[22px] font-bold leading-7 outline-none [field-sizing:content] placeholder:text-muted-foreground/35"
              style={filled ? { color } : undefined}
            />
            {unit && (
              <span className="font-mono text-[13px] font-semibold text-muted-foreground">
                {unit}
              </span>
            )}
          </label>
        ) : vt === "boolean" ? (
          <div className="flex shrink-0 rounded-[10px] bg-[var(--sf-2)] p-0.5 ring-1 ring-inset ring-[var(--ln-1)]">
            {[false, true].map((yes) => {
              const on = (value === "true") === yes;
              return (
                <button
                  key={String(yes)}
                  type="button"
                  onClick={() => onChange(yes ? "true" : "false")}
                  aria-pressed={on}
                  className={cn(
                    "h-7 rounded-lg px-3 text-[12px] font-bold transition-colors",
                    on ? (yes ? "text-white" : "bg-[var(--sf-4)] text-foreground") : "text-muted-foreground"
                  )}
                  style={on && yes ? { background: color } : undefined}
                >
                  {yes ? t("entry.yes") : t("entry.no")}
                </button>
              );
            })}
          </div>
        ) : null}

        {onRemove && !isLocked && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={t("entry.removeFromEntry")}
            title={t("entry.removeFromEntry")}
            className="-mr-1.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground/40 transition-colors hover:bg-[var(--sf-2)] hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {!isLocked && vt === "number" && recent.length > 0 && (
        <div className="mt-1.5 flex flex-wrap justify-end gap-1.5">
          {recent.map((r) => {
            const on = value === r;
            return (
              <button
                key={r}
                type="button"
                onClick={() => onChange(on ? "" : r)}
                className="h-7 rounded-full px-2.5 font-mono text-[12px] font-semibold transition-colors"
                style={
                  on
                    ? { background: color, color: "#fff" }
                    : { background: `${color}1a`, color, boxShadow: `inset 0 0 0 1px ${color}38` }
                }
              >
                {r}
                {unit ? ` ${unit}` : ""}
              </button>
            );
          })}
        </div>
      )}

      {!isLocked && vt === "select" && isScaleChoices(mod.entryType.choices) && (
        <div className="mt-2.5">
          <ScaleInput
            choices={mod.entryType.choices ?? []}
            labels={mod.mod?.scaleLabels}
            value={value}
            onChange={onChange}
            color={color}
          />
        </div>
      )}

      {!isLocked && vt === "select" && !isScaleChoices(mod.entryType.choices) && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {(mod.entryType.choices ?? []).map((choice) => {
            const on = value === choice;
            return (
              <button
                key={choice}
                type="button"
                onClick={() => onChange(on ? "" : choice)}
                aria-pressed={on}
                className={cn(
                  "h-8 rounded-full px-3 text-[13px] font-semibold transition-colors",
                  !on && "bg-[var(--sf-2)] text-muted-foreground ring-1 ring-inset ring-[var(--ln-1)] hover:text-foreground"
                )}
                style={on ? { background: color, color: "#fff" } : undefined}
              >
                {choice}
              </button>
            );
          })}
        </div>
      )}

      {!isLocked && vt === "text" && (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t("entry.textPlaceholder")}
          aria-label={label}
          className="mt-2 h-10 w-full rounded-xl bg-[var(--sf-2)] px-3 text-[14px] outline-none ring-1 ring-inset ring-[var(--ln-1)] placeholder:text-muted-foreground/50 focus:ring-2"
          style={{ ["--tw-ring-color" as string]: filled ? `${color}80` : undefined }}
        />
      )}

      {!isLocked && vt === "datetime-range" && (
        <div className="mt-2.5">
          <DateTimeRangeInput
            value={value}
            onChange={onChange}
            entryDate={entryDate ?? toLocalDateValue()}
          />
        </div>
      )}
    </div>
  );
}
