"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n";
import {
  bucketKeyOf,
  buildSeriesBuckets,
  chooseGranularity,
  startOfDayMs,
  type DayBucket,
  type Granularity,
  type ScaleRange,
} from "@/lib/analytics";
import type { Period } from "@/lib/period";
import { routes } from "@/lib/routes";
import type { Category, ChartForm, ChartKind, Entry } from "@/types";
import { CHART_LABEL, explorerVariantOf, seriesOf } from "./analysis-chart";
import { ChartExplorer, type ExplorerReading, type ExplorerSeries, type ExplorerWindow } from "./chart-explorer";
import { useCategoryMetrics } from "./use-category-metrics";

const DAY = 86400000;
/** Günlük kovada güvenlik sınırı — 40 yıl */
const MAX_BUCKETS = 15000;

const READING: Record<Exclude<ChartKind, "distribution">, ExplorerReading> = {
  bar: "total",
  line: "average",
  points: "average",
  cumulative: "cumulative",
};

/**
 * Kategori panelindeki bir grafiğin inceleme ekranı — aynı yer, aynı özellik,
 * aynı okuma; ama dönemin değil BÜTÜN geçmişin kovaları (gün, hafta, ay).
 * Panel yalnız seçili dönemi okuyor; inceleme ekranında zamanda gezilebilsin
 * diye veri burada ayrıca, sınırsız pencereyle okunur. Açılışta görünen
 * pencere panelin dönemi: haftada günler, ayda günler, yılda haftalar.
 */
export function CategoryChartExplorer({
  category,
  rootSubId,
  title,
  metricId,
  metricName,
  excludeRegular,
  choiceFilter,
  kind,
  form,
  color,
  unit,
  scale,
  emptyAsZero,
  stacked,
  period,
  onClose,
}: {
  category: Category;
  rootSubId?: string;
  title: string;
  /** Panelin gösterdiği özellik ("count" = girdi sayısı) */
  metricId: string;
  metricName: string;
  excludeRegular: boolean;
  choiceFilter: string | null;
  kind: ChartKind;
  form: ChartForm;
  color: string;
  unit?: string;
  scale?: ScaleRange;
  emptyAsZero?: boolean;
  stacked?: boolean;
  period: Period;
  onClose: () => void;
}) {
  const t = useT();
  const router = useRouter();
  const metrics = useCategoryMetrics({
    category,
    rootSubId,
    fetchStart: 0,
    resetKey: category.id,
    preferredMetricId: metricId,
    excludeRegular,
  });
  // Seçenek süzgeci açıksa inceleme de o seçeneği saysın
  const setChoice = metrics.setChoiceFilter;
  useEffect(() => setChoice(choiceFilter), [choiceFilter, setChoice]);

  const { data, compute } = metrics;
  const series = useMemo<ExplorerSeries | undefined>(() => {
    if (!data || !compute) return undefined;
    const entries: Entry[] = data.entries;
    let first = Infinity;
    for (const e of entries) if (e.occurredAt < first) first = e.occurredAt;
    const now = new Date();
    const end = startOfDayMs(now) + DAY;
    // Başlangıç ilk kayıt; panelin dönemi daha erken başlıyorsa o (açılış
    // penceresi dönemin tamamını gösterebilsin)
    let start = startOfDayMs(new Date(Number.isFinite(first) ? first : now.getTime()));
    if (period.kind !== "all" && period.start < start) start = startOfDayMs(new Date(period.start));
    const seriesKind: ChartKind = kind === "points" ? "line" : kind;
    const build = (g: Granularity): DayBucket[] => {
      const buckets = buildSeriesBuckets(start, end, g, MAX_BUCKETS);
      const idx = new Map(buckets.map((b, i) => [b.key, i]));
      const lists: Entry[][] = buckets.map(() => []);
      for (const e of entries) {
        const i = idx.get(bucketKeyOf(e.occurredAt, g));
        if (i !== undefined) lists[i].push(e);
      }
      buckets.forEach((b, i) => compute.fillBucket(b, lists[i]));
      return seriesOf(seriesKind, buckets, emptyAsZero, !!scale);
    };
    return { day: build("day"), week: build("week"), month: build("month") };
  }, [data, compute, kind, emptyAsZero, scale, period.kind, period.start]);

  // Açılış penceresi panelin dönemi; kovası dönemin uzunluğuna göre bir
  // kademe ince (ayda günler, yılda haftalar) — inceleme ayrıntı için
  const initial = useMemo<ExplorerWindow>(() => {
    if (period.kind === "all") return { g: "month", start: -Infinity, end: Infinity };
    const g: Granularity =
      period.kind === "week" || period.kind === "month" || period.kind === "day"
        ? "day"
        : period.kind === "year"
          ? "week"
          : chooseGranularity(period.start, period.end) === "month"
            ? "week"
            : "day";
    return { g, start: period.start, end: period.end };
  }, [period.kind, period.start, period.end]);

  const explorable = kind !== "distribution";
  return (
    <ChartExplorer
      open={explorable}
      onClose={onClose}
      title={title}
      subtitle={`${metricName} · ${t(CHART_LABEL[kind])}`}
      color={color}
      unit={unit}
      reading={explorable ? READING[kind] : "total"}
      variant={explorerVariantOf(kind, form)}
      series={series}
      scale={scale}
      stacked={stacked && kind === "bar" && form === "column"}
      initial={initial}
      onOpenPeriod={(key) => {
        onClose();
        router.push(routes.period(key), { scroll: false });
      }}
    />
  );
}
