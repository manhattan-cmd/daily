"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import {
  buildSeriesBuckets,
  bucketKeyOf,
  fmtNum,
  frameDailySeries,
  GRANULARITY_TITLES,
  resolveSeriesWindow,
  sumOrAvg,
  type Metric,
  type ModKind,
  type SeriesFrame,
} from "@/lib/analytics";
import { useT } from "@/lib/i18n";
import { PageHeader } from "@/components/layout/page-header";
import { StatTile } from "@/components/analytics/stat-tile";
import { MetricChips } from "@/components/analytics/metric-chips";
import { DailyBarChart } from "@/components/analytics/daily-bar-chart";
import { ShareBars, type ShareRow } from "@/components/analytics/share-bars";
import { lastOf, loadThingScope, perEntry } from "@/components/analytics/thing-scope";
import { routes } from "@/lib/routes";
import type { Entry } from "@/types";
import { PageSheet } from "@/components/ui/layer";

const CARD = "rounded-2xl border border-border bg-card p-4";
const H3 = "mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground";

/**
 * Liste analizi — nesneleri yan yana: hangi arabaya ne kadar yakıt parası,
 * hangi kitaba kaç saat, hangi müşteriden ne kadar tahsilat. Seçili metrik
 * nesne başına toplanır; nesnenin durumu olan özellikte (km) son değer
 * karşılaştırılır. Satıra dokununca o nesnenin analizine inilir.
 */
export function CollectionAnalyticsPage({ collectionId }: { collectionId: string }) {
  const t = useT();
  const router = useRouter();
  const [choice, setChoice] = useState<Metric | null>(null);

  const data = useLiveQuery(async () => {
    const coll = await db.collections.get(collectionId);
    if (!coll) return null;
    const ids = (await db.things.where("collectionId").equals(collectionId).primaryKeys()) as string[];
    return { coll, scope: await loadThingScope(ids) };
  }, [collectionId]);

  const metric = useMemo<Metric>(() => choice ?? { type: "count" }, [choice]);
  const color = data?.coll.color ?? "#06b6d4";

  const computed = useMemo(() => {
    if (!data) return null;
    const { scope } = data;
    const kind: ModKind = metric.type === "mod" ? metric.mod.kind : "number";
    const level = metric.type === "mod" && metric.mod.reading === "level";

    // Nesne başına
    const rows: ShareRow[] = scope.things
      .map((th) => {
        const list = scope.entries.filter((e) => e.thingIds?.includes(th.id));
        const { num, labels } = perEntry(scope, metric, th.id);
        const vals = list.map((e) => num.get(e.id)).filter((v): v is number => v !== undefined);
        const value =
          metric.type === "count"
            ? list.length
            : metric.type === "choice"
              ? list.reduce((n, e) => n + (labels.get(e.id)?.length ?? 0), 0)
              : level
                ? (lastOf(list, num) ?? 0)
                : sumOrAvg(vals, kind, metric.mod.reading);
        const unit = metric.type === "mod" ? metric.mod.unit : "";
        return {
          id: th.id,
          name: th.archivedAt ? `${th.name} · ${t("objects.archivedTag")}` : th.name,
          color,
          value,
          display: unit ? `${fmtNum(value)} ${unit}` : fmtNum(value),
        };
      })
      .filter((r) => r.value > 0)
      .sort((a, b) => b.value - a.value);

    // Seri — bütün listenin girdileri
    const { num } = perEntry(scope, metric);
    const agg = (sub: Entry[]) =>
      metric.type === "count"
        ? sub.length
        : sumOrAvg(sub.map((e) => num.get(e.id)).filter((v): v is number => v !== undefined), kind, metric.type === "mod" ? metric.mod.reading : undefined);
    let minOcc: number | undefined;
    for (const e of scope.entries) if (minOcc === undefined || e.occurredAt < minOcc) minOcc = e.occurredAt;
    const win = resolveSeriesWindow(0, minOcc, new Date());
    const buckets = buildSeriesBuckets(win.startMs, win.endMs, win.granularity);
    const idx = new Map(buckets.map((b, i) => [b.key, i]));
    const per: Entry[][] = buckets.map(() => []);
    for (const e of scope.entries) {
      const i = idx.get(bucketKeyOf(e.occurredAt, win.granularity));
      if (i !== undefined) per[i].push(e);
    }
    buckets.forEach((b, i) => {
      b.value = agg(per[i]);
      b.hasData = per[i].length > 0;
    });
    const frame: SeriesFrame | null = win.granularity === "day" ? frameDailySeries(buckets) : null;

    return {
      rows,
      level,
      maxRow: rows.reduce((m, r) => Math.max(m, r.value), 0),
      total: agg(scope.entries),
      buckets,
      granularity: win.granularity,
      frame,
      used: scope.things.filter((th) => scope.entries.some((e) => e.thingIds?.includes(th.id))).length,
    };
  }, [data, metric, color, t]);

  if (data === undefined) return null;
  if (data === null) return <PageSheet top={<PageHeader title="—" back="/analytics" className="band-an" />} />;
  const { coll, scope } = data;
  const unit = metric.type === "mod" ? metric.mod.unit : "";
  // Dağılım (seçenek) metrikleri liste karşılaştırmasında yalnız sayı verir
  const mods = scope.mods;

  return (
    <PageSheet
      top={
        <PageHeader title={coll.name} description={t("objects.an.listInsights")} back="/analytics" className="band-an" />
      }
    >
      {computed && (
        <div className="flex flex-col gap-4 pb-6">
          <MetricChips
            mods={mods}
            metric={metric}
            color={color}
            countFirst
            onChange={setChoice}
          />
          <div className="grid grid-cols-3 gap-2">
            <StatTile label={t("objects.an.objects")} value={fmtNum(computed.used)} sub={`/ ${fmtNum(scope.things.length)}`} color={color} />
            <StatTile label={t("objects.an.entries")} value={fmtNum(scope.entries.length)} />
            <StatTile
              label={metric.type === "count" ? t("objects.an.perObject") : computed.level ? t("stat.average") : t("stat.total")}
              value={fmtNum(metric.type === "count" ? scope.entries.length / Math.max(1, computed.used) : computed.total)}
              unit={unit || undefined}
            />
          </div>

          <div className={CARD} data-object-compare="">
            <h3 className={H3}>
              {t("objects.an.compare")}
              {metric.type === "count" ? "" : ` · ${metric.mod.name}${computed.level ? ` (${t("objects.an.last").toLocaleLowerCase("tr")})` : ""}`}
            </h3>
            <ShareBars
              rows={computed.rows}
              mode={computed.level ? "level" : "share"}
              range={computed.level ? { min: 0, max: computed.maxRow } : undefined}
              onSelect={(id) => router.push(routes.analyticsThing(id))}
              nudge
              emptyText={t("stat.noData")}
            />
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
            />
          </div>
        </div>
      )}
    </PageSheet>
  );
}
