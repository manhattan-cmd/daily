"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  bucketAncestorId,
  bucketKeyOf,
  buildSeriesBuckets,
  chooseGranularity,
  fmtNum,
  frameDailySeries,
  framePeriodSeries,
  GRANULARITY_TITLES,
  monthStartMs,
  rangeStartMs,
  resolveSeriesWindow,
  startOfDayMs,
  statSub,
  weekStartMs,
  type Granularity,
  type RangeKey,
  type SeriesFrame,
  RANGE_LABELS,
} from "@/lib/analytics";
import { monthPeriod, weekPeriod, yearPeriod } from "@/lib/period";
import { StatTile } from "./stat-tile";
import { DailyBarChart } from "./daily-bar-chart";
import { ShareBars, type ShareRow } from "./share-bars";
import { RangePicker } from "./range-picker";
import { EntryList, type EntryListRow } from "./entry-list";
import { MetricChips } from "./metric-chips";
import { useCategoryMetrics } from "./use-category-metrics";
import type { Category, Entry, SubCategory } from "@/types";

/**
 * Bir alt kategori düğümünün analiz paneli — CategoryPanel ile aynı desen,
 * ama tüm kategori yerine bu düğümün alt ağacına (kendisi + tüm torunları) odaklanır.
 * Alt kategori dağılımı yalnızca bir kademe altını (immediate children) gruplar;
 * satıra basınca kendi rotasına (aynı component) tekrar bağlanarak derinlemesine iner.
 */
export function SubcategoryPanel({
  category,
  subcategory,
  range,
  rangeStart,
  initialMetricId,
}: {
  category: Category;
  subcategory: SubCategory;
  range: RangeKey;
  rangeStart: number;
  /** URL'den gelen başlangıç metriği: "count" ya da bir mod id'si — üst sayfadaki seçimi devam ettirir */
  initialMetricId?: string;
}) {
  const router = useRouter();
  const [shareRange, setShareRange] = useState<RangeKey>(range);
  const shareRangeStart = useMemo(
    () => rangeStartMs(shareRange, new Date()),
    [shareRange]
  );

  const fetchStart = useMemo(() => {
    const now = new Date();
    return Math.min(rangeStart, weekStartMs(now), monthStartMs(now), shareRangeStart);
  }, [rangeStart, shareRangeStart]);

  const { data, metric, setMetricChoice, compute } = useCategoryMetrics({
    category,
    rootSubId: subcategory.id,
    fetchStart,
    initialMetricId,
    resetKey: subcategory.id,
  });

  const computed = useMemo(() => {
    if (!data || !compute) return null;
    const { subById, entries } = data;
    const { aggregate, averageOf, valueByEntry, displayMode, unit } = compute;
    const now = new Date();

    const statSince = (start: number) => {
      const subset = entries.filter((e) => e.occurredAt >= start);
      return {
        value: aggregate(subset),
        avg: displayMode === "both" ? averageOf(subset) : undefined,
      };
    };

    // Seri penceresi — bu hafta/ay/yıl aralıklarında dönem sayfalarıyla aynı
    // görünüm: tüm dönem baştan yer tutar (gelecek kovalar 0), eksen
    // framePeriodSeries ile sadeleşir; ay serisi haftalardan oluşur. Diğer
    // aralıklarda pencere büyüdükçe kovalar kabalaşır, "Tümü"nde pencere ilk
    // girdiye kıstırılır; gün kovalı serilerde eksen yine sadeleştirilir.
    let minOccurred: number | undefined;
    for (const e of entries) {
      if (minOccurred === undefined || e.occurredAt < minOccurred)
        minOccurred = e.occurredAt;
    }
    const periodKind =
      range === "hafta"
        ? ("week" as const)
        : range === "ay"
          ? ("month" as const)
          : range === "yil"
            ? ("year" as const)
            : null;
    let granularity: Granularity;
    let seriesStart: number;
    let seriesEnd: number;
    if (periodKind) {
      const p =
        periodKind === "week"
          ? weekPeriod(now.getTime())
          : periodKind === "month"
            ? monthPeriod(now.getTime())
            : yearPeriod(now.getTime());
      granularity =
        periodKind === "month" ? "week" : chooseGranularity(p.start, p.end);
      seriesStart = p.start;
      seriesEnd = p.end;
    } else {
      const win = resolveSeriesWindow(rangeStart, minOccurred, now);
      granularity = win.granularity;
      seriesStart = win.startMs;
      seriesEnd = win.endMs;
    }
    const buckets = buildSeriesBuckets(seriesStart, seriesEnd, granularity);
    const bucketIdx = new Map(buckets.map((b, i) => [b.key, i]));
    const bucketEntries: Entry[][] = buckets.map(() => []);
    for (const e of entries) {
      if (e.occurredAt < seriesStart) continue;
      const i = bucketIdx.get(bucketKeyOf(e.occurredAt, granularity));
      if (i !== undefined) bucketEntries[i].push(e);
    }
    buckets.forEach((b, i) => {
      b.value = aggregate(bucketEntries[i]);
    });
    const seriesFrame: SeriesFrame | null = periodKind
      ? framePeriodSeries(periodKind, seriesStart, buckets)
      : granularity === "day"
        ? frameDailySeries(buckets)
        : null;

    // Alt kategori kırılımı — yalnızca bir kademe altı (immediate children); kendi üzerine düşen
    // girdiler "Genel" adıyla ayrı bir satırda toplanır
    const shareEntries = entries.filter((e) => e.occurredAt >= shareRangeStart);
    const bySubEntries = new Map<string, Entry[]>();
    for (const e of shareEntries) {
      const bucketId = bucketAncestorId(e.subcategoryId, subById, subcategory.id);
      if (!bucketId) continue;
      const list = bySubEntries.get(bucketId) ?? [];
      list.push(e);
      bySubEntries.set(bucketId, list);
    }
    const shareRows: ShareRow[] = [...bySubEntries.entries()]
      .map(([id, list]) => ({ id, value: aggregate(list) }))
      .filter((r) => r.value > 0)
      .map(({ id, value }) => {
        const isSelf = id === subcategory.id;
        const s = isSelf ? subcategory : subById.get(id);
        return {
          id,
          name: isSelf ? "Genel" : s?.name ?? "—",
          color: category.color,
          value,
          display: unit ? `${fmtNum(value)} ${unit}` : fmtNum(value),
        };
      });

    // Girdi listesi — bu düğümün tüm alt ağacı, metrik bir mod ise yalnızca değeri olan girdiler
    const listEntries =
      metric.type === "mod"
        ? shareEntries.filter((e) => valueByEntry.has(e.id))
        : shareEntries;
    const entryRows: EntryListRow[] = [...listEntries]
      .sort((a, b) => b.occurredAt - a.occurredAt)
      .map((e) => {
        const owner =
          e.subcategoryId === subcategory.id
            ? undefined
            : subById.get(e.subcategoryId);
        return {
          id: e.id,
          occurredAt: e.occurredAt,
          title: e.title,
          notes: e.notes,
          subLabel: owner?.name,
          valueLabel:
            metric.type === "mod"
              ? `${fmtNum(valueByEntry.get(e.id) ?? 0)}${unit ? ` ${unit}` : ""}`
              : undefined,
        };
      });

    return {
      today: statSince(startOfDayMs(now)),
      week: statSince(weekStartMs(now)),
      month: statSince(monthStartMs(now)),
      buckets,
      granularity,
      seriesFrame,
      shareRows,
      entryRows,
    };
  }, [data, compute, metric.type, rangeStart, shareRangeStart, category.color, subcategory]);

  if (!data || !compute || !computed) return null;

  const metricLabel = metric.type === "count" ? "girdi" : compute.unit || undefined;
  const metricParam = metric.type === "count" ? "count" : metric.mod.id;
  const hasChildren = data.children.length > 0;

  const goTo = (subId: string) => {
    if (subId === subcategory.id) return;
    router.push(
      `/analytics/${category.id}/${subId}?range=${shareRange}&metric=${metricParam}`
    );
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Metrik seçici — bu ağacın sayısal modları + girdi sayısı */}
      <MetricChips
        numericMods={data.numericMods}
        metric={metric}
        color={category.color}
        onChange={setMetricChoice}
      />

      <div className="grid grid-cols-3 gap-2">
        <StatTile
          label="Bugün"
          value={fmtNum(computed.today.value)}
          unit={metricLabel}
          sub={
            compute.displayMode &&
            statSub(compute.displayMode, computed.today.avg, compute.unit)
          }
        />
        <StatTile
          label="Bu Hafta"
          value={fmtNum(computed.week.value)}
          unit={metricLabel}
          sub={
            compute.displayMode &&
            statSub(compute.displayMode, computed.week.avg, compute.unit)
          }
        />
        <StatTile
          label="Bu Ay"
          value={fmtNum(computed.month.value)}
          unit={metricLabel}
          sub={
            compute.displayMode &&
            statSub(compute.displayMode, computed.month.avg, compute.unit)
          }
        />
      </div>

      <div className="rounded-2xl border border-border bg-card p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          {GRANULARITY_TITLES[computed.granularity]}{" "}
          {metric.type === "count" ? "girdi" : metric.mod.name}
          {metric.type === "mod" && (
            <span className="normal-case font-normal text-muted-foreground/60">
              {" "}
              ({compute.bucketIsAvg ? "ortalama" : "toplam"})
            </span>
          )}{" "}
          · {RANGE_LABELS[range]}
        </h3>
        <DailyBarChart
          data={computed.buckets}
          color={category.color}
          unit={metricLabel}
          caption={computed.seriesFrame?.caption}
          showAllTicks={computed.seriesFrame?.showAllTicks}
        />
      </div>

      {/* Alt kategori kırılımı — yalnızca alt kategorisi olan düğümlerde gösterilir */}
      {hasChildren && (
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Alt Kategori Dağılımı
              {metric.type === "mod" && (
                <span className="normal-case font-normal text-muted-foreground/60">
                  {" "}
                  ({compute.bucketIsAvg ? "ortalama" : "toplam"})
                </span>
              )}
            </h3>
            <RangePicker value={shareRange} onChange={setShareRange} />
          </div>
          <ShareBars
            rows={computed.shareRows}
            emptyText={
              metric.type === "mod"
                ? `Bu aralıkta ${metric.mod.name} verisi yok`
                : "Bu aralıkta girdi yok"
            }
            onSelect={goTo}
          />
        </div>
      )}

      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Girdi Listesi
          </h3>
          {!hasChildren && (
            <RangePicker value={shareRange} onChange={setShareRange} />
          )}
          {hasChildren && (
            <span className="text-[10px] text-muted-foreground">
              {RANGE_LABELS[shareRange]}
            </span>
          )}
        </div>
        <EntryList
          rows={computed.entryRows}
          emptyText={
            metric.type === "mod"
              ? `Bu aralıkta ${metric.mod.name} verisi yok`
              : "Bu aralıkta girdi yok"
          }
        />
      </div>
    </div>
  );
}
