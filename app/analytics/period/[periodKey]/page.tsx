"use client";

import { use, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { CalendarX, ChevronLeft, ChevronRight } from "lucide-react";
import { db } from "@/lib/db";
import { cn } from "@/lib/utils";
import {
  bucketKeyOf,
  buildSeriesBuckets,
  chooseGranularity,
  dayKey,
  fmtNum,
  GRANULARITY_TITLES,
  startOfDayMs,
} from "@/lib/analytics";
import { parsePeriodKey, shiftPeriod } from "@/lib/period";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { StatTile } from "@/components/analytics/stat-tile";
import { DailyBarChart } from "@/components/analytics/daily-bar-chart";
import { ShareBars, type ShareRow } from "@/components/analytics/share-bars";
import { EntryList, type EntryListRow } from "@/components/analytics/entry-list";
import { PeriodJump } from "@/components/analytics/period-jump";
import { PeriodCategoryPanel } from "@/components/analytics/period-category-panel";

/**
 * Dönem analiz sayfası — herhangi bir zaman penceresinin (gün/hafta/ay/yıl/özel/tümü)
 * tüm kategorileri kapsayan analizi. Seri grafiği alt dönemlere tıklanarak inilir
 * (yıl → ay → gün); metrik, tüm kategorilerde ortak tek anlamlı ölçü olan girdi sayısıdır.
 */
export default function PeriodAnalyticsPage({
  params,
}: {
  params: Promise<{ periodKey: string }>;
}) {
  const { periodKey } = use(params);
  const router = useRouter();
  const [selectedCatId, setSelectedCatId] = useState<string | null>(null);

  const period = useMemo(
    () => parsePeriodKey(decodeURIComponent(periodKey)),
    [periodKey]
  );

  const data = useLiveQuery(async () => {
    if (!period) return null;
    const [cats, subs, entries] = await Promise.all([
      db.categories.orderBy("order").toArray(),
      db.subcategories.toArray(),
      db.entries
        .where("occurredAt")
        .between(period.start, period.end, true, false)
        .toArray(),
    ]);
    return { cats, subs, entries };
  }, [period?.key]);

  const computed = useMemo(() => {
    if (!period || !data) return null;
    const { cats, subs, entries } = data;
    const subById = new Map(subs.map((s) => [s.id, s]));
    const catById = new Map(cats.map((c) => [c.id, c]));

    // KPI'lar
    const activeDays = new Set(entries.map((e) => dayKey(e.occurredAt)));
    const usedCats = new Set<string>();
    for (const e of entries) {
      const catId = subById.get(e.subcategoryId)?.categoryId;
      if (catId) usedCats.add(catId);
    }

    // Seri — tek günlük dönemde grafik yok; "Tümü"nde pencere ilk girdiye kıstırılır
    const spanDays = (period.end - period.start) / 86400000;
    let buckets: ReturnType<typeof buildSeriesBuckets> = [];
    let granularity: ReturnType<typeof chooseGranularity> = "day";
    if (spanDays > 1.5) {
      let effStart = period.start;
      if (period.kind === "all") {
        let minOcc: number | undefined;
        for (const e of entries) {
          if (minOcc === undefined || e.occurredAt < minOcc) minOcc = e.occurredAt;
        }
        effStart = startOfDayMs(new Date(minOcc ?? Date.now()));
      }
      granularity = chooseGranularity(effStart, period.end);
      buckets = buildSeriesBuckets(effStart, period.end, granularity);
      const idx = new Map(buckets.map((b, i) => [b.key, i]));
      for (const e of entries) {
        const i = idx.get(bucketKeyOf(e.occurredAt, granularity));
        if (i !== undefined) buckets[i].value += 1;
      }
    }

    // Kategori dağılımı (girdi sayısına göre)
    const byCat = new Map<string, number>();
    for (const e of entries) {
      const catId = subById.get(e.subcategoryId)?.categoryId;
      if (!catId) continue;
      byCat.set(catId, (byCat.get(catId) ?? 0) + 1);
    }
    const catShare: ShareRow[] = [...byCat.entries()]
      .filter(([, v]) => v > 0)
      .map(([id, v]) => {
        const c = catById.get(id);
        return {
          id,
          name: c?.name ?? "—",
          color: c?.color ?? "#6366f1",
          value: v,
        };
      });

    // Kalem kalem girdi listesi — kategori bağlamıyla
    const entryRows: EntryListRow[] = [...entries]
      .sort((a, b) => b.occurredAt - a.occurredAt)
      .map((e) => {
        const sub = subById.get(e.subcategoryId);
        const cat = sub ? catById.get(sub.categoryId) : undefined;
        const subLabel = cat
          ? sub!.isCategoryRoot
            ? cat.name
            : `${cat.name} · ${sub!.name}`
          : sub?.name;
        return {
          id: e.id,
          occurredAt: e.occurredAt,
          title: e.title,
          notes: e.notes,
          subLabel,
        };
      });

    return {
      entryCount: entries.length,
      activeDays: activeDays.size,
      catCount: usedCats.size,
      buckets,
      granularity,
      hasSeries: spanDays > 1.5,
      catShare,
      entryRows,
    };
  }, [period, data]);

  if (!period) {
    return (
      <>
        <PageHeader title="Dönem" back="/analytics" />
        <EmptyState
          icon={CalendarX}
          title="Geçersiz dönem"
          description="Bu adres tanınmadı — analiz sayfasından tekrar dene."
        />
      </>
    );
  }

  const prev = shiftPeriod(period, -1);
  const nextP = shiftPeriod(period, 1);
  // Tamamen gelecekte kalan döneme gitmek anlamsız
  const nextDisabled = !nextP || nextP.start > Date.now();

  const selectedCat =
    data?.cats.find((c) => c.id === selectedCatId) ?? data?.cats[0] ?? null;

  return (
    <>
      <PageHeader
        title={period.label}
        description="Dönem Analizi"
        back="/analytics"
      />

      <div className="flex flex-col gap-4 pb-6">
        {/* Dönem gezintisi: ◀ önceki · özel seçici · sonraki ▶ */}
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            disabled={!prev}
            onClick={() => prev && router.push(`/analytics/period/${prev.key}`)}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
            aria-label="Önceki dönem"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <PeriodJump align="center" />
          <button
            type="button"
            disabled={nextDisabled}
            onClick={() =>
              nextP && router.push(`/analytics/period/${nextP.key}`)
            }
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
            aria-label="Sonraki dönem"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* KPI'lar */}
        <div className="grid grid-cols-3 gap-2">
          <StatTile
            label="Girdi"
            value={fmtNum(computed?.entryCount ?? 0)}
            sub="toplam"
          />
          <StatTile
            label="Aktif Gün"
            value={fmtNum(computed?.activeDays ?? 0)}
            sub="girdisi olan"
          />
          <StatTile
            label="Kategori"
            value={fmtNum(computed?.catCount ?? 0)}
            sub="kullanılan"
          />
        </div>

        {/* Seri — bir günden uzun dönemlerde; bara basınca alt döneme inilir */}
        {computed?.hasSeries && (
          <div className="rounded-2xl border border-border bg-card p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              {GRANULARITY_TITLES[computed.granularity]} Girdi
            </h3>
            <DailyBarChart
              data={computed.buckets}
              color="#6366f1"
              unit="girdi"
              onSelect={(k) => router.push(`/analytics/period/${k}`)}
            />
          </div>
        )}

        {/* Kategori dağılımı — satıra basınca alttaki Kategori Detayı o kategoriye geçer */}
        <div className="rounded-2xl border border-border bg-card p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Kategori Dağılımı
          </h3>
          <ShareBars
            rows={computed?.catShare ?? []}
            emptyText="Bu dönemde girdi yok"
            onSelect={setSelectedCatId}
          />
        </div>

        {/* Kategori detayı — bu dönem penceresine kısıtlı mod bazlı analiz */}
        {data && data.cats.length > 0 && selectedCat && (
          <section className="flex flex-col gap-3 mt-2">
            <h2 className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Kategori Detayı
            </h2>
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4">
              {data.cats.map((c) => {
                const active = selectedCat.id === c.id;
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

            <PeriodCategoryPanel category={selectedCat} period={period} />
          </section>
        )}

        {/* Tüm kategorilerin girdileri */}
        <div className="rounded-2xl border border-border bg-card p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Tüm Girdiler
          </h3>
          <EntryList
            rows={computed?.entryRows ?? []}
            emptyText="Bu dönemde girdi yok"
          />
        </div>
      </div>
    </>
  );
}
