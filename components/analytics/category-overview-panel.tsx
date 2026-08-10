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
  fmtPct,
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
    const {
      aggregate,
      averageOf,
      filledCount,
      fillBucket,
      valueLabelOf,
      valueByEntry,
      unit,
      kind,
      isRate,
    } = compute;
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

    // Evet serisi — üst üste "evet" denen günler. Yukarıdaki seriden farkı:
    // gün AKTİF değil, EVET olmalı. Aynı günde hem evet hem hayır varsa gün
    // evet sayılır (alışkanlık en az bir kez yapılmış).
    const yesStreaks = isRate
      ? computeStreaks(
          new Set(
            entries
              .filter((e) => (valueByEntry.get(e.id) ?? 0) > 0)
              .map((e) => dayKey(e.occurredAt))
          ),
          now
        )
      : null;

    // Gelişim — son 28 gün (bugün dahil) vs önceki 28 gün, seçili metrikte.
    // Oranda karşılaştırılan şey adet değil oranın kendisi; farkı da yüzdenin
    // yüzdesi olarak değil PUAN olarak veriyoruz ("%75 → %60, 15 puan").
    const recentStart = today - (TREND_WINDOW_DAYS - 1) * DAY_MS;
    const prevStart = recentStart - TREND_WINDOW_DAYS * DAY_MS;
    const recentEntries = entries.filter((e) => e.occurredAt >= recentStart);
    const prevEntries = entries.filter(
      (e) => e.occurredAt >= prevStart && e.occurredAt < recentStart
    );
    const recentValue = isRate
      ? averageOf(recentEntries)
      : aggregate(recentEntries);
    const prevValue = isRate ? averageOf(prevEntries) : aggregate(prevEntries);
    const hasPrev = isRate ? filledCount(prevEntries) > 0 : prevValue > 0;
    const growthPct =
      !isRate && hasPrev ? ((recentValue - prevValue) / prevValue) * 100 : null;
    const growthPoints = isRate && hasPrev ? (recentValue - prevValue) * 100 : null;

    // Trend serisi — ilk girdiden bugüne, pencere büyüdükçe kova kabalaşır
    const win = resolveSeriesWindow(0, minOcc, now);
    const buckets = buildSeriesBuckets(win.startMs, win.endMs, win.granularity);
    const idx = new Map(buckets.map((b, i) => [b.key, i]));
    const bucketEntries: Entry[][] = buckets.map(() => []);
    for (const e of entries) {
      const i = idx.get(bucketKeyOf(e.occurredAt, win.granularity));
      if (i !== undefined) bucketEntries[i].push(e);
    }
    buckets.forEach((b, i) => fillBucket(b, bucketEntries[i]));
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
    // Oranda satırlar birbirinin payı değil; her satır kendi oranını çizer ve
    // "hiç evet yok" (value 0, payda dolu) da gösterilmesi gereken bir bilgi
    const shareRows: ShareRow[] = [...bySubEntries.entries()]
      .map(([id, list]) => ({ id, value: aggregate(list), outOf: filledCount(list) }))
      .filter((r) => (isRate ? r.outOf > 0 : r.value > 0))
      .map(({ id, value, outOf }) => {
        const s = subById.get(id)!;
        return {
          id,
          name: s.isCategoryRoot ? category.name : s.name,
          color: category.color,
          value,
          outOf,
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
          valueLabel: valueLabelOf(e.id),
        };
      });

    return {
      empty: false as const,
      total,
      avg,
      rate: filledCount(entries) ? total / filledCount(entries) : 0,
      withValueCount,
      elapsedDays,
      dailyAvg,
      activeDayCount: activeDayKeys.size,
      activeRatio,
      streaks,
      yesStreaks,
      recentValue,
      prevValue,
      growthPct,
      growthPoints,
      hasPrev,
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
      ) : compute.displayMode === "rate" ? (
        /* Oran — ana rakam yüzde; ham adet dönem uzunluğuna bağlı olduğundan
           tek başına karşılaştırılamaz. Üçüncü kutu "evet serisi": yukarıdaki
           İstikrar bloğu girdi girilen günü sayar, bu evet denen günü. */
        <div className="grid grid-cols-3 gap-2">
          <StatTile
            label={t("stat.yesRate")}
            value={fmtPct(computed.rate)}
            sub={`${fmtNum(computed.total)}/${fmtNum(computed.withValueCount)}`}
          />
          <StatTile
            label={t("entry.yes")}
            value={fmtNum(computed.total)}
            sub={t("stat.outOfEntries", { n: computed.withValueCount })}
          />
          <StatTile
            label={t("stat.yesStreak")}
            value={fmtNum(computed.yesStreaks?.current ?? 0)}
            unit={t("stat.days")}
            sub={t("stat.best", { n: computed.yesStreaks?.best ?? 0 })}
          />
        </div>
      ) : compute.displayMode === "presence" ? (
        /* Metin — sayılacak tek şey "kaç girdide yazılmış"; asıl değer aşağıdaki
           listede, metnin kendisini dönem süzgeciyle okuyabilmekte */
        <div className="grid grid-cols-2 gap-2">
          <StatTile
            label={t("stat.written")}
            value={fmtNum(computed.total)}
            sub={t("stat.outOfEntries", { n: data.entries.length })}
          />
          <StatTile
            label={t("stat.dailyAverage")}
            value={fmtNum(computed.dailyAvg)}
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
              sub={t("stat.perEntry")}
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
            sub={`${computed.activeDayCount}/${computed.elapsedDays} ${t("stat.days")}`}
          />
          <StatTile
            label={t("insights.currentStreak")}
            value={fmtNum(computed.streaks.current)}
            unit={t("stat.days")}
            sub="in a row"
          />
          <StatTile
            label="Rekor Seri"
            value={fmtNum(computed.streaks.best)}
            unit={t("stat.days")}
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
            label={t("insights.last4Weeks")}
            value={
              compute.isRate
                ? fmtPct(computed.recentValue)
                : fmtNum(computed.recentValue)
            }
            unit={
              compute.isRate
                ? undefined
                : computed.isAvgMetric
                  ? unit
                  : metricLabel
            }
            sub={
              computed.growthPoints !== null
                ? t("stat.pointsVsPrev", {
                    sign: computed.growthPoints >= 0 ? "+" : "−",
                    n: fmtNum(Math.abs(computed.growthPoints)),
                  })
                : computed.growthPct !== null
                  ? t("stat.pctVsPrev", {
                      sign: computed.growthPct >= 0 ? "+" : "−",
                      pct: fmtPct(Math.abs(computed.growthPct) / 100),
                    })
                  : t("stat.noPrevPeriod")
            }
          />
          <StatTile
            label={t("insights.prev4Weeks")}
            /* Oranda veri yokluğu "%0" diye okunmamalı — 0 puan gerçek bir
               değerdir, veri yokluğu değil */
            value={
              compute.isRate
                ? computed.hasPrev
                  ? fmtPct(computed.prevValue)
                  : "—"
                : fmtNum(computed.prevValue)
            }
            unit={
              compute.isRate
                ? undefined
                : computed.isAvgMetric
                  ? unit
                  : metricLabel
            }
            sub={
              compute.isRate
                ? computed.hasPrev
                  ? t("stat.yesRate")
                  : t("stat.noData")
                : computed.isAvgMetric
                  ? "average"
                  : "total"
            }
          />
        </div>
      </div>

      {/* Alt kategori kırılımı — trendden ÖNCE: önce "ne nereye gitmiş"
          görülür, istenirse alt kategoriye inilir, sonra trend incelenir */}
      <div className="rounded-2xl border border-border bg-card p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Subcategory breakdown
          {compute.aggregateNote && (
            <span className="normal-case font-normal text-muted-foreground/60">
              {" "}
              ({compute.aggregateNote})
            </span>
          )}
        </h3>
        <ShareBars
          rows={computed.shareRows}
          mode={compute.isRate ? "rate" : "share"}
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
          {compute.aggregateNote && (
            <span className="normal-case font-normal text-muted-foreground/60">
              {" "}
              ({compute.aggregateNote})
            </span>
          )}{" "}
          · Tüm Zamanlar
        </h3>
        <DailyBarChart
          data={computed.buckets}
          color={category.color}
          unit={metric.type === "count" ? "entries" : unit}
          caption={computed.seriesFrame?.caption}
          stack={
            compute.isRate
              ? { valueLabel: t("entry.yes"), restLabel: t("entry.no") }
              : undefined
          }
        />
      </div>

      {/* Girdi listesi — son 50 */}
      <EntryListSection
        title={t("home.recentEntries")}
        accent={category.color}
        rows={computed.entryRows}
        emptyText={
          metric.type === "mod" ? `${metric.mod.name} verisi yok` : "Girdi yok"
        }
      />
    </div>
  );
}
