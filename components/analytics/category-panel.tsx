"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import {
  buildDayBuckets,
  dayKey,
  fmtNum,
  monthStartMs,
  parseNumeric,
  startOfDayMs,
  weekStartMs,
  type RangeKey,
  RANGE_LABELS,
} from "@/lib/analytics";
import { StatTile } from "./stat-tile";
import { DailyBarChart } from "./daily-bar-chart";
import { ShareBars, type ShareRow } from "./share-bars";
import { cn } from "@/lib/utils";
import type { Category, Entry, EntryValue, SubCategory } from "@/types";

type NumericMod = { id: string; name: string; unit: string };

/** Seçili metrik: girdi sayısı ya da sayısal bir modun toplamı */
type Metric = { type: "count" } | { type: "mod"; mod: NumericMod };

export function CategoryPanel({
  category,
  range,
  rangeStart,
}: {
  category: Category;
  range: RangeKey;
  rangeStart: number;
}) {
  // Kategori değişiminde sıfırlama parent'taki key={category.id} ile olur
  const [metric, setMetric] = useState<Metric>({ type: "count" });

  const data = useLiveQuery(async () => {
    const subs = await db.subcategories
      .where("categoryId")
      .equals(category.id)
      .toArray();
    const subIds = subs.map((s) => s.id);
    if (!subIds.length) {
      return { subs, entries: [] as Entry[], values: [] as EntryValue[], numericMods: [] as NumericMod[] };
    }

    // KPI üçlüsü (bugün/hafta/ay) aralık filtresinden bağımsız — en erken pencereden beri çek
    const now = new Date();
    const earliest = Math.min(rangeStart, weekStartMs(now), monthStartMs(now));
    const entries = await db.entries
      .where("subcategoryId")
      .anyOf(subIds)
      .filter((e) => e.occurredAt >= earliest)
      .toArray();
    const values = entries.length
      ? await db.entryValues
          .where("entryId")
          .anyOf(entries.map((e) => e.id))
          .toArray()
      : [];

    // Sayısal modlar: kategoriye/altlarına atananlar + girdilerde kullanılanlar
    const attachments = await db.categoryModifiers
      .filter(
        (a) =>
          (a.targetType === "category" && a.targetId === category.id) ||
          (a.targetType === "subcategory" && subIds.includes(a.targetId))
      )
      .toArray();
    const modIds = [
      ...new Set([
        ...attachments.map((a) => a.modId).filter((x): x is string => !!x),
        ...values.map((v) => v.modId).filter((x): x is string => !!x),
      ]),
    ];
    const mods = modIds.length ? await db.mods.bulkGet(modIds) : [];
    const typeIds = [
      ...new Set(mods.filter(Boolean).map((m) => m!.entryTypeId)),
    ];
    const types = typeIds.length ? await db.entryTypes.bulkGet(typeIds) : [];
    const typeMap = new Map(types.filter(Boolean).map((t) => [t!.id, t!]));

    const numericMods: NumericMod[] = mods
      .filter((m): m is NonNullable<typeof m> => !!m)
      .filter((m) => (typeMap.get(m.entryTypeId)?.valueType ?? "number") === "number")
      .map((m) => ({
        id: m.id,
        name: m.name,
        unit: typeMap.get(m.entryTypeId)?.unit ?? "",
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "tr"));

    return { subs, entries, values, numericMods };
  }, [category.id, rangeStart]);

  const computed = useMemo(() => {
    if (!data) return null;
    const { subs, entries, values } = data;
    const now = new Date();
    const todayStart = startOfDayMs(now);
    const weekStart = weekStartMs(now);
    const monthStart = monthStartMs(now);

    // Girdi başına metrik değeri: sayı modu → o girdideki mod değerlerinin toplamı; count → 1
    const valueByEntry = new Map<string, number>();
    if (metric.type === "mod") {
      for (const v of values) {
        if (v.modId !== metric.mod.id) continue;
        valueByEntry.set(
          v.entryId,
          (valueByEntry.get(v.entryId) ?? 0) + parseNumeric(v.value)
        );
      }
    }
    const entryMetric = (e: Entry): number =>
      metric.type === "count" ? 1 : valueByEntry.get(e.id) ?? 0;

    const sumSince = (start: number) =>
      entries.reduce(
        (s, e) => (e.occurredAt >= start ? s + entryMetric(e) : s),
        0
      );

    // Günlük seri (seçili aralık)
    const buckets = buildDayBuckets(rangeStart, now);
    const bucketIdx = new Map(buckets.map((b, i) => [b.key, i]));
    for (const e of entries) {
      if (e.occurredAt < rangeStart) continue;
      const i = bucketIdx.get(dayKey(e.occurredAt));
      if (i !== undefined) buckets[i].value += entryMetric(e);
    }

    // Alt kategori kırılımı (seçili aralık) — iç içe altlar en üst ataya toplanır
    const subById = new Map(subs.map((s) => [s.id, s]));
    const topAncestor = (id: string): SubCategory | undefined => {
      let cur = subById.get(id);
      let hops = 0;
      while (cur?.parentId && hops < 20) {
        const parent = subById.get(cur.parentId);
        if (!parent) break;
        cur = parent;
        hops++;
      }
      return cur;
    };
    const bySub = new Map<string, number>();
    for (const e of entries) {
      if (e.occurredAt < rangeStart) continue;
      const top = topAncestor(e.subcategoryId);
      if (!top) continue;
      bySub.set(top.id, (bySub.get(top.id) ?? 0) + entryMetric(e));
    }
    const unit = metric.type === "mod" ? metric.mod.unit : "";
    const shareRows: ShareRow[] = [...bySub.entries()]
      .filter(([, v]) => v > 0)
      .map(([id, v]) => {
        const s = subById.get(id)!;
        return {
          id,
          name: s.isCategoryRoot ? "Genel" : s.name,
          color: category.color,
          value: v,
          display: unit ? `${fmtNum(v)} ${unit}` : fmtNum(v),
        };
      });

    return {
      today: sumSince(todayStart),
      week: sumSince(weekStart),
      month: sumSince(monthStart),
      buckets,
      shareRows,
      unit,
    };
  }, [data, metric, rangeStart, category.color]);

  if (!data || !computed) return null;

  const metricLabel =
    metric.type === "count" ? "girdi" : computed.unit || undefined;

  return (
    <div className="flex flex-col gap-4">
      {/* Metrik seçici — girdi sayısı + kategorinin sayısal modları */}
      <div className="flex flex-wrap gap-2">
        <MetricChip
          label="Girdi"
          active={metric.type === "count"}
          color={category.color}
          onTap={() => setMetric({ type: "count" })}
        />
        {data.numericMods.map((m) => (
          <MetricChip
            key={m.id}
            label={m.unit ? `${m.name} (${m.unit})` : m.name}
            active={metric.type === "mod" && metric.mod.id === m.id}
            color={category.color}
            onTap={() => setMetric({ type: "mod", mod: m })}
          />
        ))}
      </div>

      {/* Bugün / Bu Hafta / Bu Ay — sabit dönemler, aralık filtresinden bağımsız */}
      <div className="grid grid-cols-3 gap-2">
        <StatTile
          label="Bugün"
          value={fmtNum(computed.today)}
          unit={metricLabel}
        />
        <StatTile
          label="Bu Hafta"
          value={fmtNum(computed.week)}
          unit={metricLabel}
        />
        <StatTile
          label="Bu Ay"
          value={fmtNum(computed.month)}
          unit={metricLabel}
        />
      </div>

      {/* Günlük seri — seçili aralık */}
      <div className="rounded-2xl border border-border bg-card p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          Günlük {metric.type === "count" ? "girdi" : metric.mod.name} ·{" "}
          {RANGE_LABELS[range]}
        </h3>
        <DailyBarChart
          data={computed.buckets}
          color={category.color}
          unit={metricLabel}
        />
      </div>

      {/* Alt kategori kırılımı — seçili aralık */}
      <div className="rounded-2xl border border-border bg-card p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Alt Kategori Dağılımı · {RANGE_LABELS[range]}
        </h3>
        <ShareBars
          rows={computed.shareRows}
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

function MetricChip({
  label,
  active,
  color,
  onTap,
}: {
  label: string;
  active: boolean;
  color: string;
  onTap: () => void;
}) {
  return (
    <button
      onClick={onTap}
      className={cn(
        "rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors",
        active
          ? "text-foreground"
          : "border-border bg-card text-muted-foreground hover:text-foreground"
      )}
      style={
        active
          ? { borderColor: `${color}70`, backgroundColor: `${color}18` }
          : undefined
      }
    >
      {label}
    </button>
  );
}
