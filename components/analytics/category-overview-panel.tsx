"use client";

import { useMemo } from "react";
import { useT, translate } from "@/lib/i18n";
import { useRouter } from "next/navigation";
import {
  bucketAncestorId,
  bucketKeyOf,
  buildSeriesBuckets,
  chooseGranularity,
  computeStreaks,
  dayKey,
  fmtNum,
  fmtPct,
  frameDailySeries,
  framePeriodSeries,
  GRANULARITY_TITLES,
  startOfDayMs,
  type Granularity,
  type SeriesFrame,
  medianOf,
  zeroFilledDaily,
} from "@/lib/analytics";
import { periodShortLabel, shiftPeriod, type Period } from "@/lib/period";
import { StatTile } from "./stat-tile";
import { StatTiles } from "./stat-tiles";
import type { ChartKind, StatKey } from "@/types";
import { AnalysisCharts } from "./analysis-chart";
import { ShareBars, type ShareRow } from "./share-bars";
import { EntryListSection, type EntryListRow } from "./entry-list";
import { MetricChips } from "./metric-chips";
import { RegularToggle, useExcludeRegular } from "./regular-toggle";
import { useCategoryMetrics } from "./use-category-metrics";
import type { Category, Entry, SubCategory } from "@/types";
import { routes } from "@/lib/routes";
import { Layer } from "@/components/ui/layer";
import { useIsBrutal } from "@/components/structure/brutal";
import { cn } from "@/lib/utils";

const DAY_MS = 86400000;
/** "Tümü"nde gelişim karşılaştırma penceresi: son 4 hafta vs önceki 4 hafta */
const TREND_WINDOW_DAYS = 28;
/** Girdi listesi uzun dönemleri kapsar — son N ile sınırla */
const ENTRY_LIST_LIMIT = 50;

/**
 * Kapsam perspektifi — bir kategorinin ya da alt kategorinin (kendisi + tüm
 * torunları) seçili dönemdeki analizi: kutular, istikrar (aktif gün oranı +
 * seriler), gelişim, alt kategori kırılımı, grafikler, girdiler.
 *
 * Dönem "Tümü"yken eski tüm zamanlar görünümü: gelişim son 4 hafta vs önceki
 * 4 hafta. Takvim dönemlerinde (gün/hafta/ay/yıl) gelişim bir önceki dönemle
 * karşılaştırır; dönem sürüyorsa önceki dönemin AYNI uzunluktaki başıyla —
 * ayın 12'sinde "geçen aya göre −%60" yanıltıcı olurdu.
 */
export function CategoryOverviewPanel({
  category,
  subcategory,
  period,
  initialMetricId,
  header,
}: {
  /** Sayfanın başlığı (sembol + ad) — özet katmanının başında durur */
  header?: React.ReactNode;
  category: Category;
  /** Verilirse bu alt kategorinin alt ağacına odaklanır */
  subcategory?: SubCategory;
  period: Period;
  /** URL'den gelen başlangıç metriği: "count" ya da bir mod id'si */
  initialMetricId?: string;
}) {
  const t = useT();
  const router = useRouter();
  const brutal = useIsBrutal();
  const [excludeRegular, setExcludeRegular] = useExcludeRegular();
  const {
    data,
    metric,
    saveView,
    setMetricChoice,
    compute,
    choiceFilter,
    setChoiceFilter,
  } = useCategoryMetrics({
    category,
    rootSubId: subcategory?.id,
    fetchStart: 0,
    initialMetricId,
    resetKey: subcategory?.id ?? category.id,
    excludeRegular,
  });

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
    const allEntries = data.entries;
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
      kind,
      isRate,
      isChoice,
      isAvgLike,
      scale,
    } = compute;
    const now = new Date();
    const nowMs = now.getTime();
    const today = startOfDayMs(now);

    if (!allEntries.length) return { empty: "never" as const };

    let minOcc = allEntries[0].occurredAt;
    for (const e of allEntries) {
      if (e.occurredAt < minOcc) minOcc = e.occurredAt;
    }
    const firstDay = startOfDayMs(new Date(minOcc));
    const isAll = period.kind === "all";
    const inProgress = nowMs >= period.start && nowMs < period.end;

    const entries = isAll
      ? allEntries
      : allEntries.filter((e) => e.occurredAt >= period.start && e.occurredAt < period.end);
    if (!entries.length) return { empty: "period" as const };

    // Dönemin geçen takvim günü, bugün dahil — "Tümü"nde ilk girdiden beri
    const winStart = isAll ? firstDay : Math.max(period.start, 0);
    const winEnd = Math.min(period.end, today + DAY_MS);
    const elapsedDays = Math.max(1, Math.round((winEnd - winStart) / DAY_MS));

    // Kutulardaki rakam seri okumasından bağımsız: "Toplam" her zaman toplam
    const total = sumOf(entries);
    const avg = averageOf(entries);
    const withValueCount =
      metric.type === "mod"
        ? entries.filter((e) => valueByEntry.has(e.id)).length
        : entries.length;
    const dailyAvg = total / elapsedDays;

    // "Boş günler 0" ayarında ortanca ve en düşük gün başına: kaydı olmayan
    // gün 0 sayılır (adımı girilmemiş gün 0 adımdır). Ortalama girdi başına
    // kalır — gün başınası zaten "Günlük ortalama" kutusu
    const zeroDays = compute.emptyAsZero && metric.type === "mod"
      ? zeroFilledDaily(entries, valueByEntry, winStart, winEnd)
      : null;

    // İstikrar — metrikten bağımsız, girdi girilen günler üzerinden. Geçmiş
    // dönemde "güncel seri" dönemin son gününe göre okunur
    const activeDayKeys = new Set(entries.map((e) => dayKey(e.occurredAt)));
    const activeRatio = (activeDayKeys.size / elapsedDays) * 100;
    const streakNow = new Date(Math.min(nowMs, period.end - 1));
    const streaks = computeStreaks(activeDayKeys, streakNow);

    // Evet serisi — üst üste "evet" denen günler. Aynı günde hem evet hem
    // hayır varsa gün evet sayılır (alışkanlık en az bir kez yapılmış).
    const yesStreaks = isRate
      ? computeStreaks(
          new Set(
            entries
              .filter((e) => (valueByEntry.get(e.id) ?? 0) > 0)
              .map((e) => dayKey(e.occurredAt))
          ),
          streakNow
        )
      : null;

    // Gelişim — karşılaştırma pencereleri
    let recentEntries: Entry[];
    let prevEntries: Entry[];
    let prevLabel: string;
    let recentLabel: string;
    let prevNote: string | undefined;
    if (isAll) {
      const recentStart = today - (TREND_WINDOW_DAYS - 1) * DAY_MS;
      const prevStart = recentStart - TREND_WINDOW_DAYS * DAY_MS;
      recentEntries = allEntries.filter((e) => e.occurredAt >= recentStart);
      prevEntries = allEntries.filter(
        (e) => e.occurredAt >= prevStart && e.occurredAt < recentStart
      );
      recentLabel = t("insights.last4Weeks");
      prevLabel = t("insights.prev4Weeks");
    } else {
      const prev = shiftPeriod(period, -1)!;
      // Sürüyorsa önceki dönemin aynı uzunluktaki başı
      const prevEnd = inProgress
        ? Math.min(prev.end, prev.start + (nowMs - period.start))
        : prev.end;
      recentEntries = entries;
      prevEntries = allEntries.filter(
        (e) => e.occurredAt >= prev.start && e.occurredAt < prevEnd
      );
      recentLabel = periodShortLabel(period, now);
      prevLabel = periodShortLabel(prev, now);
      prevNote =
        inProgress && period.kind !== "day"
          ? t("an.samePortion", { n: elapsedDays })
          : undefined;
    }
    // Oranda karşılaştırılan şey adet değil oranın kendisi; farkı da yüzdenin
    // yüzdesi olarak değil PUAN olarak veriyoruz ("%75 → %60, 15 puan").
    const recentValue = isRate ? averageOf(recentEntries) : aggregate(recentEntries);
    const prevValue = isRate ? averageOf(prevEntries) : aggregate(prevEntries);
    // "Önceki dönem 0" ile "önceki dönemde veri yok" farklı şeyler — ayrımı
    // değere değil KAYIT olup olmadığına bakarak yapıyoruz.
    const hasPrev =
      metric.type === "count" ? prevValue > 0 : filledCount(prevEntries) > 0;
    const growthPoints =
      isAvgLike && hasPrev
        ? (recentValue - prevValue) * (isRate ? 100 : 1)
        : null;
    const growthPct =
      !isAvgLike && hasPrev && prevValue > 0
        ? ((recentValue - prevValue) / prevValue) * 100
        : null;

    // Seri — tek günlük dönemde grafik yok; hafta/ay/yıl tüm dönemi kapsar
    // (gelecek kovalar 0'la yer tutar); "Tümü"nde pencere ilk girdiye kıstırılır
    const fullFrame =
      period.kind === "week" || period.kind === "month" || period.kind === "year";
    const effStart = isAll ? firstDay : period.start;
    const effEnd = fullFrame ? period.end : winEnd;
    const hasSeries = period.kind !== "day" && effEnd - effStart > 1.5 * DAY_MS;
    let buckets: ReturnType<typeof buildSeriesBuckets> = [];
    let granularity: Granularity = "day";
    let seriesFrame: SeriesFrame | null = null;
    if (hasSeries) {
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
      seriesFrame = fullFrame
        ? framePeriodSeries(period.kind as "week" | "month" | "year", period.start, buckets)
        : granularity === "day"
          ? frameDailySeries(buckets)
          : null;
    }

    // Alt kategori kırılımı — bir kademe altı; iç içe altlar o ataya toplanır.
    // Alt kategoride kendi doğrudan girdileri kendi adıyla ayrı satır
    const bySubEntries = new Map<string, Entry[]>();
    for (const e of entries) {
      const topId = bucketAncestorId(e.subcategoryId, subById, subcategory?.id);
      if (!topId) continue;
      const list = bySubEntries.get(topId) ?? [];
      list.push(e);
      bySubEntries.set(topId, list);
    }
    // Oran ve skalada satırlar birbirinin payı değil; her satır kendi
    // oranını/seviyesini çizer
    const shareRows: ShareRow[] = [...bySubEntries.entries()]
      .map(([id, list]) => ({ id, value: aggregate(list), outOf: filledCount(list) }))
      .filter((r) => (isRate || scale ? r.outOf > 0 : r.value > 0))
      .map(({ id, value, outOf }) => {
        const isSelf = id === subcategory?.id;
        const s = isSelf ? subcategory : subById.get(id);
        const isRoot = !!s?.isCategoryRoot;
        return {
          id,
          name: isRoot ? category.name : (s?.name ?? "—"),
          color: category.color,
          value,
          outOf,
          display: unit ? `${fmtNum(value)} ${unit}` : fmtNum(value),
          drillable: !isSelf && !isRoot,
        };
      });

    const listEntries =
      metric.type === "mod"
        ? entries.filter((e) => valueByEntry.has(e.id))
        : entries;
    const entryRows: EntryListRow[] = [...listEntries]
      .sort((a, b) => b.occurredAt - a.occurredAt)
      .slice(0, ENTRY_LIST_LIMIT)
      .map((e) => {
        const sub =
          e.subcategoryId === subcategory?.id ? undefined : subById.get(e.subcategoryId);
        return {
          id: e.id,
          occurredAt: e.occurredAt,
          title: e.title,
          notes: e.notes,
          // Kalemin kendi girdisi başlıksızsa satır boş kalmasın — kalemin adı
          subLabel: sub
            ? sub.isCategoryRoot
              ? category.name
              : sub.name
            : e.title
              ? undefined
              : subcategory?.name,
          valueLabel: valueLabelOf(e.id),
        };
      });

    // Dağılım — kırılım kutusunun yerini alır. Süzgeçten bağımsız hesaplanır:
    // bir seçenek seçiliyken de bütünün dağılımı görünür kalmalı.
    const distribution = distributionOf(entries);
    const topChoice = distribution[0];

    return {
      empty: false as const,
      total,
      avg,
      distribution,
      topChoice,
      choiceTotal: isChoice ? filledCount(entries) : 0,
      rate: filledCount(entries) ? total / filledCount(entries) : 0,
      withValueCount,
      elapsedDays,
      dailyAvg,
      activeDayCount: activeDayKeys.size,
      activeRatio,
      streaks,
      yesStreaks,
      entries,
      level: zeroDays?.length
        ? { ...compute.levelOf(entries), min: Math.min(...zeroDays) }
        : compute.levelOf(entries),
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
      recentValue,
      prevValue,
      recentLabel,
      prevLabel,
      prevNote,
      growthPct,
      growthPoints,
      hasPrev,
      isAvgMetric: kind === "scale",
      hasSeries,
      buckets,
      granularity,
      seriesFrame,
      shareRows,
      entryRows,
    };
  }, [data, compute, metric.type, category, subcategory, period, t]);

  if (!data || !compute || !computed) return null;

  const periodLabel = periodShortLabel(period);

  const chips = (
    <>
      <MetricChips
        mods={data.mods}
        metric={metric}
        color={category.color}
        onChange={setMetricChoice}
      />
      {data.hasRegular && (
        <RegularToggle
          active={excludeRegular}
          onChange={setExcludeRegular}
          color={category.color}
          regularSubNames={data.regularSubNames}
          excludedEntryCount={data.excludedEntryCount}
        />
      )}
    </>
  );

  if (computed.empty) {
    return (
      <div className="flex flex-col gap-4 pb-6">
        {header}
        {computed.empty === "period" && chips}
        <div className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-xs text-muted-foreground">
          {computed.empty === "period"
            ? translate("list.noEntriesInRange")
            : t("an.noEntriesYet")}
        </div>
      </div>
    );
  }

  const unit = compute.unit || undefined;
  const metricLabel = metric.type === "count" ? translate("an.entriesUnit") : unit;
  const metricParam = metric.type === "count" ? "count" : metric.mod.id;
  const showBreakdown =
    !compute.isChoice && (!subcategory || data.children.length > 0);

  return (
    // Bölümler katmanlarda (bkz. Layer) — gün ve yapı sayfalarıyla aynı iskelet
    <div className={cn("flex flex-col pb-6", brutal ? "gap-6" : "gap-4")}>
      <Layer label={t("an.summaryLayer")} className="mb-0 flex flex-col gap-4">
      {header}
      {chips}

      {/* Dönemin KPI'ları */}
      {metric.type === "count" ? (
        <div className="grid grid-cols-2 gap-2">
          <StatTile
            color={category.color}
            label={t("insights.entries")}
            value={fmtNum(computed.withValueCount)}
            sub={periodLabel}
          />
          <StatTile
            color={category.color}
            label={t("stat.dailyAverage")}
            value={fmtNum(computed.dailyAvg)}
            unit={translate("an.entriesUnit")}
            sub={`${computed.elapsedDays} ${t("stat.days")}`}
          />
        </div>
      ) : (
        /* Kutular özelliğin kendi analiz ayarından (bkz. StatTiles) */
        <StatTiles
          options={compute.statOptions}
          onPick={pickStat}
          keys={compute.stats}
          color={category.color}
          unit={unit}
          periodSub={periodLabel}
          daysSub={`${computed.elapsedDays} ${t("stat.days")}`}
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
            yesStreakCurrent: computed.yesStreaks?.current,
            yesStreakBest: computed.yesStreaks?.best,
            topChoice: computed.topChoice,
            choiceTotal: computed.choiceTotal,
            ...computed.level,
            ...computed.bag,
            noCount: computed.withValueCount - computed.total,
            streakCurrent: computed.streaks?.current,
            streakBest: computed.streaks?.best,
            elapsedDays: computed.elapsedDays,
          }}
        />
      )}
      </Layer>

      {/* İstikrar — aktif gün oranı ve seriler; tek günde anlamsız */}
      {period.kind !== "day" && (
        <Layer label={t("an.consistency")} className="mb-0 flex flex-col gap-2">
          {!brutal && (
          <h3 className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("an.consistency")}
          </h3>
          )}
          <div className="grid grid-cols-3 gap-2">
            <StatTile
              color={category.color}
              label={t("insights.activeDays")}
              value={`%${fmtNum(computed.activeRatio)}`}
              sub={`${computed.activeDayCount}/${computed.elapsedDays} ${t("stat.days")}`}
            />
            <StatTile
              color={category.color}
              label={t("insights.currentStreak")}
              value={fmtNum(computed.streaks.current)}
              unit={t("stat.days")}
              sub={translate("an.inARow")}
            />
            <StatTile
              color={category.color}
              label={t("an.bestStreak")}
              value={fmtNum(computed.streaks.best)}
              unit={t("stat.days")}
              sub={t("an.longest")}
            />
          </div>
        </Layer>
      )}

      {/* Gelişim — dağılımda yalnız bir seçenek süzgeci varken anlamlı */}
      {!(compute.isChoice && !choiceFilter) && (
        <Layer
          label={t("an.growth")}
          extra={`(${period.kind === "all" ? t("an.growthAll") : t("an.growthPeriod")})`}
          className="mb-0 flex flex-col gap-2"
        >
          {!brutal && (
          <h3 className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("an.growth")}
            <span className="normal-case font-normal text-muted-foreground/60">
              {" "}
              ({period.kind === "all" ? t("an.growthAll") : t("an.growthPeriod")})
            </span>
          </h3>
          )}
          <div className="grid grid-cols-2 gap-2">
            <StatTile
              color={category.color}
              label={computed.recentLabel}
              value={
                compute.isRate
                  ? fmtPct(computed.recentValue)
                  : fmtNum(computed.recentValue)
              }
              unit={
                compute.isRate
                  ? undefined
                  : computed.isAvgMetric
                    ? unit
                    : metricLabel
              }
              sub={
                computed.growthPoints !== null
                  ? t("stat.pointsVsPrev", {
                      sign: computed.growthPoints >= 0 ? "+" : "−",
                      n: fmtNum(Math.abs(computed.growthPoints)),
                    })
                  : computed.growthPct !== null
                    ? t("stat.pctVsPrev", {
                        sign: computed.growthPct >= 0 ? "+" : "−",
                        pct: fmtPct(Math.abs(computed.growthPct) / 100),
                      })
                    : t("stat.noPrevPeriod")
              }
            />
            <StatTile
              color={category.color}
              label={computed.prevLabel}
              /* Ortalama rakamlarda veri yokluğu "0" diye okunmamalı */
              value={
                compute.isAvgLike && !computed.hasPrev
                  ? "—"
                  : compute.isRate
                    ? fmtPct(computed.prevValue)
                    : fmtNum(computed.prevValue)
              }
              unit={
                compute.isRate || (compute.isAvgLike && !computed.hasPrev)
                  ? undefined
                  : computed.isAvgMetric
                    ? unit
                    : metricLabel
              }
              sub={
                compute.isAvgLike && !computed.hasPrev
                  ? t("stat.noData")
                  : (computed.prevNote ??
                    (compute.isRate ? t("stat.yesRate") : compute.aggregateNote))
              }
            />
          </div>
        </Layer>
      )}

      {/* Alt kategori kırılımı — grafikten ÖNCE: önce "ne nereye gitmiş",
          istenirse alt kategoriye inilir (dönem ve metrik taşınır) */}
      {showBreakdown && (
        <Layer
          label={translate("an.subBreakdown")}
          extra={compute.aggregateNote ? `(${compute.aggregateNote})` : undefined}
          className="mb-0"
        >
        {/* Brütalde katmanın kendisi kutu — içte ikinci çerçeve yok */}
        <div className={brutal ? undefined : "rounded-2xl border border-border bg-card p-4"}>
          {!brutal && (
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            {translate("an.subBreakdown")}
            {compute.aggregateNote && (
              <span className="normal-case font-normal text-muted-foreground/60">
                {" "}
                ({compute.aggregateNote})
              </span>
            )}
          </h3>
          )}
          <ShareBars
            rows={computed.shareRows}
            mode={compute.isRate ? "rate" : compute.scale ? "level" : "share"}
            range={compute.scale}
            emptyText={translate("list.noEntriesInRange")}
            onSelect={(subId) =>
              router.push(
                routes.analyticsSub(category.id, subId, `p=${period.key}&metric=${metricParam}`)
              )
            }
          />
        </div>
        </Layer>
      )}

      {/* Pano — grafikler kullanıcının kurduğu liste */}
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
          color={category.color}
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
                {/* "Tek tek" kova değil girdi çiziyor; "Haftalık" demek yanlış olurdu */}
                {kind !== "points" && `${GRANULARITY_TITLES[computed.granularity]} `}
                {metric.type === "count" ? translate("an.entriesUnit") : metric.mod.name}
              </>
            ),
            extra: ` · ${periodLabel}`,
          })}
        />
        </Layer>
      )}

      {/* Girdi listesi — son 50 */}
      <Layer className="mb-0">
      <EntryListSection
        title={t("home.recentEntries")}
        accent={category.color}
        rows={computed.entryRows}
        emptyText={translate("list.noEntriesInRange")}
      />
      </Layer>
    </div>
  );
}
