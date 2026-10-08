"use client";

import { useRef, useState } from "react";
import { ChevronDown, Info, Link2, Search, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ScaleInput, ToggleSwitch } from "@/components/ui/scale-input";
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

/*
 * ── TASARIM STANDARTLARI — eşikler ─────────────────────────────────────
 * Stres verisiyle (38 özellik, 30 seçenekli liste, 14 özellikli kalem,
 * uzun adlar, büyük sayılar) ölçülerek kondu. Yeni bir durum bu
 * sayılarla karşılanır, kutu "duruma göre" yeniden çizilmez.
 */
/** Evet/hayırda anahtarın adın yanında kalabileceği en uzun ad */
const BOOL_INLINE_MAX = 30;
/** Birim giriş yuvasına bu uzunluğa kadar sığar; uzunsa yalnız başlıkta */
const UNIT_IN_WELL_MAX = 6;
/** Bundan çok seçenek "büyük küme": kapalı gelir, açılınca listelenir */
const LARGE_SET = 8;
/** Bundan çok seçenekte açılan listenin başında arama */
const SEARCH_FROM = 12;
/** Öneri çipi yuvası */
const SUGGEST_SLOTS = 3;

/** Sayıyı okunur yaz — 104181.75 → 104.181,75 (yalnız gösterim) */
function fmtNum(v: string): string {
  const n = Number(v);
  if (!Number.isFinite(n) || v.trim() === "") return v;
  return n.toLocaleString("tr-TR", { maximumFractionDigits: 2 });
}

/**
 * Seçenek ızgarasının sütunu ve tam satıra yayılacak seçenekler.
 * Sütun sayısı uzunlukların çoğuna göre (en uzuna göre değil — tek bir
 * "Amerika Birleşik Devletleri" 30 ülkeyi tek sütuna düşürmesin); sütuna
 * sığmayan uzun seçenek bütün satırı alır. Yazı hiç kesilmez.
 */
function optionLayout(choices: string[]) {
  const lens = choices.map((c) => c.length).sort((a, b) => a - b);
  const typical = lens[Math.floor(lens.length * 0.8)] ?? 0;
  const cols = typical <= 7 ? 3 : 2;
  const spanAt = cols === 3 ? 9 : 16;
  return { cols, isWide: (c: string) => c.length > spanAt };
}

/**
 * AÇIK DEFTER kutusu — girdi formunda bir özelliğin değeri.
 *
 * KURALLAR (her tür için aynı anatomi):
 *
 *  0. YAZI KESİLMEZ: ad, seçenek, öneri hiçbir yerde "…" ile kısalmaz;
 *     gereken kadar satıra iner. Yanındaki sembol / anahtar / kaldır adın
 *     ilk satırına hizalanır.
 *  1. BAŞLIK: sembol, ad (+ birim), girdiye özel ise ⓘ, kaldır. Değer
 *     başlığa girmez. "Yalnız bu girdi" rozeti başlığı bozuyordu: yerine
 *     ⓘ — dokununca açıklama kutunun içinde açılır.
 *  2. DEĞER her türde başlığın altında, tam genişlik GİRİŞ YUVASINDA (koyu
 *     zemin, özelliğin renginde çerçeve, 48 px). Birim yuvaya ≤ 6 harfse
 *     girer, uzunsa ("mililitre", "deniz mili") yalnız başlıkta — ikisinde
 *     birden yazmaz.
 *  3. ÖNERİLER (son değerler) üç yuvalı ızgarada, "Son" etiketiyle; uzun
 *     sayılar okunur biçimde (104.181,75) ve gerekirse iki / tek sütun.
 *  4. SEÇENEK: ≤ 8 ise açık ızgara (sütun uzunluğa göre 3/2, uzun seçenek
 *     bütün satır). 8'den çoksa BÜYÜK KÜME: kutu kapalı gelir, yuvada seçili
 *     değer ya da "30 seçenekten seç"; açılınca 12'den çoksa arama, seçince
 *     kendiliğinden kapanır. (30 ülkelik kutu 746 px'ti.)
 *  5. YOĞUN FORM (5+ özellik): zaman aralığı da kapalı gelir, yuvada
 *     "Başlangıç ve bitişi seç" — 150 px'lik seçici formu uzatıyordu.
 *  6. EVET/HAYIR tek istisna: tek satır, anahtar sağda; ad 30 harften
 *     uzunsa anahtar alta iner.
 *  7. METİN uzadıkça yuva da uzar — yazılan hep görünür.
 *  8. RENK: boşken özelliğin renginde hafif, doluyken güçlü.
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
  dense = false,
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
  /** Formda çok özellik var — ağır alanlar kapalı gelir */
  dense?: boolean;
  /** Yalnız bu girdiden çıkar */
  onRemove?: () => void;
  /** Yeni eklenen özellik: görünüme kaydır, yazı alanını odakla */
  autoFocus?: boolean;
}) {
  const t = useT();
  const vt = mod.entryType.valueType ?? "number";
  const label = mod.name ?? mod.entryType.name;
  const unit = mod.entryType.unit;
  const choices = mod.entryType.choices ?? [];
  const filled = isFieldFilled(vt, value);
  const isBool = vt === "boolean";
  const isScale = vt === "select" && isScaleChoices(choices);
  const isOptions = vt === "select" && !isScale;
  const unitInWell = vt === "number" && !!unit && unit.length <= UNIT_IN_WELL_MAX;

  // Kapalı gelebilen alanlar: büyük seçenek kümesi; yoğun formda aralık
  const collapsible =
    (isOptions && choices.length > LARGE_SET) || (vt === "datetime-range" && dense);
  const [open, setOpen] = useState(!collapsible || autoFocus);
  const [query, setQuery] = useState("");
  const [infoOpen, setInfoOpen] = useState(false);

  const scrolled = useRef(false);
  const onMount = (el: HTMLDivElement | null) => {
    if (!el || !autoFocus || scrolled.current) return;
    scrolled.current = true;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    // Seçici pencere kapanırken odak tuzağı autoFocus'u yutuyor
    const input = el.querySelector("input");
    if (input) setTimeout(() => input.focus(), 300);
  };

  /*
   * Evet/hayırda adın uzunluğuna göre yerleşim: kısa ad → anahtar adın
   * yanında (tek satır); uzun ad → ad bütün genişliğe yayılır, anahtar
   * altta sağda.
   */
  const longBool = isBool && label.length > BOOL_INLINE_MAX;
  const toggle = (
    <ToggleSwitch
      checked={value === "true"}
      onChange={(v) => onChange(v ? "true" : "false")}
      color={color}
      label={label}
    />
  );

  /** Giriş yuvası — koyu zemin, özelliğin renginde çerçeve; odakta güçlenir */
  const well =
    "flex min-h-12 w-full items-center rounded-xl bg-black/25 px-3.5 ring-1 ring-inset transition-shadow focus-within:ring-2";
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
          ? `${vt === "number" ? fmtNum(value) : value}${unit ? ` ${unit}` : ""}`
          : "—";

  /** Kapalı alanın yuvası — seçili değer ya da ne seçileceği */
  const summaryWell = (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-expanded={false}
      className={cn(well, "gap-2 py-2.5 text-left")}
      style={wellStyle}
    >
      <span
        className={cn(
          "min-w-0 flex-1 break-words text-[15px] font-semibold leading-5",
          !filled && "font-medium text-muted-foreground/70"
        )}
        style={filled ? { color } : undefined}
      >
        {filled
          ? vt === "datetime-range"
            ? formatDTRDisplay(value)
            : value
          : vt === "datetime-range"
            ? t("entry.pickRange")
            : t("entry.pickFrom", { n: choices.length })}
      </span>
      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
  );

  // Seçenekler — arama süzgeci yalnız büyük kümede
  const shown =
    isOptions && query.trim()
      ? choices.filter((c) =>
          c.toLocaleLowerCase("tr").includes(query.trim().toLocaleLowerCase("tr"))
        )
      : choices;
  const layout = optionLayout(choices);

  // Öneri sütunu: okunur biçimdeki en uzun değere göre
  const sugg = recent.slice(0, SUGGEST_SLOTS).map((r) => ({ raw: r, text: fmtNum(r) }));
  const longest = Math.max(0, ...sugg.map((s) => s.text.length));
  const suggCols = longest <= 5 ? 3 : longest <= 10 ? 2 : 1;

  return (
    <div
      ref={onMount}
      data-ledger-field=""
      className={cn(
        "flex flex-col gap-2.5 rounded-2xl transition-[background-color,box-shadow] duration-300",
        isBool && !isLocked ? "px-3 py-2.5" : "p-3"
      )}
      style={
        filled
          ? { background: `${color}24`, boxShadow: `inset 0 0 0 1.5px ${color}8c` }
          : { background: `${color}0f`, boxShadow: `inset 0 0 0 1px ${color}2e` }
      }
    >
      {/* 1 — başlık */}
      <div
        className={cn("flex min-h-7 items-start gap-2.5", isBool && !isLocked && "cursor-pointer")}
        onClick={isBool && !isLocked ? () => onChange(value === "true" ? "false" : "true") : undefined}
      >
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors"
          style={filled ? { background: color, color: "#fff" } : { background: `${color}33`, color }}
        >
          <Icon className="h-[15px] w-[15px]" strokeWidth={2.2} />
        </span>
        <span className="min-w-0 flex-1 break-words pt-1 text-[14px] font-semibold leading-5 [overflow-wrap:anywhere]">
          {label}
          {unit && !unitInWell && (
            <span className="ml-1.5 text-xs font-normal text-muted-foreground">{unit}</span>
          )}
        </span>
        {entryOnly && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setInfoOpen((o) => !o);
            }}
            aria-label={t("entry.onlyThisEntry")}
            aria-expanded={infoOpen}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-[var(--sf-2)]"
            style={{ color: infoOpen ? color : undefined }}
          >
            <Info className={cn("h-4 w-4", !infoOpen && "text-muted-foreground/70")} />
          </button>
        )}
        {isBool && !isLocked && !longBool && (
          <span onClick={(e) => e.stopPropagation()} className="flex shrink-0">
            {toggle}
          </span>
        )}
        {collapsible && open && !isLocked && (
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setQuery("");
            }}
            aria-label={t("action.close")}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-[var(--sf-2)] hover:text-foreground"
          >
            <ChevronDown className="h-4 w-4 rotate-180" />
          </button>
        )}
        {onRemove && !isLocked && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            aria-label={t("entry.removeFromEntry")}
            title={t("entry.removeFromEntry")}
            className="-mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground/50 transition-colors hover:bg-[var(--sf-2)] hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* ⓘ — girdiye özel özelliğin açıklaması, kutunun içinde */}
      {entryOnly && infoOpen && (
        <p
          className="rounded-xl px-3 py-2 text-[12.5px] leading-[18px]"
          style={{ background: `${color}1f`, color }}
        >
          {t("entry.onlyThisEntryHint")}
        </p>
      )}

      {/* 2 — değer */}
      {isLocked ? (
        <div className={cn(well, "gap-2 py-2.5 text-[15px] font-semibold text-violet-200/90")} style={wellStyle}>
          <Link2 className="h-4 w-4 shrink-0 text-violet-300" />
          <span className="break-words">{lockedText}</span>
        </div>
      ) : collapsible && !open ? (
        summaryWell
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
            className="h-12 min-w-0 flex-1 bg-transparent font-mono text-[22px] font-bold outline-none placeholder:text-muted-foreground/35"
            style={filled ? { color } : undefined}
          />
          {unitInWell && (
            <span className="shrink-0 font-mono text-[14px] font-semibold text-muted-foreground">
              {unit}
            </span>
          )}
        </label>
      ) : isBool ? (
        longBool ? (
          <div
            className="-mt-0.5 flex cursor-pointer items-center justify-end gap-2.5"
            onClick={() => onChange(value === "true" ? "false" : "true")}
          >
            <span className="text-[13px] font-semibold" style={value === "true" ? { color } : undefined}>
              {value === "true" ? t("entry.yes") : t("entry.no")}
            </span>
            <span onClick={(e) => e.stopPropagation()} className="flex">
              {toggle}
            </span>
          </div>
        ) : null
      ) : vt === "text" ? (
        <label className={cn(well, "cursor-text py-3")} style={wellStyle}>
          {/* Yazı uzadıkça yuva da uzar — yazılan hep görünür */}
          <textarea
            rows={1}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={t("entry.textPlaceholder")}
            aria-label={label}
            className="min-h-6 min-w-0 flex-1 resize-none bg-transparent text-[15px] leading-6 outline-none [field-sizing:content] placeholder:text-muted-foreground/50"
          />
        </label>
      ) : isScale ? (
        <ScaleInput
          choices={choices}
          labels={mod.mod?.scaleLabels}
          value={value}
          onChange={onChange}
          color={color}
        />
      ) : isOptions ? (
        <div className="flex flex-col gap-2">
          {choices.length > SEARCH_FROM && (
            <label className={cn(well, "min-h-10 gap-2")} style={wellStyle}>
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("entry.searchOptions", { n: choices.length })}
                aria-label={t("action.search")}
                className="h-10 min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-muted-foreground/50"
              />
            </label>
          )}
          <div
            className="grid gap-1.5 [grid-auto-flow:row_dense]"
            style={{ gridTemplateColumns: `repeat(${layout.cols}, minmax(0, 1fr))` }}
          >
            {shown.map((choice) => {
              const on = value === choice;
              return (
                <button
                  key={choice}
                  type="button"
                  onClick={() => {
                    onChange(on ? "" : choice);
                    // Büyük kümede seçince kutu kapanır, seçilen yuvada okunur
                    if (collapsible && !on) {
                      setOpen(false);
                      setQuery("");
                    }
                  }}
                  aria-pressed={on}
                  className={cn(
                    "flex min-h-10 min-w-0 items-center justify-center rounded-xl px-2.5 py-1.5 text-center text-[13.5px] font-semibold leading-[18px] transition-colors [overflow-wrap:anywhere]",
                    !on && "bg-black/25 text-muted-foreground ring-1 ring-inset hover:text-foreground"
                  )}
                  style={{
                    ...(layout.isWide(choice) ? { gridColumn: "1 / -1" } : null),
                    ...(on
                      ? { background: color, color: "#fff" }
                      : { ["--tw-ring-color" as string]: `${color}40` }),
                  }}
                >
                  {choice}
                </button>
              );
            })}
            {shown.length === 0 && (
              <p className="col-span-full py-2 text-center text-[13px] text-muted-foreground">
                {t("entry.noMatch")}
              </p>
            )}
          </div>
        </div>
      ) : vt === "datetime-range" ? (
        <DateTimeRangeInput
          value={value}
          onChange={onChange}
          entryDate={entryDate ?? toLocalDateValue()}
        />
      ) : null}

      {/* 3 — öneriler */}
      {!isLocked && vt === "number" && sugg.length > 0 && (
        <div className="flex items-start gap-2">
          <span className="w-7 shrink-0 pt-2 text-[11px] font-semibold text-muted-foreground">
            {t("entry.recentShort")}
          </span>
          <div
            className="grid min-w-0 flex-1 gap-1.5"
            style={{ gridTemplateColumns: `repeat(${suggCols}, minmax(0, 1fr))` }}
          >
            {sugg.map(({ raw, text }) => {
              const on = value === raw;
              return (
                <button
                  key={raw}
                  type="button"
                  onClick={() => onChange(on ? "" : raw)}
                  className="flex min-h-8 min-w-0 items-center justify-center rounded-lg px-1.5 py-1 font-mono text-[12.5px] font-semibold leading-4 transition-colors [overflow-wrap:anywhere]"
                  style={
                    on
                      ? { background: color, color: "#fff" }
                      : { background: `${color}1a`, color, boxShadow: `inset 0 0 0 1px ${color}38` }
                  }
                >
                  {text}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
