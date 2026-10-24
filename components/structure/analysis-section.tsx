"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { BarChart3, Check, ChevronDown, RotateCcw, SlidersHorizontal } from "lucide-react";
import { db } from "@/lib/db";
import {
  clearAnalysisView,
  listScopeMods,
  measureOf,
  resolveAnalysisViews,
  setAnalysisView,
  type ResolvedAnalysisView,
} from "@/lib/db/queries";
import {
  ANALYSIS_OPTIONS,
  CHARTS_FOR,
  MAX_CHARTS,
  MAX_STATS,
  STATS_FOR,
  ZERO_FILL_KINDS,
  analysisGroupOf,
  kindOfGroup,
  optionOfView,
  resolveView,
  type AnalysisGroup,
  type AnalysisOption,
} from "@/lib/analytics";
import { MEASURE_KIND_META, type MeasureUiKind } from "@/lib/measure-kinds";
import { modColor } from "@/lib/mod-color";
import { useT, type MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { STAT_LABEL } from "@/components/analytics/stat-tiles";
import { ModAtomCore, modAtomIcon } from "@/components/structure/mod-atom";
import { useIsBrutal } from "@/components/structure/brutal";
import { Layer } from "@/components/ui/layer";
import type { ChartKind, Mod, StatKey } from "@/types";

/** Grupların sırası — sayısal olanlar önce, etiketliler sonra */
const GROUPS: AnalysisGroup[] = ["number", "duration", "scale", "rate", "choice", "presence", "object"];

/** Grubun başlığındaki simge — ölçü türünün simgesiyle aynı */
const GROUP_ICON: Record<AnalysisGroup, MeasureUiKind> = {
  number: "number",
  duration: "datetime-range",
  scale: "scale",
  rate: "boolean",
  choice: "select",
  presence: "text",
  object: "object",
};

/** Grafik adları (analysis-chart'takiyle aynı sözcükler; o modül grafik
 *  kütüphanesini taşıdığı için yapı sayfasına çekilmiyor) */
const CHART_LABEL: Record<ChartKind, MessageKey> = {
  bar: "chart.bar",
  line: "chart.line",
  cumulative: "chart.cumulative",
  points: "chart.points",
  distribution: "chart.distribution",
};

type Row = {
  mod: Mod;
  count: number;
  group: AnalysisGroup;
  view?: ResolvedAnalysisView;
  /** Kendi seçimi silinirse düşeceği üst seçim */
  parentView?: ResolvedAnalysisView;
};

/**
 * Analiz bölümü — kalemin özelliklerinin nasıl inceleneceğini kullanıcı
 * seçiyor. Özellikler ölçü türüne göre gruplu, çünkü sorulabilecek soruyu
 * tür belirliyor; hangisinin sorulacağını ise yalnız kullanıcı biliyor.
 *
 * Seçim analiz sayfasının kapsam tercihine (analysisViews) yazılır; analiz
 * sayfası kutuları ve grafikleri buradan açar. Kategoride yapılan seçim alt
 * kalemlere miras geçer (bkz. resolveAnalysisViews).
 */
export function AnalysisSection({
  categoryId,
  subcategoryId,
}: {
  categoryId: string;
  /** Verilirse alt kalemin bölümü; yoksa kategorininki */
  subcategoryId?: string;
}) {
  const t = useT();
  const brutal = useIsBrutal();
  const [open, setOpen] = useState<string | null>(null);
  const [tune, setTune] = useState(false);
  const scopeType = subcategoryId ? "subcategory" : "category";
  const scopeId = subcategoryId ?? categoryId;

  const data = useLiveQuery(async () => {
    const [mods, views] = await Promise.all([
      listScopeMods(categoryId, subcategoryId),
      resolveAnalysisViews(categoryId, subcategoryId),
    ]);
    // Üst kapsamın seçimleri: kendi seçimi silinince ne olacağını söylemek için
    let parentViews = new Map<string, ResolvedAnalysisView>();
    const names = new Map<string, string>();
    if (subcategoryId) {
      const sub = await db.subcategories.get(subcategoryId);
      parentViews = await resolveAnalysisViews(categoryId, sub?.parentId);
      const cat = await db.categories.get(categoryId);
      if (cat) names.set(cat.id, cat.name);
      for (const s of await db.subcategories.where("categoryId").equals(categoryId).toArray())
        names.set(s.id, s.name);
    }
    const rows: Row[] = mods.map(({ mod, count }) => ({
      mod,
      count,
      group: analysisGroupOf(mod.valueType, mod.choices),
      view: views.get(mod.id),
      parentView: subcategoryId ? parentViews.get(mod.id) : undefined,
    }));
    return { rows, names };
  }, [categoryId, subcategoryId]);

  if (!data) return null;
  const { rows, names } = data;

  const card = brutal
    ? "rounded-2xl border-2 border-[#111] bg-white shadow-[4px_4px_0_#111]"
    : "rounded-2xl bg-[var(--sf-2)]";

  return (
    <Layer label={t("an.section")} className="mb-6">
    <section data-analysis-section="">
      {!brutal && (
      <h2 className="px-1 mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {t("an.section")}
      </h2>
      )}
      <p className={cn("mb-3 px-1 text-[13px] leading-snug", brutal ? "text-[#111]/70" : "text-muted-foreground")}>
        {t(subcategoryId ? "an.sectionHintSub" : "an.sectionHint")}
      </p>

      {!rows.length && (
        <div className={cn(card, "px-4 py-5 text-center text-[13px] text-muted-foreground")}>
          {t("an.empty")}
        </div>
      )}

      <div className="flex flex-col gap-4">
        {GROUPS.map((g) => {
          const list = rows.filter((r) => r.group === g);
          if (!list.length) return null;
          const GIcon = MEASURE_KIND_META[GROUP_ICON[g]].icon;
          return (
            <div key={g}>
              <div
                className={cn(
                  "mb-1.5 flex items-center gap-1.5 px-1 text-[11px] font-bold uppercase tracking-[0.08em]",
                  brutal ? "text-[#111]" : "text-muted-foreground"
                )}
              >
                <GIcon className="h-3.5 w-3.5" />
                {t(`an.group.${g}` as MessageKey)}
              </div>
              <div className="flex flex-col gap-2.5">
                {list.map((r) => (
                  <ModAnalysisCard
                    key={r.mod.id}
                    row={r}
                    card={card}
                    brutal={brutal}
                    expanded={open === r.mod.id}
                    tune={tune}
                    sourceName={r.view?.inherited ? names.get(r.view.targetId) : undefined}
                    parentName={r.parentView ? names.get(r.parentView.targetId) : undefined}
                    onToggle={() => {
                      setOpen(open === r.mod.id ? null : r.mod.id);
                      setTune(false);
                    }}
                    onTune={() => setTune(!tune)}
                    scopeType={scopeType}
                    scopeId={scopeId}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
    </Layer>
  );
}

function ModAnalysisCard({
  row,
  card,
  brutal,
  expanded,
  tune,
  sourceName,
  parentName,
  onToggle,
  onTune,
  scopeType,
  scopeId,
}: {
  row: Row;
  card: string;
  brutal: boolean;
  expanded: boolean;
  tune: boolean;
  /** Seçim üstten geliyorsa üstün adı */
  sourceName?: string;
  /** Kendi seçimi silinince geçerli olacak üst seçimin sahibi */
  parentName?: string;
  onToggle: () => void;
  onTune: () => void;
  scopeType: "category" | "subcategory";
  scopeId: string;
}) {
  const t = useT();
  const { mod, count, group, view } = row;
  const kind = kindOfGroup(group);
  const options = ANALYSIS_OPTIONS[group];
  const current = optionOfView(group, view, mod.analysis);
  const currentOpt = options.find((o) => o.key === current.key) ?? options[0];
  const resolved = resolveView(kind, mod.analysis, view);
  const color = modColor(mod);
  const own = !!view && !view.inherited;

  // Her yazımda görünen bütün tercih taşınır: seçim üstten miras geliyorsa
  // bu kalemde yeni satır açılır, eksik alan varsayılana düşmesin
  const save = (patch: { option?: string; stats: StatKey[]; charts: ChartKind[]; emptyAsZero?: boolean }) =>
    setAnalysisView(scopeType, scopeId, mod.id, {
      option: patch.option ?? currentOpt.key,
      emptyAsZero: patch.emptyAsZero ?? resolved.emptyAsZero,
      stats: patch.stats,
      charts: patch.charts,
    });
  const zeroFill = ZERO_FILL_KINDS.includes(kind);

  const pick = (o: AnalysisOption) => void save({ option: o.key, stats: o.stats, charts: o.charts });

  const toggleStat = (k: StatKey) => {
    const has = resolved.stats.includes(k);
    if (!has && resolved.stats.length >= MAX_STATS) return;
    const next = has ? resolved.stats.filter((x) => x !== k) : [...resolved.stats, k];
    void save({ stats: next, charts: resolved.charts });
  };
  const toggleChart = (c: ChartKind) => {
    const has = resolved.charts.includes(c);
    // En az bir grafik kalsın — boş pano "bozuk" gibi okunuyor
    if (has && resolved.charts.length <= 1) return;
    if (!has && resolved.charts.length >= MAX_CHARTS) return;
    const next = has ? resolved.charts.filter((x) => x !== c) : [...resolved.charts, c];
    void save({ stats: resolved.stats, charts: next });
  };

  const chip = (on: boolean) =>
    cn(
      "rounded-full px-2.5 py-1 text-[12px] font-semibold transition-colors",
      brutal
        ? on
          ? "border-2 border-[#111] bg-[#111] text-white"
          : "border-2 border-[#111] bg-white text-[#111]"
        : on
          ? "bg-foreground text-background"
          : "bg-muted text-muted-foreground"
    );

  return (
    <div className={cn(card, "overflow-hidden")}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
      >
        <ModAtomCore icon={modAtomIcon({ name: mod.name, entryType: measureOf(mod) })} size="sm" color={color} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-bold leading-tight">{mod.name}</span>
          <span className={cn("block text-[12px] leading-tight", brutal ? "text-[#111]/60" : "text-muted-foreground")}>
            {count ? t("an.values", { n: count }) : t("an.noValues")}
            {resolved.emptyAsZero && ` · ${t("an.emptyAsZeroBadge")}`}
            {sourceName && ` · ${t("an.inherited", { name: sourceName })}`}
          </span>
        </span>
        <span
          className={cn(
            "shrink-0 rounded-lg px-2 py-1 text-[12px] font-bold",
            brutal ? "border-2 border-[#111] bg-[#ffd23f] text-[#111]" : "bg-muted text-foreground"
          )}
        >
          {current.custom ? t("an.custom") : t(currentOpt.label)}
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", expanded && "rotate-180")} />
      </button>

      {expanded && (
        <div className={cn("px-3 pb-3", brutal ? "border-t-2 border-[#111] pt-3" : "pt-1")}>
          <div role="radiogroup" className="flex flex-col gap-2">
            {options.map((o) => {
              const on = !current.custom && o.key === current.key;
              return (
                <button
                  key={o.key}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => pick(o)}
                  className={cn(
                    "flex w-full items-start gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors",
                    brutal
                      ? on
                        ? "border-2 border-[#111] bg-[#ffd23f] shadow-[2px_2px_0_#111]"
                        : "border-2 border-[#111]/15 bg-[#f5f1e8]"
                      : on
                        ? "bg-foreground/10 ring-1 ring-foreground/30"
                        : "bg-muted/50"
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2",
                      brutal ? "border-[#111]" : "border-foreground/40",
                      on && (brutal ? "bg-[#111]" : "border-foreground bg-foreground")
                    )}
                  >
                    {on && <Check className={cn("h-3 w-3", brutal ? "text-[#ffd23f]" : "text-background")} strokeWidth={3.5} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-bold leading-tight">{t(o.label)}</span>
                    <span className={cn("mt-0.5 block text-[12px] leading-snug", brutal ? "text-[#111]/70" : "text-muted-foreground")}>
                      {t(o.hint)}
                    </span>
                    {/* Neyin çıkacağı: kutular ve grafik */}
                    <span className={cn("mt-1.5 flex flex-wrap items-center gap-x-1.5 text-[11px] font-semibold leading-snug", brutal ? "text-[#111]/55" : "text-muted-foreground/70")}>
                      <span>{o.stats.map((k) => t(STAT_LABEL[k])).join(" · ")}</span>
                      <span className="inline-flex items-center gap-1">
                        <BarChart3 className="h-3 w-3" />
                        {o.charts.map((c) => t(CHART_LABEL[c])).join(", ")}
                      </span>
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          {current.custom && (
            <p className={cn("mt-2 px-1 text-[12px]", brutal ? "text-[#111]/70" : "text-muted-foreground")}>
              {t("an.customHint")}
            </p>
          )}

          <div className="mt-3 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={onTune}
              aria-expanded={tune}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-2 py-1 text-[13px] font-bold",
                brutal ? "text-[#111]" : "text-muted-foreground"
              )}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              {t("an.fineTune")}
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", tune && "rotate-180")} />
            </button>
            {own && (
              <button
                type="button"
                onClick={() => void clearAnalysisView(scopeType, scopeId, mod.id)}
                className={cn(
                  "flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] font-semibold",
                  brutal ? "text-[#111]/70" : "text-muted-foreground"
                )}
              >
                <RotateCcw className="h-3 w-3" />
                {parentName ? t("an.resetInherited", { name: parentName }) : t("an.reset")}
              </button>
            )}
          </div>

          {tune && (
            <div className="mt-2 flex flex-col gap-3 px-1">
              {/* Ayarlar — özelliğin bu kalemde nasıl hesaplanacağı (türe göre) */}
              {zeroFill && (
                <div>
                  <div className={cn("mb-1.5 text-[11px] font-bold uppercase tracking-[0.08em]", brutal ? "text-[#111]/70" : "text-muted-foreground")}>
                    {t("an.settings")}
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={resolved.emptyAsZero}
                    onClick={() => void save({ stats: resolved.stats, charts: resolved.charts, emptyAsZero: !resolved.emptyAsZero })}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left",
                      brutal ? "border-2 border-[#111] bg-[#f5f1e8]" : "bg-muted/50"
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-bold leading-tight">{t("an.emptyAsZero")}</span>
                      <span className={cn("mt-0.5 block text-[12px] leading-snug", brutal ? "text-[#111]/70" : "text-muted-foreground")}>
                        {t("an.emptyAsZeroHint")}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "relative mt-0.5 h-6 w-10 shrink-0 rounded-full transition-colors",
                        brutal ? "border-2 border-[#111]" : "",
                        resolved.emptyAsZero ? (brutal ? "bg-[#7be08a]" : "bg-foreground") : brutal ? "bg-white" : "bg-muted-foreground/30"
                      )}
                    >
                      <span
                        className={cn(
                          "absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full transition-all",
                          brutal ? "border-2 border-[#111] bg-white" : "bg-background",
                          resolved.emptyAsZero ? "right-0.5" : "left-0.5"
                        )}
                      />
                    </span>
                  </button>
                </div>
              )}
              <div>
                <div className={cn("mb-1.5 text-[11px] font-bold uppercase tracking-[0.08em]", brutal ? "text-[#111]/70" : "text-muted-foreground")}>
                  {t("an.tiles")} <span className="font-mono">{resolved.stats.length}/{MAX_STATS}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(STATS_FOR[kind] ?? []).map((k) => (
                    <button key={k} type="button" aria-pressed={resolved.stats.includes(k)} onClick={() => toggleStat(k)} className={chip(resolved.stats.includes(k))}>
                      {t(STAT_LABEL[k])}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className={cn("mb-1.5 text-[11px] font-bold uppercase tracking-[0.08em]", brutal ? "text-[#111]/70" : "text-muted-foreground")}>
                  {t("an.charts")} <span className="font-mono">{resolved.charts.length}/{MAX_CHARTS}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(CHARTS_FOR[kind] ?? []).map((c) => (
                    <button key={c} type="button" aria-pressed={resolved.charts.includes(c)} onClick={() => toggleChart(c)} className={chip(resolved.charts.includes(c))}>
                      {t(CHART_LABEL[c])}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
