"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import {
  buildDayBuckets,
  dayKey,
  dtrDurationHours,
  fmtNum,
  isNumericChoiceSet,
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

/** number (para, miktar...) ve duration (tarih-saat aralığı) → toplam + ortalama;
 * scale (sayısal skala, örn. 1–5 puanlama) → yalnızca ortalama, toplamak anlamsız */
type ModKind = "number" | "duration" | "scale";
type NumericMod = { id: string; name: string; unit: string; kind: ModKind };

/** Seçili metrik: girdi sayısı ya da sayısal bir modun toplamı/ortalaması */
type Metric = { type: "count" } | { type: "mod"; mod: NumericMod };

/** scale modlarda toplamın hiç anlamı yok (örn. 5 günün puanları toplanmaz); diğerlerinde ikisi de faydalı */
type DisplayMode = "avg" | "both";
const displayModeOf = (kind: ModKind): DisplayMode => (kind === "scale" ? "avg" : "both");

function sumOrAvg(values: number[], kind: ModKind): number {
  if (!values.length) return 0;
  const total = values.reduce((a, b) => a + b, 0);
  return kind === "scale" ? total / values.length : total;
}

function average(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

/** KPI kutucuklarında ikinci satırda gösterilecek etiket — hangi rakamın ne olduğunu netleştirir */
function statSub(
  displayMode: DisplayMode,
  avgValue: number | undefined,
  unit: string
): string | undefined {
  if (displayMode === "avg") return "Ortalama";
  if (avgValue !== undefined) {
    return `Ort. ${fmtNum(avgValue)}${unit ? ` ${unit}` : ""}`;
  }
  return undefined;
}

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
    const modIds = new Set([
      ...attachments.map((a) => a.modId).filter((x): x is string => !!x),
      ...values.map((v) => v.modId).filter((x): x is string => !!x),
    ]);
    // bulkGet yerine tam tablo taraması — küçük tablolar (havuzdaki mod/ölçü sayısı sınırlı),
    // bulkGet'in ardışık yazımlardan hemen sonra bazı anahtarlar için null dönebildiği gözlendi
    const [allMods, allTypes] = await Promise.all([
      db.mods.toArray(),
      db.entryTypes.toArray(),
    ]);
    const mods = allMods.filter((m) => modIds.has(m.id));
    const typeMap = new Map(allTypes.map((t) => [t.id, t]));

    const numericMods: NumericMod[] = mods
      .map((m): NumericMod | null => {
        const type = typeMap.get(m.entryTypeId);
        const vt = type?.valueType ?? "number";
        if (vt === "number") {
          return { id: m.id, name: m.name, unit: type?.unit ?? "", kind: "number" };
        }
        if (vt === "datetime-range") {
          return { id: m.id, name: m.name, unit: "sa", kind: "duration" };
        }
        if (vt === "select" && isNumericChoiceSet(type?.choices)) {
          return { id: m.id, name: m.name, unit: "", kind: "scale" };
        }
        return null;
      })
      .filter((m): m is NumericMod => !!m)
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

    // Girdi başına metrik değeri: sadece bu modun değerine sahip girdiler dahil edilir
    // (skala modlarında ortalama, yalnızca değeri olan girdiler üzerinden hesaplanmalı)
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

    // "both" modunda (süre, miktar vb.) KPI kutucuklarında toplamın yanına ortalama da eklenir
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

    // Günlük seri (seçili aralık)
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
    const bySubEntries = new Map<string, Entry[]>();
    for (const e of entries) {
      if (e.occurredAt < rangeStart) continue;
      const top = topAncestor(e.subcategoryId);
      if (!top) continue;
      const list = bySubEntries.get(top.id) ?? [];
      list.push(e);
      bySubEntries.set(top.id, list);
    }
    const bySub = new Map<string, number>();
    for (const [id, list] of bySubEntries) {
      bySub.set(id, aggregate(list));
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
      today: statSince(todayStart),
      week: statSince(weekStart),
      month: statSince(monthStart),
      buckets,
      shareRows,
      unit,
      displayMode: metric.type === "mod" ? displayModeOf(metric.mod.kind) : undefined,
      bucketIsAvg: kind === "scale",
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

      {/* Günlük seri — seçili aralık */}
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

      {/* Alt kategori kırılımı — seçili aralık */}
      <div className="rounded-2xl border border-border bg-card p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Alt Kategori Dağılımı
          {metric.type === "mod" && (
            <span className="normal-case font-normal text-muted-foreground/60">
              {" "}
              ({computed.bucketIsAvg ? "ortalama" : "toplam"})
            </span>
          )}{" "}
          · {RANGE_LABELS[range]}
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
