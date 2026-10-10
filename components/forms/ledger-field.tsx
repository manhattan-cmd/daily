"use client";

import { useRef, useState } from "react";
import { ChevronDown, Info, Link2, Search, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ToggleSwitch } from "@/components/ui/scale-input";
import { ScaleSlider } from "@/components/ui/scale-slider";
import { SmartText } from "@/components/ui/smart-text";
import {
  DateTimeRangeInput,
  formatDTRDisplay,
} from "@/components/forms/datetime-range-input";
import type { CategoryModifierWithType } from "@/lib/db/queries";
import { isScaleChoices, type EntryValueType } from "@/types";
import { cn, toLocalDateValue } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { useSkin } from "@/lib/skin";

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
/**
 * Evet/hayırda anahtar adın yanında YALNIZ ad tek satıra sığıyorsa durur
 * (~14 harf). Daha uzun ad: ad tam genişlik, anahtar altında.
 */
const BOOL_INLINE_MAX = 14;
/** Özellik adı en fazla bu kadar satır; sonra kelime sonunda "…" + kapsül */
const LABEL_LINES = 2;
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
 * Sütun sayısı uzunlukların çoğuna göre (en uzuna göre değil); sütuna
 * sığmayan uzun seçenek bütün satırı alır.
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
 *  0. YAZININ HİZASINA SİMGE KONMAZ: başlık satırında yalnız özelliğin
 *     sembolü (solda) ve adı. Aç/kapa ve kaldır kutunun SAĞ ÜST KÖŞESİNDE,
 *     yazı hizasının üstünde küçük düğmeler (kutunun üst boşluğu onlar
 *     için açılır — ad satırı daralmaz). Girdiye özel özelliğin açıklaması
 *     SEMBOLE dokununca küçük pencerede; sembolün köşesinde nokta.
 *  1. AD en fazla iki satır; sığmazsa KELİME SONUNDA "…" ve dokununca tam
 *     hâli kapsülde (SmartText). Kelime ortadan bölünmez.
 *  2. DEĞER her türde başlığın altında, tam genişlik GİRİŞ YUVASINDA (koyu
 *     zemin, özelliğin renginde çerçeve, 48 px). Sayının birimi yuvada.
 *  3. ÖNERİLER (son değerler) üç yuvalı ızgarada, "Son" etiketiyle; uzun
 *     sayılar okunur biçimde ve gerekirse iki / tek sütun.
 *  4. SEÇENEK: ≤ 8 ise açık ızgara (sütun uzunluğa göre 3/2, uzun seçenek
 *     bütün satır). 8'den çoksa BÜYÜK KÜME: kapalı gelir; açılınca 12'den
 *     çoksa arama, seçince kendiliğinden kapanır.
 *  5. ÖLÇEK: her basamak sayısında KAYDIRILAN RAY (1–5, −2…+2, 1–10 aynı
 *     görünüm; on bölmeli şerit parmağa dar kalıyordu).
 *  6. YOĞUN FORM (5+ özellik): zaman aralığı da kapalı gelir.
 *  7. EVET/HAYIR tek istisna: kısa ad (tek satır) → anahtar yanında;
 *     uzunsa ad tam genişlik, anahtar altta.
 *  8. METİN uzadıkça yuva da uzar.
 *  9. RENK: boşken özelliğin renginde hafif, doluyken güçlü.
 * 10. KENDİ GİRİŞİ OLAN özellik (ruh halinin yüzleri, duygu ızgarası):
 *     `custom` ile aynı kutunun içine konur — başlık, renk ve çerçeve
 *     yine bu kurallardan.
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
  custom,
  filled: filledProp,
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
  /** Özelliğin kendi girişi — değer yuvasının yerine çizilir */
  custom?: React.ReactNode;
  /** `custom` ile: kutu dolu mu (değer biçimi farklıysa) */
  filled?: boolean;
}) {
  const t = useT();
  // Brütal tema: ad kutunun üst kenarında sekme, evet/hayır iki büyük yarım
  const brutal = useSkin() === "brutal";
  const vt = mod.entryType.valueType ?? "number";
  const label = mod.name ?? mod.entryType.name;
  const unit = mod.entryType.unit;
  const choices = mod.entryType.choices ?? [];
  const filled = filledProp ?? isFieldFilled(vt, value);
  const isBool = vt === "boolean";
  const isScale = vt === "select" && isScaleChoices(choices);
  const isOptions = vt === "select" && !isScale;

  // Kapalı gelebilen alanlar: büyük seçenek kümesi; yoğun formda aralık
  const collapsible =
    !custom &&
    ((isOptions && choices.length > LARGE_SET) || (vt === "datetime-range" && dense));
  const [open, setOpen] = useState(!collapsible || autoFocus);
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

  const scrolled = useRef(false);
  const onMount = (el: HTMLDivElement | null) => {
    if (!el || !autoFocus || scrolled.current) return;
    scrolled.current = true;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    // Seçici pencere kapanırken odak tuzağı autoFocus'u yutuyor
    // Klavye yalnız yazılacak alanda açılsın — seçenek listesinin arama
    // kutusu odaklanınca klavye boş yere açılıyordu (Emotions)
    if (vt !== "number" && vt !== "text") return;
    const input = el.querySelector<HTMLElement>("input, textarea");
    if (input) setTimeout(() => input.focus(), 300);
  };

  const longBool = isBool && label.length > BOOL_INLINE_MAX;
  const flip = () => onChange(value === "true" ? "false" : "true");
  const toggle = (
    <ToggleSwitch
      checked={value === "true"}
      onChange={(v) => onChange(v ? "true" : "false")}
      color={color}
      label={label}
    />
  );
  // Sembolün penceresi yalnız girdiye özel özelliğin açıklaması için
  const hasMenu = !isLocked && entryOnly;
  // Köşe düğmeleri — aç/kapa ve kaldır, kutunun sağ üst köşesinde
  const cornerToggle = collapsible && !isLocked;
  const cornerRemove = !!onRemove && !isLocked;
  const hasCorner = cornerToggle || cornerRemove;

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

  const close = () => {
    setOpen(false);
    setQuery("");
  };

  return (
    <div
      ref={onMount}
      data-ledger-field=""
      data-vt={vt}
      className={cn(
        "relative flex flex-col gap-2.5 rounded-2xl transition-[background-color,box-shadow] duration-300",
        isBool && !isLocked ? "px-3 py-2.5" : "p-3",
        // Köşe düğmeleri yazının biraz üstünde dursun — ad satırı daralmasın
        hasCorner && "pt-[26px]",
        brutal && "mt-3.5 px-3 pb-3 pt-6"
      )}
      style={
        filled
          ? { background: `${color}24`, boxShadow: `inset 0 0 0 1.5px ${color}8c` }
          : { background: `${color}0f`, boxShadow: `inset 0 0 0 1px ${color}2e` }
      }
    >
      {/* Köşe — aç/kapa ve kaldır: sağ üstte, yazı hizasının üstünde */}
      {hasCorner && (
        <div className="absolute right-1.5 top-1 flex items-center gap-0.5">
          {cornerToggle && (
            <button
              type="button"
              onClick={() => (open ? close() : setOpen(true))}
              aria-expanded={open}
              aria-label={open ? t("action.close") : t("entry.expand")}
              className="flex h-[22px] w-[22px] items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-[var(--sf-2)] hover:text-foreground"
            >
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
            </button>
          )}
          {cornerRemove && (
            <button
              type="button"
              onClick={onRemove}
              aria-label={t("entry.removeFromEntry")}
              title={t("entry.removeFromEntry")}
              className="flex h-[22px] w-[22px] items-center justify-center rounded-full text-muted-foreground/60 transition-colors hover:bg-[var(--sf-2)] hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Brütal: ad kutunun üst kenarına oturan renkli sekmede */}
      {brutal && (
        <div
          data-ledger-tab=""
          className="absolute -top-[13px] left-2.5 z-[1] flex max-w-[calc(100%-70px)] items-center gap-1 rounded-lg border-2 border-[#111] px-2 py-px text-[#111]"
          style={{ background: `color-mix(in srgb, ${color} 45%, #ffffff)` }}
        >
          <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={2.6} />
          <SmartText text={label} className="min-w-0 text-[11.5px] font-black uppercase tracking-wide" />
          {entryOnly && <span className="h-2 w-2 shrink-0 rounded-full bg-[#111]" />}
        </div>
      )}

      {/* 0 — başlık: sembol + ad. Hizasında başka simge yok. */}
      {!brutal && (
      <div
        className={cn("flex min-h-7 items-start gap-2.5", isBool && !isLocked && "cursor-pointer")}
        onClick={isBool && !isLocked ? flip : undefined}
      >
        {/* Sembol — dokununca bu özelliğin küçük penceresi (kaldır, açıklama) */}
        <span className="relative flex shrink-0">
          <button
            type="button"
            disabled={!hasMenu}
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((o) => !o);
            }}
            aria-label={label}
            aria-expanded={hasMenu ? menuOpen : undefined}
            className="flex h-7 w-7 items-center justify-center rounded-full transition-[background-color,transform] enabled:active:scale-90"
            style={filled ? { background: color, color: "#fff" } : { background: `${color}33`, color }}
          >
            <Icon className="h-[15px] w-[15px]" strokeWidth={2.2} />
          </button>
          {/* Girdiye özel — sembolün köşesinde nokta, yazının yanında değil */}
          {entryOnly && (
            <span
              aria-hidden
              className="pointer-events-none absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-background"
              style={{ background: color }}
            />
          )}
          {menuOpen && (
            <>
              <span
                className="fixed inset-0 z-40"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(false);
                }}
              />
              <span
                role="menu"
                onClick={(e) => e.stopPropagation()}
                className="animate-in fade-in zoom-in-95 absolute left-0 top-9 z-50 flex w-64 flex-col gap-1 rounded-2xl bg-card p-1.5 text-[13px] shadow-[0_16px_36px_-10px_rgba(0,0,0,0.85)] ring-1 ring-[var(--ln-2)]"
              >
                {entryOnly && (
                  <span className="flex gap-2 rounded-xl px-2.5 py-2 leading-[18px] text-foreground/85">
                    <Info className="mt-px h-4 w-4 shrink-0" style={{ color }} />
                    {t("entry.onlyThisEntryHint")}
                  </span>
                )}
              </span>
            </>
          )}
        </span>

        <SmartText
          text={label}
          lines={isBool && !longBool ? 1 : LABEL_LINES}
          className="flex-1 pt-1 text-[14px] font-semibold leading-5"
        />

        {/* Evet/hayır — kısa adda anahtar yanında (ad tek satır, çakışmaz) */}
        {isBool && !isLocked && !longBool && (
          <span onClick={(e) => e.stopPropagation()} className="flex shrink-0">
            {toggle}
          </span>
        )}
      </div>
      )}

      {/* 2 — değer */}
      {custom ? (
        // Kendi girişi kutunun kenarına kadar uzanır (iç boşluğunu kendisi verir)
        <div className="-mx-4 -mb-3 -mt-2">{custom}</div>
      ) : isLocked ? (
        <div className={cn(well, "gap-2 py-2.5 text-[15px] font-semibold text-violet-200/90")} style={wellStyle}>
          <Link2 className="h-4 w-4 shrink-0 text-violet-300" />
          <span className="break-words">{lockedText}</span>
        </div>
      ) : collapsible && !open ? (
        // Kapalı kutu: yuvaya dokununca açılır
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
        </button>
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
          {unit && (
            /* data-unit: Brütal temada siyah çerçeveli küçük etiket */
            <span data-unit="" className="max-w-[45%] shrink-0 text-right font-mono text-[14px] font-semibold leading-4 text-muted-foreground">
              {unit}
            </span>
          )}
        </label>
      ) : isBool && brutal ? (
        // Brütal: iki büyük yarım — seçilen dolu
        <div className="grid grid-cols-2 overflow-hidden rounded-xl border-2 border-[#111] shadow-[3px_3px_0_#111]">
          {(["true", "false"] as const).map((v) => {
            const on = (value === "true") === (v === "true");
            return (
              <button
                key={v}
                type="button"
                aria-pressed={on}
                onClick={() => onChange(v)}
                className="h-14 text-[19px] font-black uppercase tracking-wide text-[#111] [&+&]:border-l-2 [&+&]:border-[#111]"
                style={{ background: on ? color : "#ffffff", color: on ? "#111" : "#111" }}
              >
                {v === "true" ? t("entry.yes") : t("entry.no")}
              </button>
            );
          })}
        </div>
      ) : isBool ? (
        longBool ? (
          <div className="-mt-0.5 flex cursor-pointer items-center justify-end gap-2.5" onClick={flip}>
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
        // Her ölçek kaydırılan ray — basamak sayısı ne olursa olsun aynı görünüm
        <ScaleSlider
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
                    if (collapsible && !on) close();
                  }}
                  aria-pressed={on}
                  className={cn(
                    "flex min-h-10 min-w-0 items-center justify-center break-words rounded-xl px-2.5 py-1.5 text-center text-[13.5px] font-semibold leading-[18px] transition-colors",
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
        <div className="flex flex-col gap-2">
          <DateTimeRangeInput
            value={value}
            onChange={onChange}
            entryDate={entryDate ?? toLocalDateValue()}
          />
        </div>
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
                  data-recent=""
                  data-on={on ? "" : undefined}
                  type="button"
                  onClick={() => onChange(on ? "" : raw)}
                  className="flex min-h-8 min-w-0 items-center justify-center break-words rounded-lg px-1.5 py-1 font-mono text-[12.5px] font-semibold leading-4 transition-colors"
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
