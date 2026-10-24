"use client";

import { useEffect, useMemo } from "react";
import { useT, translate } from "@/lib/i18n";
import Link from "next/link";
import { Layers } from "lucide-react";
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
  medianOf,
  zeroFilledDaily,
} from "@/lib/analytics";
import {
  periodProgress,
  periodShortLabel,

  weekPeriod,
  type Period,
} from "@/lib/period";
import { StatTile } from "./stat-tile";
import { StatTiles } from "./stat-tiles";
import { ShareBars, type ShareRow } from "./share-bars";
import { AnalysisCharts } from "./analysis-chart";
import { EntryListSection, type EntryListRow } from "./entry-list";
import { RegularToggle, useExcludeRegular } from "./regular-toggle";
import { useCategoryMetrics } from "./use-category-metrics";
import { modColor } from "@/lib/mod-color";
import type { Category, ChartKind, Entry, StatKey, SubCategory } from "@/types";
import { routes } from "@/lib/routes";
import { useIsBrutal } from "@/components/structure/brutal";
import { cn } from "@/lib/utils";
import { Layer, LayerAccent } from "@/components/ui/layer";

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
  onDrill,
  onResolved,
}: {
  category: Category;
  period: Period;
  /** Bakılan yer — bandın yer seçicisi yönetir (boş = kategorinin tamamı) */
  path: SubCategory[];
  /** Seçili özellik ("count" = girdi sayısı); bu kapsamda yoksa varsayılana düşülür */
  metricId: string;
  /** Kırılımdaki bir alt kategoriye in */
  onDrill: (subId: string) => void;
  /** Panelin gerçekten gösterdiği özellik — seçici bunu yazsın */
  onResolved?: (metricId: string) => void;
}) {
  const t = useT();
  const brutal = useIsBrutal();
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
    preferredMetricId: metricId === "count" ? undefined : metricId,
    // "Girdi sayısı" seçici listesinde yok: seçim yoksa yerin en çok
    // kullanılan özelliği açılır (özelliği olmayan yerde kayıt sayısına düşer)
    initialMetricId: undefined,
    excludeRegular,
  });

  // Mercek rengi — özellik seçiliyken kutular ve grafikler o özelliğin
  // renginde; girdi sayısında kategorinin
  const lensRaw =
    metric.type !== "count" ? data?.rawMods.get(metric.mod.id) : undefined;
  const lensColor = lensRaw ? modColor(lensRaw) : category.color;

  // Gösterilen özellik seçimden farklıysa (kendiliğinden açılan ilk özellik,
  // ya da bu yerde olmayan bir seçim) üstteki seçici onu göstersin
  const shownMetric = metric.type === "count" ? "count" : metric.mod.id;
  useEffect(() => {
    if (data && shownMetric !== metricId) onResolved?.(shownMetric);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, shownMetric]);

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

    // "Boş günler 0" ayarında ortanca ve en düşük gün başına: kaydı olmayan
    // gün 0 sayılır (adımı girilmemiş gün 0 adımdır). Ortalama girdi başına
    // kalır — gün başınası zaten "Günlük ortalama" kutusu
    const zeroDays = compute.emptyAsZero && metric.type === "mod"
      ? zeroFilledDaily(entries, valueByEntry, period.kind === "all" ? startOfDayMs(new Date(minOcc ?? now.getTime())) : period.start, period.end)
      : null;

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
      level: zeroDays?.length
        ? { ...compute.levelOf(entries), min: Math.min(...zeroDays) }
        : compute.levelOf(entries),
      entries,
      // Panoya eklenebilen bütün okumalar tek seferde
      bag: (() => {
        const g = compute.statsFor(entries);
        return {
          first: g.first,
          median: zeroDays?.length ? medianOf(zeroDays) : g.median,
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
    : `${progress.elapsedDays} ${t("stat.days")}`;
  /** Derine inildiyse bölüm başlıkları hangi kaleme ait olduğunu yazar */
  const scopePrefix = focus ? (
    <span style={{ color: `${category.color}dd` }}>{focus.name} · </span>
  ) : null;
  const metricLabel = metric.type === "count" ? translate("an.entriesUnit") : unit;

  // Bölümler katmanlarda (bkz. Layer) — gün ve yapı sayfalarıyla aynı iskelet
  return (
    <LayerAccent color={category.color}>
    <div className={cn("flex flex-col", brutal ? "gap-6" : "gap-4")}>
      <Layer className="mb-0 flex flex-col gap-4">
      {/* Bölüm başlığı — bu kutunun HANGİ kalemin özellikleri olduğu */}
      <div className="flex items-center gap-2 px-1">
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: category.color }}
        />
        <h3 data-panel-title="" className="min-w-0 truncate text-[15px] font-semibold">
          {focus ? focus.name : category.name}
          <span className="font-normal text-muted-foreground"> · {periodShortLabel(period)}</span>
        </h3>
        {/* Kalemin yapı sayfası — yapı sayfasındaki analiz düğmesinin karşılığı.
            "Tüm zamanlar" bağlantısı kalktı: dönem bandında Tümü seçiliyor */}
        <Link
          href={
            focus
              ? routes.structureSub(category.id, focus.id)
              : routes.structureCategory(category.id)
          }
          aria-label={t("nav.structure")}
          title={t("nav.structure")}
          className={cn(
            "ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors",
            brutal
              ? "border-[1.5px] border-[#111] bg-white text-[#111] shadow-[2px_2px_0_#111]"
              : "bg-[var(--sf-2)] text-muted-foreground hover:text-foreground"
          )}
        >
          <Layers className="h-4 w-4" strokeWidth={brutal ? 2.5 : 2} />
        </Link>
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
              unit={translate("an.entriesUnit")}
              sub={`${progress.elapsedDays} ${t("stat.days")}`}
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
            medianPerDay: compute.emptyAsZero,
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
      </Layer>

      {/* Alt kategori kırılımı — seçili özellikle; satıra dokununca o yere
          inilir (bandın yer seçicisi de oraya geçer) */}
      {computed.hasBreakdown && (
        <Layer
          label={translate("an.subBreakdown")}
          extra={compute.aggregateNote ? `(${compute.aggregateNote})` : undefined}
          className="mb-0"
        >
        {/* Brütalde katmanın kendisi kutu — içte ikinci çerçeve yok */}
        <div className={brutal ? undefined : "rounded-2xl border border-border bg-card p-4"}>
          {!brutal && (
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {translate("an.subBreakdown")}
            {compute.aggregateNote && (
              <span className="normal-case font-normal text-muted-foreground/60"> ({compute.aggregateNote})</span>
            )}
          </h3>
          )}
          <ShareBars
            rows={computed.shareRows}
            mode={compute.isRate ? "rate" : compute.scale ? "level" : "share"}
            range={compute.scale}
            onSelect={onDrill}
          />
        </div>
        </Layer>
      )}

      {/* Pano — kutular yukarıda, grafikler burada. İkisi de kullanıcının
          kurduğu listeler; kapsam başına ayrı saklanıyor. */}
      {computed.hasSeries && (
        <Layer label={t("an.charts")} className="mb-0">
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
          unit={metric.type === "count" ? translate("an.entriesUnit") : unit}
          caption={computed.seriesFrame?.caption}
          showAllTicks={computed.seriesFrame?.showAllTicks}
          scale={compute.scale}
          emptyAsZero={compute.emptyAsZero}
          stack={
            compute.isRate
              ? { valueLabel: t("entry.yes"), restLabel: t("entry.no") }
              : undefined
          }
          title={(kind) => ({
            main: (
              <>
                {scopePrefix}
                {/* "Tek tek" kova değil girdi çiziyor; "Haftalık" demek yanlış olurdu */}
                {kind !== "points" && `${GRANULARITY_TITLES[computed.granularity]} `}
                {metric.type === "count" ? translate("an.entriesUnit") : metric.mod.name}
              </>
            ),
          })}
        />
        </Layer>
      )}

      {/* Girdi listesi */}
      <Layer className="mb-0">
      <EntryListSection
        title={focus ? `${focus.name} · ${t("objects.entries")}` : t("objects.entries")}
        accent={lensColor}
        rows={computed.entryRows}
        emptyText={
          metric.type === "mod"
            ? `No ${metric.mod.name} data in this period`
            : "No entries in this period"
        }
      />
      </Layer>
    </div>
    </LayerAccent>
  );
}
