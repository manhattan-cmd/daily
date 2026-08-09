"use client";

import { useState } from "react";
import { Minus, Plus, X } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScaleInput } from "@/components/ui/scale-input";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * Özelliğin "nasıl ölçülüyor" bölümü.
 *
 * v18'e kadar burada havuzdan bir ölçü seçiliyordu; ölçü ayrı bir nesneydi ve
 * kullanıcı özelliğe ondan başka verecek isim bulamadığı için 16 özelliğin
 * 6'sı ölçüsüyle aynı adı taşıyordu. Artık ölçüm özelliğin kendi üzerinde.
 *
 * Tasarımın ana fikri ÖNİZLEME: seçtiğin türün girdi ekranında nasıl
 * görüneceğini burada, dokunabildiğin halde görüyorsun. Skalanın "1–10 mu
 * olsun 0–100 mü" sorusu soyut kaldığı sürece cevaplanamıyordu.
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
  /** Yalnızca önizleme için — kaydedilmez, dokunma hissini vermek adına */
  const [preview, setPreview] = useState("");

  function pickKind(k: MeasureUiKind) {
    setPreview("");
    if (k === "scale") {
      onChange({ valueType: "select", choices: SCALE_PRESETS[0].choices });
      return;
    }
    onChange({ valueType: k as EntryValueType });
  }

  const choices = value.choices ?? [];
  const range = scaleRangeOf(choices);
  const steps = choices.length;

  const setRange = (min: number, max: number) =>
    onChange({ ...value, choices: scaleChoices(min, max) });

  const addChoice = () => {
    const v = choiceDraft.trim();
    if (!v || choices.includes(v)) return;
    onChange({ ...value, choices: [...choices, v] });
    setChoiceDraft("");
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
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
                  "flex flex-col items-center gap-1 rounded-xl border px-1 py-2.5 transition-colors",
                  active
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-card text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="text-[10px] font-medium leading-tight">
                  {t(meta.labelKey)}
                </span>
              </button>
            );
          })}
        </div>
        {/* Seçilenin ne olduğu tek satırda — her kutuya sıkıştırmak yerine */}
        <p className="px-0.5 text-[11px] leading-snug text-muted-foreground/70">
          {t(MEASURE_KIND_META[kind].hintKey)}
        </p>
      </div>

      {kind === "number" && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="measure-unit">{t("measure.unit")}</Label>
          <Input
            id="measure-unit"
            value={value.unit ?? ""}
            onChange={(e) => onChange({ ...value, unit: e.target.value })}
            placeholder={t("measure.unitPlaceholder")}
          />
          {knownUnits.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {knownUnits.map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() =>
                    onChange({ ...value, unit: value.unit === u ? "" : u })
                  }
                  className={cn(
                    "rounded-lg border px-2 py-1 text-[11px] transition-colors",
                    value.unit === u
                      ? "border-primary/50 bg-primary/10 text-primary"
                      : "border-border bg-muted/40 text-muted-foreground hover:text-foreground"
                  )}
                >
                  {u}
                </button>
              ))}
            </div>
          )}
          {/* Kullanıcının kendi fark ettiği durum: "Set", "Tekrar" gibi
              adlarda birim tekrar olur — "Set: 4 set" saçma */}
          <p className="text-[11px] leading-snug text-muted-foreground/70">
            {t("measure.unitOptional")}
          </p>
        </div>
      )}

      {kind === "scale" && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <Label>{t("measure.range")}</Label>
            <div className="flex flex-wrap gap-1.5">
              {SCALE_PRESETS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() =>
                    onChange({ valueType: "select", choices: p.choices, scaleLabels: value.scaleLabels })
                  }
                  className={cn(
                    "rounded-lg border px-2.5 py-1 text-[11px] font-medium tabular-nums transition-colors",
                    choices.join() === p.choices.join()
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-muted/40 text-muted-foreground hover:text-foreground"
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Hazır aralıklar kısayol; asıl serbestlik burada */}
            <div className="flex items-center gap-2">
              {/* Bir ucu oynatmak basamak sayısını bir değiştirir; sınırlar
                  o sayıya bakar, uçların kendisine değil */}
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
            <p className="text-[11px] leading-snug text-muted-foreground/70">
              {t("measure.stepCount", { n: steps })}
            </p>
          </div>

          {/* Uç anlamları — "1–5" tek başına hangi yönün iyi olduğunu söylemiyor */}
          <div className="flex flex-col gap-2">
            <Label>{t("measure.endLabels")}</Label>
            <div className="flex items-center gap-2">
              <Input
                value={value.scaleLabels?.low ?? ""}
                onChange={(e) =>
                  onChange({
                    ...value,
                    scaleLabels: { ...value.scaleLabels, low: e.target.value },
                  })
                }
                placeholder={t("measure.lowPlaceholder")}
                className="h-9 text-sm"
              />
              <span className="shrink-0 text-xs text-muted-foreground/50">→</span>
              <Input
                value={value.scaleLabels?.high ?? ""}
                onChange={(e) =>
                  onChange({
                    ...value,
                    scaleLabels: { ...value.scaleLabels, high: e.target.value },
                  })
                }
                placeholder={t("measure.highPlaceholder")}
                className="h-9 text-sm"
              />
            </div>
          </div>

          <Preview label={t("measure.preview")}>
            <ScaleInput
              choices={choices}
              labels={value.scaleLabels}
              value={preview}
              onChange={setPreview}
            />
          </Preview>
        </div>
      )}

      {kind === "select" && (
        <div className="flex flex-col gap-2">
          <Label>{t("measure.options")}</Label>
          {choices.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {choices.map((c) => (
                <span
                  key={c}
                  className="flex items-center gap-1 rounded-lg border border-border bg-muted/40 py-1 pl-2.5 pr-1 text-xs"
                >
                  {c}
                  <button
                    type="button"
                    onClick={() =>
                      onChange({ ...value, choices: choices.filter((x) => x !== c) })
                    }
                    aria-label={t("measure.removeOption", { name: c })}
                    className="rounded-full p-0.5 text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="flex gap-1.5">
            <Input
              value={choiceDraft}
              onChange={(e) => setChoiceDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addChoice();
                }
              }}
              placeholder={t("measure.optionPlaceholder")}
              className="h-9"
            />
            <button
              type="button"
              onClick={addChoice}
              disabled={!choiceDraft.trim()}
              aria-label={t("measure.addOption")}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {kind === "boolean" && (
        <Preview label={t("measure.preview")}>
          <button
            type="button"
            onClick={() => setPreview(preview === "true" ? "false" : "true")}
            className={cn(
              "flex h-10 w-full items-center justify-center rounded-xl border text-sm font-medium transition-colors",
              preview === "true"
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-input text-muted-foreground"
            )}
          >
            {preview === "true" ? t("entry.yes") : t("entry.no")}
          </button>
        </Preview>
      )}
    </div>
  );
}

/** Sayı artır/azalt — telefonda küçük bir alana rakam yazdırmaktan iyi */
function Stepper({
  label,
  value,
  onChange,
  canDown,
  canUp,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  canDown: boolean;
  canUp: boolean;
}) {
  const btn =
    "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30";
  return (
    <div className="flex flex-1 flex-col gap-1">
      <span className="px-0.5 text-[10px] uppercase tracking-wider text-muted-foreground/60">
        {label}
      </span>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onChange(value - 1)}
          disabled={!canDown}
          aria-label={`${label} −`}
          className={btn}
        >
          <Minus className="h-3 w-3" />
        </button>
        <span className="flex-1 text-center text-sm font-semibold tabular-nums">
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

/** Girdi ekranında nasıl görüneceği — dokunulabilir, kaydedilmez */
function Preview({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 p-2.5">
      <span className="mb-2 block text-[10px] uppercase tracking-wider text-muted-foreground/60">
        {label}
      </span>
      {children}
    </div>
  );
}

/** Ölçüm ayarı kaydedilebilir mi (çoktan seçmeli en az iki seçenek ister) */
export function isMeasureComplete(m: ModMeasure): boolean {
  if (m.valueType === "select") return (m.choices?.length ?? 0) >= 2;
  return true;
}
