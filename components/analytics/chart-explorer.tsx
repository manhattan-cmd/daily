"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { ArrowRight, BarChart3, Check, ChevronDown, ChevronLeft, ChevronRight, X, type LucideIcon } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ENTRY_SCREEN } from "@/components/ui/entry-window";
import { useIsBrutal } from "@/components/structure/brutal";
import { fmtNum, type DayBucket, type Granularity, type ScaleRange } from "@/lib/analytics";
import { intlTag, useLocale, useT, type MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * Grafik inceleme ekranı — grafiğin köşesindeki düğmeyle açılan tam ekran.
 *
 * Grafik odakta: tepede ince başlık, altında değeri okuyan panel, ekranın
 * geri kalanı grafik; altta aralık düğmeleri, kova ve adım düğmeleri.
 * Uygulamanın içinde bir katman (Ekle ekranı gibi, ENTRY_SCREEN): kapatınca
 * altındaki sayfa olduğu yerde, kaydırma konumu dahil.
 *
 * Hareketler (araştırma: TradingView, Apple Borsa, Robinhood, Highcharts):
 * - dokun: o kovayı seç (seçiliye dokununca kalkar)
 * - basılı tut, sürükle: tara — parmağın altındaki kova panelde okunur.
 *   Tarama basılı tutmayla başlar ki tek parmakla sürükleme kaydırmaya kalsın
 * - sürükle: zamanda gez; hızlı bırakınca süzülür
 * - iki parmak: yalnız zaman ekseninde yakınlaştır. Sınırda kova değişir —
 *   uzaklaşınca günlükten haftalığa, aylığa; yaklaşınca geri (Garmin
 *   kullanıcılarının "büyütünce yeni bir şey görünmüyor" şikâyeti)
 * - ‹ › tek tek, « » boşlukları atlayıp sonraki kayda
 *
 * Değer balonda değil panelde: parmak balonu örtüyordu. Zaman sürekliliği
 * korunur: kaydı olmayan kova eksende yerinde, toplamda 0, ortalamada çizgi
 * kesilir (bkz. analysis-chart seriesOf).
 */

export type ExplorerSeries = Record<Granularity, DayBucket[]>;
/** Okuma: kovaların toplamı mı, ortalaması mı, birikimi mi */
export type ExplorerReading = "total" | "average" | "cumulative";
export type ExplorerVariant = "bar" | "line" | "area" | "dots";
/** Açılışta görünen pencere — panelin dönemi [start, end) */
export type ExplorerWindow = { g: Granularity; start: number; end: number };

type PresetKey = "1w" | "1m" | "3m" | "1y" | "all";
type View = { g: Granularity; start: number; span: number; sel: number | null; preset: PresetKey | null };
type Gesture =
  | { type: "pending" | "pan" | "scrub"; x0: number; y0: number; start0: number }
  | { type: "pinch"; d0: number; span0: number; anchor: number }
  | { type: "none" };

const DAY = 86400000;
/** Görünen kova sayısının sınırları; aşılınca kova değişir */
const LIMITS: Record<Granularity, { min: number; max: number }> = {
  day: { min: 5, max: 120 },
  week: { min: 6, max: 60 },
  month: { min: 4, max: Infinity },
};
const DAYS_PER: Record<Granularity, number> = { day: 1, week: 7, month: 30.44 };
const UP: Record<Granularity, Granularity | null> = { day: "week", week: "month", month: null };
const DOWN: Record<Granularity, Granularity | null> = { day: null, week: "day", month: "week" };
/** Aralık düğmeleri kovayı da seçer (Apple Sağlık gibi): 1A günlük, 1Y haftalık, Tümü aylık */
const PRESETS: { key: PresetKey; g: Granularity; span: number; label: MessageKey }[] = [
  { key: "1w", g: "day", span: 7, label: "explore.p.1w" },
  { key: "1m", g: "day", span: 31, label: "explore.p.1m" },
  { key: "3m", g: "week", span: 13, label: "explore.p.3m" },
  { key: "1y", g: "week", span: 52, label: "explore.p.1y" },
  { key: "all", g: "month", span: Infinity, label: "explore.p.all" },
];
const GRAN_DEFAULT: Record<Granularity, number> = { day: 31, week: 13, month: Infinity };
const GRAN_LABEL: Record<Granularity, MessageKey> = { day: "explore.g.day", week: "explore.g.week", month: "explore.g.month" };
const UNIT_KEY: Record<Granularity, MessageKey> = { day: "explore.u.day", week: "explore.u.week", month: "explore.u.month" };
const AVG_KEY: Record<Granularity, MessageKey> = { day: "explore.c.avg.day", week: "explore.c.avg.week", month: "explore.c.avg.month" };
const REC_KEY: Record<Granularity, MessageKey> = { day: "explore.c.recorded.day", week: "explore.c.recorded.week", month: "explore.c.recorded.month" };
const STEP_KEY: Record<Granularity, MessageKey> = { day: "explore.c.step.day", week: "explore.c.step.week", month: "explore.c.step.month" };
const OPEN_KEY: Record<Granularity, MessageKey> = { day: "explore.open.day", week: "explore.open.week", month: "explore.open.month" };
const SWITCH_KEY: Record<Granularity, MessageKey> = { day: "explore.toDaily", week: "explore.toWeekly", month: "explore.toMonthly" };
/** Basılı tutma süresi — bundan sonra tarama başlar */
const HOLD_MS = 320;
/** Bu kadar kayan dokunuş kaydırmadır (parmağın hafif yuvarlanması dokunuş sayılır) */
const SLOP_PX = 8;
/** Okuma kutusunun sayı bantları — gün özetinin sırası */
const STAT_COLORS = ["#8ea6ff", "#7ae582", "#ff9ecd"];
/** Analiz satırının küçük kare karoları (simge ve ok) — SummaryBlock bağlantı satırı gibi */
const LINK_SQ =
  "flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] border-[1.5px] bg-white text-[#111] shadow-[1.5px_1.5px_0_#111]";
/** Bölüm bantlarının tram benekleri (bkz. summary-block bandDots) */
const bandDots = (c: string) => ({
  backgroundColor: c,
  backgroundImage: "radial-gradient(rgba(17, 17, 17, 0.16) 1.2px, transparent 1.5px)",
  backgroundSize: "11px 11px",
});

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/* ——— Kova ve pencere hesapları (saf) ——— */

function bounds(b: DayBucket): [number, number] {
  const s = b.start ?? 0;
  return [s, b.end ?? s + DAY];
}
/** Başı t'den önce olan son kova */
function indexAtTime(arr: DayBucket[], t: number): number {
  let lo = 0;
  let hi = arr.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if ((arr[mid].start ?? 0) <= t) lo = mid;
    else hi = mid - 1;
  }
  return Math.max(0, lo);
}
/** Zamanın kova ekseni üstündeki kesirli yeri */
function floatAtTime(arr: DayBucket[], t: number): number {
  if (!arr.length) return 0;
  if (t >= bounds(arr[arr.length - 1])[1]) return arr.length;
  if (t <= bounds(arr[0])[0]) return 0;
  const i = indexAtTime(arr, t);
  const [t0, t1] = bounds(arr[i]);
  return i + clamp((t - t0) / Math.max(1, t1 - t0), 0, 1);
}
function timeAt(arr: DayBucket[], f: number): number {
  const i = clamp(Math.floor(f), 0, arr.length - 1);
  const [t0, t1] = bounds(arr[i]);
  return t0 + clamp(f - i, 0, 1) * (t1 - t0);
}
function spanLimits(g: Granularity, n: number): [number, number] {
  const L = LIMITS[g];
  const hi = Math.max(1, Math.min(L.max, n));
  return [Math.min(L.min, hi), hi];
}
/** Pencereyi verinin içinde tut */
function fit(series: ExplorerSeries, v: View): View {
  const n = series[v.g].length;
  const [lo, hi] = spanLimits(v.g, n);
  const span = clamp(v.span, lo, hi);
  return {
    ...v,
    span,
    start: clamp(v.start, 0, Math.max(0, n - span)),
    sel: v.sel !== null && v.sel < n ? v.sel : null,
  };
}
function initView(series: ExplorerSeries, w: ExplorerWindow): View {
  const arr = series[w.g];
  const a = floatAtTime(arr, w.start);
  const b = floatAtTime(arr, w.end);
  return fit(series, { g: w.g, start: a, span: b - a > 0.5 ? b - a : GRAN_DEFAULT[w.g], sel: null, preset: null });
}
/** Kovayı değiştir; parmakların altındaki an (t, ekrandaki kesri frac) yerinde kalsın */
function switchG(series: ExplorerSeries, v: View, g: Granularity, span: number, t: number, frac: number): View {
  const selT = v.sel !== null ? series[v.g][v.sel]?.start : undefined;
  const arr = series[g];
  const [lo, hi] = spanLimits(g, arr.length);
  const s = clamp(span, lo, hi);
  return fit(series, {
    g,
    span: s,
    start: floatAtTime(arr, t) - frac * s,
    sel: selT !== undefined ? indexAtTime(arr, selT) : null,
    preset: null,
  });
}
/** Yakınlaştır; sınır aşılınca kova değişir. Kova değiştiyse yenisi döner */
function zoomTo(
  series: ExplorerSeries,
  v: View,
  reqSpan: number,
  frac: number,
  anchor: number
): { v: View; switched: Granularity | null } {
  const n = series[v.g].length;
  const up = UP[v.g];
  const down = DOWN[v.g];
  // Yukarı geçiş biraz gecikmeli (×1.15), aşağı geçiş alt sınırda: arada
  // gidip gelmesin
  if (up && series[up].length > 1 && reqSpan > Math.min(LIMITS[v.g].max, n) * 1.15) {
    const t = timeAt(series[v.g], anchor);
    return { v: switchG(series, v, up, (reqSpan * DAYS_PER[v.g]) / DAYS_PER[up], t, frac), switched: up };
  }
  if (down && reqSpan < LIMITS[v.g].min) {
    const t = timeAt(series[v.g], anchor);
    return { v: switchG(series, v, down, (reqSpan * DAYS_PER[v.g]) / DAYS_PER[down], t, frac), switched: down };
  }
  const [lo, hi] = spanLimits(v.g, n);
  const span = clamp(reqSpan, lo, hi);
  return { v: fit(series, { ...v, span, start: anchor - frac * span, preset: null }), switched: null };
}
function visibleRange(v: View, n: number): [number, number] {
  const a = clamp(Math.ceil(v.start - 0.5), 0, Math.max(0, n - 1));
  const b = clamp(Math.floor(v.start + v.span - 0.5), a, Math.max(0, n - 1));
  return [a, b];
}
function niceStep(raw: number): number {
  if (!(raw > 0)) return 1;
  const e = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / e;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * e;
}
const drawn = (b: DayBucket) => b.hasData !== false;
const hasEntries = (b: DayBucket) => (b.count ?? 0) > 0;

/** Çizimin ölçüleri: solda pay, sağda değer ekseni, altta zaman ekseni */
function geo(w: number, h: number, span: number) {
  const L = 10;
  const R = Math.max(L + 10, w - 46);
  const T = 18;
  const B = Math.max(T + 10, h - 28);
  const pw = R - L;
  return { L, R, T, B, pw, bw: pw / Math.max(span, 0.001) };
}

/* ——— Ekran ——— */

/**
 * Seçicilerin bir seçeneği — simge, ad, kısa açıklama. Yeni bir veri türü ya
 * da grafik türü eklemek listeye bir satır eklemek demek.
 */
export type ExplorerOptionDef = { key: string; label: string; hint?: string; icon: LucideIcon };

/**
 * Başlık şeridindeki iki seçici, ayrı ayrı: GÖSTER — verinin ne okunduğu
 * (Toplam, Ortalama, Birikimli, Tek tek); GRAFİK — nasıl çizildiği (Sütun,
 * Çizgi, Alan, Nokta). Neye bakıldığı (yer, özellik) burada seçilmez.
 */
export type ExplorerControls = {
  readings: ExplorerOptionDef[];
  reading: string;
  onReading: (key: string) => void;
  charts: ExplorerOptionDef[];
  chart: string;
  onChart: (key: string) => void;
};

export function ChartExplorer({
  open,
  onClose,
  title,
  color,
  identity,
  controls,
  ...rest
}: {
  open: boolean;
  onClose: () => void;
  /** Ekran okuyucu başlığı */
  title: string;
  /** Mercek rengi — grafiğin kendi rengi */
  color: string;
  /** Başlık şeridinde neye bakıldığı — ufak kapsüller (bkz. ExplorerTag) */
  identity?: ReactNode;
  controls?: ExplorerControls;
  unit?: string;
  reading: ExplorerReading;
  variant: ExplorerVariant;
  /** Gün, hafta, ay kovaları; yüklenirken undefined */
  series: ExplorerSeries | undefined;
  scale?: ScaleRange;
  /** Oranda çubuk yığılır: değer evet, üstte soluk hayır */
  stacked?: boolean;
  initial: ExplorerWindow;
  /** Seçili kovanın dönem analizine git */
  onOpenPeriod?: (periodKey: string) => void;
}) {
  const t = useT();
  const brutal = useIsBrutal();
  const [menu, setMenu] = useState<"reading" | "chart" | null>(null);
  const line = brutal ? { borderColor: "#111" } : undefined;

  /** Seçici düğmesi — karo, küçük etiket, seçili olanın adı, ok */
  const picker = (which: "reading" | "chart", label: string, opts: ExplorerOptionDef[], cur: string) => {
    const o = opts.find((x) => x.key === cur) ?? opts[0];
    const Icon = o?.icon;
    const isOpen = menu === which;
    return (
      <button
        type="button"
        onClick={() => setMenu(isOpen ? null : which)}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={label}
        data-explore-picker={which}
        className={cn(
          "flex h-10 min-w-0 flex-1 items-center gap-2 pl-1.5 pr-2 text-left transition-colors",
          brutal
            ? cn(
                "rounded-[11px] border-2 shadow-[2px_2px_0_#111] active:translate-x-px active:translate-y-px active:shadow-none",
                isOpen ? "bg-[#111] text-[#fff4dc]" : "bg-white text-[#111]"
              )
            : cn("rounded-xl border border-border", isOpen ? "bg-[var(--sf-3)]" : "bg-card")
        )}
        style={line}
      >
        <span
          className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] text-[#111]", brutal && "border-[1.5px]")}
          style={{ background: which === "reading" ? color : "#fff", borderColor: brutal ? "#111" : undefined }}
        >
          {Icon && <Icon className="h-4 w-4" strokeWidth={2.5} />}
        </span>
        <span className="min-w-0 flex-1 leading-none">
          {/* Satır yüksekliği yazıdan büyük: kırpılan (truncate) satırda Ö ve İ noktaları kesiliyordu */}
          <span className={cn("block truncate text-[9px] font-black uppercase leading-[12px] tracking-[0.1em]", isOpen ? "opacity-70" : "opacity-55")}>{label}</span>
          <span className="mt-px block truncate text-[13.5px] font-black leading-[17px]">{o?.label}</span>
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", isOpen && "rotate-180")} strokeWidth={2.75} />
      </button>
    );
  };
  const menuOpts = controls ? (menu === "reading" ? controls.readings : menu === "chart" ? controls.charts : []) : [];
  const menuCur = controls ? (menu === "reading" ? controls.reading : controls.chart) : "";

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o) return;
        // Geri tuşu / Esc açık menüyü kapatır, ekranı değil (Android'in
        // gönderdiği Esc iptal edilemiyor; kapanma isteği burada yakalanır)
        if (menu) setMenu(null);
        else onClose();
      }}
    >
      <DialogContent hideClose aria-describedby={undefined} className={ENTRY_SCREEN}>
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <div
          data-chart-explorer=""
          className="entry-screen-in relative flex h-full min-h-0 flex-col overflow-hidden bg-background md:rounded-[3rem]"
        >
          {/* Başlık şeridi — Analiz'in mavisinde benekli. Üstte kapat ve neye
              bakıldığı (ufak kapsüller), altında iki seçici: GÖSTER (veri
              türü) ve GRAFİK (grafik türü) */}
          <header
            className={cn("relative z-20 shrink-0 pt-[env(safe-area-inset-top,0px)]", brutal ? "border-b-[3px]" : "border-b")}
            style={brutal ? { borderColor: "#111", ...bandDots("#8ea6ff") } : undefined}
          >
            <div className="flex flex-col gap-2 px-3 pb-2.5 pt-2">
              <div className="flex min-h-8 items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  aria-label={t("action.close")}
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center",
                    brutal
                      ? "rounded-[9px] border-2 bg-white text-[#111] shadow-[1.5px_1.5px_0_#111] active:translate-x-px active:translate-y-px active:shadow-none"
                      : "rounded-full bg-[var(--sf-2)] text-foreground"
                  )}
                  style={line}
                >
                  <X className="h-4 w-4" strokeWidth={2.75} />
                </button>
                <div data-explore-identity="" className="flex min-w-0 flex-1 items-center gap-1.5">
                  {identity}
                </div>
              </div>
              {controls && (
                <div data-explore-controls="" className="flex gap-2">
                  {picker("reading", t("explore.show"), controls.readings, controls.reading)}
                  {picker("chart", t("explore.chartKind"), controls.charts, controls.chart)}
                </div>
              )}
            </div>
            {/* Seçicinin menüsü — düğmenin altında; seçenekler simgeli, açıklamalı */}
            {controls && menu && (
              <div
                role="listbox"
                aria-label={t(menu === "reading" ? "board.chartType" : "board.chartForm")}
                data-explore-menu={menu}
                className={cn(
                  "animate-in absolute top-full z-30 mt-2 w-[min(320px,calc(100%-24px))] p-1.5",
                  menu === "reading" ? "left-3" : "right-3",
                  brutal ? "rounded-[14px] border-2 bg-white text-[#111] shadow-[3px_3px_0_#111]" : "rounded-2xl border border-border bg-card shadow-lg"
                )}
                style={line}
              >
                <div className={cn("px-2 pb-1.5 pt-1 text-[10px] font-black uppercase tracking-[0.1em]", brutal ? "text-[#111]/55" : "text-muted-foreground")}>
                  {t(menu === "reading" ? "board.chartType" : "board.chartForm")}
                </div>
                <div className="flex flex-col gap-0.5">
                  {menuOpts.map((o) => {
                    const on = o.key === menuCur;
                    const Icon = o.icon;
                    return (
                      <button
                        key={o.key}
                        type="button"
                        role="option"
                        aria-selected={on}
                        onClick={() => {
                          if (menu === "reading") controls.onReading(o.key);
                          else controls.onChart(o.key);
                          setMenu(null);
                        }}
                        className={cn(
                          "flex w-full items-center gap-2.5 rounded-[10px] px-2 py-2 text-left transition-colors",
                          on ? (brutal ? "bg-[#111] text-[#fff4dc]" : "bg-[var(--sf-3)]") : brutal ? "active:bg-[#111]/[0.06]" : "active:bg-[var(--sf-2)]"
                        )}
                      >
                        <span
                          className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] text-[#111]", brutal && "border-[1.5px]")}
                          style={{ background: menu === "reading" ? color : "#fff", borderColor: brutal ? "#111" : undefined }}
                        >
                          <Icon className="h-4 w-4" strokeWidth={2.5} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14px] font-extrabold leading-tight">{o.label}</span>
                          {o.hint && <span className="mt-0.5 block text-[11.5px] font-semibold leading-snug opacity-60">{o.hint}</span>}
                        </span>
                        {on && <Check className="h-4 w-4 shrink-0" strokeWidth={3} />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </header>
          {/* Menü açıkken dışına dokununca kapanır */}
          {menu && (
            <button
              type="button"
              aria-label={t("action.close")}
              onClick={() => setMenu(null)}
              className="absolute inset-0 z-10 cursor-default bg-black/10"
            />
          )}
          {rest.series ? (
            <ExplorerBody brutal={brutal} color={color} {...rest} series={rest.series} />
          ) : (
            <div className="flex flex-1 items-center justify-center text-[13px] font-bold text-muted-foreground">
              {t("explore.loading")}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Başlık şeridindeki ufak renkli kapsül — Analiz'in üst bölümü küçülünce
 * çıkan özetin kapsülü gibi (bkz. analysis-header ScopeChip): rengin açık
 * tonunda zemin, önünde rengin kendisiyle şekli — kare = kategori, daire =
 * özellik. Dokunulmaz. Eskiden iri simgeli etiketti, grafiğin yerini yiyordu.
 */
export function ExplorerTag({ color, shape, label }: { color: string; shape: "square" | "circle"; label: string }) {
  const brutal = useIsBrutal();
  return (
    <span
      className="flex min-w-0 items-center gap-1.5 rounded-full border-[1.5px] py-[3px] pl-1.5 pr-2.5 text-[12px] font-extrabold leading-[15px] text-[#111]"
      style={{ borderColor: brutal ? "#111" : "var(--border)", background: `color-mix(in srgb, ${color} 38%, white)` }}
    >
      <span
        aria-hidden
        className={cn("h-3 w-3 shrink-0 border-[1.5px]", shape === "circle" ? "rounded-full" : "rounded-[3px]")}
        style={{ background: color, borderColor: "#111" }}
      />
      <span className="truncate">{label}</span>
    </span>
  );
}

function ExplorerBody({
  brutal,
  color,
  unit,
  reading,
  variant,
  series,
  scale,
  stacked,
  initial,
  onOpenPeriod,
}: {
  brutal: boolean;
  color: string;
  unit?: string;
  reading: ExplorerReading;
  variant: ExplorerVariant;
  series: ExplorerSeries;
  scale?: ScaleRange;
  stacked?: boolean;
  initial: ExplorerWindow;
  onOpenPeriod?: (periodKey: string) => void;
}) {
  const t = useT();
  const tag = intlTag(useLocale());
  const clipId = `xc${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  /** Temanın mürekkebi — brütalde siyah, ötekilerde yazı rengi */
  const INK = brutal ? "#111111" : "var(--foreground)";
  const PAPER = brutal ? "#ffffff" : "var(--background)";

  const [view, setView] = useState<View>(() => initView(series, initial));
  // Hareketler bir sonraki çizimi beklemeden en son pencereyi okusun
  const live = useRef(view);
  const commit = (v: View) => {
    live.current = v;
    setView(v);
  };
  // Veri değişince (başka yer, özellik, grafik türü ya da yeni kayıt) görünen
  // zaman aralığı ve seçili an korunur — kovalar ilk kayıttan başladığı için
  // sıra numaraları kayıyor
  const [prevSeries, setPrevSeries] = useState(series);
  if (prevSeries !== series) {
    setPrevSeries(series);
    const old = prevSeries[view.g];
    const now = series[view.g];
    if (old.length && now.length) {
      const t0 = timeAt(old, view.start);
      const t1 = timeAt(old, view.start + view.span);
      const selT = view.sel !== null ? old[view.sel]?.start : undefined;
      const a = floatAtTime(now, t0);
      setView(
        fit(series, {
          ...view,
          start: a,
          span: Math.max(0.5, floatAtTime(now, t1) - a),
          sel: selT !== undefined ? indexAtTime(now, selT) : null,
        })
      );
    }
  }
  useEffect(() => {
    live.current = view;
  }, [view]);

  const boxRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const [toast, setToast] = useState<string | null>(null);
  const toastT = useRef<number | null>(null);
  const showToast = (msg: string) => {
    setToast(msg);
    if (toastT.current) window.clearTimeout(toastT.current);
    toastT.current = window.setTimeout(() => setToast(null), 1500);
  };

  const ptrs = useRef(new Map<number, { x: number; y: number }>());
  const gest = useRef<Gesture | null>(null);
  const holdT = useRef<number | null>(null);
  const samples = useRef<{ t: number; x: number }[]>([]);
  const raf = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (raf.current) cancelAnimationFrame(raf.current);
      if (holdT.current) window.clearTimeout(holdT.current);
      if (toastT.current) window.clearTimeout(toastT.current);
    },
    []
  );

  const fmt = useMemo(
    () => ({
      weekday: new Intl.DateTimeFormat(tag, { weekday: "long" }),
      dayMonth: new Intl.DateTimeFormat(tag, { day: "numeric", month: "long" }),
      range: new Intl.DateTimeFormat(tag, { day: "numeric", month: "long", year: "numeric" }),
      month: new Intl.DateTimeFormat(tag, { month: "long", year: "numeric" }),
      shortDay: new Intl.DateTimeFormat(tag, { day: "numeric", month: "short" }),
      shortMonth: new Intl.DateTimeFormat(tag, { month: "short" }),
      shortMonthYear: new Intl.DateTimeFormat(tag, { month: "short", year: "2-digit" }),
      span: new Intl.DateTimeFormat(tag, { day: "numeric", month: "short", year: "numeric" }),
    }),
    [tag]
  );
  const shortLabel = (b: DayBucket, g: Granularity) => {
    const s = b.start ?? 0;
    if (g === "month") return new Date(s).getMonth() === 0 ? fmt.shortMonthYear.format(s) : fmt.shortMonth.format(s);
    return fmt.shortDay.format(s);
  };
  const valText = (x: number) => (unit ? `${fmtNum(x)} ${unit}` : fmtNum(x));
  const signed = (x: number) => `${x >= 0 ? "+" : "−"}${valText(Math.abs(x))}`;
  const axisText = (x: number) =>
    Math.abs(x) >= 10000
      ? new Intl.NumberFormat(tag, { notation: "compact", maximumFractionDigits: 1 }).format(x)
      : fmtNum(x);

  /* ——— Pencere işlemleri ——— */

  const v = fit(series, view);
  const arr = series[v.g];
  const n = arr.length;
  const g = geo(size.w, size.h, v.span);

  const stopAnim = () => {
    if (raf.current) {
      cancelAnimationFrame(raf.current);
      raf.current = null;
    }
  };
  const idxAt = (vv: View, x: number) => {
    const gg = geo(size.w, size.h, vv.span);
    return clamp(Math.floor(vv.start + (x - gg.L) / gg.bw), 0, series[vv.g].length - 1);
  };
  const selectAt = (x: number) => {
    const cur = live.current;
    const i = idxAt(cur, x);
    if (i !== cur.sel) commit({ ...cur, sel: i });
  };
  /** Bırakınca süzülme — hız kova/ms, sürtünmeyle söner */
  const glide = (vel: number) => {
    stopAnim();
    // Saat ilk kareden: kare zaman damgası performance.now ile aynı saatte
    let last = -1;
    const step = (now: number) => {
      const dt = last < 0 ? 16 : Math.min(32, now - last);
      last = now;
      const cur = live.current;
      const next = fit(series, { ...cur, start: cur.start + vel * dt });
      vel *= Math.pow(0.9945, dt);
      if (next.start === cur.start || Math.abs(vel) < 0.0006) {
        raf.current = null;
        return;
      }
      commit(next);
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
  };
  /** Pencereyi yumuşakça kaydır (adım düğmeleri seçimi görünür tutar) */
  const animateTo = (target: number) => {
    stopAnim();
    const from = live.current.start;
    let t0 = -1;
    const step = (now: number) => {
      if (t0 < 0) t0 = now - 16;
      const k = Math.min(1, (now - t0) / 220);
      const e = 1 - Math.pow(1 - k, 3);
      commit(fit(series, { ...live.current, start: from + (target - from) * e }));
      raf.current = k < 1 ? requestAnimationFrame(step) : null;
    };
    raf.current = requestAnimationFrame(step);
  };
  const keepVisible = (vv: View, i: number, center: boolean) => {
    commit(vv);
    if (i >= vv.start && i + 1 <= vv.start + vv.span) return;
    animateTo(center ? i + 0.5 - vv.span / 2 : i < vv.start ? i : i + 1 - vv.span);
  };
  /** Bir kova ileri/geri — klavyede Shift ile */
  const stepBucket = (d: number) => {
    stopAnim();
    const cur = live.current;
    const len = series[cur.g].length;
    if (!len) return;
    const [, b] = visibleRange(cur, len);
    const i = cur.sel === null ? b : clamp(cur.sel + d, 0, len - 1);
    keepVisible({ ...cur, sel: i }, i, false);
  };
  /**
   * Kayıttan kayda — okuma kutusunun iki yanındaki ‹ › ve klavyede oklar.
   * Kaydı olmayan kovaları atlar. Eskiden ‹ › kova kova, « » kayıt kayıt
   * gidiyordu; veri sık olunca ikisi aynı işi yapıyordu, tek çift kaldı.
   */
  const stepEntry = (d: number) => {
    stopAnim();
    const cur = live.current;
    const list = series[cur.g];
    const [a, b] = visibleRange(cur, list.length);
    const from = cur.sel === null ? (d < 0 ? b + 1 : a - 1) : cur.sel;
    for (let j = from + d; j >= 0 && j < list.length; j += d) {
      if (hasEntries(list[j])) {
        keepVisible({ ...cur, sel: j }, j, true);
        return;
      }
    }
    showToast(t(d < 0 ? "explore.noOlder" : "explore.noNewer"));
  };
  const applyPreset = (p: (typeof PRESETS)[number]) => {
    stopAnim();
    const cur = live.current;
    const selT = cur.sel !== null ? series[cur.g][cur.sel]?.start : undefined;
    const list = series[p.g];
    const [lo, hi] = spanLimits(p.g, list.length);
    const span = clamp(p.span, lo, hi);
    commit(
      fit(series, {
        g: p.g,
        span,
        start: list.length - span,
        sel: selT !== undefined ? indexAtTime(list, selT) : null,
        preset: p.key,
      })
    );
  };
  const zoomBy = (factor: number) => {
    stopAnim();
    const cur = live.current;
    const anchor = cur.sel !== null ? cur.sel + 0.5 : cur.start + cur.span / 2;
    const frac = clamp((anchor - cur.start) / cur.span, 0, 1);
    const r = zoomTo(series, cur, cur.span * factor, frac, anchor);
    commit(r.v);
    if (r.switched) showToast(t(SWITCH_KEY[r.switched]));
  };

  /* ——— Hareketler ——— */

  const pt = (e: { clientX: number; clientY: number }) => {
    const r = boxRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const startPinch = () => {
    const [a, b] = [...ptrs.current.values()];
    const cur = live.current;
    const gg = geo(size.w, size.h, cur.span);
    const mid = (a.x + b.x) / 2;
    gest.current = { type: "pinch", d0: Math.max(24, Math.abs(a.x - b.x)), span0: cur.span, anchor: cur.start + (mid - gg.L) / gg.bw };
  };
  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    stopAnim();
    const p = pt(e);
    ptrs.current.set(e.pointerId, p);
    if (ptrs.current.size === 1) {
      gest.current = { type: "pending", x0: p.x, y0: p.y, start0: live.current.start };
      samples.current = [{ t: e.timeStamp, x: p.x }];
      holdT.current = window.setTimeout(() => {
        const gs = gest.current;
        if (gs && gs.type === "pending") {
          gest.current = { ...gs, type: "scrub" };
          selectAt(gs.x0);
        }
      }, HOLD_MS);
    } else if (ptrs.current.size === 2) {
      if (holdT.current) window.clearTimeout(holdT.current);
      startPinch();
    }
  };
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!ptrs.current.has(e.pointerId)) return;
    const p = pt(e);
    ptrs.current.set(e.pointerId, p);
    let gs = gest.current;
    if (!gs) return;
    if (gs.type === "pending" && (Math.abs(p.x - gs.x0) > SLOP_PX || Math.abs(p.y - gs.y0) > SLOP_PX)) {
      if (holdT.current) window.clearTimeout(holdT.current);
      gs = gest.current = { ...gs, type: "pan" };
    }
    if (gs.type === "pan") {
      const cur = live.current;
      const gg = geo(size.w, size.h, cur.span);
      commit(fit(series, { ...cur, start: gs.start0 - (p.x - gs.x0) / gg.bw, preset: null }));
      samples.current.push({ t: e.timeStamp, x: p.x });
      while (samples.current.length > 2 && e.timeStamp - samples.current[0].t > 90) samples.current.shift();
    } else if (gs.type === "scrub") {
      selectAt(p.x);
    } else if (gs.type === "pinch" && ptrs.current.size >= 2) {
      const [a, b] = [...ptrs.current.values()];
      const gg = geo(size.w, size.h, live.current.span);
      const d = Math.max(24, Math.abs(a.x - b.x));
      const frac = ((a.x + b.x) / 2 - gg.L) / gg.pw;
      const r = zoomTo(series, live.current, (gs.span0 * gs.d0) / d, frac, gs.anchor);
      commit(r.v);
      if (r.switched) {
        showToast(t(SWITCH_KEY[r.switched]));
        startPinch();
      }
    }
  };
  const onUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!ptrs.current.has(e.pointerId)) return;
    const p = pt(e);
    ptrs.current.delete(e.pointerId);
    const gs = gest.current;
    if (!gs) return;
    if (gs.type === "pinch" || gs.type === "none") {
      gest.current = ptrs.current.size ? { type: "none" } : null;
      return;
    }
    if (holdT.current) window.clearTimeout(holdT.current);
    if (gs.type === "pending" && e.type === "pointerup") {
      const cur = live.current;
      const i = idxAt(cur, p.x);
      commit({ ...cur, sel: cur.sel === i ? null : i });
    } else if (gs.type === "pan" && e.type === "pointerup" && samples.current.length > 1) {
      const s0 = samples.current[0];
      const s1 = samples.current[samples.current.length - 1];
      const dt = s1.t - s0.t;
      if (dt > 0 && e.timeStamp - s1.t < 60) {
        const vel = -((s1.x - s0.x) / geo(size.w, size.h, live.current.span).bw) / dt;
        if (Math.abs(vel) > 0.002) glide(vel);
      }
    }
    gest.current = null;
  };

  // Tekerlek: Ctrl (dokunmatik yüzeyde kıstırma) yakınlaştırır, Shift ya da
  // yatay kaydırma gezer; düz tekerlek sayfaya kalır. React'in tekerleği
  // pasif — engellemek için doğrudan dinleniyor.
  const wheelRef = useRef<(e: WheelEvent) => void>(() => {});
  useEffect(() => {
    wheelRef.current = (e: WheelEvent) => {
      const cur = live.current;
      const gg = geo(size.w, size.h, cur.span);
      const x = pt(e).x;
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        stopAnim();
        const r = zoomTo(series, cur, cur.span * Math.exp(e.deltaY * 0.004), (x - gg.L) / gg.pw, cur.start + (x - gg.L) / gg.bw);
        commit(r.v);
        if (r.switched) showToast(t(SWITCH_KEY[r.switched]));
      } else if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        e.preventDefault();
        stopAnim();
        commit(fit(series, { ...cur, start: cur.start + (e.shiftKey ? e.deltaY : e.deltaX) / gg.bw, preset: null }));
      }
    };
  });
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const h = (e: WheelEvent) => wheelRef.current(e);
    el.addEventListener("wheel", h, { passive: false });
    return () => el.removeEventListener("wheel", h);
  }, []);

  const onKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      if (e.shiftKey) stepBucket(-1);
      else stepEntry(-1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      if (e.shiftKey) stepBucket(1);
      else stepEntry(1);
    } else if (e.key === "+" || e.key === "=") {
      e.preventDefault();
      zoomBy(0.8);
    } else if (e.key === "-" || e.key === "_") {
      e.preventDefault();
      zoomBy(1.25);
    } else if (e.key === "Escape" && live.current.sel !== null) {
      // Seçim varken Esc önce seçimi kaldırır, ekranı kapatmaz
      e.stopPropagation();
      commit({ ...live.current, sel: null });
    }
  };

  /* ——— Okuma ——— */

  const [va, vb] = visibleRange(v, n);
  const i0 = Math.max(0, Math.floor(v.start) - 1);
  const i1 = Math.min(n - 1, Math.ceil(v.start + v.span) + 1);
  // Birikimli görünen aralığın başından birikir: pencere ay iken panelle aynı
  // rakam, kaydırınca "bu aralıkta ne birikti". Bütün geçmişin birikimi ilk
  // kayıttan büyüyüp gidiyor, panelin rakamıyla tutmuyordu
  const cum = new Map<number, number>();
  if (reading === "cumulative") {
    let run = 0;
    for (let i = va; i <= i1; i++) {
      run += arr[i].sum ?? 0;
      cum.set(i, run);
    }
  }
  const valOf = (i: number) => (reading === "cumulative" ? (i < va ? 0 : (cum.get(i) ?? 0)) : arr[i].value);
  let sum = 0;
  let cnt = 0;
  let rec = 0;
  let drawnCnt = 0;
  let drawnSum = 0;
  let maxV = -Infinity;
  let maxI = -1;
  let lo = 0;
  let hi = 0;
  let allInt = true;
  for (let i = va; i <= vb && n; i++) {
    const b = arr[i];
    const x = valOf(i);
    cnt++;
    sum += x;
    if (hasEntries(b)) rec++;
    if (!drawn(b)) continue;
    drawnCnt++;
    drawnSum += x;
    if (x > maxV) {
      maxV = x;
      maxI = i;
    }
    if (!Number.isInteger(x)) allInt = false;
    lo = Math.min(lo, x);
    hi = Math.max(hi, x + (stacked ? (b.rest ?? 0) : 0));
  }
  const visAvg = reading === "total" ? (cnt ? sum / cnt : 0) : drawnCnt ? drawnSum / drawnCnt : 0;

  // Okuma kutusu: üst satır (gün adı ya da "Görünen aralık"), başlık (tarih),
  // büyük rakam (birim yanında küçük) ve en altta en fazla üç bilgi hücresi.
  // Eskiden noktalarla ayrılmış tek uzun cümleydi; ikinci satırda kesiliyordu
  const pctFmt = new Intl.NumberFormat(tag, { style: "percent", signDisplay: "exceptZero", maximumFractionDigits: 0 });
  const u = t(UNIT_KEY[v.g]);
  let over = "";
  let bigNum: string | null = null;
  let bigText = "";
  const cells: { v: string; l: string; s?: string }[] = [];
  const sel = v.sel !== null && v.sel < n ? arr[v.sel] : null;
  const openRow = !!sel?.periodKey;
  const findEntry = (from: number, d: number) => {
    for (let j = from + d; j >= 0 && j < n; j += d) if (hasEntries(arr[j])) return j;
    return -1;
  };
  const prevEntry = findEntry(v.sel ?? vb + 1, -1);
  const nextEntry = findEntry(v.sel ?? va - 1, 1);
  if (!n) {
    bigText = t("explore.empty");
  } else if (sel && v.sel !== null) {
    const [s, e] = bounds(sel);
    over =
      v.g === "day"
        ? // Bu yılın gününde yıl yazılmaz (iki okun arasında sığsın)
          `${fmt.weekday.format(s)} · ${(new Date(s).getFullYear() === new Date(arr[n - 1].start ?? 0).getFullYear() ? fmt.dayMonth : fmt.range).format(s)}`
        : v.g === "month"
          ? fmt.month.format(s)
          : `${t(GRAN_LABEL[v.g])} · ${fmt.span.formatRange(s, e - 1)}`;
    const selV = valOf(v.sel);
    const empty = reading === "cumulative" ? false : !hasEntries(sel) && (reading === "average" || selV === 0);
    if (empty) {
      bigText = t("explore.noData");
      if (prevEntry >= 0) cells.push({ v: t("explore.c.ago", { n: v.sel - prevEntry, u }), l: t("explore.c.prevEntry") });
      if (nextEntry >= 0) cells.push({ v: t("explore.c.in", { n: nextEntry - v.sel, u }), l: t("explore.c.nextEntry") });
      if (!cells.length) cells.push({ v: "–", l: t("explore.noneHere") });
    } else {
      bigNum = fmtNum(selV);
      if (hasEntries(sel)) cells.push({ v: fmtNum(sel.count ?? 0), l: t("explore.c.entries") });
      if (reading === "cumulative") {
        cells.push({ v: signed(sel.sum ?? 0), l: t(STEP_KEY[v.g]) });
      } else {
        // Eksi işareti öteki farklarla aynı karakter (Intl düz kısa çizgi veriyor)
        if (visAvg > 0) cells.push({ v: pctFmt.format((selV - visAvg) / visAvg).replace("-", "−"), l: t("explore.c.vsAvg") });
        const prev = v.sel > 0 ? arr[v.sel - 1] : null;
        if (prev && drawn(prev) && (reading === "total" || hasEntries(prev))) {
          cells.push({ v: signed(selV - valOf(v.sel - 1)), l: t("explore.c.vsPrev") });
        }
      }
    }
  } else {
    over = `${t("explore.visibleShort")} · ${fmt.span.formatRange(bounds(arr[va])[0], bounds(arr[vb])[1] - 1)}`;
    const maxCell = maxI >= 0 ? { v: valText(maxV), l: t("explore.c.max"), s: shortLabel(arr[maxI], v.g) } : null;
    const recCell = { v: `${rec}/${cnt}`, l: t(REC_KEY[v.g]) };
    if (reading === "total") {
      bigNum = fmtNum(sum);
      cells.push({ v: valText(visAvg), l: t(AVG_KEY[v.g]) });
      if (maxCell) cells.push(maxCell);
      cells.push(recCell);
    } else if (reading === "cumulative") {
      const end = valOf(vb);
      bigNum = fmtNum(end);
      cells.push({ v: valText(cnt ? end / cnt : 0), l: t(AVG_KEY[v.g]) }, recCell);
    } else {
      if (drawnCnt) bigNum = fmtNum(visAvg);
      else bigText = t("explore.noData");
      let entCount = 0;
      for (let i = va; i <= vb; i++) entCount += arr[i].count ?? 0;
      if (maxCell) cells.push(maxCell);
      cells.push(recCell, { v: fmtNum(entCount), l: t("explore.c.entries") });
    }
  }

  /* ——— Çizim ——— */

  let y0 = lo;
  let y1 = hi;
  if (scale) {
    y0 = scale.min;
    y1 = scale.max;
  }
  if (y1 - y0 <= 0) y1 = y0 + 1;
  let yStep = scale
    ? y1 - y0 <= 6
      ? 1
      : niceStep((y1 - y0) / 4)
    : niceStep((y1 - y0) / 4);
  // Değerler tamsa (girdi adedi) eksen de tam — "2,5 girdi" çizgisi olmaz
  if (!scale && allInt && yStep < 1) yStep = 1;
  if (!scale) {
    y0 = Math.floor(y0 / yStep) * yStep;
    y1 = Math.ceil((y1 * 1.04) / yStep) * yStep;
    if (y1 <= y0) y1 = y0 + yStep;
  }
  const yS = (x: number) => g.B - ((x - y0) / (y1 - y0)) * (g.B - g.T);
  const base = yS(clamp(0, y0, y1));
  const xc = (i: number) => g.L + (i - v.start + 0.5) * g.bw;
  const faded = (i: number) => v.sel !== null && i !== v.sel;
  const ready = size.w > 0 && size.h > 0 && n > 0;

  const yTicks: number[] = [];
  if (ready) for (let k = y0; k <= y1 + yStep * 0.001; k += yStep) yTicks.push(+k.toFixed(6));

  const marks: ReactNode[] = [];
  if (ready && variant === "bar") {
    const w = Math.max(1, g.bw * 0.72);
    const outline = brutal && w >= 6;
    const r = w >= 6 ? 3.5 : 0;
    for (let i = i0; i <= i1; i++) {
      const b = arr[i];
      if (!drawn(b)) continue;
      const x = xc(i) - w / 2;
      const op = faded(i) ? 0.35 : 1;
      const bv = valOf(i);
      if (bv !== 0) {
        const top = yS(bv);
        const y = Math.min(top, base);
        const h = Math.max(1, Math.abs(base - top));
        marks.push(
          <path
            key={`b${i}`}
            d={barPath(x, y, w, h, bv > 0 ? r : 0)}
            fill={color}
            opacity={op}
            style={outline ? { stroke: INK, strokeWidth: i === v.sel ? 2.5 : 1.5 } : undefined}
          />
        );
      }
      if (stacked && (b.rest ?? 0) > 0) {
        const yTop = yS(bv + (b.rest ?? 0));
        const yBot = yS(bv);
        marks.push(
          <rect
            key={`r${i}`}
            x={x}
            y={yTop}
            width={w}
            height={Math.max(1, yBot - yTop)}
            fill={color}
            opacity={op * 0.3}
            style={outline ? { stroke: INK, strokeWidth: 1, strokeDasharray: "2 2" } : undefined}
          />
        );
      }
    }
  } else if (ready) {
    // Çizgi, alan, noktalar: ardışık çizilen kovalar parça parça — boş
    // kovada kesilir
    const segs: { i: number; x: number; y: number }[][] = [];
    let curSeg: { i: number; x: number; y: number }[] = [];
    for (let i = i0; i <= i1; i++) {
      const b = arr[i];
      if (!drawn(b)) {
        if (curSeg.length) segs.push(curSeg);
        curSeg = [];
        continue;
      }
      curSeg.push({ i, x: xc(i), y: yS(valOf(i)) });
    }
    if (curSeg.length) segs.push(curSeg);
    const lineOp = v.sel !== null ? 0.55 : 1;
    segs.forEach((s, k) => {
      const d = s.map((p, j) => `${j ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join("");
      if (variant === "area" && s.length > 1) {
        marks.push(
          <path
            key={`a${k}`}
            d={`${d}L${s[s.length - 1].x.toFixed(1)},${base.toFixed(1)}L${s[0].x.toFixed(1)},${base.toFixed(1)}Z`}
            fill={color}
            opacity={0.32 * lineOp}
          />
        );
      }
      if (variant !== "dots" && s.length > 1) {
        if (brutal) marks.push(<path key={`u${k}`} d={d} fill="none" opacity={lineOp} style={{ stroke: INK, strokeWidth: 4.5, strokeLinejoin: "round", strokeLinecap: "round" }} />);
        marks.push(<path key={`l${k}`} d={d} fill="none" stroke={color} strokeWidth={brutal ? 2.5 : 2.25} strokeLinejoin="round" strokeLinecap="round" opacity={lineOp} />);
      }
      for (let j = 0; j < s.length; j++) {
        const p = s[j];
        const isSel = p.i === v.sel;
        const show = variant === "dots" || isSel || s.length === 1 || g.bw >= 10;
        if (!show) continue;
        const rr = isSel ? 5.5 : variant === "dots" ? clamp(g.bw * 0.28, 2.5, 4.5) : 3;
        marks.push(
          <circle
            key={`d${p.i}`}
            cx={p.x}
            cy={p.y}
            r={rr}
            fill={color}
            opacity={faded(p.i) ? 0.4 : 1}
            style={{ stroke: INK, strokeWidth: isSel ? 2 : 1.25 }}
          />
        );
      }
    });
  }

  // Zaman ekseni: işaretler kovaya demirli (kaydırınca titremesin)
  const ticks: { i: number; label: string }[] = [];
  if (ready) {
    const need = 54 / g.bw;
    if (v.g === "day") {
      const stp = [1, 2, 7, 14].find((s) => s >= need);
      if (stp) {
        // Haftalık işaretler pazartesiye oturur
        const anchor = stp >= 7 ? arr.findIndex((b) => new Date(b.start ?? 0).getDay() === 1) : 0;
        for (let i = i0; i <= i1; i++) if ((((i - Math.max(0, anchor)) % stp) + stp) % stp === 0) ticks.push({ i, label: fmt.shortDay.format(arr[i].start ?? 0) });
      } else {
        const ms = need <= 31 ? 1 : need <= 92 ? 3 : 6;
        for (let i = i0; i <= i1; i++) {
          const d = new Date(arr[i].start ?? 0);
          if (d.getDate() === 1 && d.getMonth() % ms === 0) ticks.push({ i, label: d.getMonth() === 0 ? fmt.shortMonthYear.format(d) : fmt.shortMonth.format(d) });
        }
      }
    } else if (v.g === "week") {
      const stp = [1, 2, 4, 8, 13].find((s) => s >= need) ?? 26;
      for (let i = i0; i <= i1; i++) if (i % stp === 0) ticks.push({ i, label: fmt.shortDay.format(arr[i].start ?? 0) });
    } else {
      const stp = [1, 2, 3, 6].find((s) => s >= need) ?? 12;
      for (let i = i0; i <= i1; i++) {
        const d = new Date(arr[i].start ?? 0);
        if (d.getMonth() % stp === 0) ticks.push({ i, label: shortLabel(arr[i], "month") });
      }
    }
  }
  const crossX = ready && v.sel !== null && v.sel >= i0 && v.sel <= i1 ? xc(v.sel) : null;
  const crossOn = crossX !== null && crossX >= g.L - 1 && crossX <= g.R + 1;
  // Kaydı olmayan kovada değer etiketi yok (toplamdaki 0 "kayıt yok" demek)
  const selDrawn = sel && drawn(sel) && (reading === "cumulative" || hasEntries(sel)) ? sel : null;

  const pill = (x: number, y: number, text: string, key: string, anchorEnd = false) => {
    const w = text.length * 6.5 + 14;
    const px = anchorEnd ? x : clamp(x - w / 2, g.L, g.R - w);
    return (
      <g key={key}>
        <rect x={px} y={y} width={w} height={18} rx={5} style={{ fill: INK }} />
        <text x={px + w / 2} y={y + 12.5} textAnchor="middle" className="font-mono text-[10.5px] font-bold" style={{ fill: PAPER }}>
          {text}
        </text>
      </g>
    );
  };

  const line = brutal ? { borderColor: "#111" } : undefined;
  const segBtn = (on: boolean) =>
    cn(
      "font-extrabold transition-colors",
      on ? (brutal ? "bg-[#111] text-white" : "bg-foreground text-background") : brutal ? "text-[#111]/65 active:bg-[#111]/5" : "text-muted-foreground"
    );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 px-3 pb-[max(10px,env(safe-area-inset-bottom,0px))] pt-2">
      {/* Okuma kutusu — ana sayfanın Bugün bloğunun dili: üstte grafiğin
          renginde benekli baş (iki yanında Analiz'in ok karoları; seçiliyken
          sağda gün analizi karosu), altında renk bantlı sayılar. Hücreler
          arası bloğun 2 px siyahı */}
      <div
        aria-live="polite"
        data-explore-readout=""
        className={cn(
          "grid shrink-0 grid-cols-1 overflow-hidden",
          brutal ? "gap-[2px] rounded-[16px] border-2 bg-[#111] shadow-[3px_3px_0_#111]" : "gap-px rounded-2xl border border-border bg-border"
        )}
        style={line}
      >
        <div className="flex h-[52px] gap-[2px]">
          <div
            className={cn("flex min-w-0 flex-1 items-center gap-2 px-2", brutal ? "text-[#111]" : "bg-card")}
            style={brutal ? bandDots(color) : undefined}
          >
            <StepArrow brutal={brutal} dir={-1} disabled={prevEntry < 0} label={t("explore.prevEntry")} onClick={() => stepEntry(-1)} />
            <div className="min-w-0 flex-1 text-center">
              <div className="flex min-w-0 items-center justify-center gap-1.5">
                <span className="truncate text-[11px] font-black uppercase tracking-[0.08em] opacity-70">{over}</span>
                {sel && (
                  <button
                    type="button"
                    onClick={() => commit({ ...live.current, sel: null })}
                    aria-label={t("explore.clear")}
                    className={cn(
                      "flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full",
                      brutal ? "bg-[#111] text-white" : "bg-foreground text-background"
                    )}
                  >
                    <X className="h-2.5 w-2.5" strokeWidth={3.5} />
                  </button>
                )}
              </div>
              <div className="mt-0.5 flex min-w-0 items-baseline justify-center gap-1.5">
                {bigNum !== null ? (
                  <>
                    <b className="truncate font-mono text-[21px] font-bold leading-none tracking-[-0.02em] tabular-nums">{bigNum}</b>
                    {unit && <span className="shrink-0 text-[13px] font-extrabold leading-none">{unit}</span>}
                  </>
                ) : (
                  <span className="truncate text-[16px] font-black leading-none tracking-[-0.02em] opacity-55">{bigText}</span>
                )}
              </div>
            </div>
            <StepArrow brutal={brutal} dir={1} disabled={nextEntry < 0} label={t("explore.nextEntry")} onClick={() => stepEntry(1)} />
          </div>
        </div>
        {cells.length > 0 && (
          <div className={cn("grid", brutal ? "gap-[2px]" : "gap-px")} style={{ gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))` }}>
            {cells.map((c, k) => (
              <div key={k} className={cn("flex h-[42px] min-w-0 flex-col", brutal ? "bg-white text-[#111]" : "bg-card")}>
                <span className="h-1 shrink-0" style={{ background: STAT_COLORS[k % STAT_COLORS.length] }} />
                {/* Sabit boy: etiket kısa ve tek satır; tarih gibi değişen ek
                    rakamın yanında küçük. "En yüksek · 2 Eylül" iki satıra inip
                    kutuyu büyütüyordu */}
                <span className="flex min-w-0 flex-1 flex-col justify-center px-2.5">
                  <span
                    className={cn(
                      "block truncate whitespace-nowrap text-[9px] font-black uppercase leading-[12px] tracking-[0.02em]",
                      brutal ? "text-[#111]/60" : "text-muted-foreground"
                    )}
                  >
                    {c.l}
                  </span>
                  <span className="mt-px flex min-w-0 items-baseline gap-1">
                    <b className="truncate font-mono text-[14px] font-bold leading-[18px] tabular-nums">{c.v}</b>
                    {c.s && <span className={cn("shrink-0 text-[10.5px] font-bold", brutal ? "text-[#111]/55" : "text-muted-foreground")}>{c.s}</span>}
                  </span>
                </span>
              </div>
            ))}
          </div>
        )}
        {/* Gün analizi — gün sayfasının özetindeki Gün Analizi şeridinin yeri
            ve dili: bloğun en altında Analiz'in mavisinde benekli satır. Yalnız
            bir kova seçiliyken kayarak açılır; seçimsizken yer kaplamaz, ipucu
            yazısı yok. Kapalıyken -2 px: bloğun hücre arası çizgisi iki kat
            kalın görünmesin */}
        {onOpenPeriod && (
          <div
            className={cn(
              "grid transition-[grid-template-rows,margin] duration-200 ease-out motion-reduce:transition-none",
              openRow ? "grid-rows-[1fr]" : "-mt-[2px] grid-rows-[0fr]"
            )}
          >
            <div className="min-h-0 overflow-hidden">
              <button
                type="button"
                onClick={() => sel?.periodKey && onOpenPeriod(sel.periodKey)}
                disabled={!openRow}
                tabIndex={openRow ? 0 : -1}
                data-explore-open=""
                className={cn("flex h-[38px] w-full min-w-0 items-center gap-2.5 px-3 text-left", brutal ? "text-[#111] active:brightness-95" : "bg-[var(--sf-2)]")}
                style={brutal ? bandDots("#8ea6ff") : undefined}
              >
                <span className={LINK_SQ} style={brutal ? { borderColor: "#111" } : undefined}>
                  <BarChart3 className="h-4 w-4" strokeWidth={2.5} />
                </span>
                <span className="min-w-0 flex-1 truncate text-[14px] font-extrabold leading-[18px] tracking-tight">{t(OPEN_KEY[v.g])}</span>
                <span className={LINK_SQ} style={brutal ? { borderColor: "#111" } : undefined}>
                  <ArrowRight className="h-4 w-4" strokeWidth={2.75} />
                </span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Grafik penceresi — yalnız çizim; ne gösterdiği ve kova yukarıdaki kontrol bloğunda */}
      <div
        className={cn("flex min-h-0 flex-1 flex-col overflow-hidden", brutal ? "rounded-[16px] border-2 bg-white" : "rounded-2xl border border-border bg-card")}
        style={line}
      >
        <div
          ref={boxRef}
          tabIndex={0}
          role="group"
          aria-label={t("explore.chartLabel")}
          data-explore-chart=""
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onContextMenu={(e) => e.preventDefault()}
          onKeyDown={onKey}
          className="relative min-h-0 flex-1 cursor-crosshair touch-none select-none outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#8ea6ff]"
          style={{ WebkitTouchCallout: "none" }}
        >
        {ready ? (
          <svg className="absolute inset-0 h-full w-full" style={{ color: INK }} aria-hidden>
            <defs>
              <clipPath id={clipId}>
                <rect x={g.L} y={0} width={g.pw} height={size.h} />
              </clipPath>
            </defs>
            {yTicks.map((k) => (
              <g key={`y${k}`}>
                <line x1={g.L} x2={g.R} y1={yS(k)} y2={yS(k)} style={{ stroke: INK, strokeOpacity: 0.1 }} />
                <text x={g.R + 6} y={yS(k) + 3.5} className="font-mono text-[10.5px] font-semibold" style={{ fill: INK, fillOpacity: 0.55 }}>
                  {axisText(k)}
                </text>
              </g>
            ))}
            <g clipPath={`url(#${clipId})`}>
              {marks}
              {reading === "total" && cnt > 1 && visAvg > 0 && (
                <g>
                  <line x1={g.L} x2={g.R} y1={yS(visAvg)} y2={yS(visAvg)} style={{ stroke: INK, strokeWidth: 1.5, strokeDasharray: "5 4", strokeOpacity: 0.5 }} />
                  <text
                    x={g.L + 6}
                    y={yS(visAvg) - 5}
                    className="text-[10px] font-extrabold"
                    style={{ fill: INK, stroke: PAPER, strokeWidth: 3, paintOrder: "stroke", strokeLinejoin: "round" }}
                  >
                    {t("explore.avgShort", { v: axisText(visAvg) })}
                  </text>
                </g>
              )}
            </g>
            <line x1={g.L} x2={g.R} y1={base} y2={base} style={{ stroke: INK, strokeWidth: 1.5 }} />
            {/* En yüksek — seçim yokken */}
            {v.sel === null && reading !== "cumulative" && maxI >= 0 && maxV > 0 && (
              <text
                x={clamp(xc(maxI), g.L + 30, g.R - 30)}
                y={Math.max(g.T - 6, yS(maxV + (stacked ? (arr[maxI].rest ?? 0) : 0)) - 8)}
                textAnchor="middle"
                className="text-[10px] font-extrabold"
                style={{ fill: INK, stroke: PAPER, strokeWidth: 3, paintOrder: "stroke", strokeLinejoin: "round" }}
              >
                ▲ {axisText(maxV)}
              </text>
            )}
            {ticks.map(({ i, label }) => {
              const x = xc(i);
              if (x < g.L + 12 || x > g.R - 12) return null;
              const hide = crossOn && crossX !== null && Math.abs(x - crossX) < 42;
              return (
                <g key={`t${i}`}>
                  <line x1={x} x2={x} y1={g.B} y2={g.B + 4} style={{ stroke: INK, strokeWidth: 1.2 }} />
                  {!hide && (
                    <text x={x} y={size.h - 9} textAnchor="middle" className="font-mono text-[10.5px] font-semibold" style={{ fill: INK, fillOpacity: 0.55 }}>
                      {label}
                    </text>
                  )}
                </g>
              );
            })}
            {crossOn && crossX !== null && sel && (
              <g>
                <line x1={crossX} x2={crossX} y1={g.T - 10} y2={g.B} style={{ stroke: INK, strokeWidth: 1.5 }} />
                {pill(crossX, g.B + 5, shortLabel(sel, v.g), "px")}
                {selDrawn && (
                  <>
                    <line x1={g.L} x2={g.R} y1={yS(valOf(v.sel!))} y2={yS(valOf(v.sel!))} style={{ stroke: INK, strokeWidth: 1, strokeDasharray: "2 3", strokeOpacity: 0.45 }} />
                    {pill(g.R + 2, yS(valOf(v.sel!)) - 9, axisText(valOf(v.sel!)), "py", true)}
                  </>
                )}
              </g>
            )}
          </svg>
        ) : (
          n === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-[13px] font-bold text-muted-foreground">{t("explore.empty")}</div>
          )
        )}
        {toast && (
          <div className="pointer-events-none absolute inset-x-0 top-2 flex justify-center">
            <span className={cn("rounded-full px-3 py-1 text-[12px] font-extrabold", brutal ? "border-[1.5px] bg-[#ffd23f] text-[#111]" : "bg-foreground text-background")} style={line}>
              {toast}
            </span>
          </div>
        )}
        </div>
      </div>

      {/* Aralık — kovayı da seçer (1A günlük, 1Y haftalık, Tümü aylık) */}
      <div
        role="group"
        aria-label={t("explore.range")}
        className={cn("flex h-9 shrink-0 overflow-hidden rounded-[11px]", brutal ? "border-2 bg-white shadow-[2px_2px_0_#111]" : "border border-border bg-card")}
        style={line}
      >
        {PRESETS.map((p, k) => (
          <button
            key={p.key}
            type="button"
            aria-pressed={v.preset === p.key}
            onClick={() => applyPreset(p)}
            className={cn(segBtn(v.preset === p.key), "flex-1 text-[12.5px]", k > 0 && "border-l-[1.5px]")}
            style={k > 0 ? { borderLeftColor: brutal ? "#111" : "var(--border)" } : undefined}
          >
            {t(p.label)}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Okuma kutusunun ok karosu — Analiz'in üst bölümündeki ‹ dönem › okları gibi */
function StepArrow({
  brutal,
  dir,
  disabled,
  label,
  onClick,
}: {
  brutal: boolean;
  dir: -1 | 1;
  disabled: boolean;
  label: string;
  onClick: () => void;
}) {
  const Icon = dir < 0 ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center disabled:opacity-25 disabled:shadow-none",
        brutal
          ? "rounded-[10px] border-[1.5px] bg-white text-[#111] shadow-[1.5px_1.5px_0_#111] active:translate-x-px active:translate-y-px active:shadow-none"
          : "rounded-full bg-[var(--sf-2)] text-foreground"
      )}
      style={brutal ? { borderColor: "#111" } : undefined}
    >
      <Icon className="h-[18px] w-[18px]" strokeWidth={2.75} />
    </button>
  );
}

/** Üstü yuvarlak sütun (taban düz) */
function barPath(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, h, w / 2);
  const b = y + h;
  if (rr <= 0.5) return `M${x},${b}V${y}H${x + w}V${b}Z`;
  return `M${x},${b}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${b}Z`;
}
