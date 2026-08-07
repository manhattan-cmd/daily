"use client";

import { useMemo } from "react";
import { useT } from "@/lib/i18n";
import { useRouter } from "next/navigation";
import {
  bucketAncestorId,
  bucketKeyOf,
  buildSeriesBuckets,
  computeStreaks,
  dayKey,
  fmtNum,
  frameDailySeries,
  GRANULARITY_TITLES,
  resolveSeriesWindow,
  startOfDayMs,
} from "@/lib/analytics";
import { StatTile } from "./stat-tile";
import { DailyBarChart } from "./daily-bar-chart";
import { ShareBars, type ShareRow } from "./share-bars";
import { EntryListSection, type EntryListRow } from "./entry-list";
import { MetricChips } from "./metric-chips";
import { RegularToggle, useExcludeRegular } from "./regular-toggle";
import { useCategoryMetrics } from "./use-category-metrics";
import type { Category, Entry } from "@/types";

const DAY_MS = 86400000;
/** Gelişim karşılaştırma penceresi: son 4 hafta vs önceki 4 hafta */
const TREND_WINDOW_DAYS = 28;
/** Girdi listesi tüm zamanları kapsar — son N ile sınırla */
const ENTRY_LIST_LIMIT = 50;

/**
 * Kategori perspektifi — zaman penceresinden bağımsız, kategorinin tüm zamanlar
 * analizi: toplam, ilk girdiden beri günlük ortalama, istikrar (aktif gün oranı +
 * seriler), gelişim (son 4 hafta vs önceki 4 hafta), trend, kırılım, girdiler.
 */
export function CategoryOverviewPanel({ category }: { category: Category }) {
  const t = useT();
  const router = useRouter();
  const [excludeRegular, setExcludeRegular] = useExcludeRegular();
  const { data, metric, setMetricChoice, compute } = useCategoryMetrics({
    category,
    fetchStart: 0,
    resetKey: category.id,
    excludeRegular,
  });

  const computed = useMemo(() => {
    if (!data || !compute) return null;
    const { subById, entries } = data;
    const { aggregate, averageOf, valueByEntry, unit, kind } = compute;
    const now = new Date();
    const today = startOfDayMs(now);

    if (!entries.length) return { empty: true as const };

    let minOcc = entries[0].occurredAt;
    for (const e of entries) {
      if (e.occurredAt < minOcc) minOcc = e.occurredAt;
    }
    const firstDay = startOfDayMs(new Date(minOcc));
    // İlk girdiden bugüne geçen takvim günü, bugün dahil
    const elapsedDays = Math.max(1, Math.round((today - firstDay) / DAY_MS) + 1);

    const total = aggregate(entries);
    const avg = averageOf(entries);
    const withValueCount =
      metric.type === "mod"
        ? entries.filter((e) => valueByEntry.has(e.id)).length
        : entries.length;
    const dailyAvg = total / elapsedDays;

    // İstikrar — metrikten bağımsız, kategoriye girdi girilen günler üzerinden
    const activeDayKeys = new Set(entries.map((e) => dayKey(e.occurredAt)));
    const activeRatio = (activeDayKeys.size / elapsedDays) * 100;
    const streaks = computeStreaks(activeDayKeys, now);

    // Gelişim — son 28 gün (bugün dahil) vs önceki 28 gün, seçili metrikte
    const recentStart = today - (TREND_WINDOW_DAYS - 1) * DAY_MS;
    const prevStart = recentStart - TREND_WINDOW_DAYS * DAY_MS;
    const recentEntries = entries.filter((e) => e.occurredAt >= recentStart);
    const prevEntries = entries.filter(
      (e) => e.occurredAt >= prevStart && e.occurredAt < recentStart
    );
    const recentValue = aggregate(recentEntries);
    const prevValue = aggregate(prevEntries);
    const growthPct =
      prevValue > 0 ? ((recentValue - prevValue) / prevValue) * 100 : null;

    // Trend serisi — ilk girdiden bugüne, pencere büyüdükçe kova kabalaşır
    const win = resolveSeriesWindow(0, minOcc, now);
    const buckets = buildSeriesBuckets(win.startMs, win.endMs, win.granularity);
    const idx = new Map(buckets.map((b, i) => [b.key, i]));
    const bucketEntries: Entry[][] = buckets.map(() => []);
    for (const e of entries) {
      const i = idx.get(bucketKeyOf(e.occurredAt, win.granularity));
      if (i !== undefined) bucketEntries[i].push(e);
    }
    buckets.forEach((b, i) => {
      b.value = aggregate(bucketEntries[i]);
    });
    // Kısa geçmişli (gün kovalı) serilerde eksen sadeleşir: gün numaraları + ay caption'ı
    const seriesFrame =
      win.granularity === "day" ? frameDailySeries(buckets) : null;

    // Alt kategori kırılımı (tüm zamanlar) — iç içe altlar en üst ataya toplanır
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
          name: s.isCategoryRoot ? category.name : s.name,
          color: category.color,
          value,
          display: unit ? `${fmtNum(value)} ${unit}` : fmtNum(value),
          drillable: !s.isCategoryRoot,
        };
      });

    const listEntries =
      metric.type === "mod"
        ? entries.filter((e) => valueByEntry.has(e.id))
        : entries;
    const entryRows: EntryListRow[] = [...listEntries]
      .sort((a, b) => b.occurredAt - a.occurredAt)
      .slice(0, ENTRY_LIST_LIMIT)
      .map((e) => {
        const sub = subById.get(e.subcategoryId);
        return {
          id: e.id,
          occurredAt: e.occurredAt,
          title: e.title,
          notes: e.notes,
          subLabel: sub ? (sub.isCategoryRoot ? category.name : sub.name) : undefined,
          valueLabel:
            metric.type === "mod"
              ? `${fmtNum(valueByEntry.get(e.id) ?? 0)}${unit ? ` ${unit}` : ""}`
              : undefined,
        };
      });

    return {
      empty: false as const,
      total,
      avg,
      withValueCount,
      elapsedDays,
      dailyAvg,
      activeDayCount: activeDayKeys.size,
      activeRatio,
      streaks,
      recentValue,
      prevValue,
      growthPct,
      isAvgMetric: kind === "scale",
      buckets,
      granularity: win.granularity,
      seriesFrame,
      shareRows,
      entryRows,
    };
  }, [data, compute, metric.type, category]);

  if (!data || !compute || !computed) return null;

  if (computed.empty) {
    return (
      <p className="py-8 text-center text-xs text-muted-foreground/60">
        No entries in this category yet.
      </p>
    );
  }

  const unit = compute.unit || undefined;
  const metricLabel = metric.type === "count" ? "entries" : unit;

  return (
    <div className="flex flex-col gap-4 pb-6">
      <MetricChips
        numericMods={data.numericMods}
        metric={metric}
        color={category.color}
        onChange={setMetricChoice}
      />

      {data.hasRegular && (
        <RegularToggle
          active={excludeRegular}
          onChange={setExcludeRegular}
          color={category.color}
          regularSubNames={data.regularSubNames}
          excludedEntryCount={data.excludedEntryCount}
        />
      )}

      {/* Tüm zamanlar KPI'ları */}
      {metric.type === "count" ? (
        <div className="grid grid-cols-2 gap-2">
          <StatTile
            label={t("insights.entries")}
            value={fmtNum(computed.withValueCount)}
            sub="all time"
          />
          <StatTile
            label={t("stat.dailyAverage")}
            value={fmtNum(computed.dailyAvg)}
            unit="entries"
            sub={`${computed.elapsedDays} days`}
          />
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {compute.displayMode === "both" && (
            <StatTile
              label={t("stat.total")}
              value={fmtNum(computed.total)}
              unit={unit}
              sub="all time"
            />
          )}
          {compute.displayMode === "both" ? (
            <StatTile
              label={t("stat.dailyAverage")}
              value={fmtNum(computed.dailyAvg)}
              unit={unit}
              sub={`${computed.elapsedDays} days`}
            />
          ) : (
            <StatTile
              label={t("stat.average")}
              value={fmtNum(computed.avg)}
              unit={unit}
              sub="per entry"
            />
          )}
          <StatTile
            label={t("insights.entries")}
            value={fmtNum(computed.withValueCount)}
            sub={`${computed.elapsedDays} days`}
          />
        </div>
      )}

      {/* İstikrar — aktif gün oranı ve seriler (metrikten bağımsız, girdi bazlı) */}
      <div className="flex flex-col gap-2">
        <h3 className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          İstikrar
        </h3>
        <div className="grid grid-cols-3 gap-2">
          <StatTile
            label={t("insights.activeDays")}
            value={`%${fmtNum(computed.activeRatio)}`}
            sub={`${computed.activeDayCount}/${computed.elapsedDays} gün`}
          />
          <StatTile
            label="Current streak"
            value={fmtNum(computed.streaks.current)}
            unit="gün"
            sub="in a row"
          />
          <StatTile
            label="Rekor Seri"
            value={fmtNum(computed.streaks.best)}
            unit="gün"
            sub="en uzun"
          />
        </div>
      </div>

      {/* Gelişim — son 4 hafta vs önceki 4 hafta */}
      <div className="flex flex-col gap-2">
        <h3 className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Gelişim
          <span className="normal-case font-normal text-muted-foreground/60">
            {" "}
            (son 4 hafta vs önceki)
          </span>
        </h3>
        <div className="grid grid-cols-2 gap-2">
          <StatTile
            label="Last 4 weeks"
            value={fmtNum(computed.recentValue)}
            unit={computed.isAvgMetric ? unit : metricLabel}
            sub={
              computed.growthPct !== null
                ? `önceki döneme göre %${computed.growthPct >= 0 ? "+" : "−"}${fmtNum(
                    Math.abs(computed.growthPct)
                  )}`
                : "no data in the previous period"
            }
          />
          <StatTile
            label="Previous 4 weeks"
            value={fmtNum(computed.prevValue)}
            unit={computed.isAvgMetric ? unit : metricLabel}
            sub={computed.isAvgMetric ? "average" : "total"}
          />
        </div>
      </div>

      {/* Alt kategori kırılımı — trendden ÖNCE: önce "ne nereye gitmiş"
          görülür, istenirse alt kategoriye inilir, sonra trend incelenir */}
      <div className="rounded-2xl border border-border bg-card p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Subcategory breakdown
          {metric.type === "mod" && (
            <span className="normal-case font-normal text-muted-foreground/60">
              {" "}
              ({compute.bucketIsAvg ? "average" : "total"})
            </span>
          )}
        </h3>
        <ShareBars
          rows={computed.shareRows}
          emptyText={
            metric.type === "mod"
              ? `${metric.mod.name} verisi yok`
              : "Girdi yok"
          }
          onSelect={(subId) =>
            router.push(
              `/analytics/${category.id}/${subId}?range=tum&metric=${
                metric.type === "count" ? "count" : metric.mod.id
              }`
            )
          }
        />
      </div>

      {/* Trend — ilk girdiden bugüne */}
      <div className="rounded-2xl border border-border bg-card p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          {GRANULARITY_TITLES[computed.granularity]}{" "}
          {metric.type === "count" ? "entries" : metric.mod.name}
          {metric.type === "mod" && (
            <span className="normal-case font-normal text-muted-foreground/60">
              {" "}
              ({compute.bucketIsAvg ? "average" : "total"})
            </span>
          )}{" "}
          · Tüm Zamanlar
        </h3>
        <DailyBarChart
          data={computed.buckets}
          color={category.color}
          unit={metric.type === "count" ? "entries" : unit}
          caption={computed.seriesFrame?.caption}
        />
      </div>

      {/* Girdi listesi — son 50 */}
      <EntryListSection
        title="Recent entries"
        accent={category.color}
        rows={computed.entryRows}
        emptyText={
          metric.type === "mod" ? `${metric.mod.name} verisi yok` : "Girdi yok"
        }
      />
    </div>
  );
}
