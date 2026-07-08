"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  bucketAncestorId,
  bucketKeyOf,
  buildSeriesBuckets,
  fmtNum,
  GRANULARITY_TITLES,
  monthStartMs,
  rangeStartMs,
  resolveSeriesWindow,
  startOfDayMs,
  statSub,
  weekStartMs,
  type RangeKey,
  RANGE_LABELS,
} from "@/lib/analytics";
import { StatTile } from "./stat-tile";
import { DailyBarChart } from "./daily-bar-chart";
import { ShareBars, type ShareRow } from "./share-bars";
import { RangePicker } from "./range-picker";
import { EntryList, type EntryListRow } from "./entry-list";
import { MetricChips } from "./metric-chips";
import { useCategoryMetrics } from "./use-category-metrics";
import type { Category, Entry } from "@/types";

export function CategoryPanel({
  category,
  range,
  rangeStart,
}: {
  category: Category;
  range: RangeKey;
  rangeStart: number;
}) {
  const router = useRouter();
  // Alt kategori dağılımı + girdi listesi kendi bağımsız aralığını seçebilir
  const [shareRange, setShareRange] = useState<RangeKey>(range);

  // Kategori değişiminde aralığı render sırasında sıfırla (parent'ta key remount YOK —
  // remount, liveQuery yeniden yüklenene dek paneli null'a düşürüp ekranda titreme yaratıyor;
  // metrik seçimi hook'un resetKey'iyle sıfırlanır)
  const [prevCatId, setPrevCatId] = useState(category.id);
  if (prevCatId !== category.id) {
    setPrevCatId(category.id);
    setShareRange(range);
  }

  const shareRangeStart = useMemo(
    () => rangeStartMs(shareRange, new Date()),
    [shareRange]
  );

  // KPI üçlüsü (bugün/hafta/ay) aralık filtresinden bağımsız — en erken pencereden beri çek
  const fetchStart = useMemo(() => {
    const now = new Date();
    return Math.min(rangeStart, weekStartMs(now), monthStartMs(now), shareRangeStart);
  }, [rangeStart, shareRangeStart]);

  const { data, metric, setMetricChoice, compute } = useCategoryMetrics({
    category,
    fetchStart,
    resetKey: category.id,
  });

  const computed = useMemo(() => {
    if (!data || !compute) return null;
    const { subById, entries } = data;
    const { aggregate, averageOf, valueByEntry, displayMode, unit } = compute;
    const now = new Date();

    // "both" modunda (süre, miktar vb.) KPI kutucuklarında toplamın yanına ortalama da eklenir
    const statSince = (start: number) => {
      const subset = entries.filter((e) => e.occurredAt >= start);
      return {
        value: aggregate(subset),
        avg: displayMode === "both" ? averageOf(subset) : undefined,
      };
    };

    // Seri (seçili aralık) — pencere büyüdükçe kovalar kabalaşır (gün → hafta → ay);
    // "Tümü"nde pencere kategorinin ilk girdisine kıstırılır
    let minOccurred: number | undefined;
    for (const e of entries) {
      if (minOccurred === undefined || e.occurredAt < minOccurred)
        minOccurred = e.occurredAt;
    }
    const win = resolveSeriesWindow(rangeStart, minOccurred, now);
    const buckets = buildSeriesBuckets(win.startMs, win.endMs, win.granularity);
    const bucketIdx = new Map(buckets.map((b, i) => [b.key, i]));
    const bucketEntries: Entry[][] = buckets.map(() => []);
    for (const e of entries) {
      if (e.occurredAt < win.startMs) continue;
      const i = bucketIdx.get(bucketKeyOf(e.occurredAt, win.granularity));
      if (i !== undefined) bucketEntries[i].push(e);
    }
    buckets.forEach((b, i) => {
      b.value = aggregate(bucketEntries[i]);
    });

    // Alt kategori kırılımı + girdi listesi — bağımsız seçilen aralık, iç içe altlar en üst ataya toplanır
    const shareEntries = entries.filter((e) => e.occurredAt >= shareRangeStart);
    const bySubEntries = new Map<string, Entry[]>();
    for (const e of shareEntries) {
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

    // Girdi listesi — metrik bir mod ise yalnızca o modun değeri olan girdiler gösterilir
    const listEntries =
      metric.type === "mod"
        ? shareEntries.filter((e) => valueByEntry.has(e.id))
        : shareEntries;
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
      today: statSince(startOfDayMs(now)),
      week: statSince(weekStartMs(now)),
      month: statSince(monthStartMs(now)),
      buckets,
      granularity: win.granularity,
      shareRows,
      entryRows,
    };
  }, [data, compute, metric.type, rangeStart, shareRangeStart, category.color]);

  if (!data || !compute || !computed) return null;

  const metricLabel = metric.type === "count" ? "girdi" : compute.unit || undefined;
  const metricParam = metric.type === "count" ? "count" : metric.mod.id;

  return (
    <div className="flex flex-col gap-4">
      {/* Metrik seçici — kategorinin sayısal modları + girdi sayısı */}
      <MetricChips
        numericMods={data.numericMods}
        metric={metric}
        color={category.color}
        onChange={setMetricChoice}
      />

      {/* Bugün / Bu Hafta / Bu Ay — sabit dönemler, aralık filtresinden bağımsız */}
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

      {/* Seri — seçili aralık; pencere büyüdükçe kova granülerliği kabalaşır */}
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
        />
      </div>

      {/* Alt kategori kırılımı — bağımsız seçilebilir aralık, satıra basınca detay sayfasına gider */}
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
          onSelect={(subId) =>
            router.push(
              `/analytics/${category.id}/${subId}?range=${shareRange}&metric=${metricParam}`
            )
          }
        />
      </div>

      {/* Girdi listesi — alt kategori dağılımıyla aynı aralık, kalem kalem */}
      <div className="rounded-2xl border border-border bg-card p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Girdi Listesi · {RANGE_LABELS[shareRange]}
        </h3>
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
