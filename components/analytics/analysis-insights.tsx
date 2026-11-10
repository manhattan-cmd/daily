"use client";

import type { ReactNode } from "react";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Pencil, Sigma } from "lucide-react";
import { fmtNum, fmtPct } from "@/lib/analytics";
import { fmtInsightDate, partOfHour, weekdayNames } from "@/lib/insights";
import { useT, type MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
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
 * Her okuma bir satır: üstte adı ve dayanağı, iri bir cümle, altında küçük
 * bir çizim (iki çubuk, sütun dizisi, aralık şeridi, gün şeridi…). Hangi
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
  const track = brutal ? "rgba(17,17,17,0.08)" : "var(--sf-2)";
  const gray = brutal ? "rgba(17,17,17,0.24)" : "color-mix(in srgb, var(--muted-foreground) 40%, transparent)";

  const fv = (v: number) => (data.rate ? fmtPct(v) : `${fmtNum(v)}${unit ? ` ${unit}` : ""}`);
  /** Yön — yarım birimden (yüzde ya da puan) küçük fark "değişmedi" */
  const dirOf = (n: number | null): "up" | "down" | "flat" =>
    n === null || Math.abs(n) < 0.5 ? "flat" : n > 0 ? "up" : "down";
  const unitOf = (u: keyof typeof UNIT_KEY) => t(UNIT_KEY[u]);
  const basisOf = (b: string | number) => (typeof b === "number" ? t("ins.lastDays", { n: b }) : b);
  /** Süren dönemde karşılaştırmanın dayanağı — "ilk 10 gün", "bu saate kadar" */
  const trimNote =
    data.trimmed === null ? undefined : data.trimmed === "hour" ? t("ins.untilNow") : t("ins.firstDays", { n: data.trimmed });
  const joinBasis = (...parts: (string | undefined)[]) => parts.filter(Boolean).join(" · ") || undefined;

  /* ---------------- Küçük çizimler ---------------- */

  /** Yön oku — iyi/kötü yargısı yok (harcamanın artması iyi değil), rengi okumanın */
  const Badge = ({ dir }: { dir: "up" | "down" | "flat" }) => {
    const Icon = dir === "up" ? ArrowUpRight : dir === "down" ? ArrowDownRight : ArrowRight;
    return (
      <span
        aria-hidden
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
          brutal ? "border-[1.5px] border-[#111] text-[#111]" : ""
        )}
        style={
          brutal
            ? { background: `color-mix(in srgb, ${color} 45%, #fff)` }
            : { background: `color-mix(in srgb, ${color} 18%, transparent)`, color }
        }
      >
        <Icon className="h-4 w-4" strokeWidth={2.75} />
      </span>
    );
  };

  /** İki (ya da birkaç) yatay çubuk — bu dönem ile önceki, en yoğun gün ile ortalama gün */
  const Bars = ({ rows }: { rows: { label: string; v: number; text: string; accent: boolean }[] }) => {
    const max = Math.max(...rows.map((r) => r.v), 0) || 1;
    return (
      <div className="flex flex-col gap-1.5">
        {rows.map((r) => (
          <div key={r.label} className="grid grid-cols-[92px_minmax(0,1fr)_auto] items-center gap-2">
            <span className={cn("truncate text-[11px] font-bold", soft)}>{r.label}</span>
            <span
              className={cn("block h-3 overflow-hidden rounded-full", brutal && "border-[1.5px] border-[#111]")}
              style={{ background: brutal ? "#fff" : track }}
            >
              <span
                className="block h-full rounded-full"
                style={{ width: `${Math.max(2, (r.v / max) * 100)}%`, background: r.accent ? color : gray }}
              />
            </span>
            <span className="text-[11.5px] font-bold tabular-nums">{r.text}</span>
          </div>
        ))}
      </div>
    );
  };

  /** Sütun dizisi — geçmiş dönemler, haftanın günleri, saatler */
  const Columns = ({
    values,
    accent,
    avg,
    labels,
    height = 44,
  }: {
    values: (number | null)[];
    /** Renkli çizilecek sütunlar */
    accent: (i: number) => boolean;
    /** Kesik ortalama çizgisi */
    avg?: number;
    labels?: { at: number; text: string }[];
    height?: number;
  }) => {
    const nums = values.filter((v): v is number => v !== null);
    const lo = Math.min(0, ...nums);
    const hi = Math.max(...nums, avg ?? 0) || 1;
    const h = (v: number) => ((v - lo) / (hi - lo || 1)) * 100;
    return (
      <div>
        <div className="relative flex items-end gap-[3px]" style={{ height }}>
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
        </div>
        {labels && (
          <div className="relative mt-1 h-3.5">
            {labels.map((l) => (
              <span
                key={l.at}
                className={cn("absolute -translate-x-1/2 text-[9.5px] font-bold tabular-nums", soft)}
                style={{ left: `${((l.at + 0.5) / values.length) * 100}%` }}
              >
                {l.text}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  };

  /** Eğilim — kovaların noktaları ve en uygun doğru */
  const TrendLine = ({ pts, span, slope, intercept }: { pts: Pt[]; span: number; slope: number; intercept: number }) => {
    const W = 320;
    const H = 48;
    const ys = [...pts.map((p) => p.y), intercept, intercept + slope * (span - 1)];
    const lo = Math.min(...ys);
    const hi = Math.max(...ys);
    const X = (x: number) => (span > 1 ? (x / (span - 1)) * (W - 8) + 4 : W / 2);
    const Y = (y: number) => H - 5 - ((y - lo) / (hi - lo || 1)) * (H - 10);
    return (
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-12 w-full" preserveAspectRatio="none" aria-hidden>
        <polyline
          points={pts.map((p) => `${X(p.x)},${Y(p.y)}`).join(" ")}
          fill="none"
          stroke={gray}
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
        />
        <line
          x1={X(0)}
          y1={Y(intercept)}
          x2={X(span - 1)}
          y2={Y(intercept + slope * (span - 1))}
          stroke={brutal ? "#111" : color}
          strokeWidth={brutal ? 3 : 2.5}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        {brutal && (
          <line
            x1={X(0)}
            y1={Y(intercept)}
            x2={X(span - 1)}
            y2={Y(intercept + slope * (span - 1))}
            stroke={color}
            strokeWidth={1.5}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
    );
  };

  /** Aralık şeridi — uçlar, ortadaki yarı (bant) ve ortanca (çentik) */
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
              background: brutal ? color : `color-mix(in srgb, ${color} 55%, transparent)`,
            }}
          />
          <span
            className="absolute top-0 h-6 w-[3px] -translate-x-1/2 rounded-full"
            style={{ left: `${at(q.median)}%`, background: brutal ? "#111" : "var(--foreground)" }}
          />
        </div>
        <div className={cn("mt-0.5 flex justify-between text-[10px] font-bold tabular-nums", soft)}>
          <span>{fv(q.min)}</span>
          <span>{fv(q.max)}</span>
        </div>
      </div>
    );
  };

  /** Gün şeridi — dönemin günleri, kayıtlı olanlar renkli */
  const DayStrip = ({ days }: { days: StripDay[] }) => (
    <div className="grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${Math.min(days.length, 28)}, minmax(0, 1fr))` }}>
      {days.map((d, i) => (
        <span
          key={i}
          className={cn("block h-2.5 rounded-[3px]", d.today && (brutal ? "outline outline-[1.5px] outline-[#111]" : "outline outline-1 outline-foreground/60"))}
          style={{ background: d.on ? color : track }}
        />
      ))}
    </div>
  );

  /** Sıralı satırlar — en çok tekrarlananlar */
  const RankRows = ({ rows, total }: { rows: { label: string; count: number }[]; total: number }) => {
    const max = rows[0]?.count || 1;
    return (
      <div className="flex flex-col gap-1">
        {rows.map((r, i) => (
          <div key={r.label} className="grid grid-cols-[16px_minmax(0,1fr)_56px_auto] items-center gap-2">
            <span className={cn("text-[11px] font-black tabular-nums", soft)}>{i + 1}</span>
            <span className="truncate text-[12.5px] font-bold">{r.label}</span>
            <span className="block h-2 overflow-hidden rounded-full" style={{ background: track }}>
              <span className="block h-full rounded-full" style={{ width: `${(r.count / max) * 100}%`, background: i === 0 ? color : gray }} />
            </span>
            <span className={cn("whitespace-nowrap text-right text-[11px] font-bold tabular-nums", soft)}>
              {t("ins.times", { n: r.count })} · {fmtPct(r.count / (total || 1))}
            </span>
          </div>
        ))}
      </div>
    );
  };

  const Chips = ({ items }: { items: { label: string; extra?: string; dashed?: boolean }[] }) => (
    <div className="flex flex-wrap gap-1.5">
      {items.map((c) => (
        <span
          key={c.label}
          className={cn(
            "inline-flex max-w-full items-center gap-1 truncate rounded-full px-2.5 py-0.5 text-[11.5px] font-bold",
            brutal ? "border-[1.5px] border-[#111]" : "border border-border",
            c.dashed && "border-dashed opacity-70"
          )}
          style={c.dashed ? undefined : { background: brutal ? `color-mix(in srgb, ${color} 30%, #fff)` : `color-mix(in srgb, ${color} 15%, transparent)` }}
        >
          <span className="truncate">{c.label}</span>
          {c.extra && <span className={cn("tabular-nums", soft)}>{c.extra}</span>}
        </span>
      ))}
    </div>
  );

  /* ---------------- Okumalar ---------------- */

  type Row = { head?: ReactNode; sub?: ReactNode; badge?: ReactNode; basis?: string; visual?: ReactNode };

  const render = (key: InsightKey): Row | null => {
    switch (key) {
      case "change": {
        const d = data.change;
        if (!d) return null;
        // Fark: ortalamalarda puan, toplananlarda yüzde; önceki 0 ise miktar
        const x =
          d.points !== null
            ? t("stat.points", { n: fmtNum(Math.abs(d.points)) })
            : d.pct !== null
              ? fmtPct(Math.abs(d.pct) / 100)
              : d.diff
                ? fv(Math.abs(d.diff))
                : "";
        const dir = d.points !== null || d.pct !== null ? dirOf(d.points ?? d.pct) : d.diff > 0 ? "up" : d.diff < 0 ? "down" : "flat";
        return {
          head: !d.hasPrev ? t("ins.newHere") : dir === "flat" || !x ? t("ins.same") : t(dir === "up" ? "ins.upBy" : "ins.downBy", { x }),
          basis: d.hasPrev ? trimNote : undefined,
          sub: d.hasPrev ? undefined : t("ins.noPrev", { label: d.prevLabel }),
          badge: d.hasPrev ? Badge({ dir }) : undefined,
          visual: Bars({
            rows: [
              { label: d.curLabel, v: d.cur, text: fv(d.cur), accent: true },
              ...(d.hasPrev ? [{ label: d.prevLabel, v: d.prev, text: fv(d.prev), accent: false }] : []),
            ],
          }),
        };
      }
      case "history": {
        const d = data.history;
        if (!d) return null;
        const vs = d.vsPoints ?? d.vsPct;
        const x = d.vsPoints !== null ? t("stat.points", { n: fmtNum(Math.abs(d.vsPoints)) }) : fmtPct(Math.abs(d.vsPct ?? 0) / 100);
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
          visual: Columns({ values: d.values, accent: (i) => i === d.values.length - 1, avg: d.avg }),
        };
      }
      case "trend": {
        const d = data.trend;
        if (!d) return null;
        const step = Math.abs(d.slope) * (data.rate ? 100 : 1);
        const x = `${d.slope >= 0 ? "+" : "−"}${data.rate ? t("stat.points", { n: fmtNum(step) }) : `${fmtNum(step)}${unit ? ` ${unit}` : ""}`}`;
        return {
          head: t(d.dir === "up" ? "ins.up" : d.dir === "down" ? "ins.down" : "ins.flat"),
          sub: d.dir === "flat" ? t("ins.flatSub") : t(PER_KEY[d.per], { x }),
          badge: Badge({ dir: d.dir }),
          visual: TrendLine({ pts: d.pts, span: d.span, slope: d.slope, intercept: d.intercept }),
        };
      }
      case "projection": {
        const d = data.projection;
        if (!d || d.kind === "day" || d.kind === "all") return null;
        const end = t(END_KEY[d.kind]);
        return {
          head: `≈ ${fv(d.projected)}`,
          sub: t("ins.pace", { end }),
          visual: Bars({
            rows: [
              { label: t("ins.now"), v: d.cur, text: fv(d.cur), accent: true },
              { label: t("ins.projected"), v: d.projected, text: fv(d.projected), accent: true },
              ...(d.prevFull !== null ? [{ label: d.prevLabel, v: d.prevFull, text: fv(d.prevFull), accent: false }] : []),
            ],
          }),
        };
      }
      case "extremes": {
        const d = data.extremes;
        if (!d) return null;
        const line = (label: string, x: { v: number; at: number; sub?: string }, up: boolean) => (
          <div className="flex items-baseline gap-2">
            {up ? (
              <ArrowUpRight className="h-3.5 w-3.5 shrink-0 self-center" strokeWidth={2.75} style={{ color: brutal ? "#111" : color }} />
            ) : (
              <ArrowDownRight className="h-3.5 w-3.5 shrink-0 self-center" strokeWidth={2.75} style={{ color: brutal ? "#111" : color }} />
            )}
            <span className={cn("w-[70px] shrink-0 text-[11px] font-bold", soft)}>{label}</span>
            <b className="shrink-0 text-[14px] font-extrabold tabular-nums">{fv(x.v)}</b>
            <span className={cn("min-w-0 truncate text-[11px] font-semibold", soft)}>
              {fmtInsightDate(x.at)}
              {x.sub ? ` · ${x.sub}` : ""}
            </span>
          </div>
        );
        return {
          visual: (
            <div className="flex flex-col gap-1">
              {line(t("ins.highest"), d.max, true)}
              {line(t("ins.lowest"), d.min, false)}
            </div>
          ),
        };
      }
      case "typical": {
        const d = data.typical;
        if (!d) return null;
        return {
          head: `${fmtNum(d.q1)} – ${fv(d.q3)}`,
          sub: t("ins.typicalSub", { m: fv(d.median) }),
          visual: RangeStrip({ q: d }),
        };
      }
      case "peakDay": {
        const d = data.peakDay;
        if (!d) return null;
        return {
          head: fv(d.v),
          sub: t("ins.peakSub", { date: fmtInsightDate(d.at), x: fmtNum(d.v / (d.avgDay || 1)) }),
          visual: Bars({
            rows: [
              { label: t("ins.peak"), v: d.v, text: fv(d.v), accent: true },
              { label: t("ins.avgDay"), v: d.avgDay, text: fv(d.avgDay), accent: false },
            ],
          }),
        };
      }
      case "top": {
        const d = data.top;
        if (!d) return null;
        if (!d.repeats) return { head: t("ins.noRepeat"), sub: t("ins.distinct", { n: d.distinct }) };
        const first = d.rows[0];
        return {
          head: first.label,
          sub: t("ins.topSub", { n: first.count, pct: fmtPct(first.count / (d.total || 1)) }),
          visual: d.rows.length > 1 ? RankRows({ rows: d.rows, total: d.total }) : undefined,
        };
      }
      case "rare": {
        const d = data.rare;
        if (!d) return null;
        return {
          head: d.never.length ? t("ins.neverN", { n: d.never.length }) : t("ins.least", { label: d.least[0].label }),
          sub: d.never.length ? undefined : t("ins.allUsed"),
          visual: Chips({
            items: [
              ...d.never.slice(0, 8).map((l) => ({ label: l, extra: t("ins.never"), dashed: true })),
              ...(d.never.length > 8 ? [{ label: `+${d.never.length - 8}`, dashed: true }] : []),
              ...d.least.map((r) => ({ label: r.label, extra: t("ins.times", { n: r.count }) })),
            ],
          }),
        };
      }
      case "fresh": {
        const d = data.fresh;
        if (!d) return null;
        return {
          head: d.labels.length ? t("ins.freshN", { n: d.labels.length }) : t("ins.freshNone"),
          sub: !d.labels.length
            ? t("ins.freshNoneSub")
            : d.allBefore
              ? t("ins.freshSubAll")
              : t("ins.freshSub", { n: d.n, unit: unitOf(d.unit) }),
          visual: d.labels.length
            ? Chips({
                items: [
                  ...d.labels.slice(0, 8).map((l) => ({ label: l })),
                  ...(d.labels.length > 8 ? [{ label: `+${d.labels.length - 8}` }] : []),
                ],
              })
            : undefined,
        };
      }
      case "movers": {
        const d = data.movers;
        if (!d) return null;
        if (!d.up && !d.down) return { head: t("ins.sameShares"), basis: trimNote, sub: t("ins.vs", { label: d.prevLabel }) };
        const line = (x: { label: string; cur: number; prev: number }, up: boolean) => (
          <div className="flex items-center gap-2">
            {up ? (
              <ArrowUpRight className="h-3.5 w-3.5 shrink-0" strokeWidth={2.75} style={{ color: brutal ? "#111" : color }} />
            ) : (
              <ArrowDownRight className="h-3.5 w-3.5 shrink-0" strokeWidth={2.75} style={{ color: brutal ? "#111" : color }} />
            )}
            <span className="min-w-0 flex-1 truncate text-[12.5px] font-bold">{x.label}</span>
            <span className={cn("shrink-0 text-[11.5px] font-bold tabular-nums", soft)}>
              {x.prev} → {x.cur}
            </span>
          </div>
        );
        const lead = d.up ?? d.down!;
        return {
          head: t(d.up ? "ins.rose" : "ins.fell", { label: lead.label }),
          basis: trimNote,
          sub: t("ins.vs", { label: d.prevLabel }),
          visual: (
            <div className="flex flex-col gap-1">
              {d.up && line(d.up, true)}
              {d.down && line(d.down, false)}
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
            labels: short.map((s, i) => ({ at: i, text: s })),
            height: 40,
          }),
        };
      }
      case "hours": {
        const d = data.hours;
        if (!d) return null;
        const hh = `${String(d.peakHour).padStart(2, "0")}:00`;
        return {
          head: t("ins.mostly", { part: t(PART_KEY[d.part]) }),
          basis: basisOf(d.basis),
          sub: t("ins.hoursSub", { share: fmtPct(d.share), h: hh }),
          visual: Columns({
            values: d.hours,
            accent: (h) => partOfHour(h) === d.part,
            labels: [0, 6, 12, 18].map((h) => ({ at: h, text: String(h).padStart(2, "0") })),
            height: 36,
          }),
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
          head: d.avgGap <= 1.05 ? t("ins.everyDay") : t("ins.everyN", { n: fmtNum(d.avgGap) }),
          sub: [d.longestGap ? t("ins.longestGap", { n: d.longestGap }) : t("ins.noGap"), when && t("ins.last", { when })]
            .filter(Boolean)
            .join(" · "),
          visual: DayStrip({ days: d.strip }),
        };
      }
      case "streak": {
        const d = data.streak;
        if (!d) return null;
        return {
          head: d.current ? t(d.yes ? "ins.yesStreakHead" : "ins.streakHead", { n: d.current }) : t("ins.noStreak"),
          sub: t("ins.streakSub", { best: d.best, a: d.active, e: d.elapsed }),
          visual: DayStrip({ days: d.strip }),
        };
      }
    }
  };

  const rows = keys.map((k) => ({ key: k, row: render(k) })).filter((r): r is { key: InsightKey; row: Row } => !!r.row);

  const Item = ({ k, row }: { k: InsightKey; row: Row }) => (
    <div key={k} data-insight={k} className={cn("flex min-w-0 flex-col", brutal ? "bg-white px-3.5 py-3 text-[#111]" : "px-4 py-3.5")}>
      <div className="flex min-w-0 items-baseline gap-1.5">
        <span className={cn("shrink-0 text-[10px] font-black uppercase tracking-wide", soft)}>{t(INSIGHT_LABEL[k])}</span>
        {row.basis && <span className={cn("min-w-0 truncate text-[10px] font-bold opacity-75", soft)}>· {row.basis}</span>}
      </div>
      {(row.head || row.badge) && (
        <div className="mt-1 flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            {row.head && <div className="truncate text-[17px] font-extrabold leading-tight tracking-tight">{row.head}</div>}
            {row.sub && <div className={cn("mt-0.5 text-[11.5px] font-semibold leading-snug", soft)}>{row.sub}</div>}
          </div>
          {row.badge}
        </div>
      )}
      {row.visual && <div className={row.head ? "mt-2.5" : "mt-1.5"}>{row.visual}</div>}
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
