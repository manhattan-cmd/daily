"use client";

import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useRouter } from "next/navigation";
import { db } from "@/lib/db";
import {
  average,
  bucketAncestorId,
  buildDayBuckets,
  classifyNumericMod,
  dayKey,
  displayModeOf,
  dtrDurationHours,
  fmtNum,
  monthStartMs,
  parseNumeric,
  rangeStartMs,
  startOfDayMs,
  statSub,
  sumOrAvg,
  weekStartMs,
  type Metric,
  type ModKind,
  type NumericMod,
  type RangeKey,
  RANGE_LABELS,
} from "@/lib/analytics";
import { StatTile } from "./stat-tile";
import { DailyBarChart } from "./daily-bar-chart";
import { ShareBars, type ShareRow } from "./share-bars";
import { RangePicker } from "./range-picker";
import { EntryList, type EntryListRow } from "./entry-list";
import { cn } from "@/lib/utils";
import type { Category, Entry, EntryValue, SubCategory } from "@/types";

/**
 * Bir alt kategori düğümünün analiz paneli — CategoryPanel ile aynı mantık,
 * ama tüm kategori yerine bu düğümün alt ağacına (kendisi + tüm torunları) odaklanır.
 * Alt kategori dağılımı yalnızca bir kademe altını (immediate children) gruplar;
 * satıra basınca kendi rotasına (aynı component) tekrar bağlanarak derinlemesine iner.
 */
export function SubcategoryPanel({
  category,
  subcategory,
  range,
  rangeStart,
  initialMetricId,
}: {
  category: Category;
  subcategory: SubCategory;
  range: RangeKey;
  rangeStart: number;
  /** URL'den gelen başlangıç metriği: "count" ya da bir mod id'si — üst sayfadaki seçimi devam ettirir */
  initialMetricId?: string;
}) {
  const router = useRouter();
  const [metric, setMetric] = useState<Metric>({ type: "count" });
  const [metricApplied, setMetricApplied] = useState(false);
  const [shareRange, setShareRange] = useState<RangeKey>(range);
  const shareRangeStart = useMemo(
    () => rangeStartMs(shareRange, new Date()),
    [shareRange]
  );

  const data = useLiveQuery(async () => {
    const allSubs = await db.subcategories
      .where("categoryId")
      .equals(category.id)
      .toArray();
    const subById = new Map(allSubs.map((s) => [s.id, s]));

    // Bu düğümün alt ağacı (kendisi dahil) — torunlar da kapsanır
    const subtreeIds = new Set<string>([subcategory.id]);
    let frontier = [subcategory.id];
    while (frontier.length) {
      const next = allSubs.filter(
        (s) => s.parentId && frontier.includes(s.parentId)
      );
      frontier = [];
      for (const s of next) {
        if (!subtreeIds.has(s.id)) {
          subtreeIds.add(s.id);
          frontier.push(s.id);
        }
      }
    }
    const subIds = [...subtreeIds];
    const children = allSubs
      .filter((s) => s.parentId === subcategory.id)
      .sort((a, b) => a.order - b.order);

    const now = new Date();
    const earliest = Math.min(
      rangeStart,
      weekStartMs(now),
      monthStartMs(now),
      shareRangeStart
    );
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

    const attachments = await db.categoryModifiers
      .filter((a) => a.targetType === "subcategory" && subIds.includes(a.targetId))
      .toArray();
    const modIds = new Set([
      ...attachments.map((a) => a.modId).filter((x): x is string => !!x),
      ...values.map((v) => v.modId).filter((x): x is string => !!x),
    ]);
    const [allMods, allTypes] = await Promise.all([
      db.mods.toArray(),
      db.entryTypes.toArray(),
    ]);
    const mods = allMods.filter((m) => modIds.has(m.id));
    const typeMap = new Map(allTypes.map((t) => [t.id, t]));
    const numericMods: NumericMod[] = mods
      .map((m) => classifyNumericMod(m, typeMap.get(m.entryTypeId)))
      .filter((m): m is NumericMod => !!m)
      .sort((a, b) => a.name.localeCompare(b.name, "tr"));

    return { subById, children, entries, values, numericMods };
  }, [category.id, subcategory.id, rangeStart, shareRangeStart]);

  // URL'den gelen metriği bir kez uygula (mod listesi yüklendikten sonra); yoksa
  // varsayılan olarak listedeki ilk mod seçilir ("Girdi" yalnızca hiç mod yoksa varsayılan kalır)
  useEffect(() => {
    if (!data || metricApplied) return;
    if (initialMetricId && initialMetricId !== "count") {
      const found = data.numericMods.find((m) => m.id === initialMetricId);
      if (found) {
        setMetric({ type: "mod", mod: found });
        setMetricApplied(true);
        return;
      }
    }
    if (initialMetricId === undefined && data.numericMods.length > 0) {
      setMetric({ type: "mod", mod: data.numericMods[0] });
    }
    setMetricApplied(true);
  }, [data, metricApplied, initialMetricId]);

  const computed = useMemo(() => {
    if (!data) return null;
    const { subById, entries, values } = data;
    const now = new Date();
    const todayStart = startOfDayMs(now);
    const weekStart = weekStartMs(now);
    const monthStart = monthStartMs(now);

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

    const kind: ModKind = metric.type === "mod" ? metric.mod.kind : "number";
    const aggregate = (subset: Entry[]): number => {
      if (metric.type === "count") return subset.length;
      const vals = subset
        .map((e) => valueByEntry.get(e.id))
        .filter((v): v is number => v !== undefined);
      return sumOrAvg(vals, kind);
    };

    const statSince = (start: number) => {
      const subset = entries.filter((e) => e.occurredAt >= start);
      const value = aggregate(subset);
      const avg =
        metric.type === "mod" && displayModeOf(metric.mod.kind) === "both"
          ? average(
              subset
                .map((e) => valueByEntry.get(e.id))
                .filter((v): v is number => v !== undefined)
            )
          : undefined;
      return { value, avg };
    };

    const buckets = buildDayBuckets(rangeStart, now);
    const bucketIdx = new Map(buckets.map((b, i) => [b.key, i]));
    const bucketEntries: Entry[][] = buckets.map(() => []);
    for (const e of entries) {
      if (e.occurredAt < rangeStart) continue;
      const i = bucketIdx.get(dayKey(e.occurredAt));
      if (i !== undefined) bucketEntries[i].push(e);
    }
    buckets.forEach((b, i) => {
      b.value = aggregate(bucketEntries[i]);
    });

    const unit = metric.type === "mod" ? metric.mod.unit : "";

    // Alt kategori kırılımı — yalnızca bir kademe altı (immediate children); kendi üzerine düşen
    // girdiler "Genel" adıyla ayrı bir satırda toplanır
    const shareEntries = entries.filter((e) => e.occurredAt >= shareRangeStart);
    const bySubEntries = new Map<string, Entry[]>();
    for (const e of shareEntries) {
      const bucketId = bucketAncestorId(e.subcategoryId, subById, subcategory.id);
      if (!bucketId) continue;
      const list = bySubEntries.get(bucketId) ?? [];
      list.push(e);
      bySubEntries.set(bucketId, list);
    }
    const bySub = new Map<string, number>();
    for (const [id, list] of bySubEntries) bySub.set(id, aggregate(list));
    const shareRows: ShareRow[] = [...bySub.entries()]
      .filter(([, v]) => v > 0)
      .map(([id, v]) => {
        const isSelf = id === subcategory.id;
        const s = isSelf ? subcategory : subById.get(id);
        return {
          id,
          name: isSelf ? "Genel" : s?.name ?? "—",
          color: category.color,
          value: v,
          display: unit ? `${fmtNum(v)} ${unit}` : fmtNum(v),
        };
      });

    // Girdi listesi — bu düğümün tüm alt ağacı, metrik bir mod ise yalnızca değeri olan girdiler
    const listEntries =
      metric.type === "mod"
        ? shareEntries.filter((e) => valueByEntry.has(e.id))
        : shareEntries;
    const entryRows: EntryListRow[] = [...listEntries]
      .sort((a, b) => b.occurredAt - a.occurredAt)
      .map((e) => {
        const owner =
          e.subcategoryId === subcategory.id ? undefined : subById.get(e.subcategoryId);
        return {
          id: e.id,
          occurredAt: e.occurredAt,
          title: e.title,
          notes: e.notes,
          subLabel: owner?.name,
          valueLabel:
            metric.type === "mod"
              ? `${fmtNum(valueByEntry.get(e.id) ?? 0)}${unit ? ` ${unit}` : ""}`
              : undefined,
        };
      });

    return {
      today: statSince(todayStart),
      week: statSince(weekStart),
      month: statSince(monthStart),
      buckets,
      shareRows,
      entryRows,
      unit,
      displayMode: metric.type === "mod" ? displayModeOf(metric.mod.kind) : undefined,
      bucketIsAvg: kind === "scale",
    };
  }, [data, metric, rangeStart, shareRangeStart, category.color, subcategory]);

  if (!data || !computed) return null;

  const metricLabel =
    metric.type === "count" ? "girdi" : computed.unit || undefined;
  const metricParam = metric.type === "count" ? "count" : metric.mod.id;
  const hasChildren = data.children.length > 0;

  const goTo = (subId: string) => {
    if (subId === subcategory.id) return;
    router.push(
      `/analytics/${category.id}/${subId}?range=${shareRange}&metric=${metricParam}`
    );
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Metrik seçici — girdi sayısı + bu ağacın sayısal modları */}
      <div className="flex flex-wrap gap-2">
        {data.numericMods.map((m) => (
          <MetricChip
            key={m.id}
            label={m.unit ? `${m.name} (${m.unit})` : m.name}
            active={metric.type === "mod" && metric.mod.id === m.id}
            color={category.color}
            onTap={() => setMetric({ type: "mod", mod: m })}
          />
        ))}
        <MetricChip
          label="Girdi"
          active={metric.type === "count"}
          color={category.color}
          onTap={() => setMetric({ type: "count" })}
        />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <StatTile
          label="Bugün"
          value={fmtNum(computed.today.value)}
          unit={metricLabel}
          sub={
            computed.displayMode &&
            statSub(computed.displayMode, computed.today.avg, computed.unit)
          }
        />
        <StatTile
          label="Bu Hafta"
          value={fmtNum(computed.week.value)}
          unit={metricLabel}
          sub={
            computed.displayMode &&
            statSub(computed.displayMode, computed.week.avg, computed.unit)
          }
        />
        <StatTile
          label="Bu Ay"
          value={fmtNum(computed.month.value)}
          unit={metricLabel}
          sub={
            computed.displayMode &&
            statSub(computed.displayMode, computed.month.avg, computed.unit)
          }
        />
      </div>

      <div className="rounded-2xl border border-border bg-card p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          Günlük {metric.type === "count" ? "girdi" : metric.mod.name}
          {metric.type === "mod" && (
            <span className="normal-case font-normal text-muted-foreground/60">
              {" "}
              ({computed.bucketIsAvg ? "ortalama" : "toplam"})
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

      {/* Alt kategori kırılımı — yalnızca alt kategorisi olan düğümlerde gösterilir */}
      {hasChildren && (
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Alt Kategori Dağılımı
              {metric.type === "mod" && (
                <span className="normal-case font-normal text-muted-foreground/60">
                  {" "}
                  ({computed.bucketIsAvg ? "ortalama" : "toplam"})
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
            onSelect={goTo}
          />
        </div>
      )}

      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Girdi Listesi
          </h3>
          {!hasChildren && (
            <RangePicker value={shareRange} onChange={setShareRange} />
          )}
          {hasChildren && (
            <span className="text-[10px] text-muted-foreground">
              {RANGE_LABELS[shareRange]}
            </span>
          )}
        </div>
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
