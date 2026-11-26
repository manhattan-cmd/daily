"use client";

import type { TagFilter } from "@/lib/tags";
import { useEffect, useMemo, useState } from "react";
import { CircleDot, Divide, Sigma, TrendingUp, type LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { translate, useT } from "@/lib/i18n";
import { modColor } from "@/lib/mod-color";
import {
  bucketKeyOf,
  buildSeriesBuckets,
  chartFormsFor,
  chooseGranularity,
  formOf,
  startOfDayMs,
  type DayBucket,
  type Granularity,
} from "@/lib/analytics";
import type { Period } from "@/lib/period";
import { routes } from "@/lib/routes";
import type { Category, ChartForm, ChartKind, Entry, SubCategory } from "@/types";
import { CHART_HINT, CHART_LABEL, FORM_HINT, FORM_ICON, FORM_LABEL, explorerVariantOf, seriesOf } from "./analysis-chart";
import {
  ChartExplorer,
  ExplorerTag,
  type ExplorerReading,
  type ExplorerSeries,
  type ExplorerWindow,
} from "./chart-explorer";
import { useCategoryMetrics } from "./use-category-metrics";

const DAY = 86400000;
/** Günlük kovada güvenlik sınırı — 40 yıl */
const MAX_BUCKETS = 15000;

type TimeKind = Exclude<ChartKind, "distribution">;
const READING: Record<TimeKind, ExplorerReading> = {
  bar: "total",
  line: "average",
  points: "average",
  cumulative: "cumulative",
};
/** Veri türlerinin simgeleri (GÖSTER seçicisi) */
const READ_ICON: Record<TimeKind, LucideIcon> = {
  bar: Sigma,
  line: Divide,
  cumulative: TrendingUp,
  points: CircleDot,
};
/** İnceleme ekranının çizebildiği biçimler (yatay çubuk ve halka zamanı çizmiyor) */
const DRAWABLE: ChartForm[] = ["column", "line", "area", "dots"];

/**
 * Grafik inceleme ekranı, kategori panelinden açılınca. Neye bakıldığı (yer
 * ve özellik) panelinkiyle aynı, burada değişmez — başlık şeridinde ufak
 * renkli kapsüllerde yazar. Grafiğin ne gösterdiği (Toplam, Ortalama,
 * Birikimli, Tek tek) ve nasıl çizildiği (sütun, çizgi, alan, nokta) burada
 * seçilir; panelin kayıtlı grafiklerine dokunmaz.
 *
 * Veri BÜTÜN geçmişten (gün, hafta, ay kovaları); panel yalnız seçili dönemi
 * okuyor. Açılış penceresi panelin dönemi: haftada ve ayda günler, yılda
 * haftalar.
 */
export function CategoryChartExplorer({
  category,
  focus,
  metricId,
  tagFilter,
  choiceFilter,
  kind,
  form,
  period,
  onClose,
}: {
  category: Category;
  /** Panelde inilen alt kalem; yoksa kategorinin tamamı */
  focus?: SubCategory;
  /** Panelin gösterdiği özellik ("count" = girdi sayısı) */
  metricId: string;
  tagFilter: TagFilter | null;
  choiceFilter: string | null;
  kind: ChartKind;
  form: ChartForm;
  period: Period;
  onClose: () => void;
}) {
  const t = useT();
  const router = useRouter();

  const [kindSel, setKindSel] = useState<ChartKind>(kind === "distribution" ? "bar" : kind);
  const [formSel, setFormSel] = useState<ChartForm>(form);

  const metrics = useCategoryMetrics({
    category,
    rootSubId: focus?.id,
    fetchStart: 0,
    resetKey: category.id,
    preferredMetricId: metricId,
    tagFilter,
  });
  const { data, compute, metric } = metrics;
  // Seçenek süzgeci açıksa inceleme de o seçeneği saysın
  const setChoice = metrics.setChoiceFilter;
  useEffect(() => setChoice(choiceFilter), [choiceFilter, setChoice]);

  // Ne gösterilsin: bu özellikte sunulan türler. Girdi sayısında panel grafik
  // sunmuyor (sayı kutuları var); burada adedin toplamı ve birikimi çizilir
  const isCount = metric.type === "count";
  const kindOptions: TimeKind[] = isCount
    ? ["bar", "cumulative"]
    : (compute?.chartOptions ?? []).filter((k): k is TimeKind => k !== "distribution");
  const kindR: TimeKind = kindSel !== "distribution" && kindOptions.includes(kindSel) ? kindSel : (kindOptions[0] ?? "bar");
  // Nasıl çizilsin: türün biçimleri; "Tek tek" incelemede günlük noktalar
  const ctx = compute ? { ...compute.formCtx, slices: 0 } : { kind: "number" as const, slices: 0 };
  const formOptions: ChartForm[] = kindR === "points" ? ["dots"] : chartFormsFor(kindR, ctx).filter((f) => DRAWABLE.includes(f));
  const formDefault = formOf(kindR, compute?.chartForms, ctx);
  const formR: ChartForm = formOptions.includes(formSel)
    ? formSel
    : formOptions.includes(formDefault)
      ? formDefault
      : (formOptions[0] ?? "column");

  // "Tek tek" incelemede günlük ortalama noktaları. Şablon dize: React
  // derleyicisi kindR'yi değişebilir bir dizinin elemanı sayıp belleklemeyi atlıyordu
  const seriesKind: ChartKind = kindR === "points" ? "line" : `${kindR}` as TimeKind;
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
    const build = (g: Granularity): DayBucket[] => {
      const buckets = buildSeriesBuckets(start, end, g, MAX_BUCKETS);
      const idx = new Map(buckets.map((b, i) => [b.key, i]));
      const lists: Entry[][] = buckets.map(() => []);
      for (const e of entries) {
        const i = idx.get(bucketKeyOf(e.occurredAt, g));
        if (i !== undefined) lists[i].push(e);
      }
      buckets.forEach((b, i) => {
        compute.fillBucket(b, lists[i]);
        // Girdi sayısında değerli kayıt yok, toplam kovanın kayıt adedi
        if (isCount) b.sum = b.value;
      });
      return seriesOf(seriesKind, buckets, compute.emptyAsZero, !!compute.scale);
    };
    return { day: build("day"), week: build("week"), month: build("month") };
  }, [data, compute, seriesKind, isCount, period.kind, period.start]);

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

  /* ——— Neye bakıldığı: renkli etiketler ——— */
  const catName =
    category.builtInKey === "mood" ? t("mood.title") : category.builtInKey === "sleep" ? t("sleep.title") : category.name;
  const rawMod = metric.type !== "count" ? data?.rawMods.get(metric.mod.id) : undefined;
  const featureColor = rawMod ? modColor(rawMod) : "#8ea6ff";
  const lensColor = rawMod ? modColor(rawMod) : category.color;
  const metricName = metric.type === "count" ? t("insights.entries") : metric.mod.name;
  const identity = (
    <>
      <ExplorerTag color={category.color} shape="square" label={focus ? `${catName} › ${focus.name}` : catName} />
      <ExplorerTag color={featureColor} shape="circle" label={metricName} />
    </>
  );

  return (
    <ChartExplorer
      open
      onClose={onClose}
      title={`${focus ? focus.name : catName} · ${metricName}`}
      color={lensColor}
      identity={identity}
      controls={{
        readings: kindOptions.map((k) => ({ key: k, label: t(CHART_LABEL[k]), hint: t(CHART_HINT[k]), icon: READ_ICON[k] })),
        reading: kindR,
        onReading: (k) => setKindSel(k as ChartKind),
        charts: formOptions.map((f) => ({ key: f, label: t(FORM_LABEL[f]), hint: t(FORM_HINT[f]), icon: FORM_ICON[f] })),
        chart: kindR === "points" ? "dots" : formR,
        onChart: (f) => setFormSel(f as ChartForm),
      }}
      unit={metric.type === "count" ? translate("an.entriesUnit") : compute?.unit || undefined}
      reading={READING[kindR]}
      variant={explorerVariantOf(kindR, formR)}
      series={series}
      scale={compute?.scale}
      stacked={!!compute?.isRate && kindR === "bar" && formR === "column"}
      initial={initial}
      onOpenPeriod={(key) => {
        onClose();
        router.push(routes.period(key), { scroll: false });
      }}
    />
  );
}
