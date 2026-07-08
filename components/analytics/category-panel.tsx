"use client";

import { useMemo, useState } from "react";
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
import type { Category, Entry, EntryValue } from "@/types";

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
  // null = kullanıcı henüz seçmedi → varsayılan (ilk mod) render sırasında senkron türetilir,
  // effect'le sonradan set edilirse "Girdi" bir an seçili görünüp titreme yaratıyor.
  const [metricChoice, setMetricChoice] = useState<Metric | null>(null);
  // Alt kategori dağılımı + girdi listesi kendi bağımsız aralığını seçebilir
  const [shareRange, setShareRange] = useState<RangeKey>(range);

  // Kategori değişiminde seçimleri render sırasında sıfırla (parent'ta key remount YOK —
  // remount, liveQuery yeniden yüklenene dek paneli null'a düşürüp ekranda titreme yaratıyor)
  const [prevCatId, setPrevCatId] = useState(category.id);
  if (prevCatId !== category.id) {
    setPrevCatId(category.id);
    setMetricChoice(null);
    setShareRange(range);
  }

  const shareRangeStart = useMemo(
    () => rangeStartMs(shareRange, new Date()),
    [shareRange]
  );

  const data = useLiveQuery(async () => {
    const subs = await db.subcategories
      .where("categoryId")
      .equals(category.id)
      .toArray();
    const subIds = subs.map((s) => s.id);
    if (!subIds.length) {
      return { subs, entries: [] as Entry[], values: [] as EntryValue[], numericMods: [] as NumericMod[] };
    }

    // KPI üçlüsü (bugün/hafta/ay) + alt kırılım aralığı, aralık filtresinden bağımsız — en erken pencereden beri çek
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
      .map((m) => classifyNumericMod(m, typeMap.get(m.entryTypeId)))
      .filter((m): m is NumericMod => !!m)
      .sort((a, b) => a.name.localeCompare(b.name, "tr"));

    return { subs, entries, values, numericMods };
  }, [category.id, rangeStart, shareRangeStart]);

  // Varsayılan metrik: listedeki ilk mod (varsa) — "Girdi" yalnızca hiç mod yoksa varsayılan kalır
  const metric = useMemo<Metric>(() => {
    if (metricChoice) return metricChoice;
    if (data && data.numericMods.length > 0) {
      return { type: "mod", mod: data.numericMods[0] };
    }
    return { type: "count" };
  }, [metricChoice, data]);

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

    const unit = metric.type === "mod" ? metric.mod.unit : "";

    // Alt kategori kırılımı + girdi listesi — bağımsız seçilen aralık, iç içe altlar en üst ataya toplanır
    const subById = new Map(subs.map((s) => [s.id, s]));
    const shareEntries = entries.filter((e) => e.occurredAt >= shareRangeStart);
    const bySubEntries = new Map<string, Entry[]>();
    for (const e of shareEntries) {
      const topId = bucketAncestorId(e.subcategoryId, subById);
      if (!topId) continue;
      const list = bySubEntries.get(topId) ?? [];
      list.push(e);
      bySubEntries.set(topId, list);
    }
    const bySub = new Map<string, number>();
    for (const [id, list] of bySubEntries) {
      bySub.set(id, aggregate(list));
    }
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
  }, [data, metric, rangeStart, shareRangeStart, category.color]);

  if (!data || !computed) return null;

  const metricLabel =
    metric.type === "count" ? "girdi" : computed.unit || undefined;
  const metricParam = metric.type === "count" ? "count" : metric.mod.id;

  return (
    <div className="flex flex-col gap-4">
      {/* Metrik seçici — girdi sayısı + kategorinin sayısal modları */}
      <div className="flex flex-wrap gap-2">
        {data.numericMods.map((m) => (
          <MetricChip
            key={m.id}
            label={m.unit ? `${m.name} (${m.unit})` : m.name}
            active={metric.type === "mod" && metric.mod.id === m.id}
            color={category.color}
            onTap={() => setMetricChoice({ type: "mod", mod: m })}
          />
        ))}
        <MetricChip
          label="Girdi"
          active={metric.type === "count"}
          color={category.color}
          onTap={() => setMetricChoice({ type: "count" })}
        />
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

      {/* Alt kategori kırılımı — bağımsız seçilebilir aralık, satıra basınca detay sayfasına gider */}
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
