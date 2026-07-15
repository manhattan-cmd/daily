"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { Settings2 } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { listAnalysisWidgets } from "@/lib/db/queries";
import {
  average,
  bucketKeyOf,
  buildSeriesBuckets,
  classifyNumericMod,
  dtrDurationHours,
  fmtNum,
  frameDailySeries,
  GRANULARITY_TITLES,
  parseNumeric,
  resolveSeriesWindow,
  SHORT_MONTHS,
  type DayBucket,
  type Granularity,
  type NumericMod,
  type SeriesFrame,
} from "@/lib/analytics";
import { DailyBarChart } from "./daily-bar-chart";
import { StatTile } from "./stat-tile";
import {
  ANALYSIS_METHOD_LABELS,
  type Category,
  type Entry,
  type EntryValue,
} from "@/types";

type StatRow = {
  id: string;
  mod: NumericMod;
  label: string;
  value: string;
  unit?: string;
  sub: string;
};

type DailyRow = {
  id: string;
  mod: NumericMod;
  buckets: DayBucket[];
  granularity: Granularity;
  frame: SeriesFrame | null;
};

/**
 * Özel Analizler — yapı bölümündeki Analiz Ayarları sayfasında kurgulanan
 * (mod × yöntem) kutuları. Kutulara dokunmak ilgili ayar sayfasına götürür;
 * "gün gün" widget'ları seri grafiği olarak çizilir (günlük değer düzeyi —
 * aynı güne birden çok girdi düşerse ortalaması).
 */
export function CustomAnalysisSection({
  category,
  targetType,
  targetId,
  entries,
  values,
  rangeStart,
  rangeLabel,
}: {
  category: Category;
  targetType: "category" | "subcategory";
  targetId: string;
  /** Kapsamdaki girdiler (pencere üst kümesi olabilir — rangeStart ile kırpılır) */
  entries: Entry[];
  /** Bu girdilerin değerleri */
  values: EntryValue[];
  /** Analiz penceresi başlangıcı; 0 = tüm zamanlar */
  rangeStart: number;
  rangeLabel: string;
}) {
  const router = useRouter();

  const widgets = useLiveQuery(
    () => listAnalysisWidgets(targetType, targetId),
    [targetType, targetId]
  );
  const modById = useLiveQuery(async () => {
    const [mods, types] = await Promise.all([
      db.mods.toArray(),
      db.entryTypes.toArray(),
    ]);
    const typeMap = new Map(types.map((t) => [t.id, t]));
    return new Map(
      mods.map((m) => [m.id, classifyNumericMod(m, typeMap.get(m.entryTypeId))])
    );
  }, []);

  const settingsHref =
    targetType === "category"
      ? `/structure/${category.id}/analysis`
      : `/structure/${category.id}/${targetId}/analysis`;

  const computed = useMemo(() => {
    if (!widgets?.length || !modById) return null;
    const now = new Date();
    const windowEntries =
      rangeStart > 0
        ? entries.filter((e) => e.occurredAt >= rangeStart)
        : entries;
    const entryById = new Map(windowEntries.map((e) => [e.id, e]));

    // Mod başına girdi→değer haritası (aynı girdide çok değer varsa toplanır)
    const perModCache = new Map<string, Map<string, number>>();
    const perEntryValues = (mod: NumericMod): Map<string, number> => {
      let cached = perModCache.get(mod.id);
      if (cached) return cached;
      cached = new Map();
      for (const v of values) {
        if (v.modId !== mod.id || !entryById.has(v.entryId)) continue;
        const amount =
          mod.kind === "duration"
            ? dtrDurationHours(v.value)
            : parseNumeric(v.value);
        cached.set(v.entryId, (cached.get(v.entryId) ?? 0) + amount);
      }
      perModCache.set(mod.id, cached);
      return cached;
    };

    const shortDate = (t: number) => {
      const d = new Date(t);
      return `${d.getDate()} ${SHORT_MONTHS[d.getMonth()]}`;
    };

    const stats: StatRow[] = [];
    const dailies: DailyRow[] = [];

    for (const w of widgets) {
      const mod = modById.get(w.modId);
      if (!mod) continue;
      const byEntry = perEntryValues(mod);

      if (w.method === "daily") {
        let minOcc: number | undefined;
        for (const id of byEntry.keys()) {
          const t = entryById.get(id)!.occurredAt;
          if (minOcc === undefined || t < minOcc) minOcc = t;
        }
        const win = resolveSeriesWindow(rangeStart, minOcc, now);
        const buckets = buildSeriesBuckets(win.startMs, win.endMs, win.granularity);
        const idx = new Map(buckets.map((b, i) => [b.key, i]));
        const perBucket: number[][] = buckets.map(() => []);
        for (const [id, v] of byEntry) {
          const t = entryById.get(id)!.occurredAt;
          if (t < win.startMs) continue;
          const i = idx.get(bucketKeyOf(t, win.granularity));
          if (i !== undefined) perBucket[i].push(v);
        }
        buckets.forEach((b, i) => {
          b.value = average(perBucket[i]);
        });
        dailies.push({
          id: w.id,
          mod,
          buckets,
          granularity: win.granularity,
          frame: win.granularity === "day" ? frameDailySeries(buckets) : null,
        });
        continue;
      }

      const vals = [...byEntry.values()];
      let value = "—";
      let sub: string = ANALYSIS_METHOD_LABELS[w.method];
      if (!vals.length) {
        sub += " · veri yok";
      } else if (w.method === "sum") {
        value = fmtNum(vals.reduce((a, b) => a + b, 0));
      } else if (w.method === "avg") {
        value = fmtNum(average(vals));
        sub += ` · ${vals.length} girdi`;
      } else {
        // max / min — değerin görüldüğü tarih de gösterilir
        let bestId: string | undefined;
        let best: number | undefined;
        for (const [id, v] of byEntry) {
          if (
            best === undefined ||
            (w.method === "max" ? v > best : v < best)
          ) {
            best = v;
            bestId = id;
          }
        }
        value = fmtNum(best!);
        sub += ` · ${shortDate(entryById.get(bestId!)!.occurredAt)}`;
      }
      stats.push({
        id: w.id,
        mod,
        label: mod.name,
        value,
        unit: vals.length ? mod.unit || undefined : undefined,
        sub,
      });
    }

    return { stats, dailies };
  }, [widgets, modById, entries, values, rangeStart]);

  if (!computed || (!computed.stats.length && !computed.dailies.length)) {
    return null;
  }

  const goSettings = () => router.push(settingsHref);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Özel Analizler
          <span className="normal-case font-normal text-muted-foreground/60">
            {" "}
            · {rangeLabel}
          </span>
        </h3>
        <button
          onClick={goSettings}
          className="flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Analiz ayarlarını düzenle"
        >
          <Settings2 className="h-3.5 w-3.5" />
          Düzenle
        </button>
      </div>

      {computed.stats.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {computed.stats.map((s) => (
            <button key={s.id} onClick={goSettings} className="text-left">
              <StatTile
                label={s.label}
                value={s.value}
                unit={s.unit}
                sub={s.sub}
                accent={category.color}
              />
            </button>
          ))}
        </div>
      )}

      {computed.dailies.map((d) => (
        <div key={d.id} className="rounded-2xl border border-border bg-card p-4">
          <button
            onClick={goSettings}
            className="mb-2 block w-full text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
          >
            {d.mod.name}
            <span className="normal-case font-normal text-muted-foreground/60">
              {" "}
              · gün gün ({GRANULARITY_TITLES[d.granularity].toLocaleLowerCase("tr-TR")} ortalama)
            </span>
          </button>
          <DailyBarChart
            data={d.buckets}
            color={category.color}
            unit={d.mod.unit || undefined}
            caption={d.frame?.caption}
            showAllTicks={d.frame?.showAllTicks}
          />
        </div>
      ))}
    </div>
  );
}
