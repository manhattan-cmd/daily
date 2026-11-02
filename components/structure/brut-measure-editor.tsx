"use client";

import { useState, type ReactNode } from "react";
import { ArrowRight, Check, Minus, Plus, X } from "lucide-react";
import {
  MEASURE_KIND_META,
  MEASURE_UI_KINDS,
  SCALE_MAX_STEPS,
  SCALE_MIN_STEPS,
} from "@/lib/measure-kinds";
import { SCALE_PRESETS } from "@/types";
import { ScaleSlider } from "@/components/ui/scale-slider";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { isMeasureComplete, useMeasureEditor } from "./measure-editor-state";
import type { MeasureEditorProps } from "./measure-editor";

/** Kutu biçimli yazı alanı — beyaz, kalın çerçeve, odakta sarı hale */
const FIELD =
  "h-11 w-full min-w-0 rounded-[11px] border-2 border-[#111] bg-white px-3 text-[15px] font-bold text-[#111] outline-none placeholder:font-semibold placeholder:text-[#111]/35 focus:shadow-[0_0_0_3px_#ffd23f]";

/** Tek dokunuşluk seçenek — seçili olan siyah, gölgesine oturmuş */
const chip = (on: boolean) =>
  cn(
    "inline-flex h-8 max-w-full items-center gap-1.5 rounded-[9px] border-[1.5px] border-[#111] px-2.5 text-[12.5px] font-extrabold transition-transform",
    on
      ? "translate-x-[1.5px] translate-y-[1.5px] bg-[#111] text-[#fff4dc]"
      : "bg-white text-[#111] shadow-[1.5px_1.5px_0_#111] active:translate-x-[1.5px] active:translate-y-[1.5px] active:shadow-none"
  );

/**
 * "Nasıl ölçülüyor" — Brütal.
 *
 * Sade düzen (bkz. MeasureEditor) koyu temaya göre kurulmuştu; brütalde iç
 * içe dört kat çerçeve oluyordu: bölüm kutusu › krem tür kartı › beyaz
 * "örnek" kutusu › birim alanı. Simgeler gri dairelerde, ad 10 px, Nesne tek
 * başına tam satır, birim önerileri ortalanmış üç satır, altında uzun bir
 * dipnot vardı.
 *
 * Burada tek yüzey: üstte türler dörtlü kare düğmeler (ikinci sıra ortada,
 * seçili olan siyah zeminde sarı simge — Yapı › Özellikler'in tür
 * süzgeciyle aynı), altında kesik çizgiyle ayrılmış seçilen türün ayarı.
 * Her ayarın küçük bir adı var (BİRİM, ARALIK, SEÇENEKLER, ÖRNEK), alanlar
 * girdi formundaki kutularla aynı ölçüde; çerçeve yalnız dokunulacak şeyde.
 */
export function BrutMeasureEditor({
  value,
  onChange,
  knownUnits = [],
  color = "#818cf8",
}: MeasureEditorProps) {
  const t = useT();
  const s = useMeasureEditor(value, onChange);
  const { kind, choices } = s;
  const meta = MEASURE_KIND_META[kind];

  return (
    <div data-measure-editor="" className="flex flex-col gap-3.5">
      <div className="flex flex-wrap justify-center gap-1.5">
        {MEASURE_UI_KINDS.map((k) => {
          const m = MEASURE_KIND_META[k];
          const Icon = m.icon;
          const on = kind === k;
          return (
            <button
              key={k}
              type="button"
              onClick={() => s.pickKind(k)}
              aria-pressed={on}
              className={cn(
                "flex h-[62px] w-[calc((100%-18px)/4)] flex-col items-center justify-center gap-1 rounded-[12px] border-2 border-[#111] px-1 text-center text-[10.5px] font-extrabold leading-[1.15] transition-transform",
                on
                  ? "translate-x-[2px] translate-y-[2px] bg-[#111] text-[#fff4dc]"
                  : "bg-white text-[#111] shadow-[2px_2px_0_#111] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
              )}
            >
              <Icon
                className={cn("h-[19px] w-[19px] shrink-0", on && "text-[#ffd23f]")}
                strokeWidth={2.3}
              />
              <span className="line-clamp-2">{t(m.labelKey)}</span>
            </button>
          );
        })}
      </div>

      {/* Seçilen türün ayarı — key={kind}: tür değişince içeri süzülür */}
      <div
        key={kind}
        className="animate-in flex flex-col gap-3.5 border-t-[1.5px] border-dashed border-[#111]/30 pt-3.5"
      >
        <p className="px-0.5 text-[12.5px] font-bold leading-snug text-[#111]/60">
          {t(meta.hintKey)}
        </p>

        {/* Sayı — birim yazıldıkça örnek değer onunla okunur: "12 kg" */}
        {kind === "number" && (
          <Field label={t("measure.unit")} hint={t("measure.optional")}>
            <label className="flex h-12 items-center gap-2.5 rounded-[12px] border-2 border-[#111] bg-white px-3.5 focus-within:shadow-[0_0_0_3px_#ffd23f]">
              <span className="font-mono text-[22px] font-bold leading-none tabular-nums text-[#111]/25">
                12
              </span>
              <input
                id="measure-unit"
                value={value.unit ?? ""}
                onChange={(e) => onChange({ ...value, unit: e.target.value })}
                placeholder={t("measure.unitPlaceholder")}
                aria-label={t("measure.unit")}
                size={1}
                className="h-full w-0 min-w-0 flex-1 bg-transparent text-[18px] font-extrabold text-[#111] outline-none placeholder:font-bold placeholder:text-[#111]/30"
              />
              {value.unit && (
                <button
                  type="button"
                  onClick={() => onChange({ ...value, unit: "" })}
                  aria-label={t("action.remove")}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#111]/[0.07]"
                >
                  <X className="h-3 w-3" strokeWidth={2.6} />
                </button>
              )}
            </label>
            {knownUnits.length > 0 && (
              // Testler yerleşime değil bu kancaya baksın
              <div data-unit-suggestions="" className="flex flex-wrap gap-1.5">
                {knownUnits.map((u) => (
                  <button
                    key={u}
                    type="button"
                    aria-pressed={value.unit === u}
                    onClick={() => onChange({ ...value, unit: value.unit === u ? "" : u })}
                    className={chip(value.unit === u)}
                  >
                    {u}
                  </button>
                ))}
              </div>
            )}
          </Field>
        )}

        {kind === "scale" && (
          <>
            <Field label={t("measure.range")}>
              <div className="flex flex-wrap gap-1.5">
                {SCALE_PRESETS.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => {
                      s.setCustomOpen(false);
                      onChange({
                        valueType: "select",
                        choices: p.choices,
                        scaleLabels: value.scaleLabels,
                      });
                    }}
                    className={cn(chip(!s.customOpen && s.activePreset?.key === p.key), "tabular-nums")}
                  >
                    {p.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => s.setCustomOpen((v) => !v)}
                  className={chip(s.customOpen || !s.activePreset)}
                >
                  {t("measure.custom")}
                </button>
              </div>
              {/* Serbest aralık — iki sayaç, adları kendi kutularının üstünde */}
              {(s.customOpen || !s.activePreset) && (
                <div className="grid grid-cols-2 gap-2">
                  <BrutStepper
                    label={t("measure.from")}
                    value={s.range.min}
                    onChange={(n) => s.setRange(n, s.range.max)}
                    canDown={s.steps + 1 <= SCALE_MAX_STEPS}
                    canUp={s.steps - 1 >= SCALE_MIN_STEPS}
                  />
                  <BrutStepper
                    label={t("measure.to")}
                    value={s.range.max}
                    onChange={(n) => s.setRange(s.range.min, n)}
                    canDown={s.steps - 1 >= SCALE_MIN_STEPS}
                    canUp={s.steps + 1 <= SCALE_MAX_STEPS}
                  />
                </div>
              )}
            </Field>
            {/* Girdi ekranında görülecek ölçeğin kendisi; uç adları altında
                yerinde yazılır */}
            <Field label={t("measure.sample")}>
              <div className="rounded-[12px] border-2 border-[#111] bg-white px-2.5 pb-2.5 pt-2">
                <ScaleSlider
                  choices={choices}
                  value={s.demo}
                  onChange={s.setDemo}
                  color={color}
                  endSlots={{
                    low: (
                      <EndLabel
                        value={value.scaleLabels?.low ?? ""}
                        onChange={(v) => s.setLabel("low", v)}
                        placeholder={t("measure.lowPlaceholder")}
                      />
                    ),
                    high: (
                      <EndLabel
                        value={value.scaleLabels?.high ?? ""}
                        onChange={(v) => s.setLabel("high", v)}
                        placeholder={t("measure.highPlaceholder")}
                        align="right"
                      />
                    ),
                  }}
                />
              </div>
            </Field>
          </>
        )}

        {kind === "select" && (
          <Field label={t("measure.options")}>
            {choices.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {choices.map((c) => (
                  <span
                    key={c}
                    className="inline-flex h-8 max-w-full items-center gap-0.5 rounded-[9px] border-[1.5px] border-[#111] bg-white pl-2.5 pr-1 text-[12.5px] font-extrabold text-[#111] shadow-[1.5px_1.5px_0_#111]"
                  >
                    <span className="truncate">{c}</span>
                    <button
                      type="button"
                      onClick={() => s.removeChoice(c)}
                      aria-label={t("measure.removeOption", { name: c })}
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px] text-[#111]/55 hover:bg-[#111]/10 hover:text-[#111]"
                    >
                      <X className="h-3 w-3" strokeWidth={2.6} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input
                value={s.choiceDraft}
                onChange={(e) => s.setChoiceDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    s.addChoice();
                  }
                }}
                placeholder={t("measure.optionPlaceholder")}
                size={1}
                className={cn(FIELD, "w-0 flex-1")}
              />
              <button
                type="button"
                onClick={s.addChoice}
                disabled={!s.choiceDraft.trim()}
                aria-label={t("measure.addOption")}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[11px] border-2 border-[#111] bg-[#ffd23f] text-[#111] shadow-[2px_2px_0_#111] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:bg-white disabled:opacity-40 disabled:shadow-none"
              >
                <Plus className="h-5 w-5" strokeWidth={3} />
              </button>
            </div>
            {/* Kaydet düğmesi iki seçenekten önce kapalı — sebebini söyle */}
            {choices.length < 2 && <Warn>{t("measure.selectMin")}</Warn>}
          </Field>
        )}

        {kind === "boolean" && (
          <Field label={t("measure.sample")}>
            <div className="grid grid-cols-2 gap-2">
              {(["true", "false"] as const).map((v) => {
                const on = s.demo === v;
                const Icon = v === "true" ? Check : X;
                return (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={on}
                    onClick={() => s.setDemo(on ? "" : v)}
                    className={cn(
                      "flex h-11 items-center justify-center gap-1.5 rounded-[11px] border-2 border-[#111] text-[14px] font-extrabold text-[#111] transition-transform",
                      on ? "translate-x-[2px] translate-y-[2px]" : "bg-white shadow-[2px_2px_0_#111]"
                    )}
                    style={on ? { background: color } : undefined}
                  >
                    <Icon className="h-4 w-4" strokeWidth={3} />
                    {t(v === "true" ? "entry.yes" : "entry.no")}
                  </button>
                );
              })}
            </div>
          </Field>
        )}

        {/* Ayarı yok — girdi ekranında görülecek alanın kendisi */}
        {kind === "datetime-range" && (
          <Field label={t("measure.sample")}>
            <div className="flex flex-wrap items-center justify-center gap-2 rounded-[12px] border-2 border-[#111] bg-white px-3 py-3">
              <span className="rounded-[8px] border-[1.5px] border-[#111] px-2 py-1 font-mono text-[15px] font-bold tabular-nums text-[#111]">
                22:30
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-[#111]/50" strokeWidth={2.6} />
              <span className="rounded-[8px] border-[1.5px] border-[#111] px-2 py-1 font-mono text-[15px] font-bold tabular-nums text-[#111]">
                07:15
              </span>
              <span className="rounded-full bg-[#111] px-2.5 py-1 text-[11px] font-extrabold tabular-nums text-[#fff4dc]">
                {t("measure.sampleDuration")}
              </span>
            </div>
          </Field>
        )}

        {kind === "text" && (
          <Field label={t("measure.sample")}>
            <input
              value={s.demo}
              onChange={(e) => s.setDemo(e.target.value)}
              placeholder={t("measure.textDemo")}
              aria-label={t("measure.sample")}
              size={1}
              className={FIELD}
            />
          </Field>
        )}

        {/* Nesne: hangi listeden — var olanlar (rengi ve kaç nesnesi
            olduğu), yanında aynı biçimde "+ Yeni liste". Hiç liste yoksa ad
            alanı doğrudan açık; yazılan liste kayıtta açılır. */}
        {kind === "object" && (
          <>
            <Field label={t("measure.collection")}>
              {!s.noLists && (
                <div className="flex flex-wrap gap-1.5" data-collections="">
                  {(s.collections ?? []).map((c) => {
                    const on = value.collectionId === c.id;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => s.pickCollection(c.id)}
                        aria-pressed={on}
                        className={chip(on)}
                      >
                        <span
                          className="h-2.5 w-2.5 shrink-0 rotate-45 rounded-[2px] border border-[#111]"
                          style={{ background: c.color ?? color }}
                        />
                        <span className="truncate">{c.name}</span>
                        <span className="font-mono text-[10.5px] opacity-55">{c.n}</span>
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    data-new-collection=""
                    onClick={s.openNewCollection}
                    aria-pressed={s.showNew && !value.collectionId}
                    className={chip(s.showNew && !value.collectionId)}
                  >
                    <Plus className="h-3.5 w-3.5" strokeWidth={3} />
                    {t("measure.newCollection")}
                  </button>
                </div>
              )}
              {s.showNew && (
                <input
                  value={s.collDraft}
                  onChange={(e) => s.typeCollection(e.target.value)}
                  onKeyDown={(e) => {
                    // Enter özelliği kaydetmesin — yalnız klavyeyi kapatır
                    if (e.key === "Enter") {
                      e.preventDefault();
                      e.currentTarget.blur();
                    }
                  }}
                  autoFocus={s.newOpen}
                  placeholder={t("measure.collectionPlaceholder")}
                  aria-label={t("measure.newCollection")}
                  size={1}
                  data-collection-name=""
                  className={FIELD}
                />
              )}
              {value.newCollection?.trim() && !value.collectionId && (
                <p className="px-0.5 text-[11.5px] font-semibold leading-snug text-[#111]/55">
                  {t("measure.newCollectionHint", { name: value.newCollection.trim() })}
                </p>
              )}
            </Field>
            <button
              type="button"
              role="switch"
              aria-checked={!!value.multiple}
              onClick={() => onChange({ ...value, multiple: !value.multiple })}
              className="flex items-center justify-between gap-3 rounded-[12px] border-2 border-[#111] bg-white px-3.5 py-2.5 text-left text-[13px] font-bold text-[#111]"
            >
              <span>{t("measure.multiple")}</span>
              <span
                className={cn(
                  "relative h-6 w-10 shrink-0 rounded-full border-2 border-[#111] transition-colors",
                  value.multiple ? "bg-[#111]" : "bg-white"
                )}
              >
                <span
                  className={cn(
                    "absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full transition-all",
                    value.multiple ? "left-[19px] bg-[#ffd23f]" : "left-[3px] bg-[#111]"
                  )}
                />
              </span>
            </button>
            {!isMeasureComplete(value) && <Warn>{t("measure.pickCollection")}</Warn>}
          </>
        )}
      </div>
    </div>
  );
}

/** Ayarın küçük adı (BİRİM, ARALIK…) ve altında alanları */
function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline gap-1.5 px-0.5">
        <span className="text-[10.5px] font-black uppercase tracking-[0.08em] text-[#111]">
          {label}
        </span>
        {hint && <span className="text-[11px] font-semibold text-[#111]/45">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

/** Kaydet neden kapalı — koyu turuncu, kalın */
function Warn({ children }: { children: ReactNode }) {
  return (
    <p className="px-0.5 text-[11.5px] font-bold leading-snug text-[#b45309]">{children}</p>
  );
}

/** Skalanın ucuna yazılan ad — krem, ince çerçeveli; yazılınca beyaz */
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
      // size={1} + w-0: input'un ~20 karakterlik asgari genişliği pencereyi
      // yana taşırmasın (bkz. MeasureEditor'daki EndLabel)
      size={1}
      className={cn(
        "h-9 w-0 min-w-0 flex-1 rounded-[9px] border-[1.5px] border-[#111] px-2.5 text-[12.5px] font-bold text-[#111] outline-none placeholder:font-semibold placeholder:text-[#111]/40 focus:bg-white focus:shadow-[0_0_0_2px_#ffd23f]",
        value ? "bg-white" : "bg-[#fff4dc]",
        align === "right" && "text-right"
      )}
    />
  );
}

/** Sayı artır/azalt — değer doğrudan da yazılabilir */
function BrutStepper({
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
    "flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] border-[1.5px] border-[#111] bg-white text-[#111] shadow-[1.5px_1.5px_0_#111] active:translate-x-[1.5px] active:translate-y-[1.5px] active:shadow-none disabled:opacity-25 disabled:shadow-none";
  // Yazılan değer bırakılınca (ya da Enter) uygulanır; geçersizse eskiye döner
  const [draft, setDraft] = useState(String(value));
  const [shown, setShown] = useState(value);
  if (shown !== value) {
    setShown(value);
    setDraft(String(value));
  }
  const commit = () => {
    const n = parseInt(draft, 10);
    if (Number.isFinite(n) && n !== value) onChange(n);
    else setDraft(String(value));
  };
  return (
    <div className="flex flex-col gap-1.5 rounded-[12px] border-2 border-[#111] bg-white px-2 pb-2 pt-1.5">
      <span className="text-center text-[10px] font-black uppercase tracking-[0.08em] text-[#111]/55">
        {label}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onChange(value - 1)}
          disabled={!canDown}
          aria-label={`${label} −`}
          className={btn}
        >
          <Minus className="h-3.5 w-3.5" strokeWidth={3} />
        </button>
        <input
          type="text"
          inputMode="numeric"
          value={draft}
          aria-label={label}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => setDraft(e.target.value.replace(/[^0-9-]/g, ""))}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          className="min-w-0 flex-1 bg-transparent text-center font-mono text-[18px] font-bold tabular-nums text-[#111] outline-none"
        />
        <button
          type="button"
          onClick={() => onChange(value + 1)}
          disabled={!canUp}
          aria-label={`${label} +`}
          className={btn}
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={3} />
        </button>
      </div>
    </div>
  );
}
