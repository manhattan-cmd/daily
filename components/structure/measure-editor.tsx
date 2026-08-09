"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import {
  MEASURE_KIND_META,
  MEASURE_UI_KINDS,
  uiKindOf,
  type MeasureUiKind,
} from "@/lib/measure-kinds";
import { SCALE_PRESETS, type EntryValueType } from "@/types";
import type { ModMeasure } from "@/lib/db/queries";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * Özelliğin "nasıl ölçülüyor" bölümü.
 *
 * v18'e kadar burada havuzdan bir ölçü seçiliyordu; ölçü ayrı bir nesneydi ve
 * kullanıcı özelliğe ondan başka verecek isim bulamadığı için 16 özelliğin
 * 6'sı ölçüsüyle aynı adı taşıyordu. Artık ölçüm özelliğin kendi üzerinde:
 * tür + (sayıda) birim, (skalada) aralık, (çoktan seçmelide) seçenekler.
 *
 * Skala ayrı bir depolama türü değil — seçenekleri sayı olan bir "select".
 * Analiz bu kuralı zaten tanıyor ve toplamak yerine ortalıyor.
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

  function pickKind(k: MeasureUiKind) {
    if (k === "scale") {
      onChange({ valueType: "select", choices: SCALE_PRESETS[0].choices });
      return;
    }
    onChange({ valueType: k as EntryValueType });
  }

  const choices = value.choices ?? [];
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
        <div className="grid grid-cols-2 gap-1.5">
          {MEASURE_UI_KINDS.map((k) => {
            const meta = MEASURE_KIND_META[k];
            const Icon = meta.icon;
            return (
              <button
                key={k}
                type="button"
                onClick={() => pickKind(k)}
                className={cn(
                  "flex items-center gap-2 rounded-xl border px-2.5 py-2 text-left text-xs font-medium transition-colors",
                  kind === k
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-card text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="h-3.5 w-3.5 shrink-0 opacity-70" />
                <span className="truncate">{t(meta.labelKey)}</span>
              </button>
            );
          })}
        </div>
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
                  onClick={() => onChange({ ...value, unit: u })}
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
        <div className="flex flex-col gap-2">
          <Label>{t("measure.range")}</Label>
          <div className="flex flex-wrap gap-1.5">
            {SCALE_PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => onChange({ valueType: "select", choices: p.choices })}
                className={cn(
                  "rounded-xl border px-3 py-1.5 text-xs font-medium tabular-nums transition-colors",
                  choices.join() === p.choices.join()
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-card text-muted-foreground hover:text-foreground"
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          <p className="text-[11px] leading-snug text-muted-foreground/70">
            {t("measure.scaleHint")}
          </p>
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
    </div>
  );
}

/** Ölçüm ayarı kaydedilebilir mi (çoktan seçmeli en az iki seçenek ister) */
export function isMeasureComplete(m: ModMeasure): boolean {
  if (m.valueType === "select") return (m.choices?.length ?? 0) >= 2;
  return true;
}
