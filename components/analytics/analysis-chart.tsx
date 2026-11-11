"use client";

import { Fragment } from "react";
import { AreaChart, BarChart3, BarChartHorizontal, LineChart, Pencil, PieChart, Plus, ScatterChart, type LucideIcon } from "lucide-react";
import { SummaryBlock, SummaryTile } from "@/components/ui/summary-block";
import {
  chartFormsFor,
  dayKey,
  daysIn,
  fmtEntryDateTime,
  formOf,
  MAX_CHARTS,
  shortMonth,
  type DayBucket,
  type FormContext,
  type ScaleRange,
} from "@/lib/analytics";
import { useT, type MessageKey } from "@/lib/i18n";
import { DailyBarChart, type TimeAxis } from "./daily-bar-chart";
import { ChoiceDistribution } from "./choice-distribution";
import { ChoiceDonut } from "./choice-donut";
import { ViewMenu } from "./view-menu";
import { useIsBrutal } from "@/components/structure/brutal";
import type { ChartForm, ChartKind, Entry } from "@/types";

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

/** Çizim biçiminin adı, açıklaması ve simgesi — "Nasıl" menüsü */
export const FORM_LABEL: Record<ChartForm, MessageKey> = {
  column: "form.column",
  line: "form.line",
  area: "form.area",
  dots: "form.dots",
  hbar: "form.hbar",
  donut: "form.donut",
};
const FORM_HINT: Record<ChartForm, MessageKey> = {
  column: "form.columnHint",
  line: "form.lineHint",
  area: "form.areaHint",
  dots: "form.dotsHint",
  hbar: "form.hbarHint",
  donut: "form.donutHint",
};
const FORM_ICON: Record<ChartForm, LucideIcon> = {
  column: BarChart3,
  line: LineChart,
  area: AreaChart,
  dots: ScatterChart,
  hbar: BarChartHorizontal,
  donut: PieChart,
};
/** Seri biçiminin DailyBarChart karşılığı */
const VARIANT: Record<ChartForm, "bar" | "line" | "area" | "dots"> = {
  column: "bar",
  line: "line",
  area: "area",
  dots: "dots",
  hbar: "bar",
  donut: "bar",
};

/** Noktalı grafikte en fazla kaç girdi — daha fazlası okunmuyor, kaydırıyor */
const MAX_POINTS = 60;

/** Henüz gelmemiş kova — eksende yeri durur ama hiçbir okuma çizilmez */
const ahead = (b: DayBucket, now: number) => b.start !== undefined && b.start > now;

/**
 * Grafiğin kovadan okuduğu rakam. X ekseni zamanın kendisi: her kova
 * (kaydı olmayan hafta da) yerini korur. `hasData` "burada çizilecek bir
 * okuma var mı": toplamda geçmişteki boş kova GERÇEK 0'dır (o hafta
 * antrenman yok = 0 dk), ortalamada boş kovanın değeri yoktur — çizgi orada
 * kesilir; gelecekteki kova hiçbirinde çizilmez. Eskiden boş haftanın
 * iki yanı birleştiriliyor, grafik o hafta hiç yokmuş gibi akıyordu.
 */
function seriesOf(kind: ChartKind, buckets: DayBucket[], emptyAsZero = false, scale = false): DayBucket[] {
  const now = Date.now();
  if (kind === "line") {
    // "Boş günler 0": kovanın değeri gün başına — kaydı olmayan gün 0, çizgi
    // boş günde 0'a iner; henüz gelmemiş günler hiç çizilmez
    if (emptyAsZero) {
      return buckets.map((b) => {
        const days = b.start !== undefined && b.end !== undefined ? daysIn(b.start, b.end).length : 0;
        return { ...b, value: days ? (b.sum ?? 0) / days : 0, hasData: days > 0 };
      });
    }
    return buckets.map((b) => ({ ...b, value: b.avg ?? 0, hasData: !!b.hasData && !ahead(b, now) }));
  }
  if (kind === "cumulative") {
    let run = 0;
    return buckets.map((b) => {
      run += b.sum ?? 0;
      // Birikmiş toplam boş günlerde de geçerlidir, düz devam eder — ama
      // bugünde durur; gelecekteki düz çizgi veri varmış gibi okunuyordu
      return { ...b, value: run, hasData: !ahead(b, now) };
    });
  }
  // Skalada boş kova 0 puan değil, veri yok (bkz. DayBucket.hasData)
  return buckets.map((b) => ({ ...b, value: b.sum ?? b.value, hasData: scale ? b.hasData : !ahead(b, now) }));
}

/**
 * Girdi girdi seri — her kayıt kendi noktası, ZAMAN ekseninde tarihine göre
 * (eşit aralıkla dizmek kayıtsız haftayı yok ediyordu). Aralarında kaydı
 * olmayan en az bir kova (haftalık görünümde hafta, günlükte gün) kalan iki
 * kayıt birleşmez: araya delik konur, çizgi orada kesilir — kovalı
 * grafiklerle aynı kural. "Boş günler 0" açıksa kaydı olmayan her gün de 0
 * noktası olur (o zaman delik yok, boş gün gerçek 0).
 */
function pointsOf(
  entries: Entry[],
  valueByEntry: Map<string, number>,
  buckets: DayBucket[],
  emptyAsZero = false
): { data: DayBucket[]; time?: TimeAxis } {
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
  const shown = pts.sort((a, b) => a.at - b.at).slice(-MAX_POINTS);
  const spans = buckets.filter(
    (b): b is DayBucket & { start: number; end: number } => b.start !== undefined && b.end !== undefined
  );
  const idxOf = (at: number) => spans.findIndex((b) => at >= b.start && at < b.end);
  const data: DayBucket[] = [];
  shown.forEach((p, i) => {
    if (i) {
      const prev = shown[i - 1];
      const a = idxOf(prev.at);
      if (a >= 0 && idxOf(p.at) - a > 1)
        data.push({ key: `gap-${p.key}`, label: "", axisLabel: "", full: "", value: 0, hasData: false, at: (prev.at + p.at) / 2 });
    }
    const label = fmtEntryDateTime(p.at).split(" · ")[0];
    data.push({ key: p.key, label, axisLabel: label, full: p.full, value: p.value, hasData: true, at: p.at });
  });
  if (!spans.length || !shown.length) return { data };

  // Eksen kovaların aralığı (gelecek kovalar da — öteki grafiklerle aynı
  // çerçeve); son MAX_POINTS kayda kırpıldıysa ilk gösterilen kaydın kovasından
  const from = pts.length > shown.length ? Math.max(0, idxOf(shown[0].at)) : 0;
  const axis = spans.slice(from);
  const monthly = axis[0].periodKey?.startsWith("m-");
  const step = axis.length > 7 ? Math.ceil(axis.length / 6) : 1;
  const ticks: TimeAxis["ticks"] = [];
  let lastMonth = -1;
  let lastYear = -1;
  axis.forEach((b, i) => {
    if (i % step) return;
    const d = new Date(b.start);
    // Ay (ayda yıl) değişince adı yazılır, aynı ayda sade gün numarası
    const label = monthly
      ? d.getFullYear() !== lastYear
        ? `${shortMonth(d.getMonth())} ${String(d.getFullYear()).slice(2)}`
        : shortMonth(d.getMonth())
      : d.getMonth() !== lastMonth
        ? `${shortMonth(d.getMonth())} ${d.getDate()}`
        : `${d.getDate()}`;
    lastMonth = d.getMonth();
    lastYear = d.getFullYear();
    ticks.push({ at: b.start, label });
  });
  return { data, time: { domain: [axis[0].start, axis[axis.length - 1].end], ticks } };
}

export function AnalysisCharts({
  charts,
  options,
  onPick,
  forms,
  formCtx,
  onPickForm,
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
  /**
   * NASIL: grafiklerin kayıtlı çizim biçimi (türe göre) ve seçimi. "Ne"
   * (Düzenle) grafiğin hesabını seçiyor — toplam, ortalama, dağılım;
   * bu onun nasıl çizileceğini — sütun, çizgi, alan, halka. Bağlamda
   * sunulamayan biçim seçiliyse türün varsayılanı çizilir.
   */
  forms?: Partial<Record<ChartKind, ChartForm>>;
  formCtx?: FormContext;
  onPickForm?: (kind: ChartKind, form: ChartForm) => void;
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

  // Biçimin bağlamı: dağılımdaki ayrı değer sayısı çizim anında belli
  const ctx: FormContext = { ...(formCtx ?? { kind: "number" }), slices: distribution.length };
  const formFor = (kind: ChartKind) => formOf(kind, forms, ctx);

  /** NASIL — grafiğin çizim biçimi. Tek biçim kaldıysa düğme hiç yok. */
  const formMenu = (kind: ChartKind) => {
    const opts = chartFormsFor(kind, ctx);
    if (!onPickForm || opts.length < 2) return null;
    const cur = formFor(kind);
    const Icon = FORM_ICON[cur];
    return (
      <ViewMenu
        label={t("board.chartForm")}
        value={cur}
        options={opts.map((f) => ({ key: f, label: t(FORM_LABEL[f]), hint: t(FORM_HINT[f]) }))}
        onPick={(k) => onPickForm(kind, k as ChartForm)}
        triggerClassName={
          brutal
            ? "flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] border-[1.5px] border-[#111] bg-white text-[#111] active:bg-[#111]/10"
            : "-mt-1 flex h-7 shrink-0 items-center gap-1 rounded-full bg-[var(--sf-2)] px-2.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-[var(--sf-3)] hover:text-foreground"
        }
      >
        {brutal ? (
          <Icon className="h-3.5 w-3.5" strokeWidth={2.5} />
        ) : (
          <>
            <Icon className="h-3 w-3" />
            {t(FORM_LABEL[cur])}
          </>
        )}
      </ViewMenu>
    );
  };

  const chartOf = (kind: ChartKind, cells = false) => {
    const form = formFor(kind);
    if (kind === "distribution") {
      return form === "donut" ? (
        <ChoiceDonut
          cells={cells}
          rows={distribution}
          color={color}
          selected={choiceFilter ?? null}
          onSelect={onChoiceFilter ?? (() => {})}
        />
      ) : (
        <ChoiceDistribution
          cells={cells}
          rows={distribution}
          color={color}
          selected={choiceFilter ?? null}
          onSelect={onChoiceFilter ?? (() => {})}
        />
      );
    }
    // Yığın (evet/hayır) ve kovaya inme yalnız toplamın sütununda
    const column = kind === "bar" && form === "column";
    const pts = kind === "points" ? pointsOf(entries, valueByEntry, buckets, emptyAsZero) : null;
    const chart = (
      <DailyBarChart
        data={pts ? pts.data : seriesOf(kind, buckets, emptyAsZero, !!scale)}
        timeAxis={pts?.time}
        color={color}
        unit={unit}
        caption={kind === "points" ? undefined : caption}
        showAllTicks={kind === "points" ? false : showAllTicks}
        scale={scale}
        stack={column ? stack : undefined}
        variant={VARIANT[form]}
        onSelect={column ? onSelect : undefined}
      />
    );
    return cells ? <div className="px-3 pb-2 pt-3">{chart}</div> : chart;
  };

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
                {formMenu(kind)}
                {canEdit && editMenu(kind, slot)}
              </div>
              {chartOf(kind, true)}
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
              {formMenu(kind)}
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
            {formMenu(kind)}
            {editMenu(kind, slot)}
          </div>
          )}

          {chartOf(kind)}
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
