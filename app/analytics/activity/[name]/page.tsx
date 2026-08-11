"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { Boxes, ChevronRight } from "lucide-react";
import { db } from "@/lib/db";
import {
  boolToNumber,
  buildSeriesBuckets,
  bucketKeyOf,
  classifyMod,
  countByChoice,
  dayKey,
  dtrDurationHours,
  fmtNum,
  fmtPct,
  frameDailySeries,
  GRANULARITY_TITLES,
  parseNumeric,
  resolveSeriesWindow,
  sumOrAvg,
  textToNumber,
  type Metric,
  type ModKind,
  type SeriesFrame,
} from "@/lib/analytics";
import { formatDate, formatTime } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { PageHeader } from "@/components/layout/page-header";
import { StatTile } from "@/components/analytics/stat-tile";
import { MetricChips } from "@/components/analytics/metric-chips";
import { DailyBarChart } from "@/components/analytics/daily-bar-chart";
import { ShareBars, type ShareRow } from "@/components/analytics/share-bars";
import { ChoiceDistribution } from "@/components/analytics/choice-distribution";
import { metricOf } from "@/components/analytics/use-category-metrics";
import type { Entry } from "@/types";

const ACTIVITY_COLOR = "#06b6d4";
const norm = (s: string) => s.trim().toLocaleLowerCase("en-US");

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
  const t = useT();
  const { name: rawName } = use(params);
  const name = decodeURIComponent(rawName);
  const [metricChoice, setMetricChoice] = useState<Metric | null>(null);
  // Çoktan seçmelide seriyi süzen seçenek; metrik değişince sıfırlanır
  const [choiceFilter, setChoiceFilter] = useState<string | null>(null);

  const data = useLiveQuery(async () => {
    const activities = (await db.activities.toArray()).filter(
      (a) => norm(a.name) === norm(name)
    );
    if (!activities.length)
      return { activities, entries: [], values: [], mods: [], subById: new Map(), catById: new Map() };
    const ids = activities.map((a) => a.id);
    const entries = await db.entries.where("activityId").anyOf(ids).toArray();
    const values = entries.length
      ? await db.entryValues
          .where("entryId")
          .anyOf(entries.map((e) => e.id))
          .toArray()
      : [];
    const [subs, cats, allMods] = await Promise.all([
      db.subcategories.toArray(),
      db.categories.toArray(),
      db.mods.toArray(),
    ]);

    const modIds = new Set(values.map((v) => v.modId).filter((x): x is string => !!x));
    const mods = allMods
      .filter((m) => modIds.has(m.id))
      .map((m) => classifyMod(m))
      .filter((m): m is NonNullable<typeof m> => !!m)
      .sort((a, b) => a.name.localeCompare(b.name, "en"));
    return {
      activities,
      entries,
      values,
      mods,
      subById: new Map(subs.map((s) => [s.id, s])),
      catById: new Map(cats.map((c) => [c.id, c])),
    };
  }, [name]);

  const metric = useMemo<Metric>(() => {
    if (metricChoice) return metricChoice;
    if (data?.mods.length) return metricOf(data.mods[0]);
    return { type: "count" };
  }, [metricChoice, data]);

  const computed = useMemo(() => {
    if (!data || !data.activities.length) return null;
    const { activities, entries, values, subById, catById } = data;
    const now = new Date();

    // Girdi başına metrik değeri (count'ta 1)
    const valueByEntry = new Map<string, number>();
    // Dağılımda sayı yok, etiket var
    const choiceByEntry = new Map<string, string>();
    if (metric.type === "mod") {
      for (const v of values) {
        if (v.modId !== metric.mod.id) continue;
        const amount =
          metric.mod.kind === "duration"
            ? dtrDurationHours(v.value)
            : metric.mod.kind === "rate"
              ? boolToNumber(v.value)
              : metric.mod.kind === "presence"
                ? textToNumber(v.value)
                : parseNumeric(v.value);
        valueByEntry.set(v.entryId, (valueByEntry.get(v.entryId) ?? 0) + amount);
      }
    } else if (metric.type === "choice") {
      for (const v of values) {
        if (v.modId === metric.mod.id && v.value.trim())
          choiceByEntry.set(v.entryId, v.value.trim());
      }
    }
    const kind = metric.type === "count" ? "number" : metric.mod.kind;
    const isRate = kind === "rate";
    const isChoice = metric.type === "choice";
    const valuesOf = (subset: Entry[]) =>
      subset
        .map((e) => valueByEntry.get(e.id))
        .filter((v): v is number => v !== undefined);
    const choicesOf = (subset: Entry[]) =>
      subset
        .map((e) => choiceByEntry.get(e.id))
        .filter((v): v is string => !!v);
    const filledCount = (subset: Entry[]): number =>
      metric.type === "count"
        ? subset.length
        : isChoice
          ? choicesOf(subset).length
          : valuesOf(subset).length;
    const aggregate = (subset: Entry[]): number =>
      metric.type === "count"
        ? subset.length
        : isChoice
          ? choiceFilter
            ? choicesOf(subset).filter((c) => c === choiceFilter).length
            : choicesOf(subset).length
          : sumOrAvg(valuesOf(subset), kind as ModKind);

    const total = aggregate(entries);
    const filled = filledCount(entries);
    const distribution = isChoice ? countByChoice(choicesOf(entries)) : [];

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
      b.hasData = filledCount(bucketEntries[i]) > 0;
      // Oranda çubuk yığılır: alt parça evet, üstteki soluk parça hayır
      if (isRate) b.rest = filledCount(bucketEntries[i]) - b.value;
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
      .map(([id, list]) => ({ id, value: aggregate(list), outOf: filledCount(list) }))
      .filter((r) => (isRate ? r.outOf > 0 : r.value > 0))
      .map(({ id, value, outOf }) => {
        const c = catById.get(id);
        return {
          id,
          name: c?.name ?? "—",
          color: c?.color ?? ACTIVITY_COLOR,
          value,
          outOf,
          display:
            metric.type === "mod" && metric.mod.unit
              ? `${fmtNum(value)} ${metric.mod.unit}`
              : fmtNum(value),
        };
      });

    return {
      total,
      filled,
      rate: filled ? total / filled : 0,
      distribution,
      topChoice: distribution[0],
      sessions,
      perSession,
      isRate,
      isChoice,
      isPresence: kind === "presence",
      isAvgMetric: kind === "scale",
      scale: metric.type === "mod" ? metric.mod.scale : undefined,
      buckets,
      granularity: win.granularity,
      seriesFrame,
      catShare,
      entryCount: entries.length,
    };
  }, [data, metric, choiceFilter]);

  const unit = metric.type === "mod" ? metric.mod.unit : "";
  const metricLabel = metric.type === "count" ? "entries" : unit || undefined;

  return (
    <>
      <PageHeader title={name} description={t("activity.insights")} back="/analytics" />

      {data && data.activities.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Bu adla kayıtlı aktivite yok.
        </p>
      ) : (
        computed && (
          <div className="flex flex-col gap-4 pb-6">
            <MetricChips
              mods={data?.mods ?? []}
              metric={metric}
              color={ACTIVITY_COLOR}
              onChange={(m) => {
                // Süzgeç önceki özelliğin seçeneğiydi — yenisinde karşılığı yok
                setMetricChoice(m);
                setChoiceFilter(null);
              }}
            />

            {/* KPI'lar — oranda ana rakam yüzde, metinde "kaç girdide yazılmış" */}
            <div className="grid grid-cols-3 gap-2">
              <StatTile
                label={t("stat.session")}
                value={fmtNum(computed.sessions.length)}
                sub="total"
              />
              <StatTile
                label={
                  computed.isRate
                    ? t("stat.yesRate")
                    : computed.isChoice
                      ? t("stat.mostFrequent")
                      : computed.isPresence
                        ? t("stat.written")
                        : computed.isAvgMetric
                          ? t("stat.average")
                          : t("stat.total")
                }
                value={
                  computed.isChoice
                    ? (computed.topChoice?.choice ?? "—")
                    : computed.isRate
                      ? fmtPct(computed.rate)
                      : fmtNum(computed.total)
                }
                wordValue={computed.isChoice}
                unit={computed.isRate || computed.isChoice ? undefined : metricLabel}
                sub={
                  computed.isChoice
                    ? computed.topChoice
                      ? `${fmtPct(computed.topChoice.count / computed.filled)} · ${fmtNum(computed.topChoice.count)}`
                      : t("stat.noData")
                    : computed.isRate
                      ? `${fmtNum(computed.total)}/${fmtNum(computed.filled)}`
                      : "all sessions"
                }
              />
              <StatTile
                label={
                  computed.isRate
                    ? t("entry.yes")
                    : computed.isChoice
                      ? t("insights.entries")
                      : t("stat.sessionAvg")
                }
                value={fmtNum(
                  computed.isRate
                    ? computed.total
                    : computed.isChoice
                      ? computed.filled
                      : computed.perSession
                )}
                unit={computed.isRate || computed.isChoice ? undefined : metricLabel}
                sub={
                  computed.isRate
                    ? t("stat.outOfEntries", { n: computed.filled })
                    : computed.isChoice
                      ? `${computed.sessions.length} ${t("stat.session").toLocaleLowerCase()}`
                      : computed.isAvgMetric
                        ? "average"
                        : "per session"
                }
              />
            </div>

            {/* Seri */}
            <div className="rounded-2xl border border-border bg-card p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                {GRANULARITY_TITLES[computed.granularity]}{" "}
                {metric.type === "count" ? "entries" : metric.mod.name}
              </h3>
              <DailyBarChart
                data={computed.buckets}
                color={ACTIVITY_COLOR}
                unit={metric.type === "count" ? "entries" : unit}
                caption={computed.seriesFrame?.caption}
                scale={metric.type === "mod" ? metric.mod.scale : undefined}
                stack={
                  computed.isRate
                    ? { valueLabel: t("entry.yes"), restLabel: t("entry.no") }
                    : undefined
                }
              />
            </div>

            {/* Çoktan seçmelide seçenek dağılımı — kategori kırılımının üstünde,
                çünkü bu türde asıl soru "hangisi ne sıklıkla" */}
            {computed.isChoice && (
              <ChoiceDistribution
                rows={computed.distribution}
                color={ACTIVITY_COLOR}
                selected={choiceFilter}
                onSelect={setChoiceFilter}
              />
            )}

            {/* Kategori dağılımı */}
            <div className="rounded-2xl border border-border bg-card p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Category breakdown
              </h3>
              <ShareBars
                rows={computed.catShare}
                mode={
                  computed.isRate
                    ? "rate"
                    : computed.scale
                      ? "level"
                      : "share"
                }
                range={computed.scale}
                emptyText={t("stat.noData")}
              />
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
                    prefetch={false}
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
