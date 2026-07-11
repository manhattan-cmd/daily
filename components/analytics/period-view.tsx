"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { db } from "@/lib/db";
import { cn } from "@/lib/utils";
import {
  bucketKeyOf,
  buildSeriesBuckets,
  chooseGranularity,
  dayKey,
  fmtNum,
  framePeriodSeries,
  GRANULARITY_TITLES,
  startOfDayMs,
  type Granularity,
  type SeriesFrame,
} from "@/lib/analytics";
import { periodProgress, shiftPeriod, type Period } from "@/lib/period";
import { PageHeader } from "@/components/layout/page-header";
import { StatTile } from "@/components/analytics/stat-tile";
import { DailyBarChart } from "@/components/analytics/daily-bar-chart";
import { ShareBars, type ShareRow } from "@/components/analytics/share-bars";
import { EntryList, type EntryListRow } from "@/components/analytics/entry-list";
import { PeriodQuickNav } from "@/components/analytics/period-quick-nav";
import { PeriodCategoryPanel } from "@/components/analytics/period-category-panel";

/**
 * Dönem analiz görünümü — herhangi bir zaman penceresinin (gün/hafta/ay/yıl/özel/tümü)
 * tüm kategorileri kapsayan analizi. Hem /analytics (içinde bulunulan hafta, default)
 * hem /analytics/period/[periodKey] bunu render eder. Seri grafiği alt dönemlere
 * tıklanarak inilir (yıl → ay → hafta → gün); ay serisi haftalardan oluşur.
 * Devam eden dönemlerde seri bugünde kırpılır ve "şu ana kadar" rozeti gösterilir.
 */
export function PeriodView({
  period,
  title,
  back,
  initialCatId,
}: {
  period: Period;
  /** Verilmezse period.label kullanılır */
  title?: string;
  /** Header'daki geri oku; sekme kökünde (analytics) verilmez */
  back?: string;
  /** Alt kategori sayfasından geri dönüşte seçili kategoriyi korur */
  initialCatId?: string | null;
}) {
  const router = useRouter();
  const [selectedCatId, setSelectedCatId] = useState<string | null>(
    initialCatId ?? null
  );

  const data = useLiveQuery(async () => {
    const [cats, subs, entries] = await Promise.all([
      db.categories.orderBy("order").toArray(),
      db.subcategories.toArray(),
      db.entries
        .where("occurredAt")
        .between(period.start, period.end, true, false)
        .toArray(),
    ]);
    return { cats, subs, entries };
  }, [period.key]);

  const computed = useMemo(() => {
    if (!data) return null;
    const { cats, subs, entries } = data;
    const now = new Date();
    const subById = new Map(subs.map((s) => [s.id, s]));
    const catById = new Map(cats.map((c) => [c.id, c]));

    // KPI'lar
    const activeDays = new Set(entries.map((e) => dayKey(e.occurredAt)));
    const usedCats = new Set<string>();
    for (const e of entries) {
      const catId = subById.get(e.subcategoryId)?.categoryId;
      if (catId) usedCats.add(catId);
    }

    // "Şu ana kadar" — devam eden dönemde günlük ortalamanın paydası geçen gün sayısı;
    // "Tümü"nde başlangıç ilk girdiye kıstırılır
    let minOcc: number | undefined;
    for (const e of entries) {
      if (minOcc === undefined || e.occurredAt < minOcc) minOcc = e.occurredAt;
    }
    const progress = periodProgress(
      period,
      now,
      period.kind === "all" ? (minOcc ?? now.getTime()) : undefined
    );

    // Seri — tek günlük dönemde grafik yok; hafta/ay/yıl dönemlerinde seri tüm
    // dönemi kapsar (gelecek kovalar 0'la yer tutar, eksen framePeriodSeries ile
    // sadeleşir); özel/tümü'nde devam eden dönem bugünde kırpılır
    const spanDays = (period.end - period.start) / 86400000;
    const fullFrame =
      period.kind === "week" ||
      period.kind === "month" ||
      period.kind === "year";
    let buckets: ReturnType<typeof buildSeriesBuckets> = [];
    let granularity: Granularity = "day";
    let seriesFrame: SeriesFrame | null = null;
    if (spanDays > 1.5) {
      const effStart =
        period.kind === "all"
          ? startOfDayMs(new Date(minOcc ?? now.getTime()))
          : period.start;
      const effEnd =
        progress.inProgress && !fullFrame
          ? Math.min(period.end, startOfDayMs(now) + 86400000)
          : period.end;
      granularity =
        period.kind === "month" ? "week" : chooseGranularity(effStart, effEnd);
      buckets = buildSeriesBuckets(effStart, effEnd, granularity);
      const idx = new Map(buckets.map((b, i) => [b.key, i]));
      for (const e of entries) {
        const i = idx.get(bucketKeyOf(e.occurredAt, granularity));
        if (i !== undefined) buckets[i].value += 1;
      }
      if (
        period.kind === "week" ||
        period.kind === "month" ||
        period.kind === "year"
      ) {
        seriesFrame = framePeriodSeries(period.kind, period.start, buckets);
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
      progress,
      buckets,
      granularity,
      seriesFrame,
      hasSeries: spanDays > 1.5,
      catShare,
      entryRows,
    };
  }, [period, data]);

  const prev = shiftPeriod(period, -1);
  const nextP = shiftPeriod(period, 1);
  // Tamamen gelecekte kalan döneme gitmek anlamsız
  const nextDisabled = !nextP || nextP.start > new Date().getTime();

  // Varsayılan kategori: dönemde en çok girdisi olan; hiç girdi yoksa ilk kategori
  let topShareCatId: string | null = null;
  if (computed) {
    let max = 0;
    for (const r of computed.catShare) {
      if (r.value > max) {
        max = r.value;
        topShareCatId = r.id;
      }
    }
  }
  const selectedCat =
    data?.cats.find((c) => c.id === selectedCatId) ??
    data?.cats.find((c) => c.id === topShareCatId) ??
    data?.cats[0] ??
    null;

  const progress = computed?.progress;
  const showProgress =
    !!progress &&
    progress.inProgress &&
    progress.totalDays > 1 &&
    period.kind !== "all";

  return (
    <>
      <PageHeader
        title={title ?? period.label}
        description={
          showProgress
            ? `Devam ediyor · ${progress.elapsedDays}/${progress.totalDays} gün`
            : "Dönem Analizi"
        }
        back={back}
      />

      <div className="flex flex-col gap-4 pb-6">
        {/* Hızlı atlama çipleri — Bugün / Bu Hafta / Bu Ay / Bu Yıl / Tümü / Özel */}
        <PeriodQuickNav activeKey={period.key} />

        {/* Dönem gezintisi: ◀ önceki · etiket · sonraki ▶ (Tümü'nde yön yok) */}
        {(prev || nextP) && (
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
            <span className="text-xs font-medium text-muted-foreground truncate">
              {period.label}
            </span>
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
        )}

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
            sub={
              showProgress
                ? `${progress.elapsedDays} günde`
                : "girdisi olan"
            }
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
              caption={computed.seriesFrame?.caption}
              showAllTicks={computed.seriesFrame?.showAllTicks}
              onSelect={(k) => router.push(`/analytics/period/${k}`)}
            />
          </div>
        )}

        {/* Kategori dağılımı — satıra basınca kategorinin analiz sayfasına gidilir
            (dönem içi detay için alttaki Kategori Detayı çipleri kullanılır) */}
        <div className="rounded-2xl border border-border bg-card p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Kategori Dağılımı
          </h3>
          <ShareBars
            rows={computed?.catShare ?? []}
            emptyText="Bu dönemde girdi yok"
            onSelect={(id) => router.push(`/analytics/${id}`)}
          />
        </div>

        {/* Kategori detayı — bu dönem penceresine kısıtlı mod bazlı analiz */}
        {data && data.cats.length > 0 && selectedCat && (
          <section className="flex flex-col gap-3 mt-2">
            <div className="flex items-center justify-between gap-2 px-1">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Kategori Detayı
              </h2>
              {/* Zaman penceresinden bağımsız, kategorinin tüm zamanlar analizi */}
              <Link
                href={`/analytics/${selectedCat.id}`}
                className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                Kategori Analizi
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
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
