"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import {
  bucketAncestorId,
  bucketKeyOf,
  buildSeriesBuckets,
  chooseGranularity,
  fmtNum,
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
import { DailyBarChart } from "./daily-bar-chart";
import { ShareBars, type ShareRow } from "./share-bars";
import { EntryListSection, type EntryListRow } from "./entry-list";
import { MetricChips } from "./metric-chips";
import { RegularToggle, useExcludeRegular } from "./regular-toggle";
import { useCategoryMetrics } from "./use-category-metrics";
import type { Category, Entry, SubCategory } from "@/types";

/**
 * Dönem sayfasındaki kategori detayı — kategori metriklerinin donmuş bir zaman
 * penceresine ([period.start, period.end)) kısıtlı analizi. Devam eden dönemlerde
 * günlük ortalama geçen gün sayısına bölünür ("perşembe günü 4 güne böl");
 * gün dönemlerinde o günü kapsayan haftanın günlük ortalamasıyla karşılaştırılır.
 */
export function PeriodCategoryPanel({
  category,
  period,
}: {
  category: Category;
  period: Period;
}) {
  // Kırılımdan derine inme — dönemin İÇİNDE kalır. Eskiden alt kategori
  // sayfasına gidiliyordu; o sayfa "şimdi"ye göreli çalıştığından geçmiş bir
  // dönemden tıklandığında sessizce tüm zamanları gösteriyordu.
  const [path, setPath] = useState<SubCategory[]>([]);
  const focus = path[path.length - 1];
  // Gün dönemlerinde hafta bağlamı gerekir — o günü kapsayan haftanın tamamı çekilir,
  // günün kendi rakamları pencere filtresiyle hesaplanır
  const containingWeek = useMemo(
    () => (period.kind === "day" ? weekPeriod(period.start) : null),
    [period.kind, period.start]
  );

  const [excludeRegular, setExcludeRegular] = useExcludeRegular();
  const { data, metric, setMetricChoice, compute } = useCategoryMetrics({
    category,
    rootSubId: focus?.id,
    fetchStart: containingWeek ? containingWeek.start : period.start,
    fetchEnd: containingWeek ? containingWeek.end : period.end,
    resetKey: `${category.id}|${period.key}|${focus?.id ?? ""}`,
    excludeRegular,
  });

  const computed = useMemo(() => {
    if (!data || !compute) return null;
    const { subById } = data;
    const { aggregate, averageOf, valueByEntry, unit, kind } = compute;
    const now = new Date();

    // Dönem penceresine düşen girdiler (hafta bağlamı için geniş çekildiyse filtrele)
    const entries = containingWeek
      ? data.entries.filter(
          (e) => e.occurredAt >= period.start && e.occurredAt < period.end
        )
      : data.entries;

    const total = aggregate(entries);
    const avg = averageOf(entries);
    const withValueCount =
      metric.type === "mod"
        ? entries.filter((e) => valueByEntry.has(e.id)).length
        : entries.length;

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
    let weekContext: { ref: number; deltaPct: number; perDay: boolean } | null =
      null;
    if (containingWeek) {
      const weekProgress = periodProgress(containingWeek, now);
      const dayValue = aggregate(entries);
      let ref = 0;
      if (kind === "scale") {
        ref = averageOf(data.entries);
      } else if (weekProgress.elapsedDays > 0) {
        ref = aggregate(data.entries) / weekProgress.elapsedDays;
      }
      if (ref > 0 && (metric.type === "count" || withValueCount > 0)) {
        weekContext = {
          ref,
          deltaPct: ((dayValue - ref) / ref) * 100,
          perDay: kind !== "scale",
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
      buckets.forEach((b, i) => {
        b.value = aggregate(bucketEntries[i]);
      });
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
      .map(([id, list]) => ({ id, value: aggregate(list) }))
      .filter((r) => r.value > 0)
      .map(({ id, value }) => {
        const s = subById.get(id)!;
        // Odaklanılan kalemin KENDİ doğrudan girdileri (alt kaleme değil,
        // doğrudan ona yazılmış) kendi id'sinde toplanır — kendi adıyla
        // listelenirse "Yemek içinde Yemek" gibi görünüp sonsuz iniyordu.
        // Kategori kökündeki karşılığı gibi "Genel" adıyla gösterilir.
        const isSelf = id === focus?.id || s.isCategoryRoot;
        return {
          id,
          name: isSelf ? "Genel" : s.name,
          color: category.color,
          value,
          display: unit ? `${fmtNum(value)} ${unit}` : fmtNum(value),
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
          subLabel: sub ? (sub.isCategoryRoot ? "Genel" : sub.name) : undefined,
          valueLabel:
            metric.type === "mod"
              ? `${fmtNum(valueByEntry.get(e.id) ?? 0)}${unit ? ` ${unit}` : ""}`
              : undefined,
        };
      });

    return {
      total,
      avg,
      withValueCount,
      progress,
      dailyAvg,
      weekContext,
      buckets,
      granularity,
      seriesFrame,
      hasSeries,
      shareRows,
      entryRows,
    };
  }, [data, compute, metric.type, period, containingWeek, category.color, focus?.id]);

  if (!data || !compute || !computed) return null;

  const unit = compute.unit || undefined;
  const { progress, weekContext } = computed;
  const isDay = period.kind === "day";
  /** Girdi kutusunun alt yazısı — sayının kaç günü kapsadığı */
  const dayCountLabel = isDay
    ? periodShortLabel(period)
    : `${progress.elapsedDays} günde`;
  /** Derine inildiyse bölüm başlıkları hangi kaleme ait olduğunu yazar */
  const scopePrefix = focus ? (
    <span style={{ color: `${category.color}dd` }}>{focus.name} · </span>
  ) : null;
  const metricLabel = metric.type === "count" ? "girdi" : unit;

  return (
    <div className="flex flex-col gap-4">
      {/* Kapsam şeridi — derine inildiğinde aşağıdaki HER ŞEYİN (istatistik,
          grafik, kırılım, liste) hangi kaleme ait olduğunu söyler. Yoksa
          Yemek rakamlarına bakarken Harcamalar sanılabiliyordu. */}
      {path.length > 0 && (
        <div
          className="flex items-center gap-1.5 rounded-xl border px-2 py-1.5"
          style={{
            borderColor: `${category.color}40`,
            backgroundColor: `${category.color}0f`,
          }}
        >
          <button
            type="button"
            onClick={() => setPath(path.slice(0, -1))}
            aria-label="Bir üst kaleme dön"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-white/8 text-muted-foreground transition-colors hover:bg-white/12 hover:text-foreground"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <div className="flex min-w-0 flex-1 flex-wrap items-center text-xs">
            <button
              type="button"
              onClick={() => setPath([])}
              className="rounded px-1 py-0.5 font-medium text-muted-foreground underline decoration-dotted underline-offset-2 transition-colors hover:text-foreground"
            >
              {category.name}
            </button>
            {path.map((s, i) => {
              const last = i === path.length - 1;
              return (
                <span key={s.id} className="flex min-w-0 items-center">
                  <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/40" />
                  {last ? (
                    <span
                      className="max-w-[150px] truncate px-1 py-0.5 font-semibold"
                      style={{ color: `${category.color}ee` }}
                    >
                      {s.name}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setPath(path.slice(0, i + 1))}
                      className="max-w-[130px] truncate rounded px-1 py-0.5 font-medium text-muted-foreground underline decoration-dotted underline-offset-2 transition-colors hover:text-foreground"
                    >
                      {s.name}
                    </button>
                  )}
                </span>
              );
            })}
          </div>
        </div>
      )}

      <MetricChips
        numericMods={data.numericMods}
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

      {/* Dönem KPI'ları — gün dışındaki pencerelerde günlük ortalama geçen güne bölünür */}
      {metric.type === "count" ? (
        isDay ? (
          <StatTile
            label="Girdi sayısı"
            value={fmtNum(computed.withValueCount)}
            sub={period.label}
          />
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <StatTile
              label="Girdi sayısı"
              value={fmtNum(computed.withValueCount)}
              sub={dayCountLabel}
            />
            <StatTile
              label="Günlük ortalama"
              value={fmtNum(computed.dailyAvg)}
              unit="girdi"
              sub={`${progress.elapsedDays} gün üzerinden`}
            />
          </div>
        )
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {compute.displayMode === "both" && (
            <StatTile
              label="Toplam"
              value={fmtNum(computed.total)}
              unit={unit}
              // Ortalama zaten yandaki kutuda; burada hangi aralığın toplamı
              // olduğu daha faydalı
              sub={periodShortLabel(period)}
            />
          )}
          {compute.displayMode === "both" && !isDay ? (
            <StatTile
              label="Günlük ortalama"
              value={fmtNum(computed.dailyAvg)}
              unit={unit}
              sub={`${progress.elapsedDays} gün üzerinden`}
            />
          ) : (
            <StatTile
              label="Ortalama"
              value={fmtNum(computed.avg)}
              unit={unit}
              sub="girdi başına"
            />
          )}
          <StatTile
            label="Girdi sayısı"
            value={fmtNum(computed.withValueCount)}
            sub={dayCountLabel}
          />
        </div>
      )}

      {/* Gün dönemlerinde hafta bağlamı — bu gün haftalık ortalamaya göre nerede */}
      {isDay && weekContext && (
        <div className="rounded-2xl border border-border bg-card px-4 py-3 text-xs text-muted-foreground">
          Hafta ort.{" "}
          <span className="font-semibold text-foreground">
            {fmtNum(weekContext.ref)}
            {metricLabel ? ` ${metricLabel}` : ""}
            {weekContext.perDay ? "/gün" : ""}
          </span>{" "}
          · bu gün{" "}
          <span
            className="font-semibold"
            style={{ color: category.color }}
          >
            %{fmtNum(Math.abs(weekContext.deltaPct))}{" "}
            {weekContext.deltaPct >= 0 ? "üzerinde" : "altında"}
          </span>
        </div>
      )}

      {/* Alt kategori kırılımı — seriden ÖNCE: önce "ne nereye gitmiş"
          görülür, istenirse bir kademe derine inilir (dönemden çıkılmadan),
          sonra o kapsamın zaman serisi incelenir */}
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          {/* Odaklıyken de gösterilen şey aynı: bu kalemin altındaki
              kalemlerin dağılımı — başlık da aynı kalır */}
          <h3 className="min-w-0 text-xs font-semibold uppercase leading-tight tracking-wider text-muted-foreground">
            {scopePrefix}
            Alt Kategori Dağılımı
            {metric.type === "mod" && (
              <span className="normal-case font-normal text-muted-foreground/60">
                {" "}
                ({compute.bucketIsAvg ? "ortalama" : "toplam"})
              </span>
            )}
          </h3>
          {focus && (
            <Link
              href={`/analytics/${category.id}/${focus.id}`}
              className="flex shrink-0 items-center gap-1 text-[10px] font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Tüm zamanlar
              <ArrowRight className="h-3 w-3" />
            </Link>
          )}
        </div>

        {/* Yol artık panelin tepesindeki kapsam şeridinde — burada tekrar etmez */}
        <ShareBars
          rows={computed.shareRows}
          emptyText={
            metric.type === "mod"
              ? `Bu dönemde ${metric.mod.name} verisi yok`
              : focus
                ? "Bu dalın altında ayrı bir kalem yok"
                : "Bu dönemde girdi yok"
          }
          onSelect={(subId) => {
            const sub = data.subById.get(subId);
            if (!sub) return;
            // "Genel" satırları (kategori kökü ya da odağın kendi girdileri)
            // bir alt kademe değil — inilecek bir yer yok
            if (sub.isCategoryRoot || sub.id === focus?.id) return;
            // Aynı düğüm yolda varsa tekrar eklenmez (döngü koruması)
            setPath((p) => (p.some((s) => s.id === sub.id) ? p : [...p, sub]));
          }}
        />
      </div>

      {/* Seri — bir günden uzun dönemlerde */}
      {computed.hasSeries && (
        <div className="rounded-2xl border border-border bg-card p-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {scopePrefix}
            {GRANULARITY_TITLES[computed.granularity]}{" "}
            {metric.type === "count" ? "girdi" : metric.mod.name}
            {metric.type === "mod" && (
              <span className="normal-case font-normal text-muted-foreground/60">
                {" "}
                ({compute.bucketIsAvg ? "ortalama" : "toplam"})
              </span>
            )}
          </h3>
          <DailyBarChart
            data={computed.buckets}
            color={category.color}
            unit={metric.type === "count" ? "girdi" : unit}
            caption={computed.seriesFrame?.caption}
            showAllTicks={computed.seriesFrame?.showAllTicks}
          />
        </div>
      )}

      {/* Girdi listesi */}
      <EntryListSection
        title={focus ? `${focus.name} · Girdi Listesi` : "Girdi Listesi"}
        accent={category.color}
        rows={computed.entryRows}
        emptyText={
          metric.type === "mod"
            ? `Bu dönemde ${metric.mod.name} verisi yok`
            : "Bu dönemde girdi yok"
        }
      />
    </div>
  );
}
