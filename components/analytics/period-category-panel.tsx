"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  bucketAncestorId,
  bucketKeyOf,
  buildSeriesBuckets,
  chooseGranularity,
  fmtNum,
  framePeriodSeries,
  GRANULARITY_TITLES,
  startOfDayMs,
  statSub,
  type Granularity,
  type SeriesFrame,
} from "@/lib/analytics";
import {
  periodProgress,
  rangeKeyForPeriod,
  weekPeriod,
  type Period,
} from "@/lib/period";
import { StatTile } from "./stat-tile";
import { DailyBarChart } from "./daily-bar-chart";
import { ShareBars, type ShareRow } from "./share-bars";
import { EntryList, type EntryListRow } from "./entry-list";
import { MetricChips } from "./metric-chips";
import { useCategoryMetrics } from "./use-category-metrics";
import type { Category, Entry } from "@/types";

/**
 * Dönem sayfasındaki kategori detayı — kategori metriklerinin donmuş bir zaman
 * penceresine ([period.start, period.end)) kısıtlı analizi. Devam eden dönemlerde
 * günlük ortalama geçen gün sayısına bölünür ("perşembe günü 4 güne böl");
 * gün dönemlerinde o günü kapsayan haftanın günlük ortalamasıyla karşılaştırılır.
 */
export function PeriodCategoryPanel({
  category,
  period,
}: {
  category: Category;
  period: Period;
}) {
  const router = useRouter();
  // Gün dönemlerinde hafta bağlamı gerekir — o günü kapsayan haftanın tamamı çekilir,
  // günün kendi rakamları pencere filtresiyle hesaplanır
  const containingWeek = useMemo(
    () => (period.kind === "day" ? weekPeriod(period.start) : null),
    [period.kind, period.start]
  );

  const { data, metric, setMetricChoice, compute } = useCategoryMetrics({
    category,
    fetchStart: containingWeek ? containingWeek.start : period.start,
    fetchEnd: containingWeek ? containingWeek.end : period.end,
    resetKey: `${category.id}|${period.key}`,
  });

  const computed = useMemo(() => {
    if (!data || !compute) return null;
    const { subById } = data;
    const { aggregate, averageOf, valueByEntry, unit, kind } = compute;
    const now = new Date();

    // Dönem penceresine düşen girdiler (hafta bağlamı için geniş çekildiyse filtrele)
    const entries = containingWeek
      ? data.entries.filter(
          (e) => e.occurredAt >= period.start && e.occurredAt < period.end
        )
      : data.entries;

    const total = aggregate(entries);
    const avg = averageOf(entries);
    const withValueCount =
      metric.type === "mod"
        ? entries.filter((e) => valueByEntry.has(e.id)).length
        : entries.length;

    // Günlük ortalama — devam eden dönemde payda geçen gün sayısı;
    // "Tümü"nde başlangıç kategorinin ilk girdisine kıstırılır
    let minOcc: number | undefined;
    for (const e of entries) {
      if (minOcc === undefined || e.occurredAt < minOcc) minOcc = e.occurredAt;
    }
    const progress = periodProgress(
      period,
      now,
      period.kind === "all" ? (minOcc ?? now.getTime()) : undefined
    );
    const dailyAvg =
      progress.elapsedDays > 0 ? total / progress.elapsedDays : 0;

    // Hafta bağlamı (yalnız gün dönemleri) — haftanın şu ana kadarki günlük
    // ortalamasına göre bu gün nerede; scale metrikte gün ort. vs hafta ort.
    let weekContext: { ref: number; deltaPct: number; perDay: boolean } | null =
      null;
    if (containingWeek) {
      const weekProgress = periodProgress(containingWeek, now);
      const dayValue = aggregate(entries);
      let ref = 0;
      if (kind === "scale") {
        ref = averageOf(data.entries);
      } else if (weekProgress.elapsedDays > 0) {
        ref = aggregate(data.entries) / weekProgress.elapsedDays;
      }
      if (ref > 0 && (metric.type === "count" || withValueCount > 0)) {
        weekContext = {
          ref,
          deltaPct: ((dayValue - ref) / ref) * 100,
          perDay: kind !== "scale",
        };
      }
    }

    // Seri — tek günlük dönemde grafik yok; hafta/ay/yıl dönemlerinde seri tüm
    // dönemi kapsar (gelecek kovalar 0'la yer tutar); özel/tümü'nde devam eden
    // dönem bugünde kırpılır; "Tümü"nde pencere ilk girdiye kıstırılır
    const spanDays = (period.end - period.start) / 86400000;
    const fullFrame =
      period.kind === "week" ||
      period.kind === "month" ||
      period.kind === "year";
    let buckets: ReturnType<typeof buildSeriesBuckets> = [];
    let granularity: Granularity = "day";
    let seriesFrame: SeriesFrame | null = null;
    const hasSeries = spanDays > 1.5;
    if (hasSeries) {
      const effStart =
        period.kind === "all"
          ? startOfDayMs(new Date(minOcc ?? now.getTime()))
          : period.start;
      const effEnd =
        progress.inProgress && !fullFrame
          ? Math.min(period.end, startOfDayMs(now) + 86400000)
          : period.end;
      granularity =
        period.kind === "month" ? "week" : chooseGranularity(effStart, effEnd);
      buckets = buildSeriesBuckets(effStart, effEnd, granularity);
      const idx = new Map(buckets.map((b, i) => [b.key, i]));
      const bucketEntries: Entry[][] = buckets.map(() => []);
      for (const e of entries) {
        const i = idx.get(bucketKeyOf(e.occurredAt, granularity));
        if (i !== undefined) bucketEntries[i].push(e);
      }
      buckets.forEach((b, i) => {
        b.value = aggregate(bucketEntries[i]);
      });
      if (
        period.kind === "week" ||
        period.kind === "month" ||
        period.kind === "year"
      ) {
        seriesFrame = framePeriodSeries(period.kind, period.start, buckets);
      }
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
      progress,
      dailyAvg,
      weekContext,
      buckets,
      granularity,
      seriesFrame,
      hasSeries,
      shareRows,
      entryRows,
    };
  }, [data, compute, metric.type, period, containingWeek, category.color]);

  if (!data || !compute || !computed) return null;

  const unit = compute.unit || undefined;
  const { progress, weekContext } = computed;
  const isDay = period.kind === "day";
  const metricLabel = metric.type === "count" ? "girdi" : unit;

  return (
    <div className="flex flex-col gap-4">
      <MetricChips
        numericMods={data.numericMods}
        metric={metric}
        color={category.color}
        onChange={setMetricChoice}
      />

      {/* Dönem KPI'ları — gün dışındaki pencerelerde günlük ortalama geçen güne bölünür */}
      {metric.type === "count" ? (
        isDay ? (
          <StatTile
            label="Girdi"
            value={fmtNum(computed.withValueCount)}
            sub={period.label}
          />
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <StatTile
              label="Girdi"
              value={fmtNum(computed.withValueCount)}
              sub="toplam"
            />
            <StatTile
              label="Günlük Ort."
              value={fmtNum(computed.dailyAvg)}
              unit="girdi"
              sub={`${progress.elapsedDays} gün üzerinden`}
            />
          </div>
        )
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {compute.displayMode === "both" && (
            <StatTile
              label="Toplam"
              value={fmtNum(computed.total)}
              unit={unit}
              sub={
                compute.displayMode &&
                statSub(compute.displayMode, computed.avg, compute.unit)
              }
            />
          )}
          {compute.displayMode === "both" && !isDay ? (
            <StatTile
              label="Günlük Ort."
              value={fmtNum(computed.dailyAvg)}
              unit={unit}
              sub={`${progress.elapsedDays} gün üzerinden`}
            />
          ) : (
            <StatTile
              label="Ortalama"
              value={fmtNum(computed.avg)}
              unit={unit}
              sub="girdi başına"
            />
          )}
          <StatTile
            label="Girdi"
            value={fmtNum(computed.withValueCount)}
            sub="değerli"
          />
        </div>
      )}

      {/* Gün dönemlerinde hafta bağlamı — bu gün haftalık ortalamaya göre nerede */}
      {isDay && weekContext && (
        <div className="rounded-2xl border border-border bg-card px-4 py-3 text-xs text-muted-foreground">
          Hafta ort.{" "}
          <span className="font-semibold text-foreground">
            {fmtNum(weekContext.ref)}
            {metricLabel ? ` ${metricLabel}` : ""}
            {weekContext.perDay ? "/gün" : ""}
          </span>{" "}
          · bu gün{" "}
          <span
            className="font-semibold"
            style={{ color: category.color }}
          >
            %{fmtNum(Math.abs(weekContext.deltaPct))}{" "}
            {weekContext.deltaPct >= 0 ? "üzerinde" : "altında"}
          </span>
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
            caption={computed.seriesFrame?.caption}
            showAllTicks={computed.seriesFrame?.showAllTicks}
          />
        </div>
      )}

      {/* Alt kategori kırılımı — satıra basınca alt kategori detayına inilir;
          içinde bulunulan gün/hafta/ay/yıl aynı pencereyle, diğerleri tüm zamanlarla */}
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
          onSelect={(subId) =>
            router.push(
              `/analytics/${category.id}/${subId}?range=${rangeKeyForPeriod(
                period
              )}&metric=${metric.type === "count" ? "count" : metric.mod.id}`
            )
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
