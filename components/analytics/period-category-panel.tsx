"use client";

import { useMemo, useState } from "react";
import { useT } from "@/lib/i18n";
import Link from "next/link";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
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
import { ShareBars, type ShareRow } from "./share-bars";
import { AnalysisCharts, CHART_LABEL } from "./analysis-chart";
import { EntryListSection, type EntryListRow } from "./entry-list";
import { MetricChips } from "./metric-chips";
import { ChipRow } from "./chip-row";
import { RegularToggle, useExcludeRegular } from "./regular-toggle";
import { useCategoryMetrics } from "./use-category-metrics";
import { setAnalysisMetric, setAnalysisPath } from "./analysis-selection";
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
  initialPath = [],
  preferredMetricId,
}: {
  category: Category;
  period: Period;
  /** Başka dönemden taşınan kırılım yolu — bu dönemde dolu kademeye kırpılmış */
  initialPath?: SubCategory[];
  /** Başka dönemden taşınan özellik; bu dönemde verisi yoksa varsayılana düşülür */
  preferredMetricId?: string;
}) {
  const t = useT();
  // Kırılımdan derine inme — dönemin İÇİNDE kalır. Eskiden alt kategori
  // sayfasına gidiliyordu; o sayfa "şimdi"ye göreli çalıştığından geçmiş bir
  // dönemden tıklandığında sessizce tüm zamanları gösteriyordu.
  const [path, setPathState] = useState<SubCategory[]>(initialPath);
  // Yol her değiştiğinde hatırlanır — dönem değişince aynı kaleme dönülsün
  const setPath = (next: SubCategory[] | ((p: SubCategory[]) => SubCategory[])) =>
    setPathState((p) => {
      const v = typeof next === "function" ? next(p) : next;
      setAnalysisPath(category.id, v);
      return v;
    });
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
    setMetricChoice,
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
    preferredMetricId,
    // Kategori ilk açıldığında "Girdi": önce kalemlere dağılım görülsün
    initialMetricId: "count",
    excludeRegular,
  });

  /*
   * BULUNULAN KADEME — sayfanın en üstündeki kategori düzeninin aynısı bir
   * kademe aşağıda: önce o kademenin DAĞILIMI (kategorinin bütün alt
   * kategorileri; bir alt kategoriye odaklanıldıysa onun kardeşleri, kendisi
   * vurgulu), hemen altında aynı kalemlerin KAPSÜLLERİ, onların altında da
   * seçilen kapsamın özellikleri ve grafikleri. Odaklanılan kalemin verisi
   * yalnız kendi alt ağacını kapsadığı için kademe ayrıca okunuyor (aynı
   * parametreler önbellekte paylaşılıyor — odak yokken ek okuma yok).
   */
  const levelPath = focus ? path.slice(0, -1) : path;
  const levelParent = levelPath[levelPath.length - 1];
  const level = useCategoryMetrics({
    category,
    rootSubId: levelParent?.id,
    fetchStart: panelWindow(period).start,
    fetchEnd: panelWindow(period).end,
    resetKey: category.id,
    // Kırılım aşağıda seçilen özelliğe göre (Harcamalar'da Para gibi)
    preferredMetricId: metric.type === "count" ? "count" : metric.mod.id,
    initialMetricId: "count",
    excludeRegular,
  });
  const levelShare = useMemo(() => {
    const d = level.data;
    const c = level.compute;
    if (!d || !c) return null;
    const by = new Map<string, Entry[]>();
    for (const e of d.entries) {
      const top = bucketAncestorId(e.subcategoryId, d.subById, levelParent?.id);
      if (!top) continue;
      const list = by.get(top) ?? [];
      list.push(e);
      by.set(top, list);
    }
    // Girdi sayısına düşülen durumlar: çoktan seçmelide paylaştırılacak bir
    // sayı yok; paylaşım modunda kademede o özelliğe hiç değer girilmemişse
    // kutu "veri yok" yazısına dönüp yine kısalırdı
    const byCount =
      c.isChoice ||
      (!c.isRate && !c.scale && [...by.values()].every((l) => c.aggregate(l) === 0));
    // SATIRLAR ÖZELLİKTEN BAĞIMSIZ: dönemde girdisi olan her kalem satırda
    // kalır, özellik değişince yalnız çubuklar ve rakamlar değişir. Eskiden o
    // özelliği olmayan kalemler (ya da çoktan seçmelide kutunun tamamı)
    // düşüyordu; kutu birden kısalınca altındaki her şey yukarı kayıyor,
    // özellik kapsülleri arasında gezerken sayfa fırlamış gibi oluyordu.
    const rows: ShareRow[] = [...by.entries()]
      .map(([id, list]) =>
        byCount
          ? { id, value: list.length, outOf: list.length }
          : { id, value: c.aggregate(list), outOf: c.filledCount(list) }
      )
      .map(({ id, value, outOf }) => {
        const sub = d.subById.get(id)!;
        // Kademenin KENDİ doğrudan girdileri (kategori kökü ya da ebeveynin
        // kendisi) bir kalem değil — seçilecek bir kapsülü yok
        const isSelf = id === levelParent?.id || sub.isCategoryRoot;
        return {
          id,
          name: sub.isCategoryRoot ? category.name : sub.name,
          color: category.color,
          value,
          outOf,
          display:
            !byCount && (c.isRate || c.scale ? outOf === 0 : value === 0)
              ? "—"
              : !byCount && c.unit
                ? `${fmtNum(value)} ${c.unit}`
                : fmtNum(value),
          drillable: !isSelf,
        };
      });
    const counts = new Map([...by.entries()].map(([id, l]) => [id, l.length]));
    return {
      rows,
      counts,
      isRate: !byCount && c.isRate,
      scale: byCount ? undefined : c.scale,
      aggregateNote: byCount ? undefined : c.aggregateNote,
    };
  }, [level.data, level.compute, levelParent?.id, category.name, category.color]);
  /** Kademenin kalemleri — kapsül satırı (kullanıcının kendi sırasıyla) */
  const levelSubs = useMemo(
    () =>
      [...(data?.subById.values() ?? [])]
        .filter(
          (s) =>
            s.categoryId === category.id &&
            !s.isCategoryRoot &&
            (s.parentId ?? undefined) === (levelParent?.id ?? undefined)
        )
        .sort((a, b) => a.order - b.order),
    [data?.subById, category.id, levelParent?.id]
  );
  const pickSub = (sub: SubCategory) => setPath([...levelPath, sub]);

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
    <div className="flex flex-col gap-4">
      {/* Kapsam şeridi — derine inildiğinde aşağıdaki HER ŞEYİN (istatistik,
          grafik, kırılım, liste) hangi kaleme ait olduğunu söyler. Yoksa
          Yemek rakamlarına bakarken Harcamalar sanılabiliyordu. */}
      {path.length >= 2 && (
        <div
          className="flex items-center gap-2.5 rounded-2xl border px-2.5 py-2.5"
          style={{
            borderColor: `${category.color}55`,
            backgroundColor: `${category.color}14`,
          }}
        >
          <button
            type="button"
            onClick={() => setPath(path.slice(0, -1))}
            aria-label={t("insights.backLevel")}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--sf-3)] text-muted-foreground transition-colors hover:bg-[var(--sf-4)] hover:text-foreground"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            {/* Üst satır — geldiğimiz yol; her adımına basıp dönülebilir */}
            <div className="flex min-w-0 flex-wrap items-center text-[11px] leading-tight text-muted-foreground">
              <button
                type="button"
                onClick={() => setPath([])}
                className="rounded px-0.5 underline decoration-dotted underline-offset-2 transition-colors hover:text-foreground"
              >
                {category.name}
              </button>
              {path.slice(0, -1).map((s, i) => (
                <span key={s.id} className="flex min-w-0 items-center">
                  <ChevronRight className="h-3 w-3 shrink-0 opacity-40" />
                  <button
                    type="button"
                    onClick={() => setPath(path.slice(0, i + 1))}
                    className="max-w-[110px] truncate rounded px-0.5 underline decoration-dotted underline-offset-2 transition-colors hover:text-foreground"
                  >
                    {s.name}
                  </button>
                </span>
              ))}
              <ChevronRight className="h-3 w-3 shrink-0 opacity-40" />
            </div>
            {/* Alt satır — bulunulan katman, şeridin en belirgin öğesi */}
            <div
              className="truncate text-[17px] font-bold leading-tight"
              style={{ color: category.color }}
            >
              {focus.name}
            </div>
          </div>
          {/* Kapsamın tüm zamanlar analizi — kırılım kutusu artık yaprak
              kalemlerde açılmadığı için bağlantı burada durur */}
          <Link
            href={routes.analyticsSub(category.id, focus.id)}
            prefetch={false}
            className="flex w-12 shrink-0 flex-col items-center gap-0.5 rounded-lg px-1 text-center text-[10px] font-medium leading-tight text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowRight className="h-3.5 w-3.5" />
            <span>{t("stat.allTime")}</span>
          </Link>
        </div>
      )}

      {levelShare && levelShare.rows.some((r) => r.drillable) && (
        <div className="rounded-2xl border border-border bg-card p-4">
          <h3 className="mb-3 min-w-0 text-xs font-semibold uppercase leading-tight tracking-wider text-muted-foreground">
            {levelParent && (
              <span style={{ color: `${category.color}dd` }}>{levelParent.name} · </span>
            )}
            Subcategory breakdown
            {levelShare.aggregateNote && (
              <span className="normal-case font-normal text-muted-foreground/60">
                {" "}
                ({levelShare.aggregateNote})
              </span>
            )}
          </h3>
          <ShareBars
            rows={levelShare.rows}
            mode={levelShare.isRate ? "rate" : levelShare.scale ? "level" : "share"}
            range={levelShare.scale}
            // Odaklanılan kalem vurgulu, kardeşleri soluk — üstteki kategori
            // dağılımındaki gibi "şu an bunun içindesin"
            selectedId={focus?.id ?? null}
            onSelect={(subId) => {
              const sub = data.subById.get(subId);
              if (!sub || sub.isCategoryRoot || sub.id === levelParent?.id) return;
              // Seçili satıra yeniden dokunmak kademeye geri döner
              if (sub.id === focus?.id) setPath(levelPath);
              else pickSub(sub);
            }}
          />
        </div>
      )}

      {/* Kademenin kapsülleri — dağılımın hemen altında; ilk kapsül kademenin
          tamamı (kategori ya da üst kalem). Seçilen kapsülün özellikleri
          aşağıda. */}
      {levelSubs.length > 0 && (
        <ChipRow
          items={[
            {
              key: "__level",
              label: levelParent ? levelParent.name : t("insights.all"),
              color: category.color,
              active: !focus,
              onPick: () => setPath(levelPath),
            },
            ...levelSubs.map((sub) => {
              const n = levelShare?.counts.get(sub.id) ?? 0;
              return {
                key: sub.id,
                label: sub.name,
                color: category.color,
                active: focus?.id === sub.id,
                count: n,
                dim: n === 0,
                onPick: () => pickSub(sub),
              };
            }),
          ]}
        />
      )}

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
          setMetricChoice(m);
          setAnalysisMetric(category.id, m.type === "count" ? "count" : m.mod.id);
        }}
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
          color={category.color}
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
            style={{ color: category.color }}
          >
            {weekContext.inPoints
              ? t("stat.points", { n: fmtNum(Math.abs(weekContext.delta)) })
              : fmtPct(Math.abs(weekContext.delta) / 100)}{" "}
            {weekContext.delta >= 0 ? "above" : "below"}
          </span>
        </div>
      )}

      {/* Alt kategori kırılımı — seriden ÖNCE: önce "ne nereye gitmiş"
          görülür, istenirse bir kademe derine inilir (dönemden çıkılmadan),
          sonra o kapsamın zaman serisi incelenir. İnilecek kademe kalmadıysa
          bölüm hiç açılmaz */}
      {!!focus && !compute.isChoice && computed.hasBreakdown && (
        <div className="rounded-2xl border border-border bg-card p-4">
          {/* Odaklıyken de gösterilen şey aynı: bu kalemin altındaki
              kalemlerin dağılımı — başlık da aynı kalır */}
          <h3 className="mb-3 min-w-0 text-xs font-semibold uppercase leading-tight tracking-wider text-muted-foreground">
            {scopePrefix}
            Subcategory breakdown
            {compute.aggregateNote && (
              <span className="normal-case font-normal text-muted-foreground/60">
                {" "}
                ({compute.aggregateNote})
              </span>
            )}
          </h3>

          {/* Yol artık panelin tepesindeki kapsam şeridinde — burada tekrar etmez */}
          <ShareBars
            rows={computed.shareRows}
            mode={compute.isRate ? "rate" : compute.scale ? "level" : "share"}
            range={compute.scale}
            onSelect={(subId) => {
              const sub = data.subById.get(subId);
              if (!sub) return;
              // Kalemin kendi doğrudan girdileri (kategori kökü ya da odağın
              // kendisi) bir alt kademe değil — inilecek bir yer yok
              if (sub.isCategoryRoot || sub.id === focus?.id) return;
              // Aynı düğüm yolda varsa tekrar eklenmez (döngü koruması)
              setPath((p) => (p.some((s) => s.id === sub.id) ? p : [...p, sub]));
            }}
          />
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
          color={category.color}
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
        accent={category.color}
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
