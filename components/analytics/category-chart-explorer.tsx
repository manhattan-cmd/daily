"use client";

import { createElement, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { ListOrdered } from "lucide-react";
import { db } from "@/lib/db";
import { translate, useT } from "@/lib/i18n";
import { SymbolIcon } from "@/lib/icons";
import { modColor } from "@/lib/mod-color";
import {
  bucketKeyOf,
  buildSeriesBuckets,
  chartFormsFor,
  chooseGranularity,
  formOf,
  startOfDayMs,
  type DayBucket,
  type Granularity,
} from "@/lib/analytics";
import type { Period } from "@/lib/period";
import { routes } from "@/lib/routes";
import { modAtomIcon } from "@/components/structure/mod-atom";
import { useIsBrutal } from "@/components/structure/brutal";
import type { Category, ChartForm, ChartKind, Entry, Mod, SubCategory } from "@/types";
import { CHART_HINT, CHART_LABEL, FORM_HINT, FORM_ICON, FORM_LABEL, explorerVariantOf, seriesOf } from "./analysis-chart";
import {
  ChartExplorer,
  ExplorerOption,
  ExplorerSection,
  type ExplorerPicker,
  type ExplorerReading,
  type ExplorerSeries,
  type ExplorerWindow,
} from "./chart-explorer";
import { useCategoryMetrics } from "./use-category-metrics";

const DAY = 86400000;
/** Günlük kovada güvenlik sınırı — 40 yıl */
const MAX_BUCKETS = 15000;

const READING: Record<Exclude<ChartKind, "distribution">, ExplorerReading> = {
  bar: "total",
  line: "average",
  points: "average",
  cumulative: "cumulative",
};
/** İnceleme ekranının çizebildiği biçimler (yatay çubuk ve halka zamanı çizmiyor) */
const DRAWABLE: ChartForm[] = ["column", "line", "area", "dots"];

const atomIcon = (m: Mod) => modAtomIcon({ name: m.name, entryType: { valueType: m.valueType } as never });

/**
 * Grafik inceleme ekranı, kategori panelinden açılınca — genel grafik aracı:
 * başlık şeridindeki seçicilerle yer, özellik, grafik türü ve çizim biçimi
 * burada değişir (panelin kayıtlı grafiklerine dokunmaz). Açılışta panelin
 * baktığı yer, özellik ve grafik.
 *
 * Veri BÜTÜN geçmişten (gün, hafta, ay kovaları); panel yalnız seçili dönemi
 * okuyor. Açılış penceresi panelin dönemi: haftada ve ayda günler, yılda
 * haftalar.
 */
export function CategoryChartExplorer({
  category,
  rootSubId,
  metricId,
  excludeRegular,
  choiceFilter,
  kind,
  form,
  period,
  onClose,
}: {
  category: Category;
  rootSubId?: string;
  /** Panelin gösterdiği özellik ("count" = girdi sayısı) */
  metricId: string;
  excludeRegular: boolean;
  choiceFilter: string | null;
  kind: ChartKind;
  form: ChartForm;
  period: Period;
  onClose: () => void;
}) {
  const t = useT();
  const router = useRouter();
  const brutal = useIsBrutal();

  // Seçimler — açılışta panelinkiler
  const [place, setPlace] = useState<{ catId: string; subId?: string }>({ catId: category.id, subId: rootSubId });
  const [metricSel, setMetricSel] = useState(metricId);
  const [kindSel, setKindSel] = useState<ChartKind>(kind === "distribution" ? "bar" : kind);
  const [formSel, setFormSel] = useState<ChartForm>(form);

  const cats = useLiveQuery(() => db.categories.toArray(), []);
  const subs = useLiveQuery(() => db.subcategories.toArray(), []);
  const cat = cats?.find((c) => c.id === place.catId) ?? category;
  const subById = useMemo(() => new Map((subs ?? []).map((s) => [s.id, s])), [subs]);
  const focusSub = place.subId ? subById.get(place.subId) : undefined;

  const metrics = useCategoryMetrics({
    category: cat,
    rootSubId: place.subId,
    fetchStart: 0,
    resetKey: cat.id,
    preferredMetricId: metricSel,
    excludeRegular,
  });
  const { data, compute, metric } = metrics;
  const shownMetricId = metric.type === "count" ? "count" : metric.mod.id;

  // Seçenek süzgeci yalnız panelin baktığı şeye bakarken geçerli
  const sameAsPanel = place.catId === category.id && place.subId === rootSubId && shownMetricId === metricId;
  const setChoice = metrics.setChoiceFilter;
  useEffect(() => setChoice(sameAsPanel ? choiceFilter : null), [sameAsPanel, choiceFilter, setChoice]);

  // Tür ve biçim: seçim bu özellikte sunuluyorsa o, yoksa türün varsayılanı
  // Girdi sayısında panel grafik sunmuyor (sayı kutuları var); burada adedin
  // toplamı ve birikimi çizilir
  const isCount = metric.type === "count";
  const kindOptions: Exclude<ChartKind, "distribution">[] = isCount
    ? ["bar", "cumulative"]
    : (compute?.chartOptions ?? []).filter((k): k is Exclude<ChartKind, "distribution"> => k !== "distribution");
  const kindR: Exclude<ChartKind, "distribution"> =
    kindSel !== "distribution" && kindOptions.includes(kindSel) ? kindSel : (kindOptions[0] ?? "bar");
  const ctx = compute ? { ...compute.formCtx, slices: 0 } : { kind: "number" as const, slices: 0 };
  const formOptions = kindR === "points" ? [] : chartFormsFor(kindR, ctx).filter((f) => DRAWABLE.includes(f));
  const formDefault = formOf(kindR, compute?.chartForms, ctx);
  const formR: ChartForm = formOptions.includes(formSel)
    ? formSel
    : formOptions.includes(formDefault)
      ? formDefault
      : (formOptions[0] ?? "column");

  // Gösterilen veri — yer değişip yeni veri gelene kadar eskisi çizili kalır
  const fresh = useMemo<ExplorerSeries | undefined>(() => {
    if (!data || !compute) return undefined;
    const entries: Entry[] = data.entries;
    let first = Infinity;
    for (const e of entries) if (e.occurredAt < first) first = e.occurredAt;
    const now = new Date();
    const end = startOfDayMs(now) + DAY;
    // Başlangıç ilk kayıt; panelin dönemi daha erken başlıyorsa o (açılış
    // penceresi dönemin tamamını gösterebilsin)
    let start = startOfDayMs(new Date(Number.isFinite(first) ? first : now.getTime()));
    if (period.kind !== "all" && period.start < start) start = startOfDayMs(new Date(period.start));
    const seriesKind: ChartKind = kindR === "points" ? "line" : kindR;
    const build = (g: Granularity): DayBucket[] => {
      const buckets = buildSeriesBuckets(start, end, g, MAX_BUCKETS);
      const idx = new Map(buckets.map((b, i) => [b.key, i]));
      const lists: Entry[][] = buckets.map(() => []);
      for (const e of entries) {
        const i = idx.get(bucketKeyOf(e.occurredAt, g));
        if (i !== undefined) lists[i].push(e);
      }
      buckets.forEach((b, i) => {
        compute.fillBucket(b, lists[i]);
        // Girdi sayısında değerli kayıt yok, toplam kovanın kayıt adedi
        if (isCount) b.sum = b.value;
      });
      return seriesOf(seriesKind, buckets, compute.emptyAsZero, !!compute.scale);
    };
    return { day: build("day"), week: build("week"), month: build("month") };
  }, [data, compute, kindR, isCount, period.kind, period.start]);
  const [lastSeries, setLastSeries] = useState(fresh);
  if (fresh && fresh !== lastSeries) setLastSeries(fresh);
  const series = fresh ?? lastSeries;

  const initial = useMemo<ExplorerWindow>(() => {
    if (period.kind === "all") return { g: "month", start: -Infinity, end: Infinity };
    const g: Granularity =
      period.kind === "week" || period.kind === "month" || period.kind === "day"
        ? "day"
        : period.kind === "year"
          ? "week"
          : chooseGranularity(period.start, period.end) === "month"
            ? "week"
            : "day";
    return { g, start: period.start, end: period.end };
  }, [period.kind, period.start, period.end]);

  /* ——— Adlar ve karolar ——— */
  const catName = (c: Category) =>
    c.builtInKey === "mood" ? t("mood.title") : c.builtInKey === "sleep" ? t("sleep.title") : c.name;
  const placeName = focusSub ? focusSub.name : catName(cat);
  const rawMod = metric.type !== "count" ? data?.rawMods.get(metric.mod.id) : undefined;
  const lensColor = rawMod ? modColor(rawMod) : cat.color;
  const metricName = metric.type === "count" ? t("insights.entries") : metric.mod.name;
  const unit = metric.type === "count" ? translate("an.entriesUnit") : compute?.unit || undefined;

  const squareTile = (color: string, icon: string | undefined, size = 28) => (
    <span
      className="flex shrink-0 items-center justify-center rounded-[8px] border-2"
      style={{ width: size, height: size, background: color, borderColor: brutal ? "#111" : "transparent" }}
    >
      {icon && <SymbolIcon name={icon} size={Math.round(size * 0.55)} style={{ color: "#111" }} />}
    </span>
  );
  const roundTile = (color: string, node: ReactNode, size = 28) => (
    <span
      className="flex shrink-0 items-center justify-center rounded-full border-2 text-[#111]"
      style={{ width: size, height: size, background: color, borderColor: brutal ? "#111" : "transparent" }}
    >
      {node}
    </span>
  );
  const FormIcon = FORM_ICON[kindR === "points" ? "dots" : formR];

  /* ——— Seçici panelleri ——— */
  // Yer seçmek paneli kapatmaz — ardından özellik seçilebilsin
  const placeRows = () => {
    const rows: ReactNode[] = [];
    const list = (cats ?? [])
      .filter((c) => c.builtInKey !== "objects")
      .sort((a, b) => a.order - b.order);
    for (const c of list) {
      rows.push(
        <ExplorerOption
          key={c.id}
          selected={place.catId === c.id && !place.subId}
          onClick={() => setPlace({ catId: c.id })}
          tile={squareTile(c.color, c.icon, 26)}
          label={catName(c)}
        />
      );
      // Seçili kategorinin alt kalemleri, ağaç girintili
      if (c.id !== place.catId) continue;
      const walk = (parentId: string | undefined, depth: number) => {
        (subs ?? [])
          .filter((s: SubCategory) => s.categoryId === c.id && !s.isCategoryRoot && s.parentId === parentId)
          .sort((a, b) => a.order - b.order)
          .forEach((s) => {
            rows.push(
              <ExplorerOption
                key={s.id}
                depth={depth}
                selected={place.subId === s.id}
                onClick={() => setPlace({ catId: c.id, subId: s.id })}
                tile={squareTile(c.color, s.icon ?? c.icon, 22)}
                label={s.name}
              />
            );
            walk(s.id, depth + 1);
          });
      };
      walk(undefined, 1);
    }
    return rows;
  };
  const featureRows = (close: () => void) => {
    if (!data) return <p className="px-1 text-[13px] font-bold opacity-60">{t("explore.loading")}</p>;
    // Altı olan yerde bütün alt kalemlerde ortak özellikler (panelin seçicisi gibi)
    const common = data.commonModIds;
    const mods = data.mods.filter((m) => !common || common.has(m.id) || m.id === shownMetricId);
    return [
      <ExplorerOption
        key="count"
        selected={metric.type === "count"}
        onClick={() => {
          setMetricSel("count");
          close();
        }}
        tile={roundTile("#8ea6ff", <ListOrdered className="h-3.5 w-3.5" strokeWidth={2.5} />, 26)}
        label={t("insights.entries")}
      />,
      ...mods.map((m) => {
        const raw = data.rawMods.get(m.id);
        return (
          <ExplorerOption
            key={m.id}
            selected={shownMetricId === m.id}
            onClick={() => {
              setMetricSel(m.id);
              close();
            }}
            tile={roundTile(raw ? modColor(raw) : cat.color, raw ? createElement(atomIcon(raw), { className: "h-3.5 w-3.5", strokeWidth: 2.5 }) : null, 26)}
            label={m.name}
          />
        );
      }),
    ];
  };

  const pickers: ExplorerPicker[] = [
    {
      key: "data",
      label: focusSub ? `${catName(cat)} › ${placeName}` : placeName,
      value: metricName,
      tile: squareTile(cat.color, focusSub?.icon ?? cat.icon),
      grow: 1.35,
      title: t("explore.data"),
      render: (close) => (
        <>
          <ExplorerSection title={t("explore.place")}>{placeRows()}</ExplorerSection>
          <ExplorerSection title={t("explore.feature")}>{featureRows(close)}</ExplorerSection>
        </>
      ),
    },
    {
      key: "chart",
      label: t("explore.chart"),
      value: t(CHART_LABEL[kindR]),
      tile: (
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] border-2 text-[#111]"
          style={{ background: lensColor, borderColor: brutal ? "#111" : "transparent" }}
        >
          <FormIcon className="h-4 w-4" strokeWidth={2.5} />
        </span>
      ),
      title: t("explore.chart"),
      render: (close) => (
        <>
          <ExplorerSection title={t("board.chartType")}>
            {(kindOptions.length ? kindOptions : (["bar"] as const)).map((k) => (
              <ExplorerOption
                key={k}
                selected={k === kindR}
                onClick={() => {
                  setKindSel(k);
                  if (k === "points") close();
                }}
                label={t(CHART_LABEL[k])}
                hint={t(CHART_HINT[k])}
              />
            ))}
          </ExplorerSection>
          {formOptions.length > 1 && (
            <ExplorerSection title={t("board.chartForm")}>
              {formOptions.map((f) => {
                const Icon = FORM_ICON[f];
                return (
                  <ExplorerOption
                    key={f}
                    selected={f === formR}
                    onClick={() => {
                      setFormSel(f);
                      close();
                    }}
                    tile={
                      <span
                        className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[8px] border-2 bg-white text-[#111]"
                        style={{ borderColor: brutal ? "#111" : "transparent" }}
                      >
                        <Icon className="h-3.5 w-3.5" strokeWidth={2.5} />
                      </span>
                    }
                    label={t(FORM_LABEL[f])}
                    hint={t(FORM_HINT[f])}
                  />
                );
              })}
            </ExplorerSection>
          )}
        </>
      ),
    },
  ];

  return (
    <ChartExplorer
      open
      onClose={onClose}
      title={`${placeName} · ${metricName}`}
      color={lensColor}
      pickers={pickers}
      seriesLabel={metric.type === "count" ? translate("an.entriesUnit") : metric.mod.name}
      kindLabel={t(CHART_LABEL[kindR])}
      unit={unit}
      reading={READING[kindR]}
      variant={explorerVariantOf(kindR, formR)}
      series={series}
      scale={compute?.scale}
      stacked={!!compute?.isRate && kindR === "bar" && formR === "column"}
      initial={initial}
      onOpenPeriod={(key) => {
        onClose();
        router.push(routes.period(key), { scroll: false });
      }}
    />
  );
}
