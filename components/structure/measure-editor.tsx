"use client";

import { useState, type ReactNode } from "react";
import { ArrowRight, Check, Clock, Minus, Plus, X } from "lucide-react";
import {
  MEASURE_KIND_META,
  MEASURE_UI_KINDS,
  SCALE_MAX_STEPS,
  SCALE_MIN_STEPS,
  scaleChoices,
  scaleRangeOf,
  uiKindOf,
  type MeasureUiKind,
} from "@/lib/measure-kinds";
import { SCALE_PRESETS, type EntryValueType } from "@/types";
import type { ModMeasure } from "@/lib/db/queries";
import { Label } from "@/components/ui/label";
import { ScaleInput } from "@/components/ui/scale-input";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * Özelliğin "nasıl ölçülüyor" bölümü — bir ayar tezgâhı.
 *
 * İki tasarım kuralı:
 *
 * 1. Her tür için TEK kart. Ayarlar ve o ayarın sonucu aynı yüzeyde duruyor,
 *    ayrı bir "önizleme" bölümü yok. Skalada en çok fark eden yer burası:
 *    eskiden üç başlık (aralık / uçların anlamı / önizleme) ve beş kontrol
 *    vardı, form doldurmaya benziyordu. Şimdi skalanın kendisi görsel, uç
 *    adları doğrudan uçların altına yazılıyor.
 *
 * 2. Her türün dokunulacak bir şeyi var. Zaman aralığı ve metin eskiden boş
 *    bir kutuda tek satır açıklamaydı — beş türde ayar çekip altıncıda boşluğa
 *    bakmak, seçimi yanlış yapmış hissi veriyordu. Ayarı olmayan türler de
 *    girdi ekranında karşılaşılacak alanı gösteriyor.
 *
 * Serbest aralık kaybolmadı ama öne çıkmıyor: hazır aralıklar kısayol,
 * "Özel" dokunulunca sayaçlar açılıyor. Çoğu kişi 1–5 isteyip geçiyor.
 */
export function MeasureEditor({
  value,
  onChange,
  /** Havuzda hâlihazırda kullanılan birimler — önce bunlar önerilir ki
   *  "adet / Adet / tane" gibi ayrışma olmasın */
  knownUnits = [],
}: {
  value: ModMeasure;
  onChange: (next: ModMeasure) => void;
  knownUnits?: string[];
}) {
  const t = useT();
  const kind = uiKindOf(value);
  const [choiceDraft, setChoiceDraft] = useState("");
  /** Yalnızca hissi vermek için — kaydedilmez */
  const [demo, setDemo] = useState("");
  const [customOpen, setCustomOpen] = useState(false);

  const choices = value.choices ?? [];
  const range = scaleRangeOf(choices);
  const steps = choices.length;
  const activePreset = SCALE_PRESETS.find(
    (p) => p.choices.join() === choices.join()
  );

  function pickKind(k: MeasureUiKind) {
    setDemo("");
    setCustomOpen(false);
    if (k === "scale") {
      onChange({ valueType: "select", choices: SCALE_PRESETS[0].choices });
      return;
    }
    onChange({ valueType: k as EntryValueType });
  }

  const setRange = (min: number, max: number) =>
    onChange({ ...value, choices: scaleChoices(min, max) });

  const setLabel = (end: "low" | "high", v: string) =>
    onChange({ ...value, scaleLabels: { ...value.scaleLabels, [end]: v } });

  const addChoice = () => {
    const v = choiceDraft.trim();
    if (!v || choices.includes(v)) return;
    onChange({ ...value, choices: [...choices, v] });
    setChoiceDraft("");
  };

  return (
    <div className="flex flex-col gap-2.5">
      <Label>{t("measure.howMeasured")}</Label>

      <div className="grid grid-cols-3 gap-1.5">
        {MEASURE_UI_KINDS.map((k) => {
          const meta = MEASURE_KIND_META[k];
          const Icon = meta.icon;
          const active = kind === k;
          return (
            <button
              key={k}
              type="button"
              onClick={() => pickKind(k)}
              aria-pressed={active}
              className={cn(
                "flex flex-col items-center gap-1.5 rounded-xl border px-1 py-2.5 transition-all active:scale-[0.95]",
                active
                  ? "border-primary/60 bg-primary/10 text-primary shadow-[0_0_18px_-8px_rgba(99,102,241,0.9)]"
                  : "border-border bg-card text-muted-foreground hover:border-white/15 hover:text-foreground"
              )}
            >
              {/* Yuvarlak çekirdek — havuzdaki atomun şekil diliyle aynı */}
              <span
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full transition-colors",
                  active ? "bg-primary/15" : "bg-white/5"
                )}
              >
                <Icon className="h-4 w-4" strokeWidth={1.75} />
              </span>
              <span className="text-[10px] font-medium leading-tight">
                {t(meta.labelKey)}
              </span>
            </button>
          );
        })}
      </div>

      {/* Türe göre tek kart — ayar ve sonucu aynı yüzeyde. key={kind}:
          tür değişince kart yeniden takılır ve içeri süzülür; dokunuşun
          karşılığını görmek ayar çekme hissini veren şey */}
      <div
        key={kind}
        className="animate-in rounded-2xl border border-border bg-muted/20 p-3"
      >
        <p className="mb-3 text-[11px] leading-snug text-muted-foreground/80">
          {t(MEASURE_KIND_META[kind].hintKey)}
        </p>

        {/* Sayı — birim yazıldıkça örnek değer onunla okunur: "12 kg" */}
        {kind === "number" && (
          <div className="flex flex-col gap-2.5">
            <Readout hint={t("measure.sample")}>
              <span className="flex max-w-full items-baseline gap-2">
                <span className="text-2xl font-semibold tabular-nums text-muted-foreground/40">
                  12
                </span>
                <input
                  id="measure-unit"
                  value={value.unit ?? ""}
                  onChange={(e) => onChange({ ...value, unit: e.target.value })}
                  placeholder={t("measure.unitPlaceholder")}
                  aria-label={t("measure.unit")}
                  // size + ch genişliği: alan yazılana göre büyüyüp küçülür,
                  // "12 kg" bitişik okunur; boşken yer isteği yer tutucu
                  // kadar kalır (asgari genişlik notu için bkz. EndLabel)
                  size={1}
                  style={{
                    width: value.unit ? `${value.unit.length + 1}ch` : "5ch",
                  }}
                  className="min-w-0 max-w-full border-b border-dashed border-border/70 bg-transparent pb-0.5 text-center text-lg font-medium text-foreground outline-none transition-colors placeholder:text-muted-foreground/35 focus:border-primary/70"
                />
              </span>
            </Readout>
            {knownUnits.length > 0 && (
              // Testler yerleşime değil bu kancaya baksın
              <div
                data-unit-suggestions=""
                className="flex flex-wrap justify-center gap-1.5"
              >
                {knownUnits.map((u) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() =>
                      onChange({ ...value, unit: value.unit === u ? "" : u })
                    }
                    className={cn(pillClass(value.unit === u), "tabular-nums")}
                  >
                    {u}
                  </button>
                ))}
              </div>
            )}
            {/* Kullanıcının kendi fark ettiği durum: "Set", "Tekrar" gibi
                adlarda birim tekrar olur — "Set: 4 set" saçma */}
            <p className="text-center text-[11px] leading-snug text-muted-foreground/60">
              {t("measure.unitOptional")}
            </p>
          </div>
        )}

        {kind === "scale" && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-1.5">
              {SCALE_PRESETS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => {
                    setCustomOpen(false);
                    onChange({
                      valueType: "select",
                      choices: p.choices,
                      scaleLabels: value.scaleLabels,
                    });
                  }}
                  className={cn(
                    pillClass(!customOpen && activePreset?.key === p.key),
                    "tabular-nums"
                  )}
                >
                  {p.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setCustomOpen((v) => !v)}
                className={pillClass(customOpen || !activePreset)}
              >
                {t("measure.custom")}
              </button>
            </div>

            {/* Serbest aralık — iki sayaç, adları kendi kutularının üstünde.
                Tek sıraya dizilince "− 1 + – − 5 +" okunmuyordu. */}
            {(customOpen || !activePreset) && (
              <div className="flex flex-col gap-1.5">
                <div className="grid grid-cols-2 gap-2">
                  <Stepper
                    label={t("measure.from")}
                    value={range.min}
                    onChange={(n) => setRange(n, range.max)}
                    canDown={steps + 1 <= SCALE_MAX_STEPS}
                    canUp={steps - 1 >= SCALE_MIN_STEPS}
                  />
                  <Stepper
                    label={t("measure.to")}
                    value={range.max}
                    onChange={(n) => setRange(range.min, n)}
                    canDown={steps - 1 >= SCALE_MIN_STEPS}
                    canUp={steps + 1 <= SCALE_MAX_STEPS}
                  />
                </div>
                <p className="text-center text-[10px] tabular-nums text-muted-foreground/60">
                  {t("measure.stepCount", { n: steps })}
                </p>
              </div>
            )}

            {/* Skalanın kendisi + uç adları doğrudan uçların altında.
                Ayrı bir "uçların anlamı" formu soyut kalıyordu. */}
            <div className="flex flex-col gap-1.5">
              <ScaleInput choices={choices} value={demo} onChange={setDemo} />
              <div className="flex items-center gap-2">
                <EndLabel
                  value={value.scaleLabels?.low ?? ""}
                  onChange={(v) => setLabel("low", v)}
                  placeholder={t("measure.lowPlaceholder")}
                />
                <EndLabel
                  value={value.scaleLabels?.high ?? ""}
                  onChange={(v) => setLabel("high", v)}
                  placeholder={t("measure.highPlaceholder")}
                  align="right"
                />
              </div>
            </div>
          </div>
        )}

        {kind === "select" && (
          <div className="flex flex-col gap-2">
            {choices.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {choices.map((c) => (
                  <span
                    key={c}
                    className="flex max-w-full items-center gap-1 rounded-lg border border-border bg-card py-1 pl-2.5 pr-1 text-xs"
                  >
                    <span className="truncate">{c}</span>
                    <button
                      type="button"
                      onClick={() =>
                        onChange({ ...value, choices: choices.filter((x) => x !== c) })
                      }
                      aria-label={t("measure.removeOption", { name: c })}
                      className="shrink-0 rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-1.5">
              <input
                value={choiceDraft}
                onChange={(e) => setChoiceDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addChoice();
                  }
                }}
                placeholder={t("measure.optionPlaceholder")}
                size={1}
                className="h-9 w-0 min-w-0 flex-1 rounded-xl border border-border bg-black/25 px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/45 focus:border-primary/60"
              />
              <button
                type="button"
                onClick={addChoice}
                disabled={!choiceDraft.trim()}
                aria-label={t("measure.addOption")}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-primary/40 bg-primary/10 text-primary transition-all active:scale-95 disabled:border-border disabled:bg-card disabled:text-muted-foreground disabled:opacity-40"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            {/* Kaydet düğmesi iki seçenekten önce kapalı — sebebini söyle */}
            {choices.length < 2 && (
              <p className="text-[11px] leading-snug text-amber-300/80">
                {t("measure.selectMin")}
              </p>
            )}
          </div>
        )}

        {kind === "boolean" && (
          <div className="grid grid-cols-2 gap-2">
            <DemoChoice
              icon={Check}
              label={t("entry.yes")}
              active={demo === "true"}
              onClick={() => setDemo(demo === "true" ? "" : "true")}
            />
            <DemoChoice
              icon={X}
              label={t("entry.no")}
              active={demo === "false"}
              onClick={() => setDemo(demo === "false" ? "" : "false")}
            />
          </div>
        )}

        {/* Ayarı yok — girdi ekranında görülecek alanın kendisi gösterilir */}
        {kind === "datetime-range" && (
          <Readout hint={t("measure.sample")}>
            <span className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-sm font-medium tabular-nums">
              <Clock className="h-3.5 w-3.5 text-muted-foreground/60" />
              22:30
            </span>
            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
            <span className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-sm font-medium tabular-nums">
              <Clock className="h-3.5 w-3.5 text-muted-foreground/60" />
              07:15
            </span>
            <span className="rounded-full bg-primary/12 px-2 py-1 text-[11px] font-medium tabular-nums text-primary">
              {t("measure.sampleDuration")}
            </span>
          </Readout>
        )}

        {kind === "text" && (
          <input
            value={demo}
            onChange={(e) => setDemo(e.target.value)}
            placeholder={t("measure.textDemo")}
            aria-label={t("measure.sample")}
            size={1}
            className="h-10 w-full min-w-0 rounded-xl border border-border bg-black/25 px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-primary/60"
          />
        )}
      </div>
    </div>
  );
}

/** Kart içindeki koyu "okuma yüzeyi" — ayarın sonucu burada okunur */
function Readout({ children, hint }: { children: ReactNode; hint: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border/60 bg-black/25 px-3 py-2.5">
      <span className="text-[9px] uppercase tracking-wider text-muted-foreground/35">
        {hint}
      </span>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {children}
      </div>
    </div>
  );
}

/** Hazır aralık / birim gibi tek dokunuşluk kısayol düğmesi */
function pillClass(active: boolean) {
  return cn(
    "rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-all active:scale-95",
    active
      ? "border-primary bg-primary/10 text-primary"
      : "border-border bg-card text-muted-foreground hover:border-white/15 hover:text-foreground"
  );
}

/** Evet/Hayır gibi denemelik seçim — girdi ekranındaki düğmenin aynısı */
function DemoChoice({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: typeof Check;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex h-10 items-center justify-center gap-1.5 rounded-xl border text-sm font-medium transition-all active:scale-[0.97]",
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border bg-card text-muted-foreground hover:text-foreground"
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

/** Skalanın ucuna yazılan ad — çerçevesiz, yerinde yazılır */
function EndLabel({
  value,
  onChange,
  placeholder,
  align = "left",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  align?: "left" | "right";
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={placeholder}
      // size={1} + w-0: <input> varsayılan olarak ~20 karakterlik bir asgari
      // genişlik ister; min-w-0 bunu kesmiyor. İki uç etiketi yan yana
      // gelince bu istek diyaloğun ızgara sütununu şişirip tüm içeriği sağ
      // kenardan taşırıyordu — skala seçilince pencere yana büyüyor gibi
      // görünmesinin sebebi buydu.
      size={1}
      className={cn(
        "w-0 min-w-0 flex-1 rounded-md bg-transparent px-1 py-0.5 text-[11px] text-muted-foreground",
        "border-b border-dashed border-border/60 outline-none transition-colors",
        "placeholder:text-muted-foreground/35 focus:border-primary/60 focus:text-foreground",
        align === "right" && "text-right"
      )}
    />
  );
}

/** Sayı artır/azalt — telefonda küçük bir alana rakam yazdırmaktan iyi */
function Stepper({
  value,
  onChange,
  canDown,
  canUp,
  label,
}: {
  value: number;
  onChange: (n: number) => void;
  canDown: boolean;
  canUp: boolean;
  label: string;
}) {
  const btn =
    "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-all active:scale-90 hover:text-foreground disabled:opacity-25 disabled:active:scale-100";
  return (
    <div className="flex flex-col items-center gap-1 rounded-xl border border-border/60 bg-black/25 px-2 py-2">
      <span className="text-[9px] uppercase tracking-wider text-muted-foreground/50">
        {label}
      </span>
      <div className="flex w-full items-center gap-1">
        <button
          type="button"
          onClick={() => onChange(value - 1)}
          disabled={!canDown}
          aria-label={`${label} −`}
          className={btn}
        >
          <Minus className="h-3 w-3" />
        </button>
        <span className="min-w-0 flex-1 text-center text-base font-semibold tabular-nums">
          {value}
        </span>
        <button
          type="button"
          onClick={() => onChange(value + 1)}
          disabled={!canUp}
          aria-label={`${label} +`}
          className={btn}
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

/** Ölçüm ayarı kaydedilebilir mi (çoktan seçmeli en az iki seçenek ister) */
export function isMeasureComplete(m: ModMeasure): boolean {
  if (m.valueType === "select") return (m.choices?.length ?? 0) >= 2;
  return true;
}
