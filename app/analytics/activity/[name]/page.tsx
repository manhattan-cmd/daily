"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { Boxes, ChevronRight } from "lucide-react";
import { db } from "@/lib/db";
import {
  buildSeriesBuckets,
  bucketKeyOf,
  classifyNumericMod,
  dayKey,
  dtrDurationHours,
  fmtNum,
  frameDailySeries,
  GRANULARITY_TITLES,
  parseNumeric,
  resolveSeriesWindow,
  sumOrAvg,
  type Metric,
  type SeriesFrame,
} from "@/lib/analytics";
import { formatDate, formatTime } from "@/lib/utils";
import { PageHeader } from "@/components/layout/page-header";
import { StatTile } from "@/components/analytics/stat-tile";
import { MetricChips } from "@/components/analytics/metric-chips";
import { DailyBarChart } from "@/components/analytics/daily-bar-chart";
import { ShareBars, type ShareRow } from "@/components/analytics/share-bars";
import type { Entry } from "@/types";

const ACTIVITY_COLOR = "#06b6d4";
const norm = (s: string) => s.trim().toLocaleLowerCase("tr-TR");

/**
 * Aktivite analizi — aynı adı taşıyan tüm aktivite oturumlarını zaman içinde
 * birleştirir ("Market alışverişi'nde toplam/aylık ne harcadım"). Girdiler alt
 * kategorilerinde kaldığından bu sayfa genel analizlerin bir kesitidir; metrik
 * seçimi, seri grafiği ve kategori dağılımı kategori panelleriyle aynı dildedir.
 */
export default function ActivityAnalyticsPage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name: rawName } = use(params);
  const name = decodeURIComponent(rawName);
  const [metricChoice, setMetricChoice] = useState<Metric | null>(null);

  const data = useLiveQuery(async () => {
    const activities = (await db.activities.toArray()).filter(
      (a) => norm(a.name) === norm(name)
    );
    if (!activities.length)
      return { activities, entries: [], values: [], numericMods: [], subById: new Map(), catById: new Map() };
    const ids = activities.map((a) => a.id);
    const entries = await db.entries.where("activityId").anyOf(ids).toArray();
    const values = entries.length
      ? await db.entryValues
          .where("entryId")
          .anyOf(entries.map((e) => e.id))
          .toArray()
      : [];
    const [subs, cats, allMods, allTypes] = await Promise.all([
      db.subcategories.toArray(),
      db.categories.toArray(),
      db.mods.toArray(),
      db.entryTypes.toArray(),
    ]);
    const typeMap = new Map(allTypes.map((t) => [t.id, t]));
    const modIds = new Set(values.map((v) => v.modId).filter((x): x is string => !!x));
    const numericMods = allMods
      .filter((m) => modIds.has(m.id))
      .map((m) => classifyNumericMod(m, typeMap.get(m.entryTypeId)))
      .filter((m): m is NonNullable<typeof m> => !!m)
      .sort((a, b) => a.name.localeCompare(b.name, "tr"));
    return {
      activities,
      entries,
      values,
      numericMods,
      subById: new Map(subs.map((s) => [s.id, s])),
      catById: new Map(cats.map((c) => [c.id, c])),
    };
  }, [name]);

  const metric = useMemo<Metric>(() => {
    if (metricChoice) return metricChoice;
    if (data?.numericMods.length) return { type: "mod", mod: data.numericMods[0] };
    return { type: "count" };
  }, [metricChoice, data]);

  const computed = useMemo(() => {
    if (!data || !data.activities.length) return null;
    const { activities, entries, values, subById, catById } = data;
    const now = new Date();

    // Girdi başına metrik değeri (count'ta 1)
    const valueByEntry = new Map<string, number>();
    if (metric.type === "mod") {
      for (const v of values) {
        if (v.modId !== metric.mod.id) continue;
        const amount =
          metric.mod.kind === "duration"
            ? dtrDurationHours(v.value)
            : parseNumeric(v.value);
        valueByEntry.set(v.entryId, (valueByEntry.get(v.entryId) ?? 0) + amount);
      }
    }
    const kind = metric.type === "mod" ? metric.mod.kind : "number";
    const aggregate = (subset: Entry[]): number =>
      metric.type === "count"
        ? subset.length
        : sumOrAvg(
            subset
              .map((e) => valueByEntry.get(e.id))
              .filter((v): v is number => v !== undefined),
            kind
          );

    const total = aggregate(entries);

    // Oturumlar — her aktivite kaydı bir oturum; en yeniden eskiye
    const byActivity = new Map<string, Entry[]>();
    for (const e of entries) {
      if (!e.activityId) continue;
      const list = byActivity.get(e.activityId) ?? [];
      list.push(e);
      byActivity.set(e.activityId, list);
    }
    const sessions = activities
      .map((a) => {
        const list = byActivity.get(a.id) ?? [];
        return {
          id: a.id,
          occurredAt: a.occurredAt,
          date: dayKey(a.occurredAt),
          count: list.length,
          value: aggregate(list),
        };
      })
      .sort((a, b) => b.occurredAt - a.occurredAt);
    const perSession = sessions.length
      ? kind === "scale"
        ? total
        : total / sessions.length
      : 0;

    // Seri — ilk oturumdan bugüne; pencere büyüdükçe kova kabalaşır
    let minOcc: number | undefined;
    for (const e of entries) {
      if (minOcc === undefined || e.occurredAt < minOcc) minOcc = e.occurredAt;
    }
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
    const seriesFrame: SeriesFrame | null =
      win.granularity === "day" ? frameDailySeries(buckets) : null;

    // Kategori dağılımı
    const byCat = new Map<string, Entry[]>();
    for (const e of entries) {
      const catId = subById.get(e.subcategoryId)?.categoryId;
      if (!catId) continue;
      const list = byCat.get(catId) ?? [];
      list.push(e);
      byCat.set(catId, list);
    }
    const catShare: ShareRow[] = [...byCat.entries()]
      .map(([id, list]) => ({ id, value: aggregate(list) }))
      .filter((r) => r.value > 0)
      .map(({ id, value }) => {
        const c = catById.get(id);
        return {
          id,
          name: c?.name ?? "—",
          color: c?.color ?? ACTIVITY_COLOR,
          value,
          display:
            metric.type === "mod" && metric.mod.unit
              ? `${fmtNum(value)} ${metric.mod.unit}`
              : fmtNum(value),
        };
      });

    return {
      total,
      sessions,
      perSession,
      isAvgMetric: kind === "scale",
      buckets,
      granularity: win.granularity,
      seriesFrame,
      catShare,
      entryCount: entries.length,
    };
  }, [data, metric]);

  const unit = metric.type === "mod" ? metric.mod.unit : "";
  const metricLabel = metric.type === "count" ? "girdi" : unit || undefined;

  return (
    <>
      <PageHeader title={name} description="Aktivite Analizi" back="/analytics" />

      {data && data.activities.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Bu adla kayıtlı aktivite yok.
        </p>
      ) : (
        computed && (
          <div className="flex flex-col gap-4 pb-6">
            <MetricChips
              numericMods={data?.numericMods ?? []}
              metric={metric}
              color={ACTIVITY_COLOR}
              onChange={setMetricChoice}
            />

            {/* KPI'lar */}
            <div className="grid grid-cols-3 gap-2">
              <StatTile
                label="Oturum"
                value={fmtNum(computed.sessions.length)}
                sub="toplam"
              />
              <StatTile
                label={computed.isAvgMetric ? "Ortalama" : "Toplam"}
                value={fmtNum(computed.total)}
                unit={metricLabel}
                sub="tüm oturumlar"
              />
              <StatTile
                label="Oturum Ort."
                value={fmtNum(computed.perSession)}
                unit={metricLabel}
                sub={computed.isAvgMetric ? "ortalama" : "oturum başına"}
              />
            </div>

            {/* Seri */}
            <div className="rounded-2xl border border-border bg-card p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                {GRANULARITY_TITLES[computed.granularity]}{" "}
                {metric.type === "count" ? "girdi" : metric.mod.name}
              </h3>
              <DailyBarChart
                data={computed.buckets}
                color={ACTIVITY_COLOR}
                unit={metric.type === "count" ? "girdi" : unit}
                caption={computed.seriesFrame?.caption}
              />
            </div>

            {/* Kategori dağılımı */}
            <div className="rounded-2xl border border-border bg-card p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Kategori Dağılımı
              </h3>
              <ShareBars rows={computed.catShare} emptyText="Veri yok" />
            </div>

            {/* Oturumlar — güne gider */}
            <div className="rounded-2xl border border-border bg-card p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Oturumlar
              </h3>
              <div className="flex flex-col divide-y divide-border/50">
                {computed.sessions.map((s) => (
                  <Link
                    key={s.id}
                    href={`/calendar/${s.date}`}
                    className="flex items-center gap-3 py-2.5 transition-colors hover:bg-white/5 -mx-1 px-1 rounded-lg"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cyan-500/15">
                      <Boxes className="h-4 w-4 text-cyan-300" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">
                        {formatDate(s.occurredAt)}
                        <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                          {formatTime(s.occurredAt)}
                        </span>
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {s.count} girdi
                      </div>
                    </div>
                    <span className="text-sm font-semibold tabular-nums shrink-0">
                      {fmtNum(s.value)}
                      {metricLabel && (
                        <span className="ml-1 text-xs font-normal text-muted-foreground">
                          {metricLabel}
                        </span>
                      )}
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/40" />
                  </Link>
                ))}
              </div>
            </div>
          </div>
        )
      )}
    </>
  );
}
