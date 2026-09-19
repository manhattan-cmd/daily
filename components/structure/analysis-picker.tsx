"use client";

import { BarChart3, LineChart, PieChart } from "lucide-react";
import { analysisKindOf, PRESETS, PRESETS_FOR, presetOf } from "@/lib/analytics";
import { useT, type MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type {
  AnalysisPreset,
  ChartKind,
  EntryValueType,
  ModAnalysis,
  StatKey,
} from "@/types";

/**
 * "Analizde" — özelliğin analizde nasıl okunacağı, TEK bir tercih.
 *
 * Ölçü türü "bu bir sayı" der, sayının NE olduğunu söylemez: para birikir,
 * bench ağırlığı birikmez. Birikenlerde dönemin rakamı toplam; seviyelerde
 * son değer ve eğilim ("bugün 90 kg, bir ay sonra 100").
 *
 * Sadeliği kuralı: kutu listesi ve grafik türü ayrı ayrı sorulmuyor, her
 * biçim ikisini birlikte getiriyor. Ölçüye uymayan biçim hiç sunulmuyor ve
 * tek şıklı türlerde (evet/hayır, çoktan seçmeli) seçici hiç çıkmıyor —
 * tek şıklı bir soru sormak kullanıcıyı oyalamaktır.
 */

const LABEL: Record<AnalysisPreset, MessageKey> = {
  sum: "preset.sum",
  level: "preset.level",
  peak: "preset.peak",
  average: "preset.average",
  rate: "preset.rate",
  frequency: "preset.frequency",
  distribution: "preset.distribution",
  texts: "preset.texts",
};

const CHART_LABEL: Record<ChartKind, MessageKey> = {
  bar: "chart.bar",
  line: "chart.line",
  distribution: "chart.distribution",
};

const STAT_LABEL: Record<StatKey, MessageKey> = {
  total: "stat.total",
  dailyAverage: "stat.dailyAverage",
  average: "stat.average",
  last: "stat.last",
  min: "stat.min",
  max: "stat.max",
  range: "stat.range",
  entries: "insights.entries",
  rate: "stat.yesRate",
  yesCount: "entry.yes",
  yesStreak: "stat.yesStreak",
  topChoice: "stat.mostFrequent",
  written: "stat.written",
};

const HINT: Record<AnalysisPreset, MessageKey> = {
  sum: "preset.sumHint",
  level: "preset.levelHint",
  peak: "preset.peakHint",
  average: "preset.averageHint",
  rate: "preset.rateHint",
  frequency: "preset.frequencyHint",
  distribution: "preset.distributionHint",
  texts: "preset.textsHint",
};

export function AnalysisPicker({
  valueType,
  choices,
  value,
  onChange,
}: {
  valueType: EntryValueType | undefined;
  choices?: string[];
  value: ModAnalysis | undefined;
  onChange: (next: ModAnalysis) => void;
}) {
  const t = useT();
  const kind = analysisKindOf(valueType, choices);
  const options = PRESETS_FOR[kind] ?? [];
  if (options.length < 2) return null;

  // Ölçü değişince eski seçim geçersiz kalabilir; o zaman varsayılan seçili görünür
  const current =
    value?.preset && options.includes(value.preset) ? value.preset : options[0];

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium text-muted-foreground">
        {t("preset.title")}
      </span>
      <div className="flex flex-wrap gap-1.5">
        {options.map((p) => {
          const on = p === current;
          return (
            <button
              key={p}
              type="button"
              onClick={() => onChange({ ...value, preset: p })}
              aria-pressed={on}
              className={cn(
                "rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors",
                on
                  ? "border-primary/50 bg-primary/15 text-primary"
                  : "border-border bg-card text-muted-foreground hover:text-foreground"
              )}
            >
              {t(LABEL[p])}
            </button>
          );
        })}
      </div>
      {/* Seçilenin bir satırlık karşılığı — hangi kutuların çıkacağı
          seçmeden önce bilinsin */}
      <p className="text-[11px] leading-snug text-muted-foreground/70">
        {t(HINT[current])}
      </p>
    </div>
  );
}

/**
 * Detay penceresindeki "Analizde" özeti — biçim, getirdiği kutular ve grafik.
 *
 * Seçici düzenleme penceresinde; burada okunan bir özet var. Sebebi: özelliğe
 * dokunduğunda sorulan soru "bu analizde nasıl görünecek" ve cevabı bir tık
 * öteye (Düzenle) saklamak, bilgiyi ayarın arkasına kilitliyordu.
 */
export function AnalysisSummary({
  valueType,
  choices,
  analysis,
  color,
}: {
  valueType: EntryValueType | undefined;
  choices?: string[];
  analysis: ModAnalysis | undefined;
  color: string;
}) {
  const t = useT();
  const kind = analysisKindOf(valueType, choices);
  const preset = presetOf(kind, analysis);
  const spec = PRESETS[preset];
  const ChartIcon =
    spec.chart === "line" ? LineChart : spec.chart === "distribution" ? PieChart : BarChart3;

  return (
    <div
      className="flex flex-col gap-2.5 rounded-xl border px-3 py-3"
      style={{ borderColor: `${color}33`, backgroundColor: `${color}0F` }}
    >
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.13em] text-muted-foreground/70">
          {t("preset.title")}
        </span>
        <span className="h-px flex-1" style={{ backgroundColor: `${color}2E` }} />
        <span
          className="rounded-full px-2 py-0.5 text-[11px] font-medium"
          style={{ color, backgroundColor: `${color}1F` }}
        >
          {t(LABEL[preset])}
        </span>
      </div>

      {/* Hangi kutuların çıkacağı — analiz sayfasının küçük bir provası */}
      <div className="flex flex-wrap gap-1">
        {spec.stats.map((s) => (
          <span
            key={s}
            className="rounded-md border border-border/70 bg-white/[0.04] px-2 py-0.5 text-[11px] text-foreground/85"
          >
            {t(STAT_LABEL[s])}
          </span>
        ))}
      </div>

      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/70">
        <ChartIcon className="h-3 w-3" />
        {t(CHART_LABEL[spec.chart])}
      </div>
    </div>
  );
}
