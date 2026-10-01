"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import {
  ArrowRight,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  PenLine,
} from "lucide-react";
import { db } from "@/lib/db";
import { toLocalDateValue } from "@/lib/utils";
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
import {
  allPeriod,
  dayPeriod,
  monthPeriod,
  periodProgress,
  periodShortLabel,
  shiftPeriod,
  weekPeriod,
  yearPeriod,
  type Period,
} from "@/lib/period";
import { prefetchPeriod, usePeriodData } from "@/components/analytics/period-data";
import { whenIdle } from "@/lib/db/day-cache";
import { PageHeader } from "@/components/layout/page-header";
import { StatTile } from "@/components/analytics/stat-tile";
import { DailyBarChart } from "@/components/analytics/daily-bar-chart";
import { ShareBars, type ShareRow } from "@/components/analytics/share-bars";
import {
  EntryListSection,
  type EntryListRow,
} from "@/components/analytics/entry-list";
import { PeriodQuickNav } from "@/components/analytics/period-quick-nav";
import {
  PeriodCategoryPanel,
  panelWindow,
} from "@/components/analytics/period-category-panel";
import { prefetchCategoryMetrics } from "@/components/analytics/use-category-metrics";
import { useExcludeRegular } from "@/components/analytics/regular-toggle";
import {
  getAnalysisSelection,
  selectAnalysisCategory,
} from "@/components/analytics/analysis-selection";
import { ChipRow } from "@/components/analytics/chip-row";
import { LazyMount } from "@/components/ui/lazy-mount";
import { useT } from "@/lib/i18n";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { routes } from "@/lib/routes";

/**
 * Dönem özeti — girdi sayısı / aktif gün / kategori kutuları ve dönemin
 * girdi serisi — şimdilik RAFTA (2026-10). Kullanıcı Analiz'e girince önce
 * dönemin kategori dağılımını görmek, oradan bir kategoriye inmek istiyor;
 * özet en üstte bu yolu aşağı itiyordu. Geri getirmek için true yap.
 */
const SHOW_PERIOD_SUMMARY = false;

/**
 * Dönem analiz görünümü — herhangi bir zaman penceresinin (gün/hafta/ay/yıl/özel/tümü)
 * tüm kategorileri kapsayan analizi. /analytics (içinde bulunulan hafta, default) ve
 * /analytics?key=… (herhangi bir dönem) — aynı sayfa, görünüm dönemler arasında
 * yerinde kalır. Seri grafiği alt dönemlere tıklanarak inilir (yıl → ay → hafta → gün); ay serisi haftalardan oluşur.
 * Devam eden dönemlerde seri bugünde kırpılır ve t("insights.soFar") rozeti gösterilir.
 */
export function PeriodView({
  period: requestedPeriod,
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
  const t = useT();
  const router = useRouter();
  // Ekranda gösterilen dönem VERİNİN dönemi: yeni dönemin verisi gelene kadar
  // önceki dönem kendi başlığı ve rakamlarıyla tutarlı durur, sonra tek karede
  // geçilir — iskelet ya da karışık bir ara görüntü yok (bkz. period-data).
  const data = usePeriodData(requestedPeriod);
  const period = data?.period ?? requestedPeriod;
  // Başka dönemden gelindiyse orada bakılan kategori taşınır (bkz.
  // analysis-selection); URL'deki ?cat her zaman önce gelir
  const [selectedCatId, setSelectedCatId] = useState<string | null>(
    () => initialCatId ?? getAnalysisSelection().catId
  );
  // Bu dönemde elle seçildi mi — taşınan seçim yalnız bu dönemde verisi
  // varsa geçerli; elle seçilen (sönük çip dahil) her zaman geçerli
  const [catPicked, setCatPicked] = useState(!!initialCatId);
  const [prevPeriodKey, setPrevPeriodKey] = useState(period.key);
  if (prevPeriodKey !== period.key) {
    setPrevPeriodKey(period.key);
    setCatPicked(false);
  }
  const pickCat = (id: string) => {
    setSelectedCatId(id);
    setCatPicked(true);
    selectAnalysisCategory(id);
  };
  // Dağılımdan kategori seçilince detaya kaydır
  const detailRef = useRef<HTMLElement | null>(null);

  /** Uygulamada hiç girdi var mı — dönemden bağımsız */
  const totalEntries = useLiveQuery(() => db.entries.count(), []);


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

    // t("insights.soFar") — devam eden dönemde günlük ortalamanın paydası geçen gün sayısı;
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

  // Gidilebilecek dönemleri boşta önceden oku — hızlı çipler (bugün, bu hafta,
  // bu ay, bu yıl, tümü) ve önceki/sonraki dönem. Geçiş anında olsun.
  const prevKey = prev?.key;
  const nextKey = nextDisabled ? undefined : nextP?.key;
  useEffect(
    () =>
      whenIdle(async () => {
        const now = Date.now();
        const targets = [dayPeriod(now), weekPeriod(now), monthPeriod(now), yearPeriod(now), allPeriod()];
        if (prev) targets.push(prev);
        if (nextKey && nextP) targets.push(nextP);
        for (const p of targets) await prefetchPeriod(p);
      }),
    // prev/nextP her çizimde yeni nesne; kimlikleri anahtar
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [period.key, prevKey, nextKey]
  );

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
  const catCounts = new Map(
    (computed?.catShare ?? []).map((r) => [r.id, r.value])
  );
  const selectedCat =
    data?.cats.find(
      (c) =>
        c.id === selectedCatId &&
        (catPicked || (catCounts.get(c.id) ?? 0) > 0)
    ) ??
    data?.cats.find((c) => c.id === topShareCatId) ??
    data?.cats[0] ??
    null;

  // Kırılımda inilen yol da taşınır — ama yalnız bu dönemde girdisi olan
  // kademeye kadar: boş bir kaleme inilmiş halde açılmak "veri yok" duvarı
  const carried =
    selectedCat && getAnalysisSelection().catId === selectedCat.id
      ? getAnalysisSelection()
      : null;
  const carriedPath = useMemo(() => {
    if (!carried?.path.length || !data) return [];
    const parentOf = new Map(data.subs.map((s) => [s.id, s.parentId]));
    const withEntries = new Set<string>();
    for (const e of data.entries) {
      // Girdinin kalemi ve bütün ataları o dönemde "dolu" sayılır
      let id: string | undefined = e.subcategoryId;
      while (id && !withEntries.has(id)) {
        withEntries.add(id);
        id = parentOf.get(id);
      }
    }
    const kept = [];
    for (const s of carried.path) {
      if (!withEntries.has(s.id)) break;
      kept.push(s);
    }
    return kept;
  }, [carried, data]);

  // Kategori panelinin verisi: dönemde girdisi olan kategoriler boşta, dokunulan
  // kategori parmak değdiği an önden okunur — kategoriler arasında gezerken
  // panel boşalıp yeniden dolmasın (bkz. use-category-metrics önbelleği)
  const [excludeRegular] = useExcludeRegular();
  const win = panelWindow(period);
  const panelParams = (categoryId: string) => ({
    categoryId,
    fetchStart: win.start,
    fetchEnd: win.end,
    excludeRegular,
  });
  const activeCatIds = (computed?.catShare ?? [])
    .filter((r) => r.value > 0)
    .map((r) => r.id)
    .join(",");
  useEffect(
    () =>
      whenIdle(async () => {
        for (const id of activeCatIds.split(",")) {
          if (id) await prefetchCategoryMetrics(panelParams(id));
        }
      }),
    // panelParams yalnız bu üçüne bağlı
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeCatIds, win.start, win.end, excludeRegular]
  );

  // Kategori detayı çipleri — dönemde en çok girdisi olan başa; girdisi
  // olmayanlar (yapı sırasını koruyarak) sona, sayısı olmadan sönük görünür
  const catChips = useMemo(() => {
    if (!data) return [];
    const counts = new Map(
      (computed?.catShare ?? []).map((r) => [r.id, r.value])
    );
    return data.cats
      .map((cat, order) => ({ cat, order, count: counts.get(cat.id) ?? 0 }))
      .sort((a, b) => b.count - a.count || a.order - b.order);
  }, [data, computed]);

  /** KPI alt yazısı — sayıların hangi aralığa ait olduğu ("bu hafta") */
  const spanLabel = periodShortLabel(period);
  const progress = computed?.progress;

  // Hiç girdi yokken sıfırlardan bir duvar göstermek, yeni kullanıcıya
  // "burada bir şey bozuk" hissi veriyordu — davet daha dürüst
  if (totalEntries === 0) {
    return (
      <>
        <PageHeader
          title={title ?? period.label}
          description={t("insights.period")}
          back={back}
        />
        <EmptyState
          icon={BarChart3}
          title={t("insights.empty.title")}
          description={t("insights.empty.body")}
          action={
            <Button asChild>
              <Link href={routes.day(toLocalDateValue())}>
                <PenLine className="h-4 w-4" />
                {t("insights.empty.action")}
              </Link>
            </Button>
          }
        />
      </>
    );
  }

  // İlk yüklemede iskelet — boş görünüp sonra dolmaktansa şeklini göster
  if (!data) {
    return (
      <>
        <PageHeader
          title={title ?? period.label}
          description={t("insights.period")}
          back={back}
        />
        <PeriodQuickNav activeKey={requestedPeriod.key} />
        <div className="flex flex-col gap-4 pb-6">
          <div className="grid grid-cols-3 gap-2">
            <Skeleton className="h-[76px] rounded-2xl" />
            <Skeleton className="h-[76px] rounded-2xl" />
            <Skeleton className="h-[76px] rounded-2xl" />
          </div>
          <Skeleton className="h-[220px] rounded-2xl" />
          <Skeleton className="h-[140px] rounded-2xl" />
        </div>
      </>
    );
  }
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
            ? `In progress · ${progress.elapsedDays}/${progress.totalDays} days`
            : t("insights.period")
        }
        back={back}
      />

      {/* Hızlı atlama çipleri — Yapı sekmeleriyle aynı yerde: başlığın hemen
          altında, içerik akışının dışında */}
      <PeriodQuickNav activeKey={requestedPeriod.key} />

      <div className="flex flex-col gap-4 pb-6">
        {/* Dönem gezintisi: ◀ önceki · etiket · sonraki ▶ (Tümü'nde yön yok) */}
        {(prev || nextP) && (
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              disabled={!prev}
              onClick={() => prev && router.push(routes.period(prev.key))}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
              aria-label={t("insights.previousPeriod")}
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
                nextP && router.push(routes.period(nextP.key))
              }
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
              aria-label={t("insights.nextPeriod")}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Özet (KPI kutuları + dönem serisi) RAFTA — bkz. SHOW_PERIOD_SUMMARY */}
        {SHOW_PERIOD_SUMMARY && (
          <>
        {/* KPI'lar — her kutu neyin, hangi aralıkta sayısı olduğunu söyler */}
        <div className="grid grid-cols-3 gap-2">
          <StatTile
            label={t("insights.entries")}
            value={fmtNum(computed?.entryCount ?? 0)}
            sub={spanLabel}
          />
          <StatTile
            label={t("insights.activeDays")}
            value={fmtNum(computed?.activeDays ?? 0)}
            sub={
              progress
                ? `${progress.elapsedDays} günün ${computed?.activeDays ?? 0} günü`
                : spanLabel
            }
          />
          <StatTile
            label={t("insights.categoriesUsed")}
            value={fmtNum(computed?.catCount ?? 0)}
            sub={spanLabel}
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
              unit="entries"
              caption={computed.seriesFrame?.caption}
              showAllTicks={computed.seriesFrame?.showAllTicks}
              onSelect={(k) => router.push(routes.period(k))}
            />
          </div>
        )}
          </>
        )}

        {/* Kategori dağılımı — satıra basınca aynı dönemin kategori detayına
            geçilir. Eskiden kategorinin tüm zamanlar sayfasına gidiyordu:
            tıklanan rakam dönemin, açılan sayfa tüm zamanlarındı. */}
        <div className="rounded-2xl border border-border bg-card p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Category breakdown
          </h3>
          <ShareBars
            rows={computed?.catShare ?? []}
            emptyText={t("insights.noEntriesInPeriod")}
            onSelect={(id) => {
              pickCat(id);
              detailRef.current?.scrollIntoView({
                behavior: "smooth",
                block: "start",
              });
            }}
          />
        </div>

        {/* Kategori detayı — bu dönem penceresine kısıtlı mod bazlı analiz */}
        {data && data.cats.length > 0 && selectedCat && (
          /* scroll-mt: yapışkan sayfa başlığının altında kalmasın — kaydırma
             t("insights.categoryDetail") başlığını da kapsayacak kadar yukarıda dursun */
          <section ref={detailRef} className="mt-2 flex scroll-mt-32 flex-col gap-3">
            <div className="flex items-center justify-between gap-2 px-1">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Category detail
              </h2>
              {/* Zaman penceresinden bağımsız, kategorinin tüm zamanlar analizi */}
              <Link
                href={routes.analyticsCategory(selectedCat.id)}
                prefetch={false}
                className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                Category insights
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <ChipRow
              items={catChips.map(({ cat: c, count }) => ({
                key: c.id,
                label: c.name,
                color: c.color,
                active: selectedCat.id === c.id,
                count,
                dim: count === 0,
                onPick: () => pickCat(c.id),
                onPress: () => void prefetchCategoryMetrics(panelParams(c.id)),
              }))}
            />

            {/* Panel ekranın altında kalıyor ve grafikleriyle ağır: görünür
                alana yaklaşınca çizilir (bkz. LazyMount). Dönem ya da
                kategori değişince kırılımda inilen yol sıfırlansın (key). */}
            <LazyMount minHeight={640}>
              <PeriodCategoryPanel
                key={`${selectedCat.id}|${period.key}`}
                category={selectedCat}
                period={period}
                initialPath={carriedPath}
                preferredMetricId={carried?.metricId ?? undefined}
              />
            </LazyMount>
          </section>
        )}

        {/* Tüm kategorilerin girdileri — sayfanın en altı, yaklaşınca çizilir */}
        <LazyMount minHeight={480}>
          <EntryListSection
            title={t("insights.allEntries")}
            rows={computed?.entryRows ?? []}
            emptyText={t("insights.noEntriesInPeriod")}
          />
        </LazyMount>
      </div>
    </>
  );
}
