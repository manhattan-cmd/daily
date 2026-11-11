"use client";

import type { ReactNode } from "react";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Pencil, Sigma } from "lucide-react";
import { fmtPct } from "@/lib/analytics";
import { fmtInsightDate, partOfHour, weekdayNames } from "@/lib/insights";
import { intlTag, useT, type MessageKey } from "@/lib/i18n";
import { cn, dateFormatter, numberFormatter } from "@/lib/utils";
import { SummaryBlock, SummaryTile } from "@/components/ui/summary-block";
import { useIsBrutal } from "@/components/structure/brutal";
import type { InsightKey } from "@/types";
import type { InsightData, Pt, StripDay } from "./insight-data";
import { ViewMenu } from "./view-menu";

/**
 * İstatistikler — grafiklerin altında, dönemin rakamlarının bağlamı:
 * öncekine göre, geçmişin içinde, eğilim, uçlar, tekrarlar, haftanın günü,
 * günün saati, sıklık, seri. Eskiden yerinde İstikrar ve Gelişim bölümleri
 * vardı; ikisi buradaki "Seri ve düzen" ile "Öncekine göre" oldu.
 *
 * Her okuma bir kutu: üstte adı ve dayanağı, iri bir cevap (yönü varsa
 * solunda ok, yanında küçük rakam), altında etiketleri okunur bir çizim
 * (rakam kutuları, sütun dizisi, pay çubuğu, aralık şeridi, seri
 * kapsülleri…). Bir şey söylemeyen sonuç ("Tekrar yok") tek satır olur ve
 * en sona iner. Sayılar uygulamanın dilinde (3.957 ₺). Hangi
 * okumaların duracağı Düzenle'den, çoklu seçimle; menü yalnız ölçüye uyan
 * okumaları sunar (bkz. lib/insights INSIGHTS_FOR). Veri yetmeyen okuma
 * (iki günlük dönemde haftanın günü) sessizce çizilmez.
 */

export const INSIGHT_LABEL: Record<InsightKey, MessageKey> = {
  change: "ins.change",
  history: "ins.history",
  trend: "ins.trend",
  projection: "ins.projection",
  extremes: "ins.extremes",
  typical: "ins.typical",
  peakDay: "ins.peakDay",
  top: "ins.top",
  rare: "ins.rare",
  fresh: "ins.fresh",
  movers: "ins.movers",
  weekday: "ins.weekday",
  hours: "ins.hours",
  rhythm: "ins.rhythm",
  streak: "ins.streak",
};

const INSIGHT_HINT: Record<InsightKey, MessageKey> = {
  change: "ins.changeHint",
  history: "ins.historyHint",
  trend: "ins.trendHint",
  projection: "ins.projectionHint",
  extremes: "ins.extremesHint",
  typical: "ins.typicalHint",
  peakDay: "ins.peakDayHint",
  top: "ins.topHint",
  rare: "ins.rareHint",
  fresh: "ins.freshHint",
  movers: "ins.moversHint",
  weekday: "ins.weekdayHint",
  hours: "ins.hoursHint",
  rhythm: "ins.rhythmHint",
  streak: "ins.streakHint",
};

const UNIT_KEY = {
  day: "ins.unit.day",
  week: "ins.unit.week",
  month: "ins.unit.month",
  year: "ins.unit.year",
  custom: "ins.unit.custom",
  all: "ins.unit.all",
} as const satisfies Record<string, MessageKey>;

const END_KEY = {
  week: "ins.end.week",
  month: "ins.end.month",
  year: "ins.end.year",
  custom: "ins.end.custom",
} as const satisfies Record<string, MessageKey>;

const PER_KEY = { day: "ins.per.day", week: "ins.per.week", month: "ins.per.month" } as const satisfies Record<string, MessageKey>;

/** Eğilim açıklamasında kovanın sıfatı — "Günlük toplam" */
const ADJ_KEY = { day: "ins.adj.day", week: "ins.adj.week", month: "ins.adj.month" } as const satisfies Record<string, MessageKey>;

const PART_KEY = {
  morning: "ins.part.morning",
  afternoon: "ins.part.afternoon",
  evening: "ins.part.evening",
  night: "ins.part.night",
} as const satisfies Record<string, MessageKey>;

/** Brütal bloğun başı — leylak (eski Gelişim'in rengi) */
const LEAD = "#c9b8ff";

export function AnalysisInsights({
  data,
  keys,
  options,
  onToggle,
  color,
  unit,
  block = false,
}: {
  data: InsightData;
  /** Panoda duranlar, katalog sırasıyla */
  keys: InsightKey[];
  /** Bu ölçüde sunulanlar — Düzenle menüsü */
  options: InsightKey[];
  onToggle: (key: InsightKey) => void;
  /** Okumanın rengi (özelliğin ya da kategorinin) */
  color: string;
  unit?: string;
  /** Brütal blok (SummaryBlock) olarak çiz */
  block?: boolean;
}) {
  const t = useT();
  const brutal = useIsBrutal();

  // Renk ve zeminler — brütalde siyah mürekkep, sade temada temanın tonları
  const soft = brutal ? "text-[#111]/60" : "text-muted-foreground";
  const ink = brutal ? "text-[#111]" : "text-foreground";
  const track = brutal ? "rgba(17,17,17,0.08)" : "var(--sf-2)";
  const gray = brutal ? "rgba(17,17,17,0.24)" : "color-mix(in srgb, var(--muted-foreground) 40%, transparent)";
  /** Rengin açık tonları — sıralı paylar, öteki seri günleri */
  const tint = (pct: number) =>
    brutal ? `color-mix(in srgb, ${color} ${pct}%, #fff)` : `color-mix(in srgb, ${color} ${pct}%, transparent)`;

  /** Sayılar uygulamanın dilinde — Türkçede 3.957 ve 1,3; milyondan
   *  büyükse kısa (1,2 Mn). Eskiden en-US ve 10 binden büyükte "10.8K" */
  const num = (n: number) => {
    const abs = Math.abs(n);
    return numberFormatter(
      intlTag(),
      abs >= 1e6 ? { notation: "compact", maximumFractionDigits: 1 } : { maximumFractionDigits: abs >= 100 ? 0 : 1 }
    ).format(n);
  };
  const fv = (v: number) => (data.rate ? fmtPct(v) : `${num(v)}${unit ? ` ${unit}` : ""}`);
  /** Yön — yarım birimden (yüzde ya da puan) küçük fark "değişmedi" */
  const dirOf = (n: number | null): "up" | "down" | "flat" =>
    n === null || Math.abs(n) < 0.5 ? "flat" : n > 0 ? "up" : "down";
  const unitOf = (u: keyof typeof UNIT_KEY) => t(UNIT_KEY[u]);
  const basisOf = (b: string | number) => (typeof b === "number" ? t("ins.lastDays", { n: b }) : b);
  /** Süren dönemde karşılaştırmanın dayanağı — "ilk 10 gün", "bu saate kadar" */
  const trimNote =
    data.trimmed === null ? undefined : data.trimmed === "hour" ? t("ins.untilNow") : t("ins.firstDays", { n: data.trimmed });
  const joinBasis = (...parts: (string | undefined)[]) => parts.filter(Boolean).join(" · ") || undefined;
  const dayShort = (at: number) => dateFormatter(intlTag(), { day: "numeric", month: "short" }).format(new Date(at));

  /* ---------------- Küçük çizimler ---------------- */

  /** Yön oku — başlığın solunda; iyi/kötü yargısı yok (harcamanın artması
   *  iyi değil), rengi okumanın */
  const Arrow = ({ dir, size = 22 }: { dir: "up" | "down" | "flat"; size?: number }) => {
    const Icon = dir === "up" ? ArrowUpRight : dir === "down" ? ArrowDownRight : ArrowRight;
    return (
      <span
        aria-hidden
        className={cn("flex shrink-0 items-center justify-center rounded-[7px]", brutal && "border-[1.5px] border-[#111] text-[#111]")}
        style={{
          width: size,
          height: size,
          ...(brutal ? { background: tint(45) } : { background: tint(18), color }),
        }}
      >
        <Icon style={{ width: size * 0.64, height: size * 0.64 }} strokeWidth={3} />
      </span>
    );
  };

  /** Rakam kutuları — iki dönem, iki uç, iki gün yan yana; altta isteğe
   *  bağlı ince çubuk (aynı ölçekte) */
  const Cells = ({
    cells,
  }: {
    cells: { label: ReactNode; value: string; note?: string; bar?: number; accent?: boolean }[];
  }) => (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))` }}>
      {cells.map((c, i) => (
        <div
          key={i}
          className={cn("min-w-0 rounded-[10px] px-2.5 pb-2 pt-1.5", brutal ? "border-[1.5px] border-[#111]" : "border border-border")}
          style={c.accent ? { background: tint(brutal ? 20 : 10) } : brutal ? { background: "#fff" } : undefined}
        >
          <div className={cn("flex min-w-0 items-center gap-1 text-[10.5px] font-bold", soft)}>{c.label}</div>
          <div className="truncate text-[17px] font-extrabold leading-tight tracking-tight tabular-nums">{c.value}</div>
          {c.note && <div className={cn("truncate text-[10.5px] font-semibold", soft)}>{c.note}</div>}
          {c.bar !== undefined && (
            <span className="mt-1.5 block h-[5px] overflow-hidden rounded-full" style={{ background: track }}>
              <span
                className="block h-full rounded-full"
                style={{ width: `${Math.max(3, Math.min(1, c.bar) * 100)}%`, background: c.accent ? color : gray }}
              />
            </span>
          )}
        </div>
      ))}
    </div>
  );

  /** Sütun dizisi — geçmiş dönemler, haftanın günleri, saatler. Üstte
   *  isteğe bağlı değerler, altta adlar; vurgulu sütunun adı koyu */
  const Columns = ({
    values,
    accent,
    avg,
    labels,
    tops,
    height = 44,
  }: {
    values: (number | null)[];
    /** Renkli çizilecek sütunlar */
    accent: (i: number) => boolean;
    /** Kesik ortalama çizgisi */
    avg?: number;
    labels?: { at: number; text: string; strong?: boolean }[];
    /** Sütunun üstündeki değer */
    tops?: { at: number; text: string; strong?: boolean }[];
    height?: number;
  }) => {
    const nums = values.filter((v): v is number => v !== null);
    const lo = Math.min(0, ...nums);
    const hi = Math.max(...nums, avg ?? 0) || 1;
    const h = (v: number) => ((v - lo) / (hi - lo || 1)) * 100;
    const at = (i: number) => `${((i + 0.5) / values.length) * 100}%`;
    return (
      <div>
        <div className="relative flex items-end gap-[3px]" style={{ height, marginTop: tops?.length ? 15 : 0 }}>
          {values.map((v, i) => (
            <span
              key={i}
              className={cn("block min-w-0 flex-1 rounded-t-[3px]", brutal && v !== null && accent(i) && "outline outline-[1.5px] outline-[#111]")}
              style={{
                height: v === null ? 2 : `max(2px, ${h(v)}%)`,
                background: v === null ? track : accent(i) ? color : gray,
              }}
            />
          ))}
          {avg !== undefined && (
            <span
              aria-hidden
              className="pointer-events-none absolute inset-x-0 border-t-[1.5px] border-dashed"
              style={{ bottom: `${h(avg)}%`, borderColor: brutal ? "#111" : "var(--foreground)", opacity: 0.55 }}
            />
          )}
          {tops?.map((tp) => (
            <span
              key={tp.at}
              className={cn(
                // Zemin: kesik ortalama çizgisi yazının üstünden geçmesin
                "absolute -translate-x-1/2 whitespace-nowrap rounded-[3px] px-0.5 text-[9.5px] tabular-nums leading-none",
                brutal ? "bg-white" : "bg-card",
                tp.strong ? cn("font-extrabold", ink) : cn("font-bold", soft)
              )}
              style={{ left: at(tp.at), bottom: `calc(${h(values[tp.at] ?? 0)}% + 4px)` }}
            >
              {tp.text}
            </span>
          ))}
        </div>
        {labels && (
          <div className="relative mt-1 h-3.5">
            {labels.map((l) => (
              <span
                key={l.at}
                className={cn(
                  "absolute -translate-x-1/2 whitespace-nowrap text-[9.5px] tabular-nums",
                  l.strong ? cn("font-extrabold", ink) : cn("font-bold", soft)
                )}
                style={{ left: at(l.at) }}
              >
                {l.text}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  };

  /** Açıklama satırı — küçük işaret ve adı */
  const Key = ({ mark, children }: { mark: ReactNode; children: ReactNode }) => (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      {mark}
      <span className="truncate">{children}</span>
    </span>
  );
  const legend = cn("flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] font-bold", soft);

  /**
   * Eğilim — kovaların kendisi (toplananlarda sütun, ortalamalarda nokta) ve
   * üstünde en uygun doğru; doğrunun iki ucunda değeri, altta eksen ve
   * açıklama. Yarım kova (süren gün, kayıtların ortasında başladığı hafta)
   * toplananlarda kesik çerçeveyle, hesaba katılmadan durur.
   */
  const TrendChart = ({ d }: { d: NonNullable<InsightData["trend"]> }) => {
    const xs = d.pts.map((p) => p.x);
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs);
    const fit = (x: number) => d.intercept + d.slope * x;
    const ends = [fit(x0), fit(x1)];
    const vals = [...d.pts.map((p) => p.y), ...ends, ...d.skipped.map((p) => p.y)];
    let lo: number;
    let hi: number;
    if (d.range) {
      // Skala ve oran kendi uçlarında; doğru taşarsa eksen genişler
      lo = Math.min(d.range[0], ...ends);
      hi = Math.max(d.range[1], ...ends);
    } else if (d.bars) {
      lo = Math.min(0, ...vals);
      hi = Math.max(...vals);
    } else {
      const a = Math.min(...vals);
      const b = Math.max(...vals);
      const pad = (b - a) * 0.15 || Math.abs(b) * 0.1 || 1;
      lo = a - pad;
      hi = b + pad;
    }
    /** Değerin yüksekliği, alttan yüzde */
    const Y = (v: number) => ((v - lo) / (hi - lo || 1)) * 100;
    /** Kovanın ortası, soldan yüzde */
    const X = (x: number) => ((x + 0.5) / d.span) * 100;
    const at = new Map(d.pts.map((p) => [p.x, p.y]));
    const skip = new Map(d.skipped.map((p) => [p.x, p.y]));

    const line = brutal ? "#111" : color;
    const fill = tint(brutal ? 42 : 30);
    const pill = brutal
      ? "border-[1.5px] border-[#111] bg-white text-[#111]"
      : "border border-border bg-card text-foreground";

    /** Doğrunun ucu: halka ve değeri — üst kısımdaysa altında, değilse üstünde */
    const End = ({ x, v, side }: { x: number; v: number; side: "start" | "end" }) => {
      const y = Y(v);
      const below = y > 62;
      return (
        <>
          <span
            aria-hidden
            className={cn("absolute h-2.5 w-2.5 -translate-x-1/2 translate-y-1/2 rounded-full", brutal ? "border-[1.5px] border-[#111] bg-white" : "border-2 bg-card")}
            style={{ left: `${X(x)}%`, bottom: `${y}%`, borderColor: brutal ? undefined : color }}
          />
          <span
            className={cn(
              "absolute whitespace-nowrap rounded-full px-1.5 py-px text-[10px] font-extrabold tabular-nums leading-[14px]",
              pill
            )}
            style={{
              ...(side === "start" ? { left: `max(0px, calc(${X(x)}% - 6px))` } : { right: `max(0px, calc(${100 - X(x)}% - 6px))` }),
              ...(below ? { top: `calc(${100 - y}% + 8px)` } : { bottom: `calc(${y}% + 8px)` }),
            }}
          >
            ≈ {fv(v)}
          </span>
        </>
      );
    };

    const mid = Math.floor((d.span - 1) / 2);
    const ticks = d.span > 2 ? [0, mid, d.span - 1] : [0, d.span - 1];
    const series = t(d.range && data.rate ? "ins.trendSeries.rate" : d.bars ? "ins.trendSeries.sum" : "ins.trendSeries.avg", {
      per: t(ADJ_KEY[d.per]),
    });

    return (
      <div>
        {/* Çizim alanı — üstte uç değerlerine pay; skala ve oranda solda
            eksenin uçları ("1"–"5", "%0"–"%100"), yoksa noktanın yüksekliği
            neye göre okunacağı belli değildi */}
        <div className="relative flex h-[112px] pt-5">
          {d.range && (
            <div className={cn("relative mr-1.5 w-7 shrink-0 text-right text-[9.5px] font-bold tabular-nums leading-none", soft)}>
              <span className="absolute right-0 top-0 -translate-y-1/2">{fv(hi)}</span>
              <span className="absolute bottom-0 right-0 translate-y-1/2">{fv(lo)}</span>
            </div>
          )}
          <div
            className={cn(
              "relative h-full min-w-0 flex-1",
              d.bars && (brutal ? "border-b-[1.5px] border-[#111]" : "border-b border-border"),
              d.range && "border-y border-dashed"
            )}
            style={d.range ? { borderColor: gray } : undefined}
          >
            {d.bars && (
              <div className="absolute inset-0 flex items-end" style={{ gap: d.span <= 40 ? 2 : d.span <= 80 ? 1 : 0 }}>
                {Array.from({ length: d.span }, (_, i) => {
                  const v = at.get(i);
                  const half = skip.get(i);
                  return (
                    <span
                      key={i}
                      className={cn("block min-w-0 flex-1 rounded-t-[2px]", half !== undefined && "border-[1.5px] border-dashed border-b-0")}
                      style={{
                        height: half !== undefined ? `max(3px, ${Y(half)}%)` : v === undefined ? 0 : `max(2px, ${Y(v)}%)`,
                        background: half !== undefined ? "transparent" : fill,
                        borderColor: half !== undefined ? (brutal ? "#111" : color) : undefined,
                        opacity: half !== undefined ? 0.7 : 1,
                      }}
                    />
                  );
                })}
              </div>
            )}
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
              {/* Noktaları bağlayan soluk çizgi yalnız ardışık kovalarda —
                  kaydı olmayan kovanın üstünden geçmez (orada veri yok) */}
              {!d.bars &&
                d.pts
                  .reduce<Pt[][]>((runs, p, i) => {
                    if (i && p.x === d.pts[i - 1].x + 1) runs[runs.length - 1].push(p);
                    else runs.push([p]);
                    return runs;
                  }, [])
                  .filter((run) => run.length > 1)
                  .map((run) => (
                    <polyline
                      key={run[0].x}
                      points={run.map((p) => `${X(p.x)},${100 - Y(p.y)}`).join(" ")}
                      fill="none"
                      stroke={gray}
                      strokeWidth={1.25}
                      strokeLinejoin="round"
                      vectorEffect="non-scaling-stroke"
                    />
                  ))}
              <line
                x1={X(x0)}
                y1={100 - Y(ends[0])}
                x2={X(x1)}
                y2={100 - Y(ends[1])}
                stroke={line}
                strokeWidth={brutal ? 3.5 : 2.5}
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
              {brutal && (
                <line
                  x1={X(x0)}
                  y1={100 - Y(ends[0])}
                  x2={X(x1)}
                  y2={100 - Y(ends[1])}
                  stroke={color}
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              )}
            </svg>
            {!d.bars &&
              d.pts.map((p) => (
                <span
                  key={p.x}
                  aria-hidden
                  className={cn("absolute h-[7px] w-[7px] -translate-x-1/2 translate-y-1/2 rounded-full", brutal && "border border-[#111]")}
                  style={{ left: `${X(p.x)}%`, bottom: `${Y(p.y)}%`, background: brutal ? fill : tint(55) }}
                />
              ))}
            {End({ x: x0, v: ends[0], side: "start" })}
            {End({ x: x1, v: ends[1], side: "end" })}
          </div>
        </div>
        {/* Eksen — ilk, orta ve son kova */}
        <div className={cn("relative mt-1 h-3.5", d.range && "ml-[34px]")}>
          {ticks.map((i, n) => (
            <span
              key={i}
              className={cn("absolute whitespace-nowrap text-[9.5px] font-bold tabular-nums", soft)}
              style={
                n === 0
                  ? { left: 0 }
                  : n === ticks.length - 1
                    ? { right: 0 }
                    : { left: `${X(i)}%`, transform: "translateX(-50%)" }
              }
            >
              {d.labels[i]}
            </span>
          ))}
        </div>
        {/* Açıklama */}
        <div className={cn("mt-1.5", legend)}>
          {Key({
            mark: (
              <span
                aria-hidden
                className={cn(d.bars ? "h-2.5 w-2 rounded-[2px]" : "h-[7px] w-[7px] rounded-full", brutal && !d.bars && "border border-[#111]")}
                style={{ background: d.bars || brutal ? fill : tint(55) }}
              />
            ),
            children: series,
          })}
          {Key({ mark: <span aria-hidden className="h-[3px] w-3.5 rounded-full" style={{ background: line }} />, children: t("ins.trendLine") })}
          {d.skipped.length > 0 &&
            Key({
              mark: (
                <span aria-hidden className="h-2.5 w-2 rounded-t-[2px] border-[1.5px] border-b-0 border-dashed" style={{ borderColor: brutal ? "#111" : color }} />
              ),
              children: t("ins.trendOpen"),
            })}
        </div>
      </div>
    );
  };

  /** Dönem sonu — tek çubukta şimdiye kadar (dolu), bu gidişle gelecek
   *  kısım (taralı) ve geçen dönemin tamamı (çentik) */
  const Projection = ({ d }: { d: NonNullable<InsightData["projection"]> }) => {
    const max = Math.max(d.projected, d.prevFull ?? 0) || 1;
    const pc = (v: number) => (v / max) * 100;
    const hatch = `repeating-linear-gradient(135deg, ${tint(brutal ? 70 : 55)} 0 3px, transparent 3px 6px)`;
    const tick = brutal ? "#111" : "var(--foreground)";
    return (
      <div>
        <div className="relative py-1">
          <div
            className={cn("relative h-4 overflow-hidden rounded-[6px]", brutal && "border-[1.5px] border-[#111]")}
            style={{ background: brutal ? "#fff" : track }}
          >
            <span className="absolute inset-y-0 left-0" style={{ width: `${pc(d.cur)}%`, background: color }} />
            <span
              className={cn("absolute inset-y-0", brutal && "border-l-[1.5px] border-[#111]")}
              style={{ left: `${pc(d.cur)}%`, width: `${Math.max(0, pc(d.projected) - pc(d.cur))}%`, background: hatch }}
            />
          </div>
          {d.prevFull !== null && (
            <span
              aria-hidden
              className="absolute inset-y-0 w-[3px] -translate-x-1/2 rounded-full"
              style={{ left: `${pc(d.prevFull)}%`, background: tick }}
            />
          )}
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {[
            { mark: <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: color }} />, label: t("ins.now"), v: d.cur },
            {
              mark: <span className={cn("h-2.5 w-2.5 rounded-[3px]", brutal && "border border-[#111]")} style={{ background: hatch }} />,
              label: t("ins.projected"),
              v: d.projected,
            },
            ...(d.prevFull !== null
              ? [{ mark: <span className="h-3 w-[3px] rounded-full" style={{ background: tick }} />, label: d.prevLabel, v: d.prevFull }]
              : []),
          ].map((x) => (
            <div key={x.label} className="min-w-0">
              <div className={cn("flex min-w-0 items-center gap-1.5 text-[10.5px] font-bold", soft)}>
                <span aria-hidden className="flex w-2.5 shrink-0 justify-center">
                  {x.mark}
                </span>
                <span className="truncate">{x.label}</span>
              </div>
              <div className="truncate pl-4 text-[13px] font-extrabold tabular-nums">{fv(x.v)}</div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  /** Aralık şeridi — uçlar, ortadaki yarı (bant) ve ortanca (çentik); altında
   *  her girdi ince bir çizgi */
  const RangeStrip = ({ q }: { q: NonNullable<InsightData["typical"]> }) => {
    const span = q.max - q.min || 1;
    const at = (v: number) => ((v - q.min) / span) * 100;
    return (
      <div>
        <div className="relative h-6">
          <span className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full" style={{ background: gray }} />
          <span
            className={cn("absolute top-1/2 h-4 -translate-y-1/2 rounded-[5px]", brutal && "border-[1.5px] border-[#111]")}
            style={{
              left: `${at(q.q1)}%`,
              width: `max(6px, ${at(q.q3) - at(q.q1)}%)`,
              background: brutal ? color : tint(55),
            }}
          />
          <span
            className="absolute top-0 h-6 w-[3px] -translate-x-1/2 rounded-full"
            style={{ left: `${at(q.median)}%`, background: brutal ? "#111" : "var(--foreground)" }}
          />
        </div>
        <div className="relative mt-1.5 h-2.5" aria-hidden>
          {q.values.map((v, i) => (
            <span
              key={i}
              className="absolute inset-y-0 w-[2px] -translate-x-1/2 rounded-full"
              style={{
                left: `${at(v)}%`,
                background: v >= q.q1 && v <= q.q3 ? color : brutal ? "#111" : "var(--foreground)",
                opacity: v >= q.q1 && v <= q.q3 ? 0.85 : 0.35,
              }}
            />
          ))}
        </div>
        <div className={cn("mt-1 flex items-baseline justify-between gap-2 text-[10px] font-bold tabular-nums", soft)}>
          <span>{fv(q.min)}</span>
          <span className="truncate font-semibold opacity-80">{t("ins.ticks")}</span>
          <span>{fv(q.max)}</span>
        </div>
      </div>
    );
  };

  /**
   * Gün şeridi — dönemin günleri; art arda kayıtlı günler tek kapsül, içinde
   * kaç gün sürdüğü. Şimdiki seri koyu, ötekiler açık; altta ilk ve son gün.
   */
  const RunStrip = ({ days, current }: { days: StripDay[]; current: number }) => {
    if (!days.length) return null;
    const cols = Math.min(days.length, 28);
    const last = days.length - 1;
    const curEnd = current > 0 ? (days[last].on ? last : last - 1) : -1;
    const curStart = curEnd - current + 1;
    const segs: { start: number; len: number; on: boolean; today: boolean; run: number; head: boolean }[] = [];
    let i = 0;
    while (i < days.length) {
      if (!days[i].on) {
        segs.push({ start: i, len: 1, on: false, today: days[i].today, run: 0, head: false });
        i++;
        continue;
      }
      let end = i;
      while (end < days.length && days[end].on) end++;
      // Satır sonunda kapsül bölünür; sayı yalnız ilk parçada
      for (let s = i; s < end; ) {
        let e = s + 1;
        while (e < end && e % cols !== 0) e++;
        segs.push({ start: s, len: e - s, on: true, today: days.slice(s, e).some((d) => d.today), run: end - i, head: s === i });
        s = e;
      }
      i = end;
    }
    return (
      <div>
        <div className="grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {segs.map((s) => {
            const cur = s.on && s.start >= curStart && s.start <= curEnd;
            return (
              <span
                key={s.start}
                className={cn(
                  "flex h-4 items-center justify-center overflow-hidden rounded-[4px] text-[9.5px] font-black tabular-nums leading-none",
                  s.on && cur && brutal && "border-[1.5px] border-[#111]",
                  !s.on && s.today && (brutal ? "border-[1.5px] border-dashed border-[#111]" : "border border-dashed border-foreground/60"),
                  s.on && cur ? (brutal ? "text-[#111]" : "text-white") : soft
                )}
                style={{ gridColumn: `span ${s.len}`, background: !s.on ? track : cur ? color : tint(brutal ? 40 : 35) }}
              >
                {s.head && s.run >= 2 && s.len >= 2 ? s.run : null}
              </span>
            );
          })}
        </div>
        <div className={cn("mt-1 flex justify-between text-[9.5px] font-bold tabular-nums", soft)}>
          <span>{dayShort(days[0].at)}</span>
          <span>{days[last].today ? t("ins.today") : dayShort(days[last].at)}</span>
        </div>
      </div>
    );
  };

  /** Payların tek çubuğu — en çok girilen üçü renk tonlarıyla, kalanı gri;
   *  altında adları, kaç kez ve payı */
  const ShareBar = ({ rows, total }: { rows: { label: string; count: number }[]; total: number }) => {
    const shade = (i: number) => (i === 0 ? color : tint(i === 1 ? 55 : 28));
    const rest = total - rows.reduce((a, r) => a + r.count, 0);
    const all = [...rows.map((r, i) => ({ ...r, fill: shade(i) })), ...(rest > 0 ? [{ label: t("ins.other"), count: rest, fill: gray }] : [])];
    return (
      <div>
        <div
          className={cn("flex h-4 overflow-hidden rounded-[6px]", brutal && "border-[1.5px] border-[#111]")}
          style={{ background: track }}
        >
          {all.map((r, i) => (
            <span
              key={r.label}
              className={cn("block h-full", brutal && i > 0 && "border-l-[1.5px] border-[#111]")}
              style={{ width: `${(r.count / (total || 1)) * 100}%`, background: r.fill }}
            />
          ))}
        </div>
        <div className="mt-2 flex flex-col gap-1">
          {all.map((r, i) => (
            <div key={r.label} className="flex min-w-0 items-center gap-2">
              <span
                aria-hidden
                className={cn("h-2.5 w-2.5 shrink-0 rounded-[3px]", brutal && "border border-[#111]")}
                style={{ background: r.fill }}
              />
              <span className={cn("min-w-0 flex-1 truncate text-[12.5px]", i === 0 ? "font-extrabold" : "font-bold")}>{r.label}</span>
              <span className={cn("shrink-0 text-[11px] font-bold tabular-nums", soft)}>{t("ins.times", { n: r.count })}</span>
              <span className="w-9 shrink-0 text-right text-[11.5px] font-extrabold tabular-nums">{fmtPct(r.count / (total || 1))}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const Chips = ({ items }: { items: { label: string; extra?: string; dashed?: boolean }[] }) => (
    <div className="flex min-w-0 flex-wrap gap-1.5">
      {items.map((c) => (
        <span
          key={c.label}
          className={cn(
            "inline-flex max-w-full items-center gap-1 truncate rounded-full px-2.5 py-0.5 text-[11.5px] font-bold",
            brutal ? "border-[1.5px] border-[#111]" : "border border-border",
            c.dashed && "border-dashed opacity-70"
          )}
          style={c.dashed ? undefined : { background: tint(brutal ? 30 : 15) }}
        >
          <span className="truncate">{c.label}</span>
          {c.extra && <span className={cn("tabular-nums", soft)}>{c.extra}</span>}
        </span>
      ))}
    </div>
  );

  /** Öbek — solda küçük adı ("hiç", "az"), sağda içeriği */
  const Group = ({ label, children }: { label: string; children: ReactNode }) => (
    <div className="flex min-w-0 items-start gap-2">
      <span className={cn("w-7 shrink-0 pt-[5px] text-[10px] font-black uppercase tracking-wide", soft)}>{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );

  /** Değişen pay — aynı ölçekte önceki (boş halka) ve şimdiki (dolu) */
  const Mover = ({ x, max }: { x: { label: string; cur: number; prev: number }; max: number }) => {
    const pc = (v: number) => 4 + (v / (max || 1)) * 92;
    const a = pc(Math.min(x.cur, x.prev));
    const b = pc(Math.max(x.cur, x.prev));
    const diff = x.cur - x.prev;
    return (
      <div key={x.label} className="grid grid-cols-[minmax(0,88px)_minmax(0,1fr)_auto] items-center gap-2.5">
        <span className="truncate text-[12.5px] font-bold">{x.label}</span>
        <span className="relative block h-4">
          <span className="absolute inset-x-0 top-1/2 h-[2px] -translate-y-1/2 rounded-full" style={{ background: track }} />
          <span className="absolute top-1/2 h-[3px] -translate-y-1/2 rounded-full" style={{ left: `${a}%`, width: `${b - a}%`, background: color }} />
          <span
            className={cn("absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2", brutal ? "border-[#111] bg-white" : "bg-card")}
            style={{ left: `${pc(x.prev)}%`, borderColor: brutal ? undefined : gray }}
          />
          <span
            className={cn("absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full", brutal && "border-[1.5px] border-[#111]")}
            style={{ left: `${pc(x.cur)}%`, background: color }}
          />
        </span>
        <span className="whitespace-nowrap text-right text-[11.5px] font-bold tabular-nums">
          <span className={soft}>
            {x.prev} → {x.cur}
          </span>{" "}
          <b className="font-extrabold">{diff > 0 ? `+${diff}` : `−${Math.abs(diff)}`}</b>
        </span>
      </div>
    );
  };

  /* ---------------- Okumalar ---------------- */

  type Row = {
    head?: ReactNode;
    sub?: ReactNode;
    /** Başlığın solunda — yön oku */
    lead?: ReactNode;
    /** Başlığın sağında küçük rakam — "+95 ₺", "×1,7" */
    tag?: string;
    basis?: string;
    visual?: ReactNode;
    /** Bir şey söylemeyen sonuç ("Tekrar yok") — tek satır, en sonda */
    quiet?: boolean;
  };

  const render = (key: InsightKey): Row | null => {
    switch (key) {
      case "change": {
        const d = data.change;
        if (!d) return null;
        // Fark: ortalamalarda puan, toplananlarda yüzde; önceki 0 ise miktar
        const x =
          d.points !== null
            ? t("stat.points", { n: num(Math.abs(d.points)) })
            : d.pct !== null
              ? fmtPct(Math.abs(d.pct) / 100)
              : d.diff
                ? fv(Math.abs(d.diff))
                : "";
        const dir = d.points !== null || d.pct !== null ? dirOf(d.points ?? d.pct) : d.diff > 0 ? "up" : d.diff < 0 ? "down" : "flat";
        const max = Math.max(d.cur, d.prev) || 1;
        return {
          head: !d.hasPrev ? t("ins.newHere") : dir === "flat" || !x ? t("ins.same") : t(dir === "up" ? "ins.upBy" : "ins.downBy", { x }),
          basis: d.hasPrev ? trimNote : undefined,
          sub: d.hasPrev ? undefined : t("ins.noPrev", { label: d.prevLabel }),
          lead: d.hasPrev ? Arrow({ dir }) : undefined,
          // Toplananlarda yüzdenin yanında miktarı da — "%2" tek başına az şey söyler
          tag: d.hasPrev && d.pct !== null && d.diff ? `${d.diff > 0 ? "+" : "−"}${fv(Math.abs(d.diff))}` : undefined,
          visual: Cells({
            cells: [
              { label: d.curLabel, value: fv(d.cur), bar: d.cur / max, accent: true },
              ...(d.hasPrev ? [{ label: d.prevLabel, value: fv(d.prev), bar: d.prev / max }] : []),
            ],
          }),
        };
      }
      case "history": {
        const d = data.history;
        if (!d) return null;
        const vs = d.vsPoints ?? d.vsPct;
        const x = d.vsPoints !== null ? t("stat.points", { n: num(Math.abs(d.vsPoints)) }) : fmtPct(Math.abs(d.vsPct ?? 0) / 100);
        const n = d.values.length;
        const lastI = n - 1;
        // Az sütunda hepsinin adı ve değeri; çokta seyreltilir, sonuncusu hep
        const step = n <= 6 ? 1 : Math.ceil(n / 5);
        const shown = (i: number) => i === lastI || (lastI - i) % step === 0;
        const maxI = d.values.reduce<number>((m, v, i) => (v !== null && (m < 0 || v > (d.values[m] ?? -Infinity)) ? i : m), -1);
        return {
          head: d.rank === 1 ? t("ins.rankTop") : d.lowest ? t("ins.rankBottom") : t("ins.rankN", { n: d.rank }),
          basis: joinBasis(
            d.unit === "all"
              ? t("ins.ofLastBlocks", { weeks: d.of * 4 })
              : t("ins.ofLast", { n: d.of, unit: unitOf(d.unit) }),
            trimNote
          ),
          sub:
            vs === null || dirOf(vs) === "flat"
              ? t("ins.atAvg")
              : t(vs > 0 ? "ins.aboveAvg" : "ins.belowAvg", { x }),
          visual: (
            <div>
              {Columns({
                values: d.values,
                accent: (i) => i === lastI,
                avg: d.avg,
                height: 52,
                tops: d.values.flatMap((v, i) =>
                  v === null || !(n <= 6 || i === lastI || i === maxI) ? [] : [{ at: i, text: fv(v), strong: i === lastI }]
                ),
                labels: d.labels.flatMap((l, i) => (shown(i) ? [{ at: i, text: l, strong: i === lastI }] : [])),
              })}
              <div className={cn("mt-1.5", legend)}>
                {Key({
                  mark: <span aria-hidden className="w-3.5 border-t-[1.5px] border-dashed" style={{ borderColor: brutal ? "#111" : "var(--foreground)", opacity: 0.7 }} />,
                  children: t("ins.avgLine", { v: fv(d.avg) }),
                })}
              </div>
            </div>
          ),
        };
      }
      case "trend": {
        const d = data.trend;
        if (!d) return null;
        /** İşaretli fark — oranda puan, ötekilerde birimiyle; küçük adım iki
         *  anlamlı basamakla (skalada "günde +0" yazıyordu) */
        const signed = (n: number) => {
          const v = Math.abs(n) * (data.rate ? 100 : 1);
          const s = v && v < 0.1 ? numberFormatter(intlTag(), { maximumSignificantDigits: 2 }).format(v) : num(v);
          return `${n >= 0 ? "+" : "−"}${data.rate ? t("stat.points", { n: s }) : `${s}${unit ? ` ${unit}` : ""}`}`;
        };
        const xs = d.pts.map((p) => p.x);
        const over = d.slope * (Math.max(...xs) - Math.min(...xs));
        return {
          head: t(d.dir === "up" ? "ins.up" : d.dir === "down" ? "ins.down" : "ins.flat"),
          sub:
            d.dir === "flat"
              ? t("ins.flatSub")
              : `${t(PER_KEY[d.per], { x: signed(d.slope) })} · ${t("ins.trendOver", { x: signed(over) })}`,
          lead: Arrow({ dir: d.dir }),
          visual: TrendChart({ d }),
        };
      }
      case "projection": {
        const d = data.projection;
        if (!d || d.kind === "day" || d.kind === "all") return null;
        const end = t(END_KEY[d.kind]);
        return {
          head: `≈ ${fv(d.projected)}`,
          sub: t("ins.pace", { end }),
          tag: d.prevFull ? `${d.projected >= d.prevFull ? "+" : "−"}${fmtPct(Math.abs(d.projected - d.prevFull) / d.prevFull)}` : undefined,
          visual: Projection({ d }),
        };
      }
      case "extremes": {
        const d = data.extremes;
        if (!d) return null;
        const cell = (label: string, x: { v: number; at: number; sub?: string }, up: boolean) => ({
          label: (
            <>
              {Arrow({ dir: up ? "up" : "down", size: 15 })}
              <span className="truncate">{label}</span>
            </>
          ),
          value: fv(x.v),
          note: `${fmtInsightDate(x.at)}${x.sub ? ` · ${x.sub}` : ""}`,
          accent: up,
        });
        return {
          visual: Cells({ cells: [cell(t("ins.highest"), d.max, true), cell(t("ins.lowest"), d.min, false)] }),
        };
      }
      case "typical": {
        const d = data.typical;
        if (!d) return null;
        return {
          head: `${num(d.q1)} – ${fv(d.q3)}`,
          sub: t("ins.typicalSub", { m: fv(d.median) }),
          visual: RangeStrip({ q: d }),
        };
      }
      case "peakDay": {
        const d = data.peakDay;
        if (!d) return null;
        const max = Math.max(d.v, d.avgDay) || 1;
        return {
          head: fv(d.v),
          sub: fmtInsightDate(d.at),
          tag: `×${num(d.v / (d.avgDay || 1))}`,
          visual: Cells({
            cells: [
              { label: t("ins.peak"), value: fv(d.v), bar: d.v / max, accent: true },
              { label: t("ins.avgDay"), value: fv(d.avgDay), bar: d.avgDay / max },
            ],
          }),
        };
      }
      case "top": {
        const d = data.top;
        if (!d) return null;
        if (!d.repeats) return { head: t("ins.noRepeat"), sub: t("ins.distinct", { n: d.distinct }), quiet: true };
        const first = d.rows[0];
        return {
          head: first.label,
          sub: t("ins.topSub", { n: first.count, pct: fmtPct(first.count / (d.total || 1)) }),
          visual: ShareBar({ rows: d.rows, total: d.total }),
        };
      }
      case "rare": {
        const d = data.rare;
        if (!d) return null;
        return {
          head: d.never.length ? t("ins.neverN", { n: d.never.length }) : t("ins.least", { label: d.least[0].label }),
          sub: d.never.length ? undefined : t("ins.allUsed"),
          visual: (
            <div className="flex flex-col gap-1.5">
              {d.never.length > 0 &&
                Group({
                  label: t("ins.never"),
                  children: Chips({
                    items: [
                      ...d.never.slice(0, 8).map((l) => ({ label: l, dashed: true })),
                      ...(d.never.length > 8 ? [{ label: `+${d.never.length - 8}`, dashed: true }] : []),
                    ],
                  }),
                })}
              {d.least.length > 0 &&
                Group({
                  label: t("ins.rarely"),
                  children: Chips({ items: d.least.map((r) => ({ label: r.label, extra: t("ins.times", { n: r.count }) })) }),
                })}
            </div>
          ),
        };
      }
      case "fresh": {
        const d = data.fresh;
        if (!d) return null;
        if (!d.labels.length) return { head: t("ins.freshNone"), sub: t("ins.freshNoneSub"), quiet: true };
        return {
          head: t("ins.freshN", { n: d.labels.length }),
          sub: d.allBefore ? t("ins.freshSubAll") : t("ins.freshSub", { n: d.n, unit: unitOf(d.unit) }),
          visual: Chips({
            items: [
              ...d.labels.slice(0, 8).map((l) => ({ label: l })),
              ...(d.labels.length > 8 ? [{ label: `+${d.labels.length - 8}` }] : []),
            ],
          }),
        };
      }
      case "movers": {
        const d = data.movers;
        if (!d) return null;
        if (!d.up && !d.down) return { head: t("ins.sameShares"), basis: trimNote, sub: t("ins.vs", { label: d.prevLabel }), quiet: true };
        const lead = d.up ?? d.down!;
        const rows = [d.up, d.down].filter((x): x is NonNullable<typeof x> => !!x);
        const max = Math.max(...rows.flatMap((r) => [r.cur, r.prev]));
        return {
          head: t(d.up ? "ins.rose" : "ins.fell", { label: lead.label }),
          basis: trimNote,
          lead: Arrow({ dir: d.up ? "up" : "down" }),
          visual: (
            <div>
              <div className="flex flex-col gap-1.5">{rows.map((r) => Mover({ x: r, max }))}</div>
              <div className={cn("mt-2", legend)}>
                {Key({
                  mark: (
                    <span
                      aria-hidden
                      className={cn("h-2.5 w-2.5 rounded-full border-2", brutal ? "border-[#111] bg-white" : "bg-card")}
                      style={{ borderColor: brutal ? undefined : gray }}
                    />
                  ),
                  children: d.prevLabel,
                })}
                {Key({
                  mark: <span aria-hidden className={cn("h-2.5 w-2.5 rounded-full", brutal && "border border-[#111]")} style={{ background: color }} />,
                  children: d.curLabel,
                })}
              </div>
            </div>
          ),
        };
      }
      case "weekday": {
        const d = data.weekday;
        if (!d) return null;
        const short = weekdayNames("short");
        const long = weekdayNames("long");
        const v = d.values[d.best] ?? 0;
        const value = fv(v);
        return {
          head: t(d.mode === "avg" ? "ins.highestDay" : "ins.busiest", { day: long[d.best] }),
          basis: basisOf(d.basis),
          sub: t(d.mode === "avg" ? "ins.weekdaySubAvg" : "ins.weekdaySub", {
            value,
            day: long[d.worst],
            value2: fv(d.values[d.worst] ?? 0),
          }),
          visual: Columns({
            values: d.values,
            accent: (i) => i === d.best,
            tops: d.values.flatMap((x, i) => (x === null ? [] : [{ at: i, text: data.rate ? fmtPct(x) : num(x), strong: i === d.best }])),
            labels: short.map((s, i) => ({ at: i, text: s, strong: i === d.best })),
            height: 44,
          }),
        };
      }
      case "hours": {
        const d = data.hours;
        if (!d) return null;
        const hh = `${String(d.peakHour).padStart(2, "0")}:00`;
        // Günün bölümleri saat çizgisinin altında — hangisi yoğunsa renkli
        const parts: { part: keyof typeof PART_KEY; from: number; to: number; named: boolean }[] = [
          { part: "night", from: 0, to: 5, named: true },
          { part: "morning", from: 5, to: 12, named: true },
          { part: "afternoon", from: 12, to: 17, named: true },
          { part: "evening", from: 17, to: 22, named: true },
          { part: "night", from: 22, to: 24, named: false },
        ];
        return {
          head: t("ins.mostly", { part: t(PART_KEY[d.part]) }),
          basis: basisOf(d.basis),
          sub: t("ins.hoursSub", { share: fmtPct(d.share), h: hh }),
          visual: (
            <div>
              {Columns({
                values: d.hours,
                accent: (h) => partOfHour(h) === d.part,
                tops: [{ at: d.peakHour, text: hh, strong: true }],
                height: 40,
              })}
              <div className="mt-1 grid gap-[3px]" style={{ gridTemplateColumns: "repeat(24, minmax(0, 1fr))" }}>
                {parts.map((p) => {
                  const on = p.part === d.part;
                  return (
                    <span
                      key={p.from}
                      className={cn(
                        "flex h-[18px] items-center justify-center overflow-hidden whitespace-nowrap rounded-[4px] text-[9.5px] leading-none",
                        on ? cn("font-extrabold", ink, brutal && "border-[1.5px] border-[#111]") : cn("font-bold", soft)
                      )}
                      style={{ gridColumn: `${p.from + 1} / ${p.to + 1}`, background: on ? tint(brutal ? 45 : 25) : track }}
                    >
                      {p.named ? t(PART_KEY[p.part]) : null}
                    </span>
                  );
                })}
              </div>
            </div>
          ),
        };
      }
      case "rhythm": {
        const d = data.rhythm;
        if (!d) return null;
        const when =
          d.sinceLast === null
            ? null
            : d.sinceLast === 0
              ? t("ins.today")
              : d.sinceLast === 1
                ? t("ins.yesterday")
                : t("ins.daysAgo", { n: d.sinceLast });
        return {
          head: d.avgGap <= 1.05 ? t("ins.everyDay") : t("ins.everyN", { n: num(d.avgGap) }),
          visual: Cells({
            cells: [
              { label: t("ins.longestGapLabel"), value: d.longestGap ? t("ins.nDays", { n: d.longestGap }) : t("ins.noGapShort") },
              ...(when ? [{ label: t("ins.lastLabel"), value: when }] : []),
            ],
          }),
        };
      }
      case "streak": {
        const d = data.streak;
        if (!d) return null;
        return {
          head: d.current ? t(d.yes ? "ins.yesStreakHead" : "ins.streakHead", { n: d.current }) : t("ins.noStreak"),
          sub: t("ins.streakSub", { best: d.best, a: d.active, e: d.elapsed }),
          visual: RunStrip({ days: d.strip, current: d.current }),
        };
      }
    }
  };

  // Bir şey söylemeyen sonuçlar ("Tekrar yok") tek satır olarak en sona
  const all = keys.map((k) => ({ key: k, row: render(k) })).filter((r): r is { key: InsightKey; row: Row } => !!r.row);
  const rows = [...all.filter((r) => !r.row.quiet), ...all.filter((r) => r.row.quiet)];

  const tagCls = cn(
    "mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[11.5px] font-extrabold tabular-nums leading-[16px]",
    brutal ? "border-[1.5px] border-[#111] bg-white text-[#111]" : "bg-[var(--sf-2)] text-foreground"
  );

  const Item = ({ k, row }: { k: InsightKey; row: Row }) =>
    row.quiet ? (
      <div
        key={k}
        data-insight={k}
        className={cn("flex min-w-0 items-baseline gap-2", brutal ? "bg-white px-3.5 py-2.5 text-[#111]" : "px-4 py-2.5")}
      >
        <span className={cn("shrink-0 text-[10.5px] font-black uppercase tracking-wide", soft)}>{t(INSIGHT_LABEL[k])}</span>
        <span className="min-w-0 flex-1 truncate text-right text-[12px] font-bold">
          {row.head}
          {row.sub && <span className={cn("font-semibold", soft)}> · {row.sub}</span>}
        </span>
      </div>
    ) : (
      <div key={k} data-insight={k} className={cn("flex min-w-0 flex-col", brutal ? "bg-white px-3.5 py-3 text-[#111]" : "px-4 py-3.5")}>
        <div className="flex min-w-0 items-baseline gap-1.5">
          <span className={cn("shrink-0 text-[10.5px] font-black uppercase tracking-wide", soft)}>{t(INSIGHT_LABEL[k])}</span>
          {row.basis && <span className={cn("min-w-0 truncate text-[10.5px] font-bold opacity-75", soft)}>· {row.basis}</span>}
        </div>
        {row.head && (
          <div className="mt-1.5 flex min-w-0 items-start gap-2">
            {row.lead && <span className="mt-px">{row.lead}</span>}
            <div className="min-w-0 flex-1">
              <div className="truncate text-[18px] font-extrabold leading-tight tracking-tight">{row.head}</div>
              {row.sub && <div className={cn("mt-0.5 text-[11.5px] font-semibold leading-snug", soft)}>{row.sub}</div>}
            </div>
            {row.tag && <span className={tagCls}>{row.tag}</span>}
          </div>
        )}
        {row.visual && <div className={row.head ? "mt-3" : "mt-1"}>{row.visual}</div>}
      </div>
    );

  const empty = (
    <div className={cn("text-center text-[12px] font-semibold", soft, brutal ? "bg-white px-3.5 py-4" : "px-4 py-5")}>
      {keys.length ? t("ins.empty") : t("ins.noneSelected")}
    </div>
  );

  const menu = (trigger: ReactNode, triggerClassName?: string) => (
    <ViewMenu
      label={t("ins.menu")}
      value=""
      selected={keys}
      options={options.map((o) => ({ key: o, label: t(INSIGHT_LABEL[o]), hint: t(INSIGHT_HINT[o]) }))}
      onPick={(k) => onToggle(k as InsightKey)}
      triggerClassName={triggerClassName}
    >
      {trigger}
    </ViewMenu>
  );

  if (block) {
    return (
      <SummaryBlock
        compact
        lead={{ kind: "title", color: LEAD, glyph: Sigma, overline: t("ins.title"), title: t("ins.title") }}
        action={menu(<SummaryTile compact color="#ffffff" icon={Pencil} label={t("action.edit")} />)}
        stats={[]}
      >
        {rows.length ? rows.map((r) => Item({ k: r.key, row: r.row })) : empty}
      </SummaryBlock>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 px-1">
        <h3 className="min-w-0 flex-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("ins.title")}</h3>
        {menu(
          <>
            <Pencil className="h-3 w-3" />
            {t("action.edit")}
          </>,
          "-mr-1 flex h-7 shrink-0 items-center gap-1 rounded-full bg-[var(--sf-2)] px-2.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-[var(--sf-3)] hover:text-foreground"
        )}
      </div>
      <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
        {rows.length ? rows.map((r) => Item({ k: r.key, row: r.row })) : empty}
      </div>
    </div>
  );
}
