"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { BarChart3 } from "lucide-react";
import { db } from "@/lib/db";
import {
  bucketKeyOf,
  buildSeriesBuckets,
  fmtNum,
  GRANULARITY_TITLES,
  isRangeKey,
  rangeStartMs,
  resolveSeriesWindow,
  RANGE_LABELS,
  type RangeKey,
} from "@/lib/analytics";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { StatTile } from "@/components/analytics/stat-tile";
import { DailyBarChart } from "@/components/analytics/daily-bar-chart";
import { ShareBars, type ShareRow } from "@/components/analytics/share-bars";
import { CategoryPanel } from "@/components/analytics/category-panel";
import { PeriodJump } from "@/components/analytics/period-jump";
import { cn } from "@/lib/utils";

/** Ana sayfadaki hızlı aralık çipleri — diğer RangeKey'ler (7/30) URL üzerinden hâlâ geçerli */
const RANGES: RangeKey[] = ["bugun", "hafta", "ay", "yil", "tum"];

export default function AnalyticsPage() {
  return (
    <Suspense fallback={null}>
      <AnalyticsPageContent />
    </Suspense>
  );
}

function AnalyticsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Alt kategori detayından geri dönüşte seçili kategori/aralık korunur
  const [range, setRange] = useState<RangeKey>(() => {
    const r = searchParams.get("range");
    return isRangeKey(r) ? r : "hafta";
  });
  const [selectedCatId, setSelectedCatId] = useState<string | null>(
    () => searchParams.get("cat")
  );

  // Aralık başlangıcı — dakikalık oynamalar yeniden sorgu tetiklemesin diye memo
  const rangeStart = useMemo(() => rangeStartMs(range, new Date()), [range]);

  const overview = useLiveQuery(async () => {
    const [cats, subs, mods] = await Promise.all([
      db.categories.orderBy("order").toArray(),
      db.subcategories.toArray(),
      db.mods.toArray(),
    ]);
    const entries = await db.entries
      .where("occurredAt")
      .aboveOrEqual(rangeStart)
      .toArray();

    // Girdi serisi — pencere büyüdükçe kovalar kabalaşır (gün → hafta → ay);
    // "Tümü"nde pencere ilk girdiye kıstırılır
    let minOccurred: number | undefined;
    for (const e of entries) {
      if (minOccurred === undefined || e.occurredAt < minOccurred)
        minOccurred = e.occurredAt;
    }
    const win = resolveSeriesWindow(rangeStart, minOccurred, new Date());
    const buckets = buildSeriesBuckets(win.startMs, win.endMs, win.granularity);
    const bucketIdx = new Map(buckets.map((b, i) => [b.key, i]));
    for (const e of entries) {
      if (e.occurredAt < win.startMs) continue;
      const i = bucketIdx.get(bucketKeyOf(e.occurredAt, win.granularity));
      if (i !== undefined) buckets[i].value += 1;
    }

    // Kategori payı (girdi sayısına göre)
    const subCat = new Map(subs.map((s) => [s.id, s.categoryId]));
    const byCat = new Map<string, number>();
    for (const e of entries) {
      const catId = subCat.get(e.subcategoryId);
      if (!catId) continue;
      byCat.set(catId, (byCat.get(catId) ?? 0) + 1);
    }
    const catShare: ShareRow[] = cats
      .filter((c) => (byCat.get(c.id) ?? 0) > 0)
      .map((c) => ({
        id: c.id,
        name: c.name,
        color: c.color,
        value: byCat.get(c.id)!,
      }));

    return {
      cats,
      entryCount: entries.length,
      catCount: cats.length,
      subCount: subs.filter((s) => !s.isCategoryRoot).length,
      modCount: mods.length,
      buckets,
      granularity: win.granularity,
      catShare,
    };
  }, [rangeStart]);

  const cats = overview?.cats ?? [];
  const selectedCat =
    cats.find((c) => c.id === selectedCatId) ?? cats[0] ?? null;

  return (
    <>
      <PageHeader title="Analiz" description="Sayılar ve eğilimler" />

      {overview && overview.catCount === 0 ? (
        <EmptyState
          icon={BarChart3}
          title="Henüz veri yok"
          description="Analiz görmek için önce kategori oluşturup girdi ekle."
        />
      ) : (
        <div className="flex flex-col gap-4 pb-6">
          {/* Aralık filtresi — alttaki her şeyi kapsar; "Özel" herhangi bir tarih
              aralığının dönem analiz sayfasına götürür */}
          <div className="flex flex-wrap gap-2">
            {RANGES.map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={cn(
                  "rounded-xl border px-3.5 py-1.5 text-xs font-medium transition-colors",
                  range === r
                    ? "border-primary/60 bg-primary/15 text-foreground"
                    : "border-border bg-card text-muted-foreground hover:text-foreground"
                )}
              >
                {RANGE_LABELS[r]}
              </button>
            ))}
            <PeriodJump />
          </div>

          {/* Genel sayılar */}
          <div className="grid grid-cols-2 gap-2">
            <StatTile
              label="Girdi"
              value={fmtNum(overview?.entryCount ?? 0)}
              sub={RANGE_LABELS[range]}
            />
            <StatTile
              label="Kategori"
              value={fmtNum(overview?.catCount ?? 0)}
              sub="toplam"
            />
            <StatTile
              label="Alt Kategori"
              value={fmtNum(overview?.subCount ?? 0)}
              sub="toplam"
            />
            <StatTile
              label="Mod"
              value={fmtNum(overview?.modCount ?? 0)}
              sub="havuzda"
            />
          </div>

          {/* Girdi serisi — bara basınca o dönemin (gün/hafta/ay) analiz sayfası açılır */}
          <div className="rounded-2xl border border-border bg-card p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              {GRANULARITY_TITLES[overview?.granularity ?? "day"]} Girdi ·{" "}
              {RANGE_LABELS[range]}
            </h3>
            <DailyBarChart
              data={overview?.buckets ?? []}
              color="#6366f1"
              unit="girdi"
              onSelect={(periodKey) =>
                router.push(`/analytics/period/${periodKey}`)
              }
            />
          </div>

          {/* Kategori payları */}
          <div className="rounded-2xl border border-border bg-card p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Kategori Dağılımı · {RANGE_LABELS[range]}
            </h3>
            <ShareBars
              rows={overview?.catShare ?? []}
              emptyText="Bu aralıkta girdi yok"
            />
          </div>

          {/* Kategori detayı */}
          {cats.length > 0 && (
            <section className="flex flex-col gap-3 mt-2">
              <h2 className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Kategori Detayı
              </h2>
              <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4">
                {cats.map((c) => {
                  const active = selectedCat?.id === c.id;
                  return (
                    <button
                      key={c.id}
                      onClick={() => setSelectedCatId(c.id)}
                      className={cn(
                        "flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors shrink-0",
                        active
                          ? "text-foreground"
                          : "border-border bg-card text-muted-foreground hover:text-foreground"
                      )}
                      style={
                        active
                          ? {
                              borderColor: `${c.color}70`,
                              backgroundColor: `${c.color}18`,
                            }
                          : undefined
                      }
                    >
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: c.color }}
                      />
                      {c.name}
                    </button>
                  );
                })}
              </div>

              {/* key ile remount YOK — remount panel null'a düşüp titreme yaratıyor;
                  kategori değişimi panelin içinde render sırasında ele alınır */}
              {selectedCat && (
                <CategoryPanel
                  category={selectedCat}
                  range={range}
                  rangeStart={rangeStart}
                />
              )}
            </section>
          )}
        </div>
      )}
    </>
  );
}
