"use client";

import { useMemo } from "react";
import {
  bucketAncestorId,
  bucketKeyOf,
  buildSeriesBuckets,
  chooseGranularity,
  fmtNum,
  GRANULARITY_TITLES,
  startOfDayMs,
} from "@/lib/analytics";
import type { Period } from "@/lib/period";
import { StatTile } from "./stat-tile";
import { DailyBarChart } from "./daily-bar-chart";
import { ShareBars, type ShareRow } from "./share-bars";
import { EntryList, type EntryListRow } from "./entry-list";
import { MetricChips } from "./metric-chips";
import { useCategoryMetrics } from "./use-category-metrics";
import type { Category, Entry } from "@/types";

/**
 * Dönem sayfasındaki kategori detayı — CategoryPanel'in donmuş bir zaman
 * penceresine ([period.start, period.end)) kısıtlı hâli. KPI'lar göreli dönemler
 * (bugün/hafta/ay) yerine pencerenin kendisine aittir: toplam / ortalama / girdi.
 */
export function PeriodCategoryPanel({
  category,
  period,
}: {
  category: Category;
  period: Period;
}) {
  const { data, metric, setMetricChoice, compute } = useCategoryMetrics({
    category,
    fetchStart: period.start,
    fetchEnd: period.end,
    resetKey: `${category.id}|${period.key}`,
  });

  const computed = useMemo(() => {
    if (!data || !compute) return null;
    const { subById, entries } = data;
    const { aggregate, averageOf, valueByEntry, unit } = compute;

    const total = aggregate(entries);
    const avg = averageOf(entries);
    const withValueCount =
      metric.type === "mod"
        ? entries.filter((e) => valueByEntry.has(e.id)).length
        : entries.length;

    // Seri — tek günlük dönemde grafik yok; "Tümü"nde pencere ilk girdiye kıstırılır
    const spanDays = (period.end - period.start) / 86400000;
    let buckets: ReturnType<typeof buildSeriesBuckets> = [];
    let granularity: ReturnType<typeof chooseGranularity> = "day";
    const hasSeries = spanDays > 1.5;
    if (hasSeries) {
      let effStart = period.start;
      if (period.kind === "all") {
        let minOcc: number | undefined;
        for (const e of entries) {
          if (minOcc === undefined || e.occurredAt < minOcc) minOcc = e.occurredAt;
        }
        effStart = startOfDayMs(new Date(minOcc ?? Date.now()));
      }
      granularity = chooseGranularity(effStart, period.end);
      buckets = buildSeriesBuckets(effStart, period.end, granularity);
      const idx = new Map(buckets.map((b, i) => [b.key, i]));
      const bucketEntries: Entry[][] = buckets.map(() => []);
      for (const e of entries) {
        const i = idx.get(bucketKeyOf(e.occurredAt, granularity));
        if (i !== undefined) bucketEntries[i].push(e);
      }
      buckets.forEach((b, i) => {
        b.value = aggregate(bucketEntries[i]);
      });
    }

    // Alt kategori kırılımı — iç içe altlar en üst ataya toplanır
    const bySubEntries = new Map<string, Entry[]>();
    for (const e of entries) {
      const topId = bucketAncestorId(e.subcategoryId, subById);
      if (!topId) continue;
      const list = bySubEntries.get(topId) ?? [];
      list.push(e);
      bySubEntries.set(topId, list);
    }
    const shareRows: ShareRow[] = [...bySubEntries.entries()]
      .map(([id, list]) => ({ id, value: aggregate(list) }))
      .filter((r) => r.value > 0)
      .map(({ id, value }) => {
        const s = subById.get(id)!;
        return {
          id,
          name: s.isCategoryRoot ? "Genel" : s.name,
          color: category.color,
          value,
          display: unit ? `${fmtNum(value)} ${unit}` : fmtNum(value),
        };
      });

    const listEntries =
      metric.type === "mod"
        ? entries.filter((e) => valueByEntry.has(e.id))
        : entries;
    const entryRows: EntryListRow[] = [...listEntries]
      .sort((a, b) => b.occurredAt - a.occurredAt)
      .map((e) => {
        const sub = subById.get(e.subcategoryId);
        return {
          id: e.id,
          occurredAt: e.occurredAt,
          title: e.title,
          notes: e.notes,
          subLabel: sub ? (sub.isCategoryRoot ? "Genel" : sub.name) : undefined,
          valueLabel:
            metric.type === "mod"
              ? `${fmtNum(valueByEntry.get(e.id) ?? 0)}${unit ? ` ${unit}` : ""}`
              : undefined,
        };
      });

    return {
      total,
      avg,
      withValueCount,
      buckets,
      granularity,
      hasSeries,
      shareRows,
      entryRows,
    };
  }, [data, compute, metric.type, period, category.color]);

  if (!data || !compute || !computed) return null;

  const unit = compute.unit || undefined;

  return (
    <div className="flex flex-col gap-4">
      <MetricChips
        numericMods={data.numericMods}
        metric={metric}
        color={category.color}
        onChange={setMetricChoice}
      />

      {/* Dönem KPI'ları — pencere donuk olduğundan bugün/hafta/ay yerine toplam/ortalama */}
      {metric.type === "count" ? (
        <StatTile
          label="Girdi"
          value={fmtNum(computed.withValueCount)}
          sub={period.label}
        />
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {compute.displayMode === "both" && (
            <StatTile
              label="Toplam"
              value={fmtNum(computed.total)}
              unit={unit}
            />
          )}
          <StatTile
            label="Ortalama"
            value={fmtNum(computed.avg)}
            unit={unit}
            sub="girdi başına"
          />
          <StatTile
            label="Girdi"
            value={fmtNum(computed.withValueCount)}
            sub="değerli"
          />
        </div>
      )}

      {/* Seri — bir günden uzun dönemlerde */}
      {computed.hasSeries && (
        <div className="rounded-2xl border border-border bg-card p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            {GRANULARITY_TITLES[computed.granularity]}{" "}
            {metric.type === "count" ? "girdi" : metric.mod.name}
            {metric.type === "mod" && (
              <span className="normal-case font-normal text-muted-foreground/60">
                {" "}
                ({compute.bucketIsAvg ? "ortalama" : "toplam"})
              </span>
            )}
          </h3>
          <DailyBarChart
            data={computed.buckets}
            color={category.color}
            unit={metric.type === "count" ? "girdi" : unit}
          />
        </div>
      )}

      {/* Alt kategori kırılımı */}
      <div className="rounded-2xl border border-border bg-card p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Alt Kategori Dağılımı
          {metric.type === "mod" && (
            <span className="normal-case font-normal text-muted-foreground/60">
              {" "}
              ({compute.bucketIsAvg ? "ortalama" : "toplam"})
            </span>
          )}
        </h3>
        <ShareBars
          rows={computed.shareRows}
          emptyText={
            metric.type === "mod"
              ? `Bu dönemde ${metric.mod.name} verisi yok`
              : "Bu dönemde girdi yok"
          }
        />
      </div>

      {/* Girdi listesi */}
      <div className="rounded-2xl border border-border bg-card p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Girdi Listesi
        </h3>
        <EntryList
          rows={computed.entryRows}
          emptyText={
            metric.type === "mod"
              ? `Bu dönemde ${metric.mod.name} verisi yok`
              : "Bu dönemde girdi yok"
          }
        />
      </div>
    </div>
  );
}
