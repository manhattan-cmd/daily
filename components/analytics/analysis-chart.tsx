"use client";

import { Plus } from "lucide-react";
import { fmtEntryDateTime, MAX_CHARTS, type DayBucket, type ScaleRange } from "@/lib/analytics";
import { useT, type MessageKey } from "@/lib/i18n";
import { DailyBarChart } from "./daily-bar-chart";
import { ChoiceDistribution } from "./choice-distribution";
import { ViewMenu } from "./view-menu";
import type { ChartKind, Entry } from "@/types";

/**
 * Panodaki grafikler — kullanıcının kurduğu liste.
 *
 * Aynı veriye birden çok soru sorulabiliyor: haftalık toplam çubuğu ile
 * birikimli çizgi yan yana durunca "bu hafta ne harcadım" ve "ay sonunda
 * nereye varırım" aynı ekranda cevaplanıyor. Her grafiğin başlığına
 * dokunmak türünü değiştiriyor ya da grafiği kaldırıyor; sondaki kesik
 * çerçeve yenisini ekliyor.
 *
 * Grafikler kovaların HAM okumalarından besleniyor (bucket.sum / .avg):
 * seri okumasını tek bir yere bağlamak, iki grafiği aynı anda göstermeyi
 * imkânsız kılıyordu.
 */

export const CHART_LABEL: Record<ChartKind, MessageKey> = {
  bar: "chart.bar",
  line: "chart.line",
  cumulative: "chart.cumulative",
  points: "chart.points",
  distribution: "chart.distribution",
};

export const CHART_HINT: Record<ChartKind, MessageKey> = {
  bar: "chart.barHint",
  line: "chart.lineHint",
  cumulative: "chart.cumulativeHint",
  points: "chart.pointsHint",
  distribution: "chart.distributionHint",
};

/** Noktalı grafikte en fazla kaç girdi — daha fazlası okunmuyor, kaydırıyor */
const MAX_POINTS = 60;

/** Grafiğin kovadan okuduğu rakam */
function seriesOf(kind: ChartKind, buckets: DayBucket[]): DayBucket[] {
  if (kind === "line") {
    return buckets.map((b) => ({ ...b, value: b.avg ?? 0 }));
  }
  if (kind === "cumulative") {
    let run = 0;
    return buckets.map((b) => {
      run += b.sum ?? 0;
      // Birikimli çizgide "veri yok" diye bir kova olmaz: birikmiş toplam
      // boş günlerde de geçerlidir, düz devam eder
      return { ...b, value: run, hasData: true };
    });
  }
  return buckets.map((b) => ({ ...b, value: b.sum ?? b.value }));
}

/** Girdi girdi seri — her kayıt kendi noktası */
function pointsOf(
  entries: Entry[],
  valueByEntry: Map<string, number>
): DayBucket[] {
  return entries
    .filter((e) => valueByEntry.has(e.id))
    .sort((a, b) => a.occurredAt - b.occurredAt)
    .slice(-MAX_POINTS)
    .map((e) => {
      const label = fmtEntryDateTime(e.occurredAt).split(" · ")[0];
      return {
        key: e.id,
        label,
        axisLabel: label,
        full: fmtEntryDateTime(e.occurredAt),
        value: valueByEntry.get(e.id) ?? 0,
        hasData: true,
      };
    });
}

export function AnalysisCharts({
  charts,
  options,
  onPick,
  buckets,
  entries,
  valueByEntry,
  distribution,
  choiceFilter,
  onChoiceFilter,
  color,
  unit,
  caption,
  showAllTicks,
  stack,
  scale,
  onSelect,
  title,
}: {
  charts: ChartKind[];
  options: ChartKind[];
  onPick: (slot: number, kind: ChartKind | null) => void;
  buckets: DayBucket[];
  entries: Entry[];
  valueByEntry: Map<string, number>;
  /** Dağılım grafiği için etiket sayımları */
  distribution: { choice: string; count: number }[];
  choiceFilter?: string | null;
  onChoiceFilter?: (choice: string | null) => void;
  color: string;
  unit?: string;
  caption?: string;
  showAllTicks?: boolean;
  stack?: { valueLabel: string; restLabel: string };
  scale?: ScaleRange;
  onSelect?: (periodKey: string) => void;
  /** Grafiğin üstündeki bağlam ("YÜRÜYÜŞ · HAFTALIK SÜRE") */
  title: (kind: ChartKind) => React.ReactNode;
}) {
  const t = useT();
  const canEdit = options.length > 0;

  return (
    <div className="flex flex-col gap-3">
      {charts.map((kind, slot) => (
        <div
          key={`${kind}-${slot}`}
          className="rounded-2xl border border-border bg-card p-4"
        >
          <ViewMenu
            label={t("board.chartType")}
            value={kind}
            options={[
              ...options.map((o) => ({
                key: o,
                label: t(CHART_LABEL[o]),
                hint: t(CHART_HINT[o]),
              })),
              { key: "__remove__", label: t("board.remove"), danger: true },
            ]}
            onPick={(k) =>
              onPick(slot, k === "__remove__" ? null : (k as ChartKind))
            }
          >
            {title(kind)}
          </ViewMenu>

          {kind === "distribution" ? (
            <ChoiceDistribution
              rows={distribution}
              color={color}
              selected={choiceFilter ?? null}
              onSelect={onChoiceFilter ?? (() => {})}
            />
          ) : (
            <DailyBarChart
              data={
                kind === "points"
                  ? pointsOf(entries, valueByEntry)
                  : seriesOf(kind, buckets)
              }
              color={color}
              unit={unit}
              caption={kind === "points" ? undefined : caption}
              showAllTicks={kind === "points" ? false : showAllTicks}
              scale={scale}
              stack={kind === "bar" ? stack : undefined}
              variant={kind === "bar" ? "bar" : "line"}
              onSelect={kind === "bar" ? onSelect : undefined}
            />
          )}
        </div>
      ))}

      {canEdit && charts.length < MAX_CHARTS && (
        <ViewMenu
          label={t("board.chartType")}
          value=""
          options={options.map((o) => ({
            key: o,
            label: t(CHART_LABEL[o]),
            hint: t(CHART_HINT[o]),
          }))}
          onPick={(k) => onPick(-1, k as ChartKind)}
        >
          <div className="flex items-center justify-center gap-1.5 rounded-2xl border border-dashed border-border py-3 text-[12px] font-medium text-muted-foreground/70 transition-colors hover:border-muted-foreground/50 hover:text-foreground">
            <Plus className="h-3.5 w-3.5" />
            {t("board.addChart")}
          </div>
        </ViewMenu>
      )}
    </div>
  );
}
