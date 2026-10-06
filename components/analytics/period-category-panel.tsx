"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useT } from "@/lib/i18n";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import {
  bucketAncestorId,
  bucketKeyOf,
  buildSeriesBuckets,
  chooseGranularity,
  computeStreaks,
  dayKey,
  fmtNum,
  fmtPct,
  framePeriodSeries,
  GRANULARITY_TITLES,
  startOfDayMs,
  type Granularity,
  type SeriesFrame,
} from "@/lib/analytics";
import {
  periodProgress,
  periodShortLabel,

  weekPeriod,
  type Period,
} from "@/lib/period";
import { StatTile } from "./stat-tile";
import { StatTiles } from "./stat-tiles";
import type { ShareRow } from "./share-bars";
import { AnalysisCharts, CHART_LABEL } from "./analysis-chart";
import { EntryListSection, type EntryListRow } from "./entry-list";
import { MetricChips } from "./metric-chips";
import { RegularToggle, useExcludeRegular } from "./regular-toggle";
import { useCategoryMetrics } from "./use-category-metrics";
import { setAnalysisMetric } from "./analysis-selection";
import { modColor } from "@/lib/mod-color";
import type { Category, ChartKind, Entry, StatKey, SubCategory } from "@/types";
import { routes } from "@/lib/routes";

/**
 * Dönem sayfasındaki kategori detayı — kategori metriklerinin donmuş bir zaman
 * penceresine ([period.start, period.end)) kısıtlı analizi. Devam eden dönemlerde
 * günlük ortalama geçen gün sayısına bölünür ("perşembe günü 4 güne böl");
 * gün dönemlerinde o günü kapsayan haftanın günlük ortalamasıyla karşılaştırılır.
 */
/**
 * Panelin veri penceresi — gün dönemlerinde o günü kapsayan hafta (hafta
 * bağlamı için), diğerlerinde dönemin kendisi. Panel ve önden okuma
 * (PeriodView) AYNI pencereyi kullanmalı, yoksa önbellek anahtarı tutmaz.
 */
export function panelWindow(period: Period): { start: number; end: number } {
  if (period.kind === "day") {
    const w = weekPeriod(period.start);
    return { start: w.start, end: w.end };
  }
  return { start: period.start, end: period.end };
}

export function PeriodCategoryPanel({
  category,
  period,
  path,
  metricId,
  onMetricChange,
}: {
  category: Category;
  period: Period;
  /** Bakılan yer — sayfanın kademe yığını yönetir (boş = kategorinin tamamı) */
  path: SubCategory[];
  /** Seçili özellik ("count" = girdi sayısı); bu kapsamda yoksa varsayılana düşülür */
  metricId: string;
  onMetricChange: (id: string) => void;
}) {
  const t = useT();
  /*
   * ÖZELLİK GEÇİŞİNDE SAYFA OYNAMASIN. İki ayrı sebep vardı:
   *  1) yeni görünüm kısaysa (Para seçilince liste yalnız tutarı olan
   *     kayıtlara iniyor) sayfa kısalıyor, dibe yakın bakan kullanıcıda
   *     tarayıcı kaydırmayı yeni dibe çekiyordu → panelin o anki boyu alt
   *     sınır olarak tutulur;
   *  2) içerik değişirken tarayıcının kaydırma çapası başka bir öğeye
   *     atlayabiliyordu → kapsül satırının ekrandaki yeri geçişten önce
   *     ölçülür, yeni görünüm çizilince sayfa tam o kadar düzeltilir:
   *     parmağın altındaki satır yerinden oynamaz.
   */
  const rootRef = useRef<HTMLDivElement>(null);
  const chipsRef = useRef<HTMLDivElement>(null);
  const pinTop = useRef<number | null>(null);
  const [minHeight, setMinHeight] = useState<number | undefined>(undefined);
  // Bakılan yer değişince sınır kalkar — kısa bir kaleme geçince altta boşluk kalmasın
  const focusKey = path[path.length - 1]?.id ?? "";
  const [heldFor, setHeldFor] = useState(focusKey);
  if (heldFor !== focusKey) {
    setHeldFor(focusKey);
    setMinHeight(undefined);
  }
  const holdPosition = () => {
    const h = rootRef.current?.offsetHeight;
    if (h) setMinHeight(h);
    const top = chipsRef.current?.getBoundingClientRect().top;
    pinTop.current = top ?? null;
  };
  const focus = path[path.length - 1];
  // Gün dönemlerinde hafta bağlamı gerekir — o günü kapsayan haftanın tamamı çekilir,
  // günün kendi rakamları pencere filtresiyle hesaplanır
  const containingWeek = useMemo(
    () => (period.kind === "day" ? weekPeriod(period.start) : null),
    [period.kind, period.start]
  );

  const [excludeRegular, setExcludeRegular] = useExcludeRegular();
  const {
    data,
    metric,
    saveView,
    compute,
    choiceFilter,
    setChoiceFilter,
  } = useCategoryMetrics({
    category,
    rootSubId: focus?.id,
    fetchStart: panelWindow(period).start,
    fetchEnd: panelWindow(period).end,
    // Kırılımda inip çıkmak özellik seçimini SIFIRLAMAZ: "Öğrenme › Süre"ye
    // bakan kişi Okuma'ya bastığında Okuma'nın süresini görmek istiyor.
    // İnilen kalemde o özellik yoksa geçici olarak varsayılan gösterilir,
    // geri çıkınca seçim döner (bkz. useCategoryMetrics metric).
    resetKey: category.id,
    preferredMetricId: metricId,
    // Kategori ilk açıldığında "Girdi": önce kalemlere dağılım görülsün
    initialMetricId: "count",
    excludeRegular,
  });

  // Mercek rengi — özellik seçiliyken kutular ve grafikler o özelliğin
  // renginde; girdi sayısında kategorinin
  const lensRaw =
    metric.type !== "count" ? data?.rawMods.get(metric.mod.id) : undefined;
  const lensColor = lensRaw ? modColor(lensRaw) : category.color;

  // Yeni görünüm çizildi — kapsül satırı ölçülen yerine geri getirilir
  const metricKey = metric.type === "count" ? "count" : metric.mod.id;
  useLayoutEffect(() => {
    const before = pinTop.current;
    const el = chipsRef.current;
    pinTop.current = null;
    if (before === null || !el) return;
    const delta = el.getBoundingClientRect().top - before;
    const scroller = el.closest("main");
    if (scroller && Math.abs(delta) > 1) scroller.scrollTop += delta;
  }, [metricKey]);

  /**
   * Pano düzenleme: yuvayı değiştir, kaldır (key null) ya da sona ekle
   * (slot -1). Tercih bakılan kapsama yazılır — aynı özellik başka kalemde
   * kendi panosunu korur.
   */
  const pickStat = (slot: number, key: StatKey | null) => {
    const cur = compute?.stats ?? [];
    const next =
      slot < 0
        ? key
          ? [...cur, key]
          : cur
        : key
          ? cur.map((k, i) => (i === slot ? key : k))
          : cur.filter((_, i) => i !== slot);
    void saveView({ stats: next });
  };

  /** Grafik ekle / değiştir / kaldır — kutularla aynı mantık */
  const pickChart = (slot: number, kind: ChartKind | null) => {
    const cur = compute?.charts ?? [];
    const next =
      slot < 0
        ? kind
          ? [...cur, kind]
          : cur
        : kind
          ? cur.map((c, i) => (i === slot ? kind : c))
          : cur.filter((_, i) => i !== slot);
    void saveView({ charts: next });
  };

  const computed = useMemo(() => {
    if (!data || !compute) return null;
    const { subById } = data;
    const {
      aggregate,
      sumOf,
      averageOf,
      filledCount,
      fillBucket,
      valueLabelOf,
      distributionOf,
      valueByEntry,
      unit,
      isRate,
      isChoice,
      isAvgLike,
      scale,
    } = compute;
    const now = new Date();

    // Dönem penceresine düşen girdiler (hafta bağlamı için geniş çekildiyse filtrele)
    const entries = containingWeek
      ? data.entries.filter(
          (e) => e.occurredAt >= period.start && e.occurredAt < period.end
        )
      : data.entries;

    // Kutulardaki rakam seri okumasından bağımsız: "Toplam" her zaman toplam
    const total = sumOf(entries);
    const avg = averageOf(entries);
    const withValueCount =
      metric.type === "mod"
        ? entries.filter((e) => valueByEntry.has(e.id)).length
        : entries.length;
    const rate = withValueCount ? total / withValueCount : 0;

    // Günlük ortalama — devam eden dönemde payda geçen gün sayısı;
    // "Tümü"nde başlangıç kategorinin ilk girdisine kıstırılır
    let minOcc: number | undefined;
    for (const e of entries) {
      if (minOcc === undefined || e.occurredAt < minOcc) minOcc = e.occurredAt;
    }
    const progress = periodProgress(
      period,
      now,
      period.kind === "all" ? (minOcc ?? now.getTime()) : undefined
    );
    const dailyAvg =
      progress.elapsedDays > 0 ? total / progress.elapsedDays : 0;

    // Hafta bağlamı (yalnız gün dönemleri) — haftanın şu ana kadarki günlük
    // ortalamasına göre bu gün nerede; scale metrikte gün ort. vs hafta ort.
    let weekContext: {
      ref: number;
      delta: number;
      /** Fark puan mı yüzde mi — ortalama rakamlarda yüzde yanıltıcı */
      inPoints: boolean;
      perDay: boolean;
    } | null = null;
    if (containingWeek) {
      const weekProgress = periodProgress(containingWeek, now);
      const dayValue = isAvgLike ? averageOf(entries) : aggregate(entries);
      let ref = 0;
      if (isAvgLike) {
        ref = averageOf(data.entries);
      } else if (weekProgress.elapsedDays > 0) {
        ref = aggregate(data.entries) / weekProgress.elapsedDays;
      }
      const hasRef = isAvgLike ? filledCount(data.entries) > 0 : ref > 0;
      if (hasRef && (metric.type === "count" || withValueCount > 0)) {
        weekContext = {
          ref,
          // 3,2 → 3,6 "%12 arttı" değil "0,4 puan arttı"
          delta: isAvgLike
            ? (dayValue - ref) * (isRate ? 100 : 1)
            : ((dayValue - ref) / ref) * 100,
          inPoints: isAvgLike,
          perDay: !isAvgLike,
        };
      }
    }

    // Seri — tek günlük dönemde grafik yok; hafta/ay/yıl dönemlerinde seri tüm
    // dönemi kapsar (gelecek kovalar 0'la yer tutar); özel/tümü'nde devam eden
    // dönem bugünde kırpılır; "Tümü"nde pencere ilk girdiye kıstırılır
    const spanDays = (period.end - period.start) / 86400000;
    const fullFrame =
      period.kind === "week" ||
      period.kind === "month" ||
      period.kind === "year";
    let buckets: ReturnType<typeof buildSeriesBuckets> = [];
    let granularity: Granularity = "day";
    let seriesFrame: SeriesFrame | null = null;
    const hasSeries = spanDays > 1.5;
    if (hasSeries) {
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
      const bucketEntries: Entry[][] = buckets.map(() => []);
      for (const e of entries) {
        const i = idx.get(bucketKeyOf(e.occurredAt, granularity));
        if (i !== undefined) bucketEntries[i].push(e);
      }
      buckets.forEach((b, i) => fillBucket(b, bucketEntries[i]));
      if (
        period.kind === "week" ||
        period.kind === "month" ||
        period.kind === "year"
      ) {
        seriesFrame = framePeriodSeries(period.kind, period.start, buckets);
      }
    }

    // Alt kategori kırılımı — iç içe altlar en üst ataya toplanır
    const bySubEntries = new Map<string, Entry[]>();
    for (const e of entries) {
      // Odaklıysak bir kademe altını grupla; değilse kategorinin kök dalları
      const topId = bucketAncestorId(e.subcategoryId, subById, focus?.id);
      if (!topId) continue;
      const list = bySubEntries.get(topId) ?? [];
      list.push(e);
      bySubEntries.set(topId, list);
    }
    const shareRows: ShareRow[] = [...bySubEntries.entries()]
      .map(([id, list]) => ({ id, value: aggregate(list), outOf: filledCount(list) }))
      .filter((r) => (isRate || scale ? r.outOf > 0 : r.value > 0))
      .map(({ id, value, outOf }) => {
        const s = subById.get(id)!;
        // Kalemin KENDİ doğrudan girdileri (alt kalemine değil, doğrudan ona
        // yazılmış) kendi id'sinde toplanır. Adıyla listelenir ama inilecek
        // bir kademe değildir — tıklanabilir olsaydı kendi içine sonsuz
        // inilirdi (Yemek > Yemek > ...).
        const isSelf = id === focus?.id || s.isCategoryRoot;
        return {
          id,
          name: s.isCategoryRoot ? category.name : s.name,
          color: category.color,
          value,
          outOf,
          display: unit ? `${fmtNum(value)} ${unit}` : fmtNum(value),
          drillable: !isSelf,
        };
      });

    const listEntries =
      metric.type === "mod"
        ? entries.filter((e) => valueByEntry.has(e.id))
        : entries;
    const entryRows: EntryListRow[] = [...listEntries]
      .sort((a, b) => b.occurredAt - a.occurredAt)
      .map((e) => {
        const sub = subById.get(e.subcategoryId);
        return {
          id: e.id,
          occurredAt: e.occurredAt,
          title: e.title,
          notes: e.notes,
          subLabel: sub
            ? sub.isCategoryRoot
              ? category.name
              : sub.name
            : undefined,
          valueLabel: valueLabelOf(e.id),
        };
      });

    // Dağılım süzgeçten bağımsız — bir seçenek seçiliyken de bütün görünür kalır
    const distribution = distributionOf(entries);

    return {
      total,
      avg,
      rate,
      distribution,
      topChoice: distribution[0],
      choiceTotal: isChoice ? filledCount(entries) : 0,
      // Düzey okumasının kutuları: son ölçüm ve uçlar
      level: compute.levelOf(entries),
      entries,
      // Panoya eklenebilen bütün okumalar tek seferde
      bag: (() => {
        const g = compute.statsFor(entries);
        return {
          first: g.first,
          median: g.median,
          maxDay: g.maxDay,
          perActiveDay: g.perActiveDay,
          activeDays: g.activeDays,
          distinct: g.distinct,
        };
      })(),
      // Evet serisi — "evet" denen üst üste günler. Kutu seçilebildiği için
      // bu panelde de hesaplanıyor; eskiden yalnız içgörü panelinde vardı.
      // Kayıt serisi — "üst üste kaç gün" kutusu (evet serisinden farkı:
      // değerin ne olduğuna bakmaz, kayıt girilmiş olması yeter)
      streaks: computeStreaks(
        new Set(
          entries.filter((e) => valueByEntry.has(e.id)).map((e) => dayKey(e.occurredAt))
        ),
        new Date(Math.min(now.getTime(), period.end - 1))
      ),
      yesStreak: isRate
        ? computeStreaks(
            new Set(
              entries
                .filter((e) => (valueByEntry.get(e.id) ?? 0) > 0)
                .map((e) => dayKey(e.occurredAt))
            ),
            new Date(Math.min(now.getTime(), period.end - 1))
          )
        : null,
      withValueCount,
      progress,
      dailyAvg,
      weekContext,
      buckets,
      granularity,
      seriesFrame,
      hasSeries,
      shareRows,
      // İnilecek bir kademe yoksa (yaprak kalem, ya da bu dönemde yalnızca
      // kalemin kendi girdileri var) dağılım tek bir %100 çubuğundan ibaret
      // kalır — hiçbir şey anlatmaz, bölüm hiç açılmaz
      hasBreakdown: shareRows.some((r) => r.drillable),
      entryRows,
    };
  }, [data, compute, metric.type, period, containingWeek, category, focus?.id]);

  if (!data || !compute || !computed) return null;

  const unit = compute.unit || undefined;
  const { progress, weekContext } = computed;
  const isDay = period.kind === "day";
  /** Girdi kutusunun alt yazısı — sayının kaç günü kapsadığı */
  const dayCountLabel = isDay
    ? periodShortLabel(period)
    : `${progress.elapsedDays} days`;
  /** Derine inildiyse bölüm başlıkları hangi kaleme ait olduğunu yazar */
  const scopePrefix = focus ? (
    <span style={{ color: `${category.color}dd` }}>{focus.name} · </span>
  ) : null;
  const metricLabel = metric.type === "count" ? "entries" : unit;

  return (
    <div
      ref={rootRef}
      className="flex flex-col gap-4"
      style={minHeight ? { minHeight } : undefined}
    >
      {/* Bölüm başlığı — bu kutunun HANGİ kalemin özellikleri olduğu */}
      <div className="flex items-center gap-2 px-1">
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: category.color }}
        />
        <h3 className="min-w-0 truncate text-[15px] font-semibold">
          {focus ? focus.name : category.name}
        </h3>
        <span className="shrink-0 text-[12px] text-muted-foreground">
          · {t("entry.features")}
        </span>
        {/* Kapsamın tüm zamanlar analizi */}
        <Link
          href={
            focus
              ? routes.analyticsSub(category.id, focus.id)
              : routes.analyticsCategory(category.id)
          }
          prefetch={false}
          className="ml-auto flex shrink-0 items-center gap-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          {t("stat.allTime")}
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      <div ref={chipsRef}>
      <MetricChips
        countFirst
        asRow
        colorOfMod={(id) => {
          const m = data.rawMods.get(id);
          return m ? modColor(m) : category.color;
        }}
        mods={data.mods}
        metric={metric}
        color={category.color}
        onChange={(m) => {
          holdPosition();
          const id = m.type === "count" ? "count" : m.mod.id;
          setAnalysisMetric(category.id, id);
          onMetricChange(id);
        }}
      />
      </div>

      {data.hasRegular && (
        <RegularToggle
          active={excludeRegular}
          onChange={setExcludeRegular}
          color={category.color}
          regularSubNames={data.regularSubNames}
          excludedEntryCount={data.excludedEntryCount}
        />
      )}

      {/* Dönem KPI'ları — gün dışındaki pencerelerde günlük ortalama geçen güne bölünür */}
      {metric.type === "count" ? (
        isDay ? (
          <StatTile
            color={category.color}
            label={t("insights.entries")}
            value={fmtNum(computed.withValueCount)}
            sub={period.label}
          />
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <StatTile
              color={category.color}
              label={t("insights.entries")}
              value={fmtNum(computed.withValueCount)}
              sub={dayCountLabel}
            />
            <StatTile
              color={category.color}
              label={t("stat.dailyAverage")}
              value={fmtNum(computed.dailyAvg)}
              unit="entries"
              sub={`${progress.elapsedDays} days`}
            />
          </div>
        )
      ) : (
        /* Kutular özelliğin kendi analiz ayarından geliyor; ölçü türüne göre
           dallanan uzun koşul zinciri StatTiles'ın içindeki tek listeye indi */
        <StatTiles
          options={compute.statOptions}
          onPick={pickStat}
          keys={compute.stats}
          color={lensColor}
          unit={unit}
          periodSub={periodShortLabel(period)}
          daysSub={dayCountLabel}
          values={{
            total: computed.total,
            dailyAvg: computed.dailyAvg,
            avg: computed.avg,
            withValueCount: computed.withValueCount,
            entriesCount: compute.isChoice
              ? computed.choiceTotal
              : computed.withValueCount,
            rate: computed.rate,
            yesStreakCurrent: computed.yesStreak?.current,
            yesStreakBest: computed.yesStreak?.best,
            topChoice: computed.topChoice,
            choiceTotal: computed.choiceTotal,
            ...computed.level,
            ...computed.bag,
            noCount: computed.withValueCount - computed.total,
            streakCurrent: computed.streaks?.current,
            streakBest: computed.streaks?.best,
            elapsedDays: progress.elapsedDays,
          }}
        />
      )}

      {/* Gün dönemlerinde hafta bağlamı — bu gün haftalık ortalamaya göre nerede */}
      {isDay && weekContext && (
        <div className="rounded-2xl border border-border bg-card px-4 py-3 text-xs text-muted-foreground">
          Week avg.{" "}
          <span className="font-semibold text-foreground">
            {compute.isRate
              ? fmtPct(weekContext.ref)
              : fmtNum(weekContext.ref)}
            {metricLabel && !compute.isRate ? ` ${metricLabel}` : ""}
            {weekContext.perDay ? "/gün" : ""}
          </span>{" "}
          · this day{" "}
          <span
            className="font-semibold"
            style={{ color: lensColor }}
          >
            {weekContext.inPoints
              ? t("stat.points", { n: fmtNum(Math.abs(weekContext.delta)) })
              : fmtPct(Math.abs(weekContext.delta) / 100)}{" "}
            {weekContext.delta >= 0 ? "above" : "below"}
          </span>
        </div>
      )}

      {/* Pano — kutular yukarıda, grafikler burada. İkisi de kullanıcının
          kurduğu listeler; kapsam başına ayrı saklanıyor. */}
      {computed.hasSeries && (
        <AnalysisCharts
          charts={compute.charts}
          options={compute.chartOptions}
          onPick={pickChart}
          buckets={computed.buckets}
          entries={computed.entries}
          valueByEntry={compute.valueByEntry}
          distribution={computed.distribution}
          choiceFilter={choiceFilter}
          onChoiceFilter={setChoiceFilter}
          color={lensColor}
          unit={metric.type === "count" ? "entries" : unit}
          caption={computed.seriesFrame?.caption}
          showAllTicks={computed.seriesFrame?.showAllTicks}
          scale={compute.scale}
          stack={
            compute.isRate
              ? { valueLabel: t("entry.yes"), restLabel: t("entry.no") }
              : undefined
          }
          title={(kind) => (
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {scopePrefix}
              {/* "Tek tek" kova değil girdi çiziyor; "Haftalık" demek yanlış olurdu */}
              {kind !== "points" && `${GRANULARITY_TITLES[computed.granularity]} `}
              {metric.type === "count" ? "entries" : metric.mod.name}
              <span className="font-normal normal-case text-muted-foreground/60 underline decoration-dotted decoration-muted-foreground/40 underline-offset-[3px]">
                {" "}
                ({t(CHART_LABEL[kind])})
              </span>
            </h3>
          )}
        />
      )}

      {/* Girdi listesi */}
      <EntryListSection
        title={focus ? `${focus.name} · Entry list` : "Entry list"}
        accent={lensColor}
        rows={computed.entryRows}
        emptyText={
          metric.type === "mod"
            ? `No ${metric.mod.name} data in this period`
            : "No entries in this period"
        }
      />
    </div>
  );
}
