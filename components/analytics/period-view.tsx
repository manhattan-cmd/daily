"use client";

import { useEffect, useMemo, useState } from "react";
import { ObjectsCard } from "@/components/analytics/objects-card";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import {
  BarChart3,
  PenLine,
} from "lucide-react";
import { db } from "@/lib/db";
import { cn, toLocalDateValue } from "@/lib/utils";
import { Layer, PageSheet } from "@/components/ui/layer";
import { useIsBrutal } from "@/components/structure/brutal";
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
  periodLabel,
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
  EntryListBlock,
  EntryListSection,
  type EntryListRow,
} from "@/components/analytics/entry-list";
import { ANALYSIS_COLOR, AnalysisMenu } from "@/components/analytics/analysis-header";
import { SummaryBlock, SummaryTile } from "@/components/ui/summary-block";
import { PeriodNav, PeriodTabs } from "@/components/analytics/period-switcher";
import {
  PeriodCategoryPanel,
  panelWindow,
} from "@/components/analytics/period-category-panel";
import { prefetchCategoryMetrics } from "@/components/analytics/use-category-metrics";
import { useExcludeRegular } from "@/components/analytics/regular-toggle";
import {
  getAnalysisSelection,
  selectAnalysisCategory,
  setAnalysisPath,
  setAnalysisMetric,
} from "@/components/analytics/analysis-selection";
import { ScopePickers } from "@/components/analytics/scope-pickers";
import type { SubCategory } from "@/types";
import { LazyMount } from "@/components/ui/lazy-mount";
import { intlTag, useLocale, useT, translate } from "@/lib/i18n";
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

/** Analiz başlık bandının zemini (zaman + yol menülerinin bölümü) */
export const ANALYSIS_HEADER =
  // band-an: Brütal temada bölümün mavi bandı (bkz. globals.css "bolum bantlari")
  "band-an rounded-b-[24px] border-[var(--ln-2)] bg-card pb-0 shadow-[0_12px_28px_-14px_rgba(0,0,0,0.75)]";

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
  initialSubId,
}: {
  /** Açılışta inilecek alt kategori (yapı sayfasının Analiz'i) — initialCatId'nin */
  initialSubId?: string | null;
  period: Period;
  /** Verilmezse period.label kullanılır */
  title?: string;
  /** Header'daki geri oku; sekme kökünde (analytics) verilmez */
  back?: string;
  /** Alt kategori sayfasından geri dönüşte seçili kategoriyi korur */
  initialCatId?: string | null;
}) {
  const t = useT();
  const brutal = useIsBrutal();
  // Başlık etiketi bu dille — sunucuyla aynı ilk çizim (bkz. periodLabel)
  const locale = useLocale();
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
  // "Kategoriler"e dönüldü — hiçbir kategori seçili değil, altta kademe yok
  const [catsOnly, setCatsOnly] = useState(false);
  const pickCat = (id: string) => {
    setSelectedCatId(id);
    setCatPicked(true);
    setCatsOnly(false);
    selectAnalysisCategory(id);
  };
  /*
   * KADEME YIĞINI. Sayfa yukarıdan aşağı bir yol: kategoriler → seçilen
   * kategorinin alt kategorileri → seçilen alt kategorinin alt kalemleri → …
   * → en sonda seçilen yerin özellikleri. Yol ve özellik seçimi kategoriye
   * aittir (başka kategoriye geçince sıfırdan). Bir satıra dokunmak bir
   * sonraki kartı açar ve sayfa oraya kayar; nerede olunduğunu başlıktaki
   * konum çubuğu söyler.
   */
  const [drill, setDrill] = useState<{ catId: string; path: SubCategory[] } | null>(null);
  const [metricSel, setMetricSel] = useState<{ catId: string; id: string } | null>(null);
  // Seçimden sonra hangi karta kayılacak — yeni kart çizildikten sonra
  const [scrollTarget, setScrollTarget] = useState<string | null>(null);
  useEffect(() => {
    if (!scrollTarget) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const id = requestAnimationFrame(() => {
      // Kartlar data-section ile işaretli (top · cat · alt kalem id · focus)
      const el = document.querySelector<HTMLElement>(
        `[data-section="${CSS.escape(scrollTarget)}"]`
      );
      const main = document.querySelector("main");
      setScrollTarget(null);
      if (!el || !main) return;
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      // Kayarken bant kısılıyor; varılan yer bandın altında kalabiliyor.
      // Kayma bitince kart bandın hemen altına yeniden oturtulur.
      const realign = () => {
        main.removeEventListener("scrollend", realign);
        clearTimeout(timer);
        if (scrollTarget === "top") return;
        const header = main.querySelector("header");
        const want = (header?.getBoundingClientRect().bottom ?? 0) + 12;
        const off = el.getBoundingClientRect().top - want;
        if (Math.abs(off) > 2) main.scrollBy({ top: off, behavior: "smooth" });
      };
      main.addEventListener("scrollend", realign);
      // scrollend desteklenmiyorsa (eski WebView) yedek
      timer = setTimeout(realign, 900);
    });
    return () => {
      cancelAnimationFrame(id);
      clearTimeout(timer);
    };
  }, [scrollTarget]);

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
          icon: c?.icon,
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

  const catCounts = new Map(
    (computed?.catShare ?? []).map((r) => [r.id, r.value])
  );
  // Analiz SEÇİMSİZ açılır: önce kategorilerin dağılımı, kullanıcı birine
  // dokununca kademeler açılır. Eskiden en çok girdisi olan kategori (ve
  // taşınan alt kalem) kendiliğinden seçili geliyordu. Bu oturumda seçilmiş
  // bir kategori dönem değişince korunur — o dönemde verisi varsa.
  const selectedCat = catsOnly
    ? null
    : data?.cats.find(
        (c) =>
          c.id === selectedCatId &&
          (catPicked || (catCounts.get(c.id) ?? 0) > 0)
      ) ?? null;

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

  // Adresle gelen alt kategori (yapıdan): kökten ona yol — o dönemde girdisi
  // olmasa da (taşınan yoldan farkı); seçicilerle yer değişince geçersiz
  const urlPath = useMemo(() => {
    if (!initialSubId || !data || selectedCat?.id !== initialCatId) return null;
    const subById = new Map(data.subs.map((x) => [x.id, x]));
    const chain: SubCategory[] = [];
    for (let cur = subById.get(initialSubId); cur; cur = cur.parentId ? subById.get(cur.parentId) : undefined) chain.unshift(cur);
    return chain.length && chain[0].categoryId === initialCatId ? chain : null;
  }, [initialSubId, initialCatId, data, selectedCat?.id]);
  const path: SubCategory[] = selectedCat
    ? drill?.catId === selectedCat.id
      ? drill.path
      : (urlPath ?? carriedPath)
    : [];
  const metricId: string = selectedCat
    ? metricSel?.catId === selectedCat.id
      ? metricSel.id
      : carried?.metricId ?? "count"
    : "count";
  /** Seçim değişince içerik baştan değişir — sayfa başına, kaydırma animasyonu yok */
  const toTop = () => {
    const main = document.querySelector("main");
    if (main) main.scrollTop = 0;
  };
  /** Üst seçiciden yer: kategori ve inilecek yol tek seferde */
  const pickPlace = (catId: string | null, pathIds: string[]) => {
    if (!catId) {
      setCatsOnly(true);
      toTop();
      return;
    }
    const subById = new Map((data?.subs ?? []).map((s) => [s.id, s]));
    const next = pathIds.map((id) => subById.get(id)).filter((x): x is SubCategory => !!x);
    pickCat(catId);
    setDrill({ catId, path: next });
    setAnalysisPath(catId, next);
    // Seçili özellik yeni yerde de seçili kalsın (ağaç zaten onun geçtiği
    // yerleri gösteriyor)
    if (metricId !== "count") {
      setMetricSel({ catId, id: metricId });
      setAnalysisMetric(catId, metricId);
    }
    toTop();
  };
  /** Üst seçiciden özellik: başka kategorideyse önce oraya geçer */
  const pickMetric = (catId: string, id: string) => {
    if (catId !== selectedCat?.id) {
      pickCat(catId);
      setDrill({ catId, path: [] });
      setAnalysisPath(catId, []);
    }
    setMetricSel({ catId, id });
    setAnalysisMetric(catId, id);
    toTop();
  };
  /** Kırılımdan bir alt kategoriye in — yol kökten o kaleme kurulur */
  const drillTo = (subId: string) => {
    if (!selectedCat || !data) return;
    const subById = new Map(data.subs.map((x) => [x.id, x]));
    const chain: SubCategory[] = [];
    for (let cur = subById.get(subId); cur; cur = cur.parentId ? subById.get(cur.parentId) : undefined) chain.unshift(cur);
    pickPlace(selectedCat.id, chain.map((x) => x.id));
  };

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


  /** KPI alt yazısı — sayıların hangi aralığa ait olduğu ("bu hafta") */
  const spanLabel = periodShortLabel(period);
  const progress = computed?.progress;

  // Hiç girdi yokken sıfırlardan bir duvar göstermek, yeni kullanıcıya
  // "burada bir şey bozuk" hissi veriyordu — davet daha dürüst
  if (totalEntries === 0) {
    // Brütal: tek blok — "Analiz için henüz veri yok" ve yeşil İlk girdini
    // yap karosu; açıklama cümlesi yok
    if (brutal) {
      return (
        <PageSheet
          top={<AnalysisMenu title={t("nav.insights")} />}
        >
          <SummaryBlock
            lead={{ kind: "title", color: ANALYSIS_COLOR, overline: t("nav.insights"), title: t("insights.empty.title") }}
            action={
              <SummaryTile
                color="#7ae582"
                icon={PenLine}
                label={t("insights.empty.action")}
                href={routes.day(toLocalDateValue())}
              />
            }
            stats={[]}
          />
        </PageSheet>
      );
    }
    return (
      <PageSheet
        top={
          <PageHeader
            title={title ?? periodLabel(period, locale)}
            description={t("insights.period")}
            back={back}
            className="band-an"
          />
        }
      >
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
      </PageSheet>
    );
  }

  // İlk yüklemede iskelet — boş görünüp sonra dolmaktansa şeklini göster
  if (!data) {
    if (brutal) {
      return (
        <PageSheet top={<AnalysisMenu period={requestedPeriod} sub={" "} />}>
          <div className="flex flex-col gap-4 pb-6">
            <Skeleton className="h-[220px] rounded-[18px]" />
            <Skeleton className="h-[140px] rounded-[18px]" />
          </div>
        </PageSheet>
      );
    }
    return (
      <PageSheet
        top={
          <PageHeader
            compact
            className={ANALYSIS_HEADER}
            title={title ?? periodLabel(period, locale)}
            titleSlot={<PeriodNav period={requestedPeriod} />}
            nav={<PeriodTabs period={requestedPeriod} />}
          />
        }
      >
        <div className="flex flex-col gap-4 pb-6">
          <div className="grid grid-cols-3 gap-2">
            <Skeleton className="h-[76px] rounded-2xl" />
            <Skeleton className="h-[76px] rounded-2xl" />
            <Skeleton className="h-[76px] rounded-2xl" />
          </div>
          <Skeleton className="h-[220px] rounded-2xl" />
          <Skeleton className="h-[140px] rounded-2xl" />
        </div>
      </PageSheet>
    );
  }
  const showProgress =
    !!progress &&
    progress.inProgress &&
    progress.totalDays > 1 &&
    period.kind !== "all";

  const fmt = (n: number) => new Intl.NumberFormat(intlTag(locale)).format(n);
  const pickers = (
    <ScopePickers
      cats={data.cats}
      subs={data.subs}
      entries={data.entries}
      selectedCat={selectedCat}
      path={path}
      metricId={metricId}
      onPlace={pickPlace}
      onMetric={pickMetric}
    />
  );

  // Brütal: ana sayfanın blok dili — üst menü şerit (bkz. AnalysisMenu),
  // bölümler SummaryBlock: mavi Kategori dağılımı (satırlar beyaz hücrede),
  // sarı Nesneler, turuncu Tüm girdiler. Yer seçiliyken o yerin blokları
  // (bkz. PeriodCategoryPanel). Krem katmanlar yok.
  if (brutal) {
    const catRows = computed?.catShare ?? [];
    const entryCount = computed?.entryCount ?? 0;
    return (
      <PageSheet
        top={
          <AnalysisMenu
            period={period}
            sub={[
              `${fmt(entryCount)} ${t("home.entries")}`,
              showProgress && t("period.progress", { n: progress.elapsedDays, total: progress.totalDays }),
            ]
              .filter(Boolean)
              .join(" · ")}
            below={pickers}
          />
        }
      >
        <div className="flex flex-col gap-4 pb-6">
          {!selectedCat && (
            <div data-section="top" className="scroll-mt-36">
              <SummaryBlock
                lead={{
                  kind: "count",
                  color: ANALYSIS_COLOR,
                  overline: translate("an.catBreakdown"),
                  value: fmt(catRows.length),
                  unit: t("an.catsUnit"),
                }}
                stats={[]}
              >
                {catRows.length > 0 && <ShareBars cells rows={catRows} nudge onSelect={(id) => pickPlace(id, [])} />}
              </SummaryBlock>
            </div>
          )}

          {!selectedCat && <ObjectsCard start={period.start} end={period.end} />}

          {selectedCat && (
            <PeriodCategoryPanel
              key={`${selectedCat.id}|${period.key}`}
              category={selectedCat}
              period={period}
              path={path}
              metricId={metricId}
              onDrill={drillTo}
              onResolved={(id) => setMetricSel({ catId: selectedCat.id, id })}
            />
          )}

          {/* Tüm kategorilerin girdileri — sayfanın en altı, yaklaşınca
              çizilir; dönem boşken blok yok (başlık zaten "0 girdi" diyor) */}
          {!selectedCat && entryCount > 0 && (
            <LazyMount minHeight={480}>
              <EntryListBlock title={t("insights.allEntries")} rows={computed?.entryRows ?? []} />
            </LazyMount>
          )}
        </div>
      </PageSheet>
    );
  }

  return (
    <PageSheet
      top={
      <PageHeader
        compact
        // Bandın kendi zemini — sayfanın üstünde ayrı bir bölüm olduğu belli
        // olsun: açık yüzey, yuvarlak alt köşeler, altına düşen yumuşak gölge
        className={ANALYSIS_HEADER}
        title={title ?? periodLabel(period, locale)}
        // Ortada tarih kapsülü, iki yanında ‹ ›. Geri oku yok — dönemler
        // arasında sekmeler ve oklarla geziliyor
        titleSlot={
          <PeriodNav
            period={period}
            note={
              showProgress
                ? t("period.progress", {
                    n: progress.elapsedDays,
                    total: progress.totalDays,
                  })
                : undefined
            }
          />
        }
        nav={
          // Sade menü: ZAMAN sekmeleri (renksiz), altında YER yolu (tek vurgu:
          // bulunulan kalem). Hepsi başlıkla aynı sol çizgiden başlar.
          <div className="flex flex-col">
          <PeriodTabs period={period} />
          {/* Konum yolunun yerinde iki seçici: solda özellik, sağda yer
              (kategori ağacı). Seçim bu görünümün kendi durumunu sürer */}
          <div className="py-2">
          <ScopePickers
            cats={data.cats}
            subs={data.subs}
            entries={data.entries}
            selectedCat={selectedCat}
            path={path}
            metricId={metricId}
            onPlace={pickPlace}
            onMetric={pickMetric}
          />
          </div>
          </div>
        }
      />
      }
    >

      <div className={cn("flex flex-col pb-6", "gap-4")}>
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
              unit={translate("an.entriesUnit")}
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
        {!selectedCat && (
        <Layer label={translate("an.catBreakdown")} className="mb-0">
        <div
          data-section="top"
          className={cn("scroll-mt-36", !brutal && "rounded-2xl border border-border bg-card p-4")}
        >
          {!brutal && (
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            {translate("an.catBreakdown")}
          </h3>
          )}
          <ShareBars
            rows={computed?.catShare ?? []}
            emptyText={t("insights.noEntriesInPeriod")}
            nudge
            onSelect={(id) => pickPlace(id, [])}
          />
        </div>
        </Layer>
        )}

        {/* Nesneler — listeler ve dönemdeki girdileri, liste analizine gider */}
        {!selectedCat && <ObjectsCard start={period.start} end={period.end} />}

        {/* Seçilen yerin analizi — bandın seçicileriyle belirlenen özellik
            ve yer; kırılımdan inmek de yeri değiştirir */}
        {data && selectedCat && (
          <PeriodCategoryPanel
            key={`${selectedCat.id}|${period.key}`}
            category={selectedCat}
            period={period}
            path={path}
            metricId={metricId}
            onDrill={drillTo}
            onResolved={(id) => setMetricSel({ catId: selectedCat.id, id })}
          />
        )}

        {/* Tüm kategorilerin girdileri — sayfanın en altı, yaklaşınca çizilir */}
        {!selectedCat && (
        <LazyMount minHeight={480}>
          <Layer bare className="mb-0">
          <EntryListSection
            framed
            title={t("insights.allEntries")}
            rows={computed?.entryRows ?? []}
            emptyText={t("insights.noEntriesInPeriod")}
          />
          </Layer>
        </LazyMount>
        )}
      </div>
    </PageSheet>
  );
}
