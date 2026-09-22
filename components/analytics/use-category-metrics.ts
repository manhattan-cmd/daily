"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { listAnalysisViews, setAnalysisView } from "@/lib/db/queries";
import { choiceLabel } from "@/lib/choice-level";
import {
  average,
  boolToNumber,
  classifyMod,
  countByChoice,
  displayModeOf,
  dtrDurationHours,
  fmtNum,
  isChoiceMod,
  parseNumeric,
  sumOrAvg,
  levelStats,
  analysisKindOf,
  SERIES_FOR,
  STATS_FOR,
  CHARTS_FOR,
  dayKey,
  textToNumber,
  type DayBucket,
  type DisplayMode,
  type Metric,
  type MetricMod,
  type ModKind,
  type ScaleRange,
} from "@/lib/analytics";
import type { ChartKind, ModReading, SeriesMode, StatKey } from "@/types";

/** Bir girdi kümesinin bütün sayısal okumaları — kutular buradan besleniyor */
export type StatBag = {
  sum: number;
  average: number;
  median: number;
  min: number;
  max: number;
  first: number;
  last: number;
  maxDay: number;
  perActiveDay: number;
  activeDays: number;
  distinct: number;
  filled: number;
};
import { useT } from "@/lib/i18n";
import type { Category, Entry, EntryValue, Mod, SubCategory } from "@/types";

export interface CategoryMetricsData {
  /** Kategorinin TÜM alt kategorileri (kapsam dışındakiler de — atalar için gerekir) */
  subById: Map<string, SubCategory>;
  /** Kapsamdaki alt kategori id'leri (rootSubId verilmişse alt ağacı, yoksa tüm kategori) */
  scopeSubIds: string[];
  /** rootSubId verilmişse onun doğrudan çocukları (order sıralı) */
  children: SubCategory[];
  /** Kapsam + [fetchStart, fetchEnd) penceresindeki girdiler
   * (excludeRegular açıksa düzenli/sabit alt ağaçların girdileri çıkarılmış) */
  entries: Entry[];
  values: EntryValue[];
  mods: MetricMod[];
  /** Havuzdaki ham kayıtlar — seçenek listeleri ölçüden çıkıyor */
  rawMods: Map<string, Mod>;
  /** Kapsamda düzenli/sabit işaretli alt kategori var mı ("hariç tut" anahtarı
   * yalnızca varsa gösterilir; kök alt kategorinin kendisi düzenliyse false —
   * onu doğrudan analiz eden sayfayı boşaltmak anlamsız) */
  hasRegular: boolean;
  /** Kapsamdaki, kendisi doğrudan işaretli alt kategorilerin adları (şeffaflık satırı) */
  regularSubNames: string[];
  /** excludeRegular açıkken pencereden çıkarılan girdi sayısı */
  excludedEntryCount: number;
}

export interface MetricCompute {
  /** Girdi başına seçili metriğin değeri — yalnızca değeri olan girdiler haritada */
  valueByEntry: Map<string, number>;
  /** Kovanın ve kırılımın rakamı — seri okumasına UYAR (toplam ya da ortalama) */
  aggregate: (subset: Entry[]) => number;
  /**
   * Alt kümenin gerçek toplamı — seri okumasından bağımsız.
   *
   * "Toplam" kutusu bunu kullanmak zorunda: grafiği "tek tek" okumaya
   * çevirmek dönemin toplamını değiştirmez. Eskiden ikisi aynı yoldan
   * geliyordu ve çizgiye geçince kutu "Toplam 452 ₺" yazıyordu — oysa 452
   * ortalamaydı, ayın toplamı 16.700 ₺.
   */
  sumOf: (subset: Entry[]) => number;
  /** Alt kümede değeri olan girdilerin ortalaması. Oran metriğinde bu ORANIN
   *  kendisidir (0–1) — evet=1/hayır=0 değerlerinin ortalaması. */
  averageOf: (subset: Entry[]) => number;
  /** Alt kümede bu metriğin değeri OLAN girdi sayısı — oranın paydası */
  filledCount: (subset: Entry[]) => number;
  /** Kovayı doldur; oran metriğinde "hayır" payı da yığının üstüne yazılır */
  fillBucket: (bucket: DayBucket, subset: Entry[]) => void;
  /** Girdi listesinde gösterilecek okunur değer: sayıda birimli rakam, oranda
   *  Evet/Hayır, metinde metnin kendisi. Metrik "girdi sayısı" ise undefined. */
  valueLabelOf: (entryId: string) => string | undefined;
  /** Alt kümedeki seçenek dağılımı — yalnız çoktan seçmelide dolu.
   *  Seçenek süzgeci UYGULANMAZ; dağılım her zaman bütünü gösterir. */
  distributionOf: (subset: Entry[]) => { choice: string; count: number }[];
  kind: ModKind | "choice";
  unit: string;
  displayMode: DisplayMode | undefined;
  /** Başlıklardaki parantez içi not — "(ortalama)" / "(toplam)" / "(evet)" */
  aggregateNote: string | undefined;
  /** Oran metriği mi — panellerde KPI ve kırılım biçimini belirler */
  isRate: boolean;
  /** Dağılım metriği mi — kırılım kutusunun yerini seçenek dağılımı alır */
  isChoice: boolean;
  /** Skalanın aralığı ve uçları; skala metriği değilse undefined */
  scale: ScaleRange | undefined;
  /** Rakamı ortalama olan metrikler (skala ve oran). Bunlarda boş dönem "0"
   *  diye okunamaz ve değişim yüzde değil PUAN farkıyla anlatılır. */
  isAvgLike: boolean;
  /** Okuma biçimi — düzeyde kovalar toplanmaz, ortalanır */
  reading: ModReading;
  /** Çıkacak analiz kutuları (kullanıcının seçimi ya da türün varsayılanı) */
  stats: StatKey[];
  /** Serinin çizimi */
  chart: ChartKind;
  /** Serinin okunuşu ve bu ölçüde sunulan okumalar */
  series: SeriesMode;
  seriesOptions: SeriesMode[];
  /** Panodaki grafikler ve bu ölçüde sunulanlar */
  charts: ChartKind[];
  chartOptions: ChartKind[];
  /** Bu ölçüde kutuya konabilecekler */
  statOptions: StatKey[];
  /**
   * Alt kümenin bütün sayısal okumaları tek seferde. Panoda kutu sayısı
   * kullanıcıya bağlı olduğu için panellerin tek tek hesap yapması ölü koda
   * dönüyordu; burada hepsi bir kez çıkıyor, panel yalnız seçilenleri çiziyor.
   */
  statsFor: (subset: Entry[]) => StatBag;
  /** Alt kümedeki son/en düşük/en yüksek değer — düzey kutularının kaynağı */
  levelOf: (subset: Entry[]) => { last: number; min: number; max: number };
}

/**
 * Kategori kapsamlı metrik analizi — PeriodCategoryPanel, SubcategoryPanel ve
 * CategoryOverviewPanel'in ortak çekirdeği. Veriyi çeker (alt kategoriler,
 * girdiler, değerler, sayısal modlar), metrik seçimini yönetir (varsayılan:
 * ilk mod; URL'den initialMetricId gelirse o) ve girdi kümeleri üzerinde
 * toplama fonksiyonlarını sunar. Panellere kalan: pencere/kova kurgusu ve yerleşim.
 */
export function useCategoryMetrics({
  category,
  rootSubId,
  fetchStart,
  fetchEnd,
  initialMetricId,
  resetKey,
  excludeRegular = false,
}: {
  category: Category;
  /** Verilirse kapsam bu alt kategorinin alt ağacı; yoksa tüm kategori */
  rootSubId?: string;
  /** Girdi sorgusunun alt sınırı (dahil) */
  fetchStart: number;
  /** Girdi sorgusunun üst sınırı (hariç); yoksa sınırsız */
  fetchEnd?: number;
  /** URL'den gelen başlangıç metriği: "count" ya da mod id'si */
  initialMetricId?: string;
  /** Değiştiğinde metrik seçimi sıfırlanır (örn. kategori değişimi) */
  resetKey: string;
  /** Düzenli/sabit işaretli alt ağaçların girdilerini pencereden çıkar */
  excludeRegular?: boolean;
}) {
  const t = useT();
  // null = kullanıcı henüz seçmedi → varsayılan render sırasında senkron türetilir,
  // effect'le sonradan set edilirse "Girdi" bir an seçili görünüp titreme yaratıyor
  const [metricChoice, setMetricChoice] = useState<Metric | null>(null);
  // Çoktan seçmelide seriyi süzen seçenek; null = tüm girdiler
  const [choiceFilter, setChoiceFilter] = useState<string | null>(null);
  // Tercihin yazılacağı yer: alt kaleme bakılıyorsa o kalem, yoksa kategori
  const scopeType: "category" | "subcategory" = rootSubId
    ? "subcategory"
    : "category";
  const scopeId = rootSubId ?? category.id;

  // Kapsam değişiminde seçimi render sırasında sıfırla (remount'suz geçişler için)
  const [prevResetKey, setPrevResetKey] = useState(resetKey);
  if (prevResetKey !== resetKey) {
    setPrevResetKey(resetKey);
    setMetricChoice(null);
    setChoiceFilter(null);
  }

  const data = useLiveQuery(async (): Promise<CategoryMetricsData | null> => {
    // (kapsam yukarıda hesaplandı)
    const allSubs = await db.subcategories
      .where("categoryId")
      .equals(category.id)
      .toArray();
    const subById = new Map(allSubs.map((s) => [s.id, s]));

    let scopeSubIds: string[];
    let children: SubCategory[] = [];
    if (rootSubId) {
      // Alt ağaç (kendisi dahil) — torunlar da kapsanır
      const subtreeIds = new Set<string>([rootSubId]);
      let frontier = [rootSubId];
      while (frontier.length) {
        const next = allSubs.filter(
          (s) => s.parentId && frontier.includes(s.parentId)
        );
        frontier = [];
        for (const s of next) {
          if (!subtreeIds.has(s.id)) {
            subtreeIds.add(s.id);
            frontier.push(s.id);
          }
        }
      }
      scopeSubIds = [...subtreeIds];
      children = allSubs
        .filter((s) => s.parentId === rootSubId)
        .sort((a, b) => a.order - b.order);
    } else {
      scopeSubIds = allSubs.map((s) => s.id);
    }

    // Düzenli/sabit kapsama: kendisi ya da bir atası isRegular olan alt kategoriler
    const regularIds = new Set<string>();
    for (const s of allSubs) {
      let cur: SubCategory | undefined = s;
      let hops = 0;
      while (cur && hops++ < 20) {
        if (cur.isRegular) {
          regularIds.add(s.id);
          break;
        }
        cur = cur.parentId ? subById.get(cur.parentId) : undefined;
      }
    }
    // Kökün kendisi düzenliyse anahtar sunulmaz — sayfayı boşaltmak anlamsız
    const rootIsRegular = rootSubId ? regularIds.has(rootSubId) : false;
    const hasRegular =
      !rootIsRegular && scopeSubIds.some((id) => regularIds.has(id));
    const regularSubNames = hasRegular
      ? allSubs
          .filter((s) => s.isRegular && scopeSubIds.includes(s.id))
          .map((s) => s.name)
      : [];
    const applyExclude = hasRegular && excludeRegular;

    if (!scopeSubIds.length) {
      return {
        subById,
        scopeSubIds,
        children,
        entries: [],
        values: [],
        mods: [],
        rawMods: new Map(),
        hasRegular,
        regularSubNames,
        excludedEntryCount: 0,
      };
    }

    const fetched = await db.entries
      .where("subcategoryId")
      .anyOf(scopeSubIds)
      .filter(
        (e) =>
          e.occurredAt >= fetchStart &&
          (fetchEnd === undefined || e.occurredAt < fetchEnd)
      )
      .toArray();
    const entries = applyExclude
      ? fetched.filter((e) => !regularIds.has(e.subcategoryId))
      : fetched;
    const excludedEntryCount = fetched.length - entries.length;
    const values = entries.length
      ? await db.entryValues
          .where("entryId")
          .anyOf(entries.map((e) => e.id))
          .toArray()
      : [];

    // Metrik adayları: yalnızca kapsamdaki girdilerde GERÇEKTEN kullanılanlar.
    // Atanmış ama hiç veri girilmemiş özellikler metrik çipi olarak
    // gösterilmez — analiz edilecek bir şeyleri yok, kalabalık yapıyorlardı.
    const modIds = new Set(
      values.map((v) => v.modId).filter((x): x is string => !!x)
    );
    // bulkGet yerine tam tablo taraması — küçük tablolar (havuzdaki mod/ölçü sayısı sınırlı),
    // bulkGet'in ardışık yazımlardan hemen sonra bazı anahtarlar için null dönebildiği gözlendi
    const allMods = await db.mods.toArray();
    // Bakılan kapsamın tercihleri: aynı özellik başka kalemde başka okunuyor
    const views = await listAnalysisViews(scopeType, scopeId);
    const mods: MetricMod[] = allMods
      .filter((m) => modIds.has(m.id))
      .map((m) => classifyMod(m, views.get(m.id)))
      .filter((m): m is MetricMod => !!m)
      .sort((a, b) => a.name.localeCompare(b.name, "en"));

    return {
      subById,
      scopeSubIds,
      children,
      entries,
      values,
      mods,
      rawMods: new Map(allMods.map((m) => [m.id, m])),
      hasRegular,
      regularSubNames,
      excludedEntryCount,
    };
  }, [category.id, rootSubId, fetchStart, fetchEnd, excludeRegular]);

  // Varsayılan metrik: URL'den gelen mod; yoksa listedeki ilk mod
  // ("Girdi" yalnızca URL "count" derse ya da hiç mod yoksa varsayılan)
  const metric = useMemo<Metric>(() => {
    if (metricChoice) {
      // Seçim yalnız KİMLİĞİ taşır, kaydın kendisini değil: seçildiği andaki
      // nesne dondurulursa kapsam tercihi değişince (kutu/grafik seçimi)
      // ekran eski görünümde kalıyordu — kayıt güncelleniyor ama panel
      // sınıflandırmanın eski kopyasına bakıyordu.
      if (metricChoice.type !== "count" && data) {
        const fresh = data.mods.find((m) => m.id === metricChoice.mod.id);
        if (fresh) return metricOf(fresh);
      }
      return metricChoice;
    }
    if (data) {
      if (initialMetricId && initialMetricId !== "count") {
        const found = data.mods.find((m) => m.id === initialMetricId);
        if (found) return metricOf(found);
      }
      if (initialMetricId === undefined && data.mods.length > 0) {
        return metricOf(data.mods[0]);
      }
    }
    return { type: "count" };
  }, [metricChoice, data, initialMetricId]);

  const compute = useMemo<MetricCompute | null>(() => {
    if (!data) return null;

    // Girdi başına metrik değeri: sadece bu modun değerine sahip girdiler dahil edilir
    // (skala modlarında ortalama, yalnızca değeri olan girdiler üzerinden hesaplanmalı)
    const valueByEntry = new Map<string, number>();
    // Ham değer — listede okunur etiketi (Evet/Hayır, metnin kendisi) buradan çıkar
    const rawByEntry = new Map<string, string>();
    // Seçenekler AYRI tutuluyor çünkü bir girdi aynı özellikten birden çok
    // değer taşıyabiliyor (ruh halinde bir kayıtta üç duygu). Tek değerli
    // haritada son yazan kazanıyordu: üç duygulu bir kayıt dağılıma bir
    // duyguyla giriyordu. Tek seçimli özelliklerde liste zaten tek elemanlı,
    // davranış değişmiyor.
    const choicesByEntry = new Map<string, string[]>();
    if (metric.type === "mod") {
      for (const v of data.values) {
        if (v.modId !== metric.mod.id) continue;
        const amount =
          metric.mod.kind === "duration"
            ? dtrDurationHours(v.value)
            : metric.mod.kind === "rate"
              ? boolToNumber(v.value)
              : metric.mod.kind === "presence"
                ? textToNumber(v.value)
                : parseNumeric(v.value);
        valueByEntry.set(v.entryId, (valueByEntry.get(v.entryId) ?? 0) + amount);
        rawByEntry.set(v.entryId, v.value);
      }
    } else if (metric.type === "choice") {
      // Dağılımda sayıya çevrilecek bir şey yok; etiketin kendisi taşınır
      for (const v of data.values) {
        if (v.modId !== metric.mod.id) continue;
        const label = choiceLabel(v.value).trim();
        if (!label) continue;
        const list = choicesByEntry.get(v.entryId);
        if (list) list.push(label);
        else choicesByEntry.set(v.entryId, [label]);
      }
    }

    const kind: ModKind | "choice" =
      metric.type === "count" ? "number" : metric.mod.kind;
    const unit = metric.type === "mod" ? metric.mod.unit : "";
    const isRate = kind === "rate";
    const isChoice = metric.type === "choice";
    // Metriğin biçimi: kutular ve grafik buradan gelir
    const spec =
      metric.type === "count"
        ? {
            reading: "flow" as ModReading,
            stats: [] as StatKey[],
            chart: "bar" as const,
            charts: [] as ChartKind[],
            series: "sum" as SeriesMode,
          }
        : metric.mod.spec;
    // Seçenek listeleri ÖLÇÜDEN çıkıyor; havuzdaki ham kaydı buradan okuyoruz
    const rawMod = metric.type === "count" ? undefined : data.rawMods.get(metric.mod.id);
    const optionKind = analysisKindOf(rawMod?.valueType, rawMod?.choices);
    const reading: ModReading = metric.type === "mod" ? metric.mod.reading : "flow";
    const valuesOf = (subset: Entry[]) =>
      subset
        .map((e) => valueByEntry.get(e.id))
        .filter((v): v is number => v !== undefined);
    const choicesOf = (subset: Entry[]) =>
      subset.flatMap((e) => choicesByEntry.get(e.id) ?? []);

    // Dağılımda "ne kadar" diye bir rakam yok; sayılan şey GİRDİ. Bir seçenek
    // süzgeci açıksa seri ve kırılım o seçeneğin adedini gösterir — "gergin
    // günlerim artıyor mu" sorusu tam bu.
    // "Kaç girdide veri var" — seçenekte kayıt başına sayılır, seçim başına
    // değil; yoksa üç duygulu tek kayıt üç girdiymiş gibi okunurdu
    const filledCount = (subset: Entry[]): number =>
      metric.type === "count"
        ? subset.length
        : isChoice
          ? subset.filter((e) => (choicesByEntry.get(e.id)?.length ?? 0) > 0)
              .length
          : valuesOf(subset).length;
    const aggregate = (subset: Entry[]): number =>
      metric.type === "count"
        ? subset.length
        : isChoice
          ? choiceFilter
            ? choicesOf(subset).filter((c) => c === choiceFilter).length
            : choicesOf(subset).length
          : sumOrAvg(valuesOf(subset), kind as ModKind, reading);
    const averageOf = (subset: Entry[]): number => average(valuesOf(subset));
    const statsFor = (subset: Entry[]): StatBag => {
      const nums = valuesOf(subset);
      const sorted = [...nums].sort((a, b) => a - b);
      const sum = nums.reduce((a, b) => a + b, 0);
      // Gün toplamları — "en yoğun gün" ve kayıtlı gün ortalaması buradan
      const perDay = new Map<string, number>();
      for (const e of subset) {
        const v = valueByEntry.get(e.id);
        if (v === undefined) continue;
        const k = dayKey(e.occurredAt);
        perDay.set(k, (perDay.get(k) ?? 0) + v);
      }
      const days = perDay.size;
      const labels = choicesOf(subset);
      return {
        sum,
        average: nums.length ? sum / nums.length : 0,
        median: sorted.length
          ? sorted.length % 2
            ? sorted[(sorted.length - 1) / 2]
            : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
          : 0,
        min: sorted.length ? sorted[0] : 0,
        max: sorted.length ? sorted[sorted.length - 1] : 0,
        first: nums.length ? nums[0] : 0,
        last: nums.length ? nums[nums.length - 1] : 0,
        maxDay: days ? Math.max(...perDay.values()) : 0,
        perActiveDay: days ? sum / days : 0,
        activeDays: days,
        distinct: new Set(labels.length ? labels : nums.map(String)).size,
        filled: filledCount(subset),
      };
    };

    const sumOf = (subset: Entry[]): number =>
      metric.type === "count"
        ? subset.length
        : isChoice
          ? filledCount(subset)
          : valuesOf(subset).reduce((a, b) => a + b, 0);
    const distributionOf = (subset: Entry[]) =>
      isChoice ? countByChoice(choicesOf(subset)) : [];

    const fillBucket = (bucket: DayBucket, subset: Entry[]) => {
      bucket.value = aggregate(subset);
      bucket.hasData = filledCount(subset) > 0;
      // Her grafik kendi okumasını alsın: toplam, ortalama ve adet birlikte
      const nums = valuesOf(subset);
      bucket.sum = isChoice
        ? filledCount(subset)
        : nums.reduce((a, b) => a + b, 0);
      bucket.avg = nums.length ? bucket.sum / nums.length : 0;
      bucket.count = filledCount(subset);
      // Oranda çubuk yığılır: alt parça evet, üstteki soluk parça hayır
      if (isRate) bucket.rest = filledCount(subset) - bucket.value;
    };

    const valueLabelOf = (entryId: string): string | undefined => {
      if (metric.type === "count") return undefined;
      const raw = rawByEntry.get(entryId);
      // Dağılımda ve metinde okunacak şey sayı değil değerin kendisi
      if (isChoice) return choicesByEntry.get(entryId)?.join(" · ") || undefined;
      if (kind === "presence") return raw?.trim() || undefined;
      if (kind === "rate") {
        return raw === undefined
          ? undefined
          : raw === "true"
            ? t("entry.yes")
            : t("entry.no");
      }
      const n = valueByEntry.get(entryId);
      if (n === undefined) return undefined;
      return `${fmtNum(n)}${unit ? ` ${unit}` : ""}`;
    };

    return {
      valueByEntry,
      aggregate,
      sumOf,
      averageOf,
      filledCount,
      fillBucket,
      valueLabelOf,
      distributionOf,
      kind,
      unit,
      displayMode:
        metric.type === "mod"
          ? displayModeOf(metric.mod.kind)
          : isChoice
            ? "choice"
            : undefined,
      aggregateNote:
        metric.type === "count"
          ? undefined
          : isChoice
            ? (choiceFilter ?? t("list.entry"))
            : kind === "scale" || reading === "level"
              ? t("stat.average")
              : isRate
                ? t("entry.yes")
                : kind === "presence"
                  ? t("stat.written")
                  : t("stat.total"),
      isRate,
      isChoice,
      scale: metric.type === "mod" ? metric.mod.scale : undefined,
      isAvgLike: kind === "scale" || isRate || reading === "level",
      reading,
      stats:
        metric.type === "count"
          ? (["entries", "dailyAverage"] as StatKey[])
          : spec.stats,
      chart: spec.chart,
      charts: spec.charts ?? [],
      chartOptions:
        metric.type === "count" ? [] : CHARTS_FOR[optionKind] ?? [],
      statsFor,
      series: spec.series,
      seriesOptions: metric.type === "count" ? [] : SERIES_FOR[optionKind] ?? [],
      statOptions: metric.type === "count" ? [] : STATS_FOR[optionKind] ?? [],
      // Girdiler zaman sırasında geldiği için "son" gerçekten sonuncusu
      levelOf: (subset: Entry[]) => levelStats(valuesOf(subset)),
    };
  }, [data, metric, choiceFilter, t]);

  /** Kutu ya da grafik seçimi — bakılan kapsam için yazılır */
  const saveView = async (patch: {
    stats?: StatKey[];
    charts?: ChartKind[];
    series?: SeriesMode;
  }) => {
    if (metric.type === "count") return;
    await setAnalysisView(scopeType, scopeId, metric.mod.id, patch);
  };

  return {
    data,
    metric,
    saveView,
    // Başka bir özelliğe geçince seçenek süzgeci kalmasın — o süzgeç
    // önceki özelliğin seçeneğiydi, yenisinde karşılığı yok
    setMetricChoice: (m: Metric) => {
      setMetricChoice(m);
      setChoiceFilter(null);
    },
    compute,
    choiceFilter,
    setChoiceFilter,
  };
}

/** Modun kendi türüne göre doğru metrik dalını kurar */
export function metricOf(mod: MetricMod): Metric {
  return isChoiceMod(mod) ? { type: "choice", mod } : { type: "mod", mod };
}
