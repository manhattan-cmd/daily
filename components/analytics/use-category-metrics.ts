"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import {
  average,
  boolToNumber,
  classifyNumericMod,
  displayModeOf,
  dtrDurationHours,
  fmtNum,
  parseNumeric,
  sumOrAvg,
  textToNumber,
  type DayBucket,
  type DisplayMode,
  type Metric,
  type ModKind,
  type NumericMod,
} from "@/lib/analytics";
import { useT } from "@/lib/i18n";
import type { Category, Entry, EntryValue, SubCategory } from "@/types";

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
  numericMods: NumericMod[];
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
  /** Alt kümenin metrik toplamı (scale modda ortalaması), count metriğinde adedi */
  aggregate: (subset: Entry[]) => number;
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
  kind: ModKind;
  unit: string;
  displayMode: DisplayMode | undefined;
  /** Başlıklardaki parantez içi not — "(ortalama)" / "(toplam)" / "(evet)" */
  aggregateNote: string | undefined;
  /** Oran metriği mi — panellerde KPI ve kırılım biçimini belirler */
  isRate: boolean;
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

  // Kapsam değişiminde seçimi render sırasında sıfırla (remount'suz geçişler için)
  const [prevResetKey, setPrevResetKey] = useState(resetKey);
  if (prevResetKey !== resetKey) {
    setPrevResetKey(resetKey);
    setMetricChoice(null);
  }

  const data = useLiveQuery(async (): Promise<CategoryMetricsData | null> => {
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
        numericMods: [],
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

    // Sayısal modlar: yalnızca kapsamdaki girdilerde GERÇEKTEN kullanılanlar.
    // Atanmış ama hiç veri girilmemiş özellikler metrik çipi olarak
    // gösterilmez — analiz edilecek bir şeyleri yok, kalabalık yapıyorlardı.
    const modIds = new Set(
      values.map((v) => v.modId).filter((x): x is string => !!x)
    );
    // bulkGet yerine tam tablo taraması — küçük tablolar (havuzdaki mod/ölçü sayısı sınırlı),
    // bulkGet'in ardışık yazımlardan hemen sonra bazı anahtarlar için null dönebildiği gözlendi
    const allMods = await db.mods.toArray();
    const numericMods: NumericMod[] = allMods
      .filter((m) => modIds.has(m.id))
      .map((m) => classifyNumericMod(m))
      .filter((m): m is NumericMod => !!m)
      .sort((a, b) => a.name.localeCompare(b.name, "en"));

    return {
      subById,
      scopeSubIds,
      children,
      entries,
      values,
      numericMods,
      hasRegular,
      regularSubNames,
      excludedEntryCount,
    };
  }, [category.id, rootSubId, fetchStart, fetchEnd, excludeRegular]);

  // Varsayılan metrik: URL'den gelen mod; yoksa listedeki ilk mod
  // ("Girdi" yalnızca URL "count" derse ya da hiç mod yoksa varsayılan)
  const metric = useMemo<Metric>(() => {
    if (metricChoice) return metricChoice;
    if (data) {
      if (initialMetricId && initialMetricId !== "count") {
        const found = data.numericMods.find((m) => m.id === initialMetricId);
        if (found) return { type: "mod", mod: found };
      }
      if (initialMetricId === undefined && data.numericMods.length > 0) {
        return { type: "mod", mod: data.numericMods[0] };
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
    }

    const kind: ModKind = metric.type === "mod" ? metric.mod.kind : "number";
    const unit = metric.type === "mod" ? metric.mod.unit : "";
    const isRate = kind === "rate";
    const valuesOf = (subset: Entry[]) =>
      subset
        .map((e) => valueByEntry.get(e.id))
        .filter((v): v is number => v !== undefined);
    const aggregate = (subset: Entry[]): number =>
      metric.type === "count" ? subset.length : sumOrAvg(valuesOf(subset), kind);
    const averageOf = (subset: Entry[]): number => average(valuesOf(subset));
    const filledCount = (subset: Entry[]): number =>
      metric.type === "count" ? subset.length : valuesOf(subset).length;

    const fillBucket = (bucket: DayBucket, subset: Entry[]) => {
      bucket.value = aggregate(subset);
      // Oranda çubuk yığılır: alt parça evet, üstteki soluk parça hayır
      if (isRate) bucket.rest = filledCount(subset) - bucket.value;
    };

    const valueLabelOf = (entryId: string): string | undefined => {
      if (metric.type !== "mod") return undefined;
      const raw = rawByEntry.get(entryId);
      if (kind === "rate") {
        return raw === undefined
          ? undefined
          : raw === "true"
            ? t("entry.yes")
            : t("entry.no");
      }
      // Metinde okunacak şey sayı değil yazının kendisi
      if (kind === "presence") return raw?.trim() || undefined;
      const n = valueByEntry.get(entryId);
      if (n === undefined) return undefined;
      return `${fmtNum(n)}${unit ? ` ${unit}` : ""}`;
    };

    return {
      valueByEntry,
      aggregate,
      averageOf,
      filledCount,
      fillBucket,
      valueLabelOf,
      kind,
      unit,
      displayMode:
        metric.type === "mod" ? displayModeOf(metric.mod.kind) : undefined,
      aggregateNote:
        metric.type !== "mod"
          ? undefined
          : kind === "scale"
            ? t("stat.average")
            : isRate
              ? t("entry.yes")
              : kind === "presence"
                ? t("stat.written")
                : t("stat.total"),
      isRate,
    };
  }, [data, metric, t]);

  return { data, metric, setMetricChoice, compute };
}
