"use client";

import { Fragment } from "react";
import { LineChart, Pencil, Plus } from "lucide-react";
import { SummaryBlock, SummaryTile } from "@/components/ui/summary-block";
import { dayKey, daysIn, fmtEntryDateTime, MAX_CHARTS, type DayBucket, type ScaleRange } from "@/lib/analytics";
import { useT, type MessageKey } from "@/lib/i18n";
import { DailyBarChart } from "./daily-bar-chart";
import { ChoiceDistribution } from "./choice-distribution";
import { ViewMenu } from "./view-menu";
import { useIsBrutal } from "@/components/structure/brutal";
import type { ChartKind, Entry } from "@/types";

/**
 * Panodaki grafikler — kullanıcının kurduğu liste.
 *
 * Aynı veriye birden çok soru sorulabiliyor: haftalık toplam çubuğu ile
 * birikimli çizgi yan yana durunca "bu hafta ne harcadım" ve "ay sonunda
 * nereye varırım" aynı ekranda cevaplanıyor. Her grafiğin başlığına
 * dokunmak türünü değiştiriyor ya da grafiği kaldırıyor; sondaki kesik
 * çerçeve yenisini ekliyor.
 *
 * Grafikler kovaların HAM okumalarından besleniyor (bucket.sum / .avg):
 * seri okumasını tek bir yere bağlamak, iki grafiği aynı anda göstermeyi
 * imkânsız kılıyordu.
 */

export const CHART_LABEL: Record<ChartKind, MessageKey> = {
  bar: "chart.bar",
  line: "chart.line",
  cumulative: "chart.cumulative",
  points: "chart.points",
  distribution: "chart.distribution",
};

export const CHART_HINT: Record<ChartKind, MessageKey> = {
  bar: "chart.barHint",
  line: "chart.lineHint",
  cumulative: "chart.cumulativeHint",
  points: "chart.pointsHint",
  distribution: "chart.distributionHint",
};

/** Noktalı grafikte en fazla kaç girdi — daha fazlası okunmuyor, kaydırıyor */
const MAX_POINTS = 60;

/** Grafiğin kovadan okuduğu rakam */
function seriesOf(kind: ChartKind, buckets: DayBucket[], emptyAsZero = false): DayBucket[] {
  if (kind === "line") {
    // "Boş günler 0": kovanın değeri gün başına — kaydı olmayan gün 0, çizgi
    // boş günde 0'a iner; henüz gelmemiş günler hiç çizilmez
    if (emptyAsZero) {
      return buckets.map((b) => {
        const days = b.start !== undefined && b.end !== undefined ? daysIn(b.start, b.end).length : 0;
        return { ...b, value: days ? (b.sum ?? 0) / days : 0, hasData: days > 0 };
      });
    }
    return buckets.map((b) => ({ ...b, value: b.avg ?? 0 }));
  }
  if (kind === "cumulative") {
    let run = 0;
    return buckets.map((b) => {
      run += b.sum ?? 0;
      // Birikimli çizgide "veri yok" diye bir kova olmaz: birikmiş toplam
      // boş günlerde de geçerlidir, düz devam eder
      return { ...b, value: run, hasData: true };
    });
  }
  return buckets.map((b) => ({ ...b, value: b.sum ?? b.value }));
}

/** Girdi girdi seri — her kayıt kendi noktası. "Boş günler 0" açıksa
 *  kovaların kapsadığı aralıkta kaydı olmayan her gün de 0 noktası olur. */
function pointsOf(
  entries: Entry[],
  valueByEntry: Map<string, number>,
  buckets: DayBucket[],
  emptyAsZero = false
): DayBucket[] {
  const pts: { key: string; at: number; value: number; full: string }[] = entries
    .filter((e) => valueByEntry.has(e.id))
    .map((e) => ({
      key: e.id,
      at: e.occurredAt,
      value: valueByEntry.get(e.id) ?? 0,
      full: fmtEntryDateTime(e.occurredAt),
    }));
  const first = buckets[0]?.start;
  const last = buckets[buckets.length - 1]?.end;
  if (emptyAsZero && first !== undefined && last !== undefined) {
    const used = new Set(pts.map((p) => dayKey(p.at)));
    for (const day of daysIn(first, last)) {
      if (used.has(day)) continue;
      const [y, m, d] = day.split("-").map(Number);
      const at = new Date(y, m - 1, d, 12).getTime();
      pts.push({ key: `zero-${day}`, at, value: 0, full: fmtEntryDateTime(at).split(" · ")[0] });
    }
  }
  return pts
    .sort((a, b) => a.at - b.at)
    .slice(-MAX_POINTS)
    .map((p) => {
      const label = fmtEntryDateTime(p.at).split(" · ")[0];
      return { key: p.key, label, axisLabel: label, full: p.full, value: p.value, hasData: true };
    });
}

export function AnalysisCharts({
  charts,
  options,
  onPick,
  buckets,
  entries,
  valueByEntry,
  distribution,
  choiceFilter,
  onChoiceFilter,
  color,
  unit,
  caption,
  showAllTicks,
  stack,
  scale,
  onSelect,
  title,
  emptyAsZero,
  block,
}: {
  /**
   * Brütal: grafikler tek blokta (bkz. SummaryBlock) — ince mavi başta
   * yalnız "Grafikler" (sayı yok), yanında dar yeşil + karosu; her grafiğin
   * başı grafiğin renginin açık tonunda ince bir şerit — adı ("Haftalık
   * Para"), yanında türü beyaz kapsülde ("Toplam"), sağda küçük kalem
   * (Düzenle) — çizimi hemen altında. Baş ve çizim tek hücre (aralarında
   * siyah çizgi yok); iki grafiğin arasında bloğun mavisinde ince şerit —
   * alt alta birkaç grafik olunca hangi başın hangi grafiğe ait olduğu
   * belli olsun. Eskiden baş da çizim de ayrı hücreydi, her şey aynı siyah
   * çizgiyle ayrılıyordu; ayrı kartlar da denendi, yapışık hali seçildi.
   * Değer bloğun etiketi.
   */
  block?: string;
  charts: ChartKind[];
  options: ChartKind[];
  onPick: (slot: number, kind: ChartKind | null) => void;
  buckets: DayBucket[];
  entries: Entry[];
  valueByEntry: Map<string, number>;
  /** Dağılım grafiği için etiket sayımları */
  distribution: { choice: string; count: number }[];
  choiceFilter?: string | null;
  onChoiceFilter?: (choice: string | null) => void;
  color: string;
  unit?: string;
  caption?: string;
  showAllTicks?: boolean;
  stack?: { valueLabel: string; restLabel: string };
  scale?: ScaleRange;
  /** Kayıt girilmeyen günler 0 sayılır (bkz. ResolvedView.emptyAsZero) */
  emptyAsZero?: boolean;
  onSelect?: (periodKey: string) => void;
  /** Grafiğin üstündeki bağlam: ana ad ("YÜRÜYÜŞ · HAFTALIK SÜRE") ve
   *  türün yanına eklenen kapsam ("· Tüm Zamanlar") */
  title: (kind: ChartKind) => { main: React.ReactNode; extra?: React.ReactNode };
}) {
  const t = useT();
  const brutal = useIsBrutal();
  const canEdit = options.length > 0;

  const editMenu = (kind: ChartKind, slot: number) => (
    <ViewMenu
      label={t("board.chartType")}
      value={kind}
      options={[
        ...options.map((o) => ({
          key: o,
          label: t(CHART_LABEL[o]),
          hint: t(CHART_HINT[o]),
        })),
        { key: "__remove__", label: t("board.remove"), danger: true },
      ]}
      onPick={(k) =>
        onPick(slot, k === "__remove__" ? null : (k as ChartKind))
      }
      triggerClassName={
        brutal
          ? "flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] border-[1.5px] border-[#111] bg-white text-[#111] active:bg-[#111]/10"
          : "-mr-1 -mt-1 flex h-7 shrink-0 items-center gap-1 rounded-full bg-[var(--sf-2)] px-2.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-[var(--sf-3)] hover:text-foreground"
      }
    >
      {brutal ? (
        <Pencil className="h-3 w-3" strokeWidth={2.75} />
      ) : (
        <>
          <Pencil className="h-3 w-3" />
          {t("action.edit")}
        </>
      )}
    </ViewMenu>
  );

  const chartOf = (kind: ChartKind) =>
    kind === "distribution" ? (
      <ChoiceDistribution
        rows={distribution}
        color={color}
        selected={choiceFilter ?? null}
        onSelect={onChoiceFilter ?? (() => {})}
      />
    ) : (
      <DailyBarChart
        data={
          kind === "points"
            ? pointsOf(entries, valueByEntry, buckets, emptyAsZero)
            : seriesOf(kind, buckets, emptyAsZero)
        }
        color={color}
        unit={unit}
        caption={kind === "points" ? undefined : caption}
        showAllTicks={kind === "points" ? false : showAllTicks}
        scale={scale}
        stack={kind === "bar" ? stack : undefined}
        variant={kind === "bar" ? "bar" : "line"}
        onSelect={kind === "bar" ? onSelect : undefined}
      />
    );

  if (block !== undefined) {
    const canAdd = canEdit && charts.length < MAX_CHARTS;
    return (
      <SummaryBlock
        compact
        lead={{ kind: "title", color: "#8ea6ff", glyph: LineChart, overline: block, title: block }}
        action={
          canAdd ? (
            <ViewMenu
              label={t("board.chartType")}
              value=""
              options={options.map((o) => ({ key: o, label: t(CHART_LABEL[o]), hint: t(CHART_HINT[o]) }))}
              onPick={(k) => onPick(-1, k as ChartKind)}
              pickSingle
            >
              <SummaryTile compact color="#7ae582" icon={Plus} label={t("board.addChartShort")} />
            </ViewMenu>
          ) : undefined
        }
        stats={[]}
      >
        {charts.map((kind, slot) => {
          const head = title(kind);
          return (
            <Fragment key={`${kind}-${slot}`}>
            {/* İki grafiğin arası: siyah çizgiler arasında mavi şerit */}
            {slot > 0 && <div aria-hidden data-chart-gap="" className="h-2" style={{ background: "#c8d4ff" }} />}
            <div data-chart-unit="" className="flex flex-col bg-white">
              <div
                data-chart-head=""
                className="flex min-h-[40px] items-center gap-2 py-1.5 pl-3.5 pr-2 text-[#111]"
                // Grafiğin renginin açık tonu — opak (bloğun ara çizgileri
                // siyah); altında aynı rengin ince çizgisi
                style={{
                  backgroundColor: "#fff",
                  backgroundImage: `linear-gradient(${color}2e, ${color}2e)`,
                  borderBottom: `1.5px solid ${color}66`,
                }}
              >
                <span className="min-w-0 truncate text-[13px] font-extrabold leading-tight tracking-tight">{head.main}</span>
                <span className="flex h-5 min-w-0 shrink items-center truncate rounded-full border-[1px] bg-white px-2 text-[10.5px] font-bold text-[#111]/70" style={{ borderColor: "rgba(17,17,17,0.22)" }}>
                  {t(CHART_LABEL[kind])}
                  {head.extra}
                </span>
                <span className="flex-1" />
                {canEdit && editMenu(kind, slot)}
              </div>
              {kind === "distribution" ? (
                <ChoiceDistribution
                  cells
                  rows={distribution}
                  color={color}
                  selected={choiceFilter ?? null}
                  onSelect={onChoiceFilter ?? (() => {})}
                />
              ) : (
                <div className="px-3 pb-2 pt-3">{chartOf(kind)}</div>
              )}
            </div>
            </Fragment>
          );
        })}
      </SummaryBlock>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {charts.map((kind, slot) => {
        const head = title(kind);
        return (
        <div key={`${kind}-${slot}`} className={brutal ? "flex flex-col gap-2" : undefined}>
          {/* Brütal: başlık kartın dışında, geniş alanda — siyah etikette ana
              ad, yanında tür ve kapsam düz yazı; kartın içinde sığmıyordu */}
          {brutal && (
            <div data-chart-head="" className="flex items-end gap-2">
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                <h3 className="text-xs font-semibold uppercase tracking-wider">{head.main}</h3>
                <span className="text-[11px] font-bold text-[#111]/60">
                  {t(CHART_LABEL[kind])}
                  {head.extra}
                </span>
              </div>
              {editMenu(kind, slot)}
            </div>
          )}
        <div className="rounded-2xl border border-border bg-card p-4">
          {/* Başlık + sağ üstte "Düzenle". Eskiden başlığın kendisi menüyü
              açıyordu; grafiğin üstüne dokunan kullanıcı istemeden pencere
              açıyordu. Grafik türü artık yalnız bu düğmeyle değişir. */}
          {!brutal && (
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {head.main}
                <span className="font-normal normal-case text-muted-foreground/60 underline decoration-dotted decoration-muted-foreground/40 underline-offset-[3px]">
                  {" "}
                  ({t(CHART_LABEL[kind])})
                </span>
                {head.extra}
              </h3>
            </div>
            {editMenu(kind, slot)}
          </div>
          )}

          {kind === "distribution" ? (
            <ChoiceDistribution
              rows={distribution}
              color={color}
              selected={choiceFilter ?? null}
              onSelect={onChoiceFilter ?? (() => {})}
            />
          ) : (
            <DailyBarChart
              data={
                kind === "points"
                  ? pointsOf(entries, valueByEntry, buckets, emptyAsZero)
                  : seriesOf(kind, buckets, emptyAsZero)
              }
              color={color}
              unit={unit}
              caption={kind === "points" ? undefined : caption}
              showAllTicks={kind === "points" ? false : showAllTicks}
              scale={scale}
              stack={kind === "bar" ? stack : undefined}
              variant={kind === "bar" ? "bar" : "line"}
              onSelect={kind === "bar" ? onSelect : undefined}
            />
          )}
        </div>
        </div>
        );
      })}

      {canEdit && charts.length < MAX_CHARTS && (
        <ViewMenu
          label={t("board.chartType")}
          value=""
          options={options.map((o) => ({
            key: o,
            label: t(CHART_LABEL[o]),
            hint: t(CHART_HINT[o]),
          }))}
          onPick={(k) => onPick(-1, k as ChartKind)}
              pickSingle
        >
          <div className="flex items-center justify-center gap-1.5 rounded-2xl border border-dashed border-border py-3 text-[12px] font-medium text-muted-foreground/70 transition-colors hover:border-muted-foreground/50 hover:text-foreground">
            <Plus className="h-3.5 w-3.5" />
            {t("board.addChart")}
          </div>
        </ViewMenu>
      )}
    </div>
  );
}
