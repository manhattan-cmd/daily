"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { ChevronRight } from "lucide-react";
import { db } from "@/lib/db";
import {
  buildSeriesBuckets,
  bucketKeyOf,
  countByChoice,
  dayKey,
  fmtNum,
  fmtPct,
  frameDailySeries,
  GRANULARITY_TITLES,
  resolveSeriesWindow,
  sumOrAvg,
  type Metric,
  type ModKind,
  type SeriesFrame,
} from "@/lib/analytics";
import { formatDate, withUnit } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { PageHeader } from "@/components/layout/page-header";
import { StatTile } from "@/components/analytics/stat-tile";
import { MetricChips } from "@/components/analytics/metric-chips";
import { DailyBarChart } from "@/components/analytics/daily-bar-chart";
import { ShareBars, type ShareRow } from "@/components/analytics/share-bars";
import { ChoiceDistribution } from "@/components/analytics/choice-distribution";
import { metricOf } from "@/components/analytics/use-category-metrics";
import { lastOf, loadThingScope, perEntry } from "@/components/analytics/thing-scope";
import { currentThingValues } from "@/lib/db/things";
import { routes } from "@/lib/routes";
import type { Entry } from "@/types";

const CARD = "rounded-2xl border border-border bg-card p-4";
const H3 = "mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground";

/**
 * Nesne analizi — bir nesnenin iliştirildiği bütün girdiler, kategori ne
 * olursa olsun. "Duster'a bu yıl ne kadar yakıt parası", "Sapiens'e kaç
 * saat", km'nin seyri. Aktivite analiziyle aynı dil: metrik çipleri, seri,
 * kategori dağılımı; üstte nesnenin şu anki durumu.
 */
export function ThingAnalyticsPage({ thingId }: { thingId: string }) {
  const t = useT();
  const [choice, setChoice] = useState<Metric | null>(null);
  const [choiceFilter, setChoiceFilter] = useState<string | null>(null);

  const data = useLiveQuery(async () => {
    const th = await db.things.get(thingId);
    if (!th) return null;
    const [scope, coll, current] = await Promise.all([
      loadThingScope([thingId]),
      db.collections.get(th.collectionId),
      currentThingValues(thingId),
    ]);
    return { th, coll, scope, current };
  }, [thingId]);

  const metric = useMemo<Metric>(() => {
    if (choice) return choice;
    if (data?.scope.mods.length) return metricOf(data.scope.mods[0]);
    return { type: "count" };
  }, [choice, data]);

  const color = data?.coll?.color ?? "#06b6d4";

  const computed = useMemo(() => {
    if (!data) return null;
    const { scope } = data;
    const { entries } = scope;
    const { num, labels } = perEntry(scope, metric, thingId);
    const kind: ModKind = metric.type === "mod" ? metric.mod.kind : "number";
    const level = metric.type === "mod" && metric.mod.reading === "level";
    const isChoice = metric.type === "choice";
    const isRate = kind === "rate";
    const vals = (sub: Entry[]) => sub.map((e) => num.get(e.id)).filter((v): v is number => v !== undefined);
    const chs = (sub: Entry[]) => sub.flatMap((e) => labels.get(e.id) ?? []);
    const filled = (sub: Entry[]) =>
      metric.type === "count" ? sub.length : isChoice ? sub.filter((e) => labels.has(e.id)).length : vals(sub).length;
    const agg = (sub: Entry[]) =>
      metric.type === "count"
        ? sub.length
        : isChoice
          ? (choiceFilter ? chs(sub).filter((c) => c === choiceFilter) : chs(sub)).length
          : sumOrAvg(vals(sub), kind, metric.mod.reading);

    const all = vals(entries);
    const distribution = isChoice ? countByChoice(chs(entries)) : [];

    // Seri — ilk girdiden bugüne
    let minOcc: number | undefined;
    for (const e of entries) if (minOcc === undefined || e.occurredAt < minOcc) minOcc = e.occurredAt;
    const win = resolveSeriesWindow(0, minOcc, new Date());
    const buckets = buildSeriesBuckets(win.startMs, win.endMs, win.granularity);
    const idx = new Map(buckets.map((b, i) => [b.key, i]));
    const per: Entry[][] = buckets.map(() => []);
    for (const e of entries) {
      const i = idx.get(bucketKeyOf(e.occurredAt, win.granularity));
      if (i !== undefined) per[i].push(e);
    }
    buckets.forEach((b, i) => {
      b.value = agg(per[i]);
      b.hasData = filled(per[i]) > 0;
      if (isRate) b.rest = filled(per[i]) - b.value;
    });
    const frame: SeriesFrame | null = win.granularity === "day" ? frameDailySeries(buckets) : null;

    // Kategori dağılımı — seviyede (km) toplam anlamsız, girdi sayısıyla
    const byCat = new Map<string, Entry[]>();
    for (const e of entries) {
      const c = scope.subById.get(e.subcategoryId)?.categoryId;
      if (c) byCat.set(c, [...(byCat.get(c) ?? []), e]);
    }
    const catShare: ShareRow[] = [...byCat.entries()]
      .map(([id, list]) => {
        const c = scope.catById.get(id);
        const value = level || isChoice ? list.length : agg(list);
        return {
          id,
          name: c?.name ?? "—",
          color: c?.color ?? color,
          value,
          outOf: filled(list),
          display:
            !level && metric.type === "mod" && metric.mod.unit ? `${fmtNum(value)} ${metric.mod.unit}` : fmtNum(value),
        };
      })
      .filter((r) => (isRate ? (r.outOf ?? 0) > 0 : r.value > 0));

    // Girdiler — en yeni önce, nesne için yazılanlar öne
    const rows = [...entries]
      .sort((a, b) => b.occurredAt - a.occurredAt)
      .slice(0, 100)
      .map((e) => {
        const sub = scope.subById.get(e.subcategoryId);
        const cat = sub ? scope.catById.get(sub.categoryId) : undefined;
        const parts = scope.values
          .filter((v) => v.entryId === e.id && v.modId && v.value !== "" && (!v.thingId || v.thingId === thingId))
          .sort((a, b) => Number(!!b.thingId) - Number(!!a.thingId))
          .map((v) => {
            const m = scope.modById.get(v.modId!);
            if (!m || m.valueType === "datetime-range") return null;
            if (m.valueType === "boolean") return v.value === "true" ? m.name : null;
            if (m.valueType === "number")
              return m.unit ? withUnit(fmtNum(Number(v.value)), m.unit) : `${m.name} ${fmtNum(Number(v.value))}`;
            return v.value;
          })
          .filter(Boolean) as string[];
        return {
          id: e.id,
          date: dayKey(e.occurredAt),
          at: e.occurredAt,
          path: sub?.isCategoryRoot ? cat?.name : [cat?.name, sub?.name].filter(Boolean).join(" › "),
          catColor: cat?.color ?? color,
          parts,
        };
      });

    return {
      count: entries.length,
      filled: filled(entries),
      total: agg(entries),
      last: lastOf(entries, num),
      min: all.length ? Math.min(...all) : undefined,
      max: all.length ? Math.max(...all) : undefined,
      avg: all.length ? all.reduce((a, b) => a + b, 0) / all.length : undefined,
      level,
      isChoice,
      isRate,
      distribution,
      buckets,
      granularity: win.granularity,
      frame,
      catShare,
      rows,
      lastAt: entries.reduce((m, e) => Math.max(m, e.occurredAt), 0),
    };
  }, [data, metric, choiceFilter, thingId, color]);

  if (data === undefined) return null;
  if (data === null)
    return <PageHeader title="—" back="/analytics" className="band-an" />;

  const { th, coll, scope, current } = data;
  const unit = metric.type === "mod" ? metric.mod.unit : "";
  const stateMods = (coll?.modIds ?? [])
    .concat(th.extraModIds ?? [])
    .map((id) => scope.modById.get(id))
    .filter((m) => m && current[m.id]);

  return (
    <>
      <PageHeader
        title={th.name}
        description={coll?.name}
        back={coll ? routes.analyticsCollection(coll.id) : "/analytics"}
        className="band-an"
      />
      <div className="flex flex-col gap-4 pb-6">
        {/* Şu an — nesnenin durumu, son girdisinden */}
        {stateMods.length > 0 && (
          <div className="grid grid-cols-2 gap-2" data-thing-now="">
            {stateMods.map((m) => {
              const c = current[m!.id];
              const n = Number(c.value);
              return (
                <StatTile
                  key={m!.id}
                  label={m!.name}
                  value={m!.valueType === "number" && Number.isFinite(n) ? fmtNum(n) : c.value}
                  wordValue={m!.valueType !== "number"}
                  unit={m!.unit || undefined}
                  sub={`${t("objects.current")} · ${formatDate(c.at)}`}
                  color={color}
                />
              );
            })}
          </div>
        )}

        {computed && computed.count === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{t("objects.noEntries")}</p>
        ) : (
          computed && (
            <>
              <MetricChips
                mods={scope.mods}
                metric={metric}
                color={color}
                countFirst
                onChange={(m) => {
                  setChoice(m);
                  setChoiceFilter(null);
                }}
              />

              <div className="grid grid-cols-3 gap-2">
                {metric.type === "count" ? (
                  <>
                    <StatTile label={t("objects.an.entries")} value={fmtNum(computed.count)} />
                    <StatTile
                      label={t("objects.an.categories")}
                      value={fmtNum(computed.catShare.length)}
                    />
                    <StatTile label={t("objects.an.lastEntry")} value={computed.lastAt ? formatDate(computed.lastAt) : "—"} wordValue />
                  </>
                ) : computed.isChoice ? (
                  <>
                    <StatTile
                      label={t("stat.mostFrequent")}
                      value={computed.distribution[0]?.choice ?? "—"}
                      wordValue
                      sub={computed.distribution[0] ? fmtPct(computed.distribution[0].count / Math.max(1, computed.filled)) : undefined}
                    />
                    <StatTile label={t("objects.an.entries")} value={fmtNum(computed.filled)} />
                    <StatTile label={t("objects.an.distinct")} value={fmtNum(computed.distribution.length)} />
                  </>
                ) : computed.level ? (
                  <>
                    <StatTile label={t("objects.an.last")} value={computed.last !== undefined ? fmtNum(computed.last) : "—"} unit={unit || undefined} />
                    <StatTile label={t("stat.average")} value={computed.avg !== undefined ? fmtNum(computed.avg) : "—"} unit={unit || undefined} />
                    {/* Durumda asıl soru değişim: bu sürede kaç km yapıldı */}
                    <StatTile
                      label={t("objects.an.change")}
                      value={computed.min !== undefined ? `+${fmtNum(computed.max! - computed.min)}` : "—"}
                      sub={computed.min !== undefined ? `${fmtNum(computed.min)}–${fmtNum(computed.max!)}${unit ? " " + unit : ""}` : undefined}
                    />
                  </>
                ) : (
                  <>
                    <StatTile label={computed.isRate ? t("stat.yesRate") : t("stat.total")} value={computed.isRate ? fmtPct(computed.total / Math.max(1, computed.filled)) : fmtNum(computed.total)} unit={computed.isRate ? undefined : unit || undefined} />
                    <StatTile label={t("stat.perEntry")} value={computed.filled ? fmtNum(computed.total / computed.filled) : "—"} unit={computed.isRate ? undefined : unit || undefined} />
                    <StatTile label={t("objects.an.entries")} value={fmtNum(computed.filled)} sub={`/ ${fmtNum(computed.count)}`} />
                  </>
                )}
              </div>

              <div className={CARD}>
                <h3 className={H3}>
                  {GRANULARITY_TITLES[computed.granularity]}{" "}
                  {metric.type === "count" ? t("objects.an.entries") : metric.mod.name}
                </h3>
                <DailyBarChart
                  data={computed.buckets}
                  color={color}
                  unit={metric.type === "count" ? t("objects.an.entries") : unit}
                  caption={computed.frame?.caption}
                  scale={metric.type === "mod" ? metric.mod.scale : undefined}
                  stack={computed.isRate ? { valueLabel: t("entry.yes"), restLabel: t("entry.no") } : undefined}
                />
              </div>

              {computed.isChoice && (
                <ChoiceDistribution
                  rows={computed.distribution}
                  color={color}
                  selected={choiceFilter}
                  onSelect={setChoiceFilter}
                />
              )}

              <div className={CARD}>
                <h3 className={H3}>{t("objects.an.byCategory")}</h3>
                <ShareBars rows={computed.catShare} mode={computed.isRate ? "rate" : "share"} emptyText={t("stat.noData")} />
              </div>

              <div className={CARD}>
                <h3 className={H3}>{t("objects.entries")}</h3>
                <div className="flex flex-col divide-y divide-border/50">
                  {computed.rows.map((r) => (
                    <Link
                      key={r.id}
                      href={routes.day(r.date)}
                      prefetch={false}
                      className="-mx-1 flex items-center gap-3 rounded-lg px-1 py-2.5 transition-colors hover:bg-[var(--sf-2)]"
                    >
                      <span className="h-8 w-1.5 shrink-0 rounded-full" style={{ background: r.catColor }} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{r.path}</span>
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {formatDate(r.at)}
                          {r.parts.length ? ` · ${r.parts.join(" · ")}` : ""}
                        </span>
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/40" />
                    </Link>
                  ))}
                </div>
              </div>
            </>
          )
        )}
      </div>
    </>
  );
}
