"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Activity,
  ArrowRight,
  BarChart3,
  CalendarDays,
  CalendarRange,
  ChartColumnStacked,
  Gauge,
  Layers,
  LayoutGrid,
  LineChart,
  Link2,
  Moon,
  Shapes,
  Smile,
  Star,
  SunMoon,
  type LucideIcon,
} from "lucide-react";
import { db } from "@/lib/db";
import { intlTag, useLocale, useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { routes } from "@/lib/routes";
import { bucketKeyOf, buildSeriesBuckets, chooseGranularity, dayKey, shortMonth, startOfDayMs, type Granularity } from "@/lib/analytics";
import { dayPeriod, monthPeriod, periodProgress, periodShortLabel, shiftPeriod, weekPeriod, type Period } from "@/lib/period";
import {
  EMOTION_GRID,
  EMOTION_LOOKS,
  EmotionFace,
  SCALE_STEP_KEYS,
  ScaleFace,
  emotionLook,
  emotionName,
  moodText,
  scaleColor,
  scaleLabelsAreDefault,
  type EmotionQuadrant,
} from "@/lib/icons/emotions";
import {
  DAY_PARTS,
  DAY_PART_HOURS,
  averageOfDays,
  buildRecords,
  byDay,
  dayChanges,
  emotionCounts,
  emotionLevels,
  emotionPairs,
  highlights,
  isMoodModName,
  levelDistribution,
  levelSlot,
  linkStats,
  partStats,
  pickMoodMods,
  quadrantCounts,
  quadrantsOf,
  scaleOf,
  sleepNights,
  sleepVsMood,
  weekdayStats,
  type DayPart,
  type DayStat,
  type MoodRecord,
  type MoodScale,
  type QuadCounts,
} from "@/lib/mood-analytics";
import { SummaryBlock, SummaryEmpty, SummaryTile } from "@/components/ui/summary-block";
import { EmotionCapsule, LevelCapsule } from "@/components/dashboard/entry-parts";
import { StatCell } from "./stat-tiles";
import { EntryListBlock, type EntryListRow } from "./entry-list";
import { PeriodCategoryPanel } from "./period-category-panel";
import type { Category, Mod, SubCategory } from "@/types";
import { blockFill } from "@/lib/fill";

/**
 * Ruh hali analizi — Analiz'de yer olarak Ruh hali seçilince genel panelin
 * yerine açılan özel sayfa (araştırma: claude.ai/artifact/Q6AqNTr5Gj6USv6FxgotQu).
 *
 * Genel panel bir özelliği okuyor (Duygular seçiliyse duyguları kırmızı
 * karelerle sayıyor, Mutluluk seçiliyse ortalamasını). Ruh halinde iki
 * özellik birlikte anlam taşıyor; sayfa ikisini aynı anda okuyor ve
 * özellik seçicisine gerek bırakmıyor. Kişinin Ruh hali kategorisine kendi
 * eklediği bir özellik seçilirse genel panel açılır.
 *
 * Analiz sayfalarının blok dilinde (bkz. PeriodCategoryPanel): üstte yerin
 * bloğu ve sayıları, altında her analiz kendi ince başlı bloğunda. Bu
 * adımda yalnız ruh hali verisiyle olanlar: özet, zaman haritası (gün akışı
 * / yedi gün / takvim / yılın pikselleri), mutluluk çizgisi, dağılım,
 * duygular, duygu haritası, öne çıkan günler, girdiler.
 *
 * Hesap kuralları lib/mood-analytics'te: gün ortalaması günün kayıtlarından,
 * dönem ortalaması günlerden; kayıtsız gün tahmin edilmez.
 */
export function MoodPanel(props: {
  category: Category;
  period: Period;
  path: SubCategory[];
  metricId: string;
  onDrill: (subId: string) => void;
  onResolved?: (metricId: string) => void;
  /** Sayfanın baş bloğu (bkz. PeriodCategoryPanel renderHead) */
  renderHead?: (body: ReactNode) => ReactNode;
}) {
  const { metricId, renderHead } = props;
  // Seçili özellik kişinin kendi eklediği bir özellikse (yerleşik Mutluluk
  // ve Duygular değil) o özelliğin genel analizi
  const metricMod = useLiveQuery(
    async () => (metricId === "count" ? null : ((await db.mods.get(metricId)) ?? null)),
    [metricId]
  );
  if (metricMod === undefined) return renderHead ? <div className="flex flex-col gap-4">{renderHead(null)}</div> : null;
  if (metricMod && !isMoodModName(metricMod.name)) return <PeriodCategoryPanel {...props} />;
  return <MoodBody category={props.category} period={props.period} focus={props.path[props.path.length - 1]} renderHead={renderHead} />;
}

/** Karşılaştırma penceresi: günde o günü kapsayan hafta, takvim dönemlerinde bir önceki; Tümü ve özel aralıkta yok */
function refPeriodOf(p: Period): Period | null {
  if (p.kind === "day") return weekPeriod(p.start);
  if (p.kind === "week" || p.kind === "month" || p.kind === "year") return shiftPeriod(p, -1);
  return null;
}

function useMoodData(categoryId: string, focusId: string | undefined, start: number, end: number) {
  return useLiveQuery(async () => {
    const subs = await db.subcategories.where("categoryId").equals(categoryId).toArray();
    let ids = subs.map((s) => s.id);
    if (focusId) {
      // İnilen kalem ve bütün altları
      const keep = new Set([focusId]);
      for (let grew = true; grew; ) {
        grew = false;
        for (const s of subs) {
          if (s.parentId && keep.has(s.parentId) && !keep.has(s.id)) {
            keep.add(s.id);
            grew = true;
          }
        }
      }
      ids = [...keep];
    }
    const entries = (await db.entries.where("subcategoryId").anyOf(ids).toArray()).filter(
      (e) => e.occurredAt >= start && e.occurredAt < end
    );
    const values = entries.length
      ? (await db.entryValues.where("entryId").anyOf(entries.map((e) => e.id)).toArray()).filter((v) => !v.thingId)
      : [];
    const modIds = [...new Set(values.map((v) => v.modId).filter((x): x is string => !!x))];
    const mods = (await db.mods.bulkGet(modIds)).filter((m): m is Mod => !!m);
    return { entries, values, mods };
  }, [categoryId, focusId, start, end]);
}

/** Uyku kayıtları ve bütün kategorilerin girdileri (bağlantı için) */
function useContextData(start: number, end: number, enabled: boolean) {
  return useLiveQuery(async () => {
    if (!enabled) return null;
    const [cats, subs, entries] = await Promise.all([
      db.categories.toArray(),
      db.subcategories.toArray(),
      db.entries.where("occurredAt").between(start, end, true, false).toArray(),
    ]);
    const sleepCats = new Set(cats.filter((c) => c.builtInKey === "sleep").map((c) => c.id));
    const sleepSubs = new Set(subs.filter((x) => sleepCats.has(x.categoryId)).map((x) => x.id));
    const sleepEntries = entries.filter((e) => sleepSubs.has(e.subcategoryId));
    const sleepValues = sleepEntries.length
      ? (await db.entryValues.where("entryId").anyOf(sleepEntries.map((e) => e.id)).toArray()).filter((v) => !v.thingId)
      : [];
    const modIds = [...new Set(sleepValues.map((v) => v.modId).filter((x): x is string => !!x))];
    const sleepMods = (await db.mods.bulkGet(modIds)).filter((m): m is Mod => !!m);
    return { cats, subs, entries, sleepEntries, sleepValues, sleepMods };
  }, [start, end, enabled]);
}

/** Blokların baş renkleri — analiz sayfasının bölüm renkleriyle aynı aile */
const LEAD = {
  map: "#7ae582",
  trend: "#8ea6ff",
  dist: "#ffd23f",
  emotions: "#ff9ecd",
  emoMap: "#c9b8ff",
  highlights: "#ffb38a",
  flow: "#7fe0d3",
  emoHap: "#b8f28c",
  pairs: "#f6b8ff",
  weekdays: "#a8d8ff",
  parts: "#ffe08a",
  vol: "#d9d4c7",
  sleep: "#a9b8e6",
  links: "#e6c3a0",
};

/** Bölgelerin rengi — haritadaki köşe tonları (bkz. EMOTION_LOOKS) */
const QUAD_COLOR: Record<EmotionQuadrant, string> = {
  tense: "#ef372a",
  lively: "#faac0f",
  low: "#487aef",
  serene: "#36b57a",
};
/** Yığının sırası, alttan üste: hoşlar altta, aradaki sınır hoş payını çiziyor */
const QUAD_STACK: EmotionQuadrant[] = ["serene", "lively", "tense", "low"];
/** Bir pazartesi — hafta günlerinin adları için */
const MONDAY = new Date(2026, 10, 16).getTime();

/** İnce başlı analiz bloğu — başta renk + simge + ad, altında soluk açıklama */
function Section({
  color,
  glyph,
  title,
  hint,
  children,
}: {
  color: string;
  glyph: LucideIcon;
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <SummaryBlock compact lead={{ kind: "title", color, glyph, overline: title, title, hint }} stats={[]}>
      {children}
    </SummaryBlock>
  );
}

/** Hücrenin küçük etiketi — StatCell'in etiketiyle aynı */
const LABEL = "block text-[9.5px] font-black uppercase leading-[11px] text-ink/60";
/** Kayıtsız günün kesik çerçevesi (brütalde border-color sınıfı ezilir, satır içi) */
const DASHED = { borderStyle: "dashed", borderColor: "color-mix(in srgb, var(--ink) 32%, transparent)" } as const;

function MoodBody({
  category,
  period,
  focus,
  renderHead,
}: {
  category: Category;
  period: Period;
  focus?: SubCategory;
  renderHead?: (body: ReactNode) => ReactNode;
}) {
  const t = useT();
  const locale = useLocale();
  const tag = intlTag(locale);
  const router = useRouter();
  const [allEmotions, setAllEmotions] = useState(false);
  const [allLevels, setAllLevels] = useState(false);
  const [allLinks, setAllLinks] = useState(false);

  const ref = useMemo(() => refPeriodOf(period), [period]);
  const ctxStart = period.kind === "day" ? period.start - 30 * 86400000 : period.start;
  const fetchStart = Math.min(ctxStart, ref?.start ?? period.start);
  const fetchEnd = Math.max(period.end, ref?.end ?? period.end);
  const data = useMoodData(category.id, focus?.id, fetchStart, fetchEnd);
  // Uyku ve öteki kayıtlar (3. adım) — haftada yok
  const ctx = useContextData(ctxStart, period.end, period.kind !== "week");

  const nf1 = useMemo(() => new Intl.NumberFormat(tag, { minimumFractionDigits: 1, maximumFractionDigits: 1 }), [tag]);
  const pctFmt = useMemo(() => new Intl.NumberFormat(tag, { style: "percent", maximumFractionDigits: 0 }), [tag]);

  const view = useMemo(() => {
    if (!data) return null;
    const { scale: scaleMod, emotion: emoMod } = pickMoodMods(data.mods);
    const scale = scaleOf(scaleMod);
    const records = buildRecords(data.entries, data.values, scaleMod?.id, emoMod?.id);
    const cur = records.filter((r) => r.at >= period.start && r.at < period.end);
    const prev = ref ? records.filter((r) => r.at >= ref.start && r.at < ref.end) : [];
    const days = byDay(cur);
    const now = new Date();
    const progress = periodProgress(period, now, period.kind === "all" ? (cur[0]?.at ?? now.getTime()) : undefined);
    const counts = emotionCounts(cur);
    const prevDays = byDay(prev);
    const rated = (ds: DayStat[]) => ds.filter((d) => d.avg !== null).length;
    // Kıyas ancak önceki dönemde yeterli veri varsa: en az 3 gün (günde,
    // haftasından 2 gün) ve bu dönemin dörtte biri kadar. Yalnız Aralık'ı
    // kayıtlı bir yılla kıyas "▲0,1" gibi anlamsız bir fark veriyordu.
    const comparable = !!ref && rated(prevDays) >= (period.kind === "day" ? 2 : Math.max(3, Math.ceil(rated(days) / 4)));
    const prevCounts = emotionCounts(prev);
    const prevPicks = prevCounts.reduce((s, [, c]) => s + c, 0);
    return {
      // Bugün — takvimde gelecek günler ve Tümü'nün sonu (çizim saf kalsın diye burada)
      nowMs: now.getTime(),
      scale,
      named: scale.values.length === SCALE_STEP_KEYS.length && scaleLabelsAreDefault(scaleMod?.scaleLabels),
      cur,
      days,
      avg: averageOfDays(days),
      refAvg: comparable ? averageOfDays(prevDays) : null,
      progress,
      counts,
      // Duyguların önceki dönemdeki PAYI — sayı kıyaslanmıyor: süren ay biten
      // aydan kısa, sayılar hep düşmüş görünürdü
      prevShares:
        comparable && period.kind !== "day" && prevPicks >= 10
          ? new Map(prevCounts.map(([n, c]) => [n, c / prevPicks]))
          : null,
      dist: levelDistribution(cur, scale),
      hl: highlights(days),
      // Önceki dönemin dalgalanması — kıyas yalnız yeterli veri varsa
      prevChanges: comparable ? dayChanges(prevDays) : [],
      // Günde: son 30 günün günleri (gecenin kıyası için)
      recentDays: period.kind === "day" ? byDay(records.filter((r) => r.at >= ctxStart && r.at < period.end)) : [],
    };
  }, [data, period, ref, ctxStart]);

  // ── Uyku geceleri ve öteki kayıtların günleri ──
  const context = useMemo(() => {
    if (!view || !ctx) return null;
    const qualityMod = ctx.sleepMods.find((m) => m.valueType === "select" && !!m.choices?.length && m.choices.every((c) => /^\d+$/.test(c)));
    const nights = sleepNights(ctx.sleepEntries, ctx.sleepValues, qualityMod?.id);
    const qualityMax = qualityMod ? Math.max(...qualityMod.choices!.map(Number)) : 5;
    // Ruh hali, uyku (kendi bloğunda) ve nesne durumları dışında her kategori
    // ve alt kategori; alt kategorinin günleri üstününkiyle aynıysa tekrar etmez
    const skip = new Set(ctx.cats.filter((c) => c.builtInKey).map((c) => c.id));
    const subById = new Map(ctx.subs.map((x) => [x.id, x]));
    const catById = new Map(ctx.cats.map((c) => [c.id, c]));
    const catDays = new Map<string, Set<string>>();
    const subDays = new Map<string, Set<string>>();
    const add = (m: Map<string, Set<string>>, k: string, d: string) => {
      const set = m.get(k);
      if (set) set.add(d);
      else m.set(k, new Set([d]));
    };
    const dayCount = new Map<string, number>();
    const todayKey = dayKey(period.start);
    for (const e of ctx.entries) {
      if (e.occurredAt < period.start || e.occurredAt >= period.end) continue;
      const sub = subById.get(e.subcategoryId);
      if (!sub || skip.has(sub.categoryId)) continue;
      const d = dayKey(e.occurredAt);
      add(catDays, sub.categoryId, d);
      for (let c: SubCategory | undefined = sub; c; c = c.parentId ? subById.get(c.parentId) : undefined) {
        if (!c.isCategoryRoot) add(subDays, c.id, d);
      }
      // Günde: kalem başına kayıt sayısı (gizli kök kalemde kategorinin adı)
      if (period.kind === "day" && d === todayKey) {
        const k = sub.isCategoryRoot ? `c:${sub.categoryId}` : `s:${sub.id}`;
        dayCount.set(k, (dayCount.get(k) ?? 0) + 1);
      }
    }
    const same = (a: Set<string>, b?: Set<string>) => !!b && a.size === b.size && [...a].every((x) => b.has(x));
    const items: { id: string; name: string; color: string; cat?: string; days: Set<string> }[] = [];
    for (const [id, ds] of catDays) {
      const c = catById.get(id);
      if (c) items.push({ id: `c:${id}`, name: c.name, color: c.color, days: ds });
    }
    for (const [id, ds] of subDays) {
      const sub = subById.get(id)!;
      const c = catById.get(sub.categoryId);
      if (!c) continue;
      const parentDays = sub.parentId && !subById.get(sub.parentId)?.isCategoryRoot ? subDays.get(sub.parentId) : catDays.get(sub.categoryId);
      if (same(ds, parentDays)) continue;
      items.push({ id: `s:${id}`, name: sub.name, color: c.color, cat: c.name, days: ds });
    }
    const byId = new Map(items.map((x) => [x.id, x]));
    const rows = linkStats(view.days, items).map((r) => ({ ...r, item: byId.get(r.id)! }));
    const dayOthers = [...dayCount.entries()]
      .map(([k, n]) => {
        const isCat = k.startsWith("c:");
        const sub = isCat ? undefined : subById.get(k.slice(2));
        const c = catById.get(isCat ? k.slice(2) : sub!.categoryId);
        return { key: k, name: isCat ? (c?.name ?? "") : sub!.name, color: c?.color ?? "#ddd", n };
      })
      .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
    return { nights, qualityMax, rows, dayOthers };
  }, [view, ctx, period]);

  if (!view) return renderHead ? <div className="flex flex-col gap-4">{renderHead(null)}</div> : null;
  const { scale, named, cur, days, avg, refAvg, progress, counts } = view;
  const isDay = period.kind === "day";
  const catName = moodText(category.name, t);
  const title = focus ? moodText(focus.name, t) : catName;
  const structureHref = focus ? routes.structureSub(category.id, focus.id) : routes.structureCategory(category.id);
  const go = (key: string) => router.push(routes.period(key), { scroll: false });
  const slotOf = (v: number) => levelSlot(v, scale);
  const colorOf = (v: number) => {
    const s = slotOf(v);
    return scaleColor(s.index, s.total);
  };
  const stepName = (v: number) => (named ? t(SCALE_STEP_KEYS[slotOf(v).index]) : undefined);
  const face = (v: number, size: number) => {
    const s = slotOf(v);
    return <ScaleFace index={s.index} total={s.total} size={size} />;
  };
  const timeOf = (ms: number) => new Date(ms).toLocaleTimeString(tag, { hour: "2-digit", minute: "2-digit" });

  // ── Yerin bloğu: ortalama + sayılar ──
  const empty = cur.length === 0;
  const all = period.kind === "all";
  const delta = avg !== null && refAvg !== null ? avg - refAvg : null;
  const refText =
    refAvg === null || !ref ? "" : isDay ? t("moodan.weekAvg", { n: nf1.format(refAvg) }) : `${ref.label} · ${nf1.format(refAvg)}`;
  // Sayfanın baş bloğunda seçimlerin altında; baş verilmezse kendi bloğunda
  const headBody = (
    <>
      {empty ? (
        <SummaryEmpty
          text={t(all ? "brut.noEntries" : "insights.noEntriesInPeriod")}
          action={all ? undefined : { label: t("an.seeAll"), icon: ArrowRight, color: "var(--paper)", onClick: () => go("all") }}
        />
      ) : (
        <>
          <div className="flex items-center gap-3 bg-paper px-3.5 py-3 text-ink">
            {avg !== null ? (
              face(avg, 52)
            ) : (
              <span className="h-[52px] w-[52px] shrink-0 rounded-full border-2" style={DASHED} />
            )}
            <div className="min-w-0 flex-1">
              <span className={LABEL}>{t(isDay ? "moodan.dayAverage" : "moodan.average")}</span>
              {avg !== null ? (
                <div className="mt-1 flex min-w-0 items-baseline gap-1">
                  <b className="font-mono text-[28px] font-bold leading-none tabular-nums">{nf1.format(avg)}</b>
                  <span className="font-mono text-[13px] font-bold text-ink/55">/{scale.max}</span>
                  {stepName(avg) && <span className="ml-1.5 min-w-0 truncate text-[14px] font-extrabold">{stepName(avg)}</span>}
                </div>
              ) : (
                <div className="mt-1 text-[14px] font-extrabold text-ink/55">{t("moodan.noLevel")}</div>
              )}
              {delta !== null && (
                <div className="mt-1.5 flex min-w-0 items-center gap-1.5">
                  <span
                    className="shrink-0 rounded-full border-[1.5px] px-2 py-px font-mono text-[11px] font-bold leading-[16px] tabular-nums"
                    style={{ borderColor: "var(--line)", background: delta > 0.05 ? blockFill("#d9f6e2") : delta < -0.05 ? blockFill("#e7e2ff") : blockFill("#f1ede4") }}
                  >
                    {delta > 0.05 ? "▲" : delta < -0.05 ? "▼" : "="} {nf1.format(Math.abs(delta))}
                  </span>
                  <span className="min-w-0 truncate text-[11px] font-bold text-ink/55">{refText}</span>
                </div>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-[2px]">
            {isDay ? (
              <>
                <StatCell color={category.color} label={t("moodan.records")} value={String(cur.length)} />
                <StatCell
                  color={category.color}
                  label={t("moodan.firstLast")}
                  value={cur.length > 1 ? `${timeOf(cur[0].at)}–${timeOf(cur[cur.length - 1].at)}` : timeOf(cur[0].at)}
                  wordValue
                />
              </>
            ) : (
              <>
                <StatCell
                  color={category.color}
                  label={t("moodan.loggedDays")}
                  value={String(days.length)}
                  unit={`/${progress.elapsedDays}`}
                  sub={pctFmt.format(days.length / Math.max(1, progress.elapsedDays))}
                />
                <StatCell
                  color={category.color}
                  label={t("moodan.records")}
                  value={String(cur.length)}
                  sub={`${progress.elapsedDays} ${t("stat.days")}`}
                />
              </>
            )}
          </div>
        </>
      )}
    </>
  );
  const head = renderHead ? (
    renderHead(headBody)
  ) : (
    <SummaryBlock
      lead={{
        kind: "thing",
        color: category.color,
        icon: focus?.icon ?? category.icon,
        overline: focus ? `${catName} · ${periodShortLabel(period)}` : periodShortLabel(period),
        title,
      }}
      action={<SummaryTile color="#ffd23f" icon={Layers} label={t("nav.structure")} href={structureHref} />}
      stats={[]}
    >
      {headBody}
    </SummaryBlock>
  );
  if (empty) return <div className="flex flex-col gap-4">{head}</div>;

  // ── Zaman haritası: döneme göre biçim değiştiren tek blok ──
  const dayMap = new Map(days.map((d) => [d.day, d]));
  const todayKey = dayKey(view.nowMs);
  const weekdayShort = (ms: number) => new Date(ms).toLocaleDateString(tag, { weekday: "short" });
  let timeMap: ReactNode = null;
  if (isDay) {
    timeMap = (
      <Section color={LEAD.map} glyph={CalendarDays} title={t("moodan.dayFlow")} hint={t("moodan.recordsN", { n: cur.length })}>
        <div className="bg-paper px-3 pb-1 pt-3">
          <DayFlowChart records={cur} scale={scale} />
        </div>
        <div className="flex flex-col bg-paper">
          {cur.map((r, i) => (
            <div
              key={r.id}
              className={cn("grid grid-cols-[46px_minmax(0,1fr)] gap-2 px-3 py-2.5 text-ink", i > 0 && "border-t-[1.5px]")}
              style={i > 0 ? { borderTopColor: "var(--line)" } : undefined}
            >
              <span className="pt-1 font-mono text-[12px] font-bold tabular-nums">{timeOf(r.at)}</span>
              <div className="flex min-w-0 flex-col gap-1.5">
                <div className="flex flex-wrap gap-1.5">
                  {r.level !== null && (
                    <LevelCapsule
                      icon={face(r.level, 16)}
                      value={String(r.level)}
                      choices={scale.values.map(String)}
                      color={colorOf(r.level)}
                      title={stepName(r.level)}
                    />
                  )}
                  {r.emotions.map((n) => (
                    <EmotionCapsule key={n} name={n} level={null} />
                  ))}
                </div>
                {r.notes && <p className="line-clamp-3 text-[12px] font-semibold leading-snug text-ink/60">“{r.notes}”</p>}
              </div>
            </div>
          ))}
        </div>
      </Section>
    );
  } else if (period.kind === "week") {
    timeMap = (
      <Section color={LEAD.map} glyph={CalendarDays} title={t("moodan.weekStrip")} hint={t("moodan.calendarHint")}>
        <div className="grid grid-cols-7 gap-1 bg-paper p-2.5">
          {Array.from({ length: 7 }, (_, i) => {
            const s0 = new Date(period.start);
            const ms = new Date(s0.getFullYear(), s0.getMonth(), s0.getDate() + i).getTime();
            const d = dayMap.get(dayKey(ms));
            const future = dayKey(ms) > todayKey;
            const body = (
              <>
                <span className="text-[9.5px] font-black uppercase tracking-wide text-ink/60">{weekdayShort(ms)}</span>
                {d?.avg != null ? face(d.avg, 28) : <span className="h-7 w-7 rounded-full border-2" style={DASHED} />}
                <span className="font-mono text-[11.5px] font-bold tabular-nums">{d?.avg != null ? nf1.format(d.avg) : "–"}</span>
                <span className="text-[9px] font-bold text-ink/55">{d ? t("moodan.recordsN", { n: d.records.length }) : " "}</span>
              </>
            );
            const cls = "flex min-w-0 flex-col items-center gap-1 rounded-[11px] border-2 px-0.5 py-1.5 text-ink";
            return d ? (
              <button key={i} type="button" onClick={() => go(dayPeriod(ms).key)} className={cn(cls, "bg-paper active:bg-paper-2")} style={{ borderColor: "var(--line)" }}>
                {body}
              </button>
            ) : (
              <div key={i} className={cn(cls, future && "opacity-40")} style={DASHED}>
                {body}
              </div>
            );
          })}
        </div>
      </Section>
    );
  } else if (period.kind === "month") {
    const first = new Date(period.start);
    const lead = (first.getDay() + 6) % 7;
    const nd = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    timeMap = (
      <Section color={LEAD.map} glyph={CalendarDays} title={t("moodan.calendar")} hint={t("moodan.calendarHint")}>
        <div className="grid grid-cols-7 gap-1 bg-paper p-2.5">
          {Array.from({ length: 7 }, (_, i) => (
            <span key={`h${i}`} className="pb-0.5 text-center text-[9.5px] font-black uppercase tracking-wide text-ink/60">
              {weekdayShort(MONDAY + i * 86400000)}
            </span>
          ))}
          {Array.from({ length: lead }, (_, i) => (
            <span key={`b${i}`} />
          ))}
          {Array.from({ length: nd }, (_, i) => {
            const ms = new Date(first.getFullYear(), first.getMonth(), i + 1).getTime();
            const key = dayKey(ms);
            const d = dayMap.get(key);
            const num = <span className="absolute left-1 top-0.5 font-mono text-[8.5px] font-bold text-ink/60">{i + 1}</span>;
            if (!d) {
              const future = key > todayKey;
              return (
                <div key={key} className="relative aspect-square rounded-[9px] border-2" style={future ? { borderColor: "color-mix(in srgb, var(--ink) 8%, transparent)" } : DASHED}>
                  {num}
                </div>
              );
            }
            return (
              <button
                key={key}
                type="button"
                onClick={() => go(dayPeriod(ms).key)}
                title={d.avg != null ? `${i + 1} · ${nf1.format(d.avg)}` : undefined}
                className={cn("relative grid aspect-square place-items-center rounded-[9px] border-2 bg-paper active:bg-paper-2", key === todayKey && "shadow-[2px_2px_0_var(--shade)]")}
                style={{ borderColor: "var(--line)" }}
              >
                {num}
                {d.avg != null ? face(d.avg, 22) : d.records[0]?.emotions[0] ? <EmotionFace name={d.records[0].emotions[0]} size={18} /> : null}
              </button>
            );
          })}
        </div>
      </Section>
    );
  } else {
    // Yıl, Tümü, özel aralık: her satır bir ay, her kare bir gün
    const startMonth = period.kind === "year" ? new Date(period.start) : new Date(cur[0].at);
    const endMs = period.kind === "year" ? period.end - 1 : Math.min(period.end - 1, view.nowMs);
    const months: Date[] = [];
    for (let m = new Date(startMonth.getFullYear(), startMonth.getMonth(), 1); m.getTime() <= endMs; m = new Date(m.getFullYear(), m.getMonth() + 1, 1)) {
      months.push(m);
    }
    const multiYear = months.some((m) => m.getFullYear() !== months[0].getFullYear());
    timeMap = (
      <Section color={LEAD.map} glyph={CalendarDays} title={t("moodan.pixels")} hint={t("moodan.pixelsHint")}>
        <div className="flex flex-col gap-2 bg-paper p-3">
          <div className="grid items-center gap-[2px]" style={{ gridTemplateColumns: "34px repeat(31, minmax(0, 1fr))" }}>
            {months.map((m) => {
              const nd = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
              return (
                <MonthPixels
                  key={m.getTime()}
                  label={`${shortMonth(m.getMonth())}${multiYear ? ` ${String(m.getFullYear()).slice(2)}` : ""}`}
                  onLabel={() => go(monthPeriod(m.getTime()).key)}
                  cells={Array.from({ length: 31 }, (_, i) => {
                    if (i >= nd) return null;
                    const key = dayKey(new Date(m.getFullYear(), m.getMonth(), i + 1).getTime());
                    if (key > todayKey || key < dayKey(period.start)) return null;
                    const d = dayMap.get(key);
                    return { key, color: d ? (d.avg != null ? colorOf(d.avg) : "color-mix(in srgb, #e9e4d8 var(--fill-k), var(--line))") : undefined, title: d?.avg != null ? `${i + 1} · ${nf1.format(d.avg)}` : undefined };
                  })}
                />
              );
            })}
          </div>
          <div className="flex flex-wrap gap-x-2.5 gap-y-1 text-[10.5px] font-bold text-ink">
            {scale.values.map((v) => (
              <span key={v} className="inline-flex items-center gap-1">
                <i className="inline-block h-2.5 w-2.5 rounded-[3px] border-[1.5px]" style={{ background: colorOf(v), borderColor: "var(--line)" }} />
                {stepName(v) ?? v}
              </span>
            ))}
            <span className="inline-flex items-center gap-1 text-ink/60">
              <i className="inline-block h-2.5 w-2.5 rounded-[3px] border-[1.5px]" style={DASHED} />
              {t("moodan.noRecord")}
            </span>
          </div>
        </div>
      </Section>
    );
  }

  // ── Mutluluk çizgisi (gün ve haftada yok: haftada yedi günün şeridi yetiyor) ──
  let trend: ReactNode = null;
  if (!isDay && period.kind !== "week" && avg !== null) {
    const g: Granularity =
      period.kind === "month" ? "day" : period.kind === "year" ? "week" : chooseGranularity(startOfDayMs(new Date(cur[0].at)), period.end);
    const start = period.kind === "all" || period.kind === "custom" ? startOfDayMs(new Date(cur[0].at)) : period.start;
    const end = period.kind === "all" ? Math.min(period.end, startOfDayMs(new Date(view.nowMs)) + 86400000) : period.end;
    const buckets = buildSeriesBuckets(start, end, g).map((b) => b.key);
    const index = new Map(buckets.map((k, i) => [k, i]));
    const groups = buckets.map(() => [] as DayStat[]);
    for (const d of days) {
      if (d.avg === null) continue;
      const i = index.get(bucketKeyOf(new Date(d.day + "T12:00:00").getTime(), g));
      if (i !== undefined) groups[i].push(d);
    }
    const points = groups.map((ds) =>
      ds.length
        ? {
            avg: ds.reduce((s, d) => s + d.avg!, 0) / ds.length,
            min: g === "day" ? ds[0].min! : null,
            max: g === "day" ? ds[0].max! : null,
          }
        : null
    );
    trend = (
      <Section
        color={LEAD.trend}
        glyph={LineChart}
        title={t("moodan.trend")}
        hint={t(g === "day" ? "moodan.dailyAvg" : g === "week" ? "moodan.weeklyAvg" : "moodan.monthlyAvg")}
      >
        <div className="bg-paper px-3 pb-2.5 pt-3">
          <TrendChart
            points={points}
            labels={axisLabels(buckets, g, tag, end)}
            titles={buckets.map((k) => bucketTitle(k, g, tag))}
            scale={scale}
            mean={avg}
            colorOf={colorOf}
            fmt={(v) => nf1.format(v)}
          />
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[10.5px] font-bold text-ink/70">
            <span>● {t(g === "day" ? "moodan.dailyAvg" : g === "week" ? "moodan.weeklyAvg" : "moodan.monthlyAvg")}</span>
            {g === "day" && <span>▮ {t("moodan.dayRange")}</span>}
            <span>– – {t("moodan.periodAvg", { n: nf1.format(avg) })}</span>
          </div>
        </div>
      </Section>
    );
  }

  // ── Mutluluk dağılımı (gün dışında) ──
  const rated = view.dist.reduce((s, x) => s + x, 0);
  let distribution: ReactNode = null;
  if (!isDay && rated > 0) {
    const n = scale.values.length;
    // Ortanın üstü ve altı (beşlikte 4–5 ve 1–2; tek sayılı skalada orta dışarıda)
    const high = view.dist.slice(Math.ceil(n / 2)).reduce((s, x) => s + x, 0);
    const low = view.dist.slice(0, Math.floor(n / 2)).reduce((s, x) => s + x, 0);
    distribution = (
      <Section color={LEAD.dist} glyph={BarChart3} title={t("moodan.dist")} hint={t("moodan.recordsN", { n: rated })}>
        <div className="flex flex-col gap-3 bg-paper px-3 py-3 text-ink">
          <div className="flex h-[22px] gap-[2px]">
            {view.dist.map((c, i) =>
              c ? (
                <span
                  key={i}
                  title={`${stepName(scale.values[i]) ?? scale.values[i]}: ${c}`}
                  className="min-w-[6px] rounded-[5px] border-[1.5px]"
                  style={{ flex: c, background: colorOf(scale.values[i]), borderColor: "var(--line)" }}
                />
              ) : null
            )}
          </div>
          <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
            {scale.values.map((v, i) => (
              <div key={v} className="flex min-w-0 flex-col items-center gap-0.5">
                {face(v, 20)}
                {named && <span className="w-full truncate text-center text-[10px] font-extrabold">{stepName(v)}</span>}
                <span className="font-mono text-[10.5px] font-bold tabular-nums text-ink/60">{pctFmt.format(view.dist[i] / rated)}</span>
              </div>
            ))}
          </div>
          {named && (
            <div className="flex flex-wrap gap-x-3 gap-y-1 border-t-[1.5px] pt-2 text-[11.5px] font-bold" style={{ borderTopColor: "color-mix(in srgb, var(--ink) 15%, transparent)" }}>
              <span>
                {t("moodan.distHigh")}: <b className="font-mono">{pctFmt.format(high / rated)}</b>
              </span>
              <span className="text-ink/70">
                {t("moodan.distLow")}: <b className="font-mono">{pctFmt.format(low / rated)}</b>
              </span>
            </div>
          )}
        </div>
      </Section>
    );
  }

  // ── Duygular ──
  const picks = counts.reduce((s, [, c]) => s + c, 0);
  const maxCount = counts[0]?.[1] ?? 0;
  const TOP = 6;
  const shownEmotions = allEmotions ? counts : counts.slice(0, TOP);
  const emotions = (
    <Section
      color={LEAD.emotions}
      glyph={Smile}
      title={t("mood.emotions")}
      hint={picks ? t("moodan.picks", { n: picks, k: counts.length }) : undefined}
    >
      {!picks ? (
        <p className="bg-paper px-3.5 py-4 text-center text-[12.5px] font-bold text-ink/55">{t("moodan.noEmotions")}</p>
      ) : isDay ? (
        <div className="flex flex-wrap gap-1.5 bg-paper p-3">
          {counts.map(([n]) => (
            <EmotionCapsule key={n} name={n} level={null} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col bg-paper">
          {shownEmotions.map(([name, n], i) => {
            const share = n / picks;
            const p = view.prevShares?.get(name) ?? 0;
            // Pay farkı, puan olarak (%5 → %8: ▲3)
            const d = Math.round((share - p) * 100);
            return (
              <div
                key={name}
                className={cn("flex min-w-0 items-center gap-2.5 px-3 py-2 text-ink", i > 0 && "border-t-[1.5px]")}
                style={i > 0 ? { borderTopColor: "var(--line)" } : undefined}
              >
                <EmotionFace name={name} size={30} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className="min-w-0 flex-1 truncate text-[13.5px] font-black leading-tight">{emotionName(name, t)}</span>
                    <b className="shrink-0 font-mono text-[13px] font-bold leading-tight tabular-nums">{n}</b>
                    <span className="w-9 shrink-0 text-right font-mono text-[10.5px] font-bold leading-tight text-ink/55">
                      {pctFmt.format(share)}
                    </span>
                    {view.prevShares && (
                      <span
                        className="w-11 shrink-0 rounded-full border-[1.5px] py-px text-center font-mono text-[10px] font-bold leading-[14px]"
                        style={{ borderColor: "var(--line)", background: p === 0 ? blockFill("#d9f6e2") : d > 0 ? blockFill("#d9f6e2") : d < 0 ? blockFill("#e7e2ff") : blockFill("#f1ede4") }}
                        title={ref ? `${ref.label}: ${pctFmt.format(p)} → ${pctFmt.format(share)}` : undefined}
                      >
                        {p === 0 ? t("moodan.new") : d > 0 ? `▲${d}` : d < 0 ? `▼${-d}` : "="}
                      </span>
                    )}
                  </span>
                  <span className="mt-1.5 block h-[9px] overflow-hidden rounded-full border-[1.5px] bg-paper-2" style={{ borderColor: "var(--line)" }}>
                    <span
                      className="block h-full border-r-[1.5px]"
                      style={{ width: `${(n / maxCount) * 100}%`, background: emotionLook(name).color, borderRightColor: "var(--line)" }}
                    />
                  </span>
                </span>
              </div>
            );
          })}
          {counts.length > TOP && (
            <button
              type="button"
              onClick={() => setAllEmotions((v) => !v)}
              className="border-t-[1.5px] px-3 py-2.5 text-center text-[12.5px] font-black text-ink active:bg-paper-2"
              style={{ borderTopColor: "var(--line)" }}
            >
              {allEmotions ? t("moodan.showLess") : t("moodan.showAll", { n: counts.length })}
            </button>
          )}
        </div>
      )}
    </Section>
  );

  // ── Duygu haritası (gün dışında, en az 10 seçimde) ──
  let emoMap: ReactNode = null;
  if (!isDay && picks >= 10) {
    const q = quadrantCounts(counts);
    const countOf = new Map(counts);
    const onMap = picks - q.other;
    const cell = (name: string) => {
      const n = countOf.get(name) ?? 0;
      const look = emotionLook(name);
      const alpha = n ? Math.round((0.14 + 0.72 * (n / maxCount)) * 255).toString(16).padStart(2, "0") : "";
      return (
        <div
          key={name}
          title={`${emotionName(name, t)}: ${n}`}
          className="flex min-w-0 flex-col items-center gap-px rounded-[9px] border-[1.5px] px-0.5 pb-1 pt-1.5 text-ink"
          style={n ? { background: blockFill(`${look.color}${alpha}`), borderColor: "var(--line)" } : DASHED}
        >
          <span className={n ? undefined : "opacity-30"}>
            <EmotionFace name={name} size={20} />
          </span>
          <span className="w-full truncate text-center text-[9.5px] font-bold leading-tight">{emotionName(name, t)}</span>
          <b className="font-mono text-[11px] font-bold leading-none tabular-nums">{n}</b>
        </div>
      );
    };
    const block = (quad: EmotionQuadrant, rows: number[], cols: number[]) => (
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex items-baseline justify-between gap-1 px-0.5">
          <span className="truncate text-[9.5px] font-black uppercase tracking-wide">{t(`moodan.q.${quad}` as const)}</span>
          <span className="font-mono text-[10.5px] font-bold tabular-nums text-ink/60">{pctFmt.format(onMap ? q[quad] / onMap : 0)}</span>
        </div>
        <div className="grid grid-cols-2 gap-1">{rows.flatMap((r) => cols.map((c) => cell(EMOTION_GRID[r][c])))}</div>
      </div>
    );
    const others = counts.filter(([n]) => !(n in EMOTION_LOOKS));
    emoMap = (
      <Section color={LEAD.emoMap} glyph={LayoutGrid} title={t("moodan.map")} hint={t("moodan.mapHint")}>
        <div className="flex flex-col gap-2.5 bg-paper p-2.5">
          <div className="grid grid-cols-2 gap-x-2 gap-y-2.5">
            {block("tense", [0, 1, 2], [0, 1])}
            {block("lively", [0, 1, 2], [2, 3])}
            {block("low", [3, 4, 5], [0, 1])}
            {block("serene", [3, 4, 5], [2, 3])}
          </div>
          {others.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="px-0.5 text-[9.5px] font-black uppercase tracking-wide">{t("moodan.q.other")}</span>
              <div className="grid grid-cols-4 gap-1">{others.map(([n]) => cell(n))}</div>
            </div>
          )}
        </div>
      </Section>
    );
  }

  // ── Öne çıkan günler (gün dışında) ──
  let standout: ReactNode = null;
  if (!isDay && view.hl) {
    const box = (d: DayStat, best: boolean) => {
      const ms = new Date(d.day + "T12:00:00").getTime();
      const emos = [...new Set(d.records.flatMap((r) => r.emotions))].slice(0, 6);
      const note = d.records.map((r) => r.notes).find(Boolean);
      return (
        <button
          type="button"
          onClick={() => go(dayPeriod(ms).key)}
          className="flex min-w-0 flex-col items-start gap-1.5 px-3 py-2.5 text-left text-ink active:brightness-95"
          style={{ background: best ? blockFill("#fff3cf") : blockFill("#ece8ff") }}
        >
          <span className={LABEL}>{t(best ? "moodan.best" : "moodan.worst")}</span>
          <span className="text-[13.5px] font-extrabold leading-tight">
            {new Date(ms).toLocaleDateString(tag, { day: "numeric", month: "long", weekday: "short" })}
          </span>
          <span className="flex items-center gap-1.5">
            {face(d.avg!, 26)}
            <b className="font-mono text-[16px] font-bold tabular-nums">{nf1.format(d.avg!)}</b>
          </span>
          {emos.length > 0 && (
            <span className="flex flex-wrap gap-0.5">
              {emos.map((n) => (
                <EmotionFace key={n} name={n} size={16} />
              ))}
            </span>
          )}
          <span className="line-clamp-3 text-[11.5px] font-semibold leading-snug text-ink/60">
            {note ? `“${note}”` : t("moodan.noNote")}
          </span>
        </button>
      );
    };
    standout = (
      <Section color={LEAD.highlights} glyph={Star} title={t("moodan.highlights")}>
        <div className="grid grid-cols-2 gap-[2px]">
          {box(view.hl.best, true)}
          {box(view.hl.worst, false)}
        </div>
      </Section>
    );
  }

  // ══ 2. adım: duygu ilişkileri ve ritimler ══
  // Eşiğin altında sonuç yerine ne kadar veri gerektiği yazılır. Haftada
  // yalnız bölge akışı ve dalgalanma var; eşik tutmazsa blok hiç görünmez.
  const long = !isDay && period.kind !== "week";
  const rangeStart = period.kind === "all" || period.kind === "custom" ? startOfDayMs(new Date(cur[0].at)) : period.start;
  const rangeEnd = period.kind === "all" ? Math.min(period.end, startOfDayMs(new Date(view.nowMs)) + 86400000) : period.end;
  const spanDays = (rangeEnd - rangeStart) / 86400000;
  const signed = (v: number) => `${v > 0.05 ? "+" : v < -0.05 ? "−" : "±"}${nf1.format(Math.abs(v))}`;
  const thin = (msg: string) => <ReadLine text={msg} muted />;

  // ── Bölge akışı: dört bölgenin payı zaman içinde ──
  let flow: ReactNode = null;
  if (!isDay && picks > 0) {
    const fg: Granularity =
      period.kind === "week"
        ? "day"
        : period.kind === "month"
          ? "week"
          : period.kind === "year"
            ? "month"
            : spanDays <= 14
              ? "day"
              : spanDays <= 120
                ? "week"
                : "month";
    const fb = buildSeriesBuckets(rangeStart, rangeEnd, fg);
    const idx = new Map(fb.map((b, i) => [b.key, i]));
    const groups = fb.map(() => [] as MoodRecord[]);
    for (const r of cur) {
      const i = idx.get(bucketKeyOf(r.at, fg));
      if (i !== undefined) groups[i].push(r);
    }
    const multiYear = new Date(rangeStart).getFullYear() !== new Date(rangeEnd - 1).getFullYear();
    const every = Math.ceil(fb.length / 8);
    const cols = fb.map((b, i) => {
      const d = bucketDate(b.key, fg);
      const label =
        i % every !== 0
          ? ""
          : fg === "day"
            ? fb.length <= 7
              ? d.toLocaleDateString(tag, { weekday: "short" })
              : String(d.getDate())
            : fg === "week"
              ? String(new Date(Math.max(d.getTime(), rangeStart)).getDate())
              : `${shortMonth(d.getMonth())}${multiYear && (d.getMonth() === 0 || i === 0) ? ` ${String(d.getFullYear()).slice(2)}` : ""}`;
      return { key: b.key, periodKey: b.periodKey ?? `d-${b.key}`, title: b.full, label, q: quadrantsOf(groups[i]), future: d.getTime() > view.nowMs };
    });
    const filled = cols.filter((c) => QUAD_STACK.some((q) => c.q[q] > 0)).length;
    if (filled >= 2) {
      const showShare = cols.length <= 12;
      flow = (
        <Section
          color={LEAD.flow}
          glyph={ChartColumnStacked}
          title={t("moodan.flow")}
          hint={t(fg === "day" ? "moodan.byDay" : fg === "week" ? "moodan.byWeek" : "moodan.byMonth")}
        >
          <div className="bg-paper px-3 pb-2.5 pt-2.5">
            <FlowChart cols={cols} showShare={showShare} pct={(v) => pctFmt.format(v)} qName={(q) => t(`moodan.q.${q}` as const)} onPick={go} />
            <div className="mt-2 flex flex-wrap gap-x-2.5 gap-y-1 text-[10.5px] font-bold text-ink">
              {[...QUAD_STACK].reverse().map((q) => (
                <span key={q} className="inline-flex items-center gap-1">
                  <i className="inline-block h-2.5 w-2.5 rounded-[3px] border-[1.5px]" style={{ background: QUAD_COLOR[q], borderColor: "var(--line)" }} />
                  {t(`moodan.q.${q}` as const)}
                </span>
              ))}
              {showShare && <span className="text-ink/60">{t("moodan.pleasantTop")}</span>}
            </div>
          </div>
        </Section>
      );
    }
  }

  // ── Duygu ve mutluluk: duygunun geçtiği kayıtların ortalaması ──
  let emoHap: ReactNode = null;
  if (long && picks > 0 && rated > 0) {
    const MIN = 4;
    const levels = emotionLevels(cur, MIN);
    const list = levels.length > 8 && !allLevels ? [...levels.slice(0, 4), null, ...levels.slice(-4)] : levels;
    emoHap = (
      <Section color={LEAD.emoHap} glyph={Gauge} title={t("moodan.emoHap")} hint={levels.length >= 3 ? t("moodan.emoHapHint") : undefined}>
        {levels.length < 3 ? (
          thin(t("moodan.emoHapThin", { k: MIN, n: levels.length }))
        ) : (
          <>
            <div className="flex flex-col bg-paper">
              {list.map((x, i) =>
                x === null ? (
                  <button
                    key="gap"
                    type="button"
                    onClick={() => setAllLevels(true)}
                    className="border-t-[1.5px] py-1.5 text-center text-[12px] font-black text-ink/70 active:bg-paper-2"
                    style={{ borderTopColor: "var(--line)" }}
                  >
                    ⋯ {t("moodan.showAll", { n: levels.length })}
                  </button>
                ) : (
                  <div
                    key={x.name}
                    className={cn(
                      "grid grid-cols-[24px_minmax(0,0.9fr)_minmax(0,1fr)_30px] items-center gap-2 px-3 py-2 text-ink",
                      i > 0 && "border-t-[1.5px]"
                    )}
                    style={i > 0 ? { borderTopColor: "var(--line)" } : undefined}
                    title={`${emotionName(x.name, t)}: ${nf1.format(x.avg)}`}
                  >
                    <EmotionFace name={x.name} size={24} />
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-black leading-tight">{emotionName(x.name, t)}</span>
                      <span className="block font-mono text-[10px] font-bold leading-tight text-ink/55">{t("moodan.recordsN", { n: x.n })}</span>
                    </span>
                    <ScaleTrack value={x.avg} mean={avg} scale={scale} colorOf={colorOf} />
                    <b className="text-right font-mono text-[13px] font-bold tabular-nums">{nf1.format(x.avg)}</b>
                  </div>
                )
              )}
              {levels.length > 8 && allLevels && (
                <button
                  type="button"
                  onClick={() => setAllLevels(false)}
                  className="border-t-[1.5px] px-3 py-2 text-center text-[12.5px] font-black text-ink active:bg-paper-2"
                  style={{ borderTopColor: "var(--line)" }}
                >
                  {t("moodan.showLess")}
                </button>
              )}
            </div>
            <ReadLine
              text={t("moodan.emoHapRead", {
                a: emotionName(levels[0].name, t),
                x: nf1.format(levels[0].avg),
                b: emotionName(levels[levels.length - 1].name, t),
                y: nf1.format(levels[levels.length - 1].avg),
              })}
            />
          </>
        )}
      </Section>
    );
  }

  // ── Birlikte görülen duygular ──
  let together: ReactNode = null;
  if (long && picks > 0) {
    const pr = emotionPairs(cur, 3);
    const top = pr.pairs.slice(0, 5);
    together = (
      <Section color={LEAD.pairs} glyph={Link2} title={t("moodan.pairs")} hint={top.length ? t("moodan.pairsHint") : undefined}>
        {!top.length ? (
          thin(t("moodan.pairsThin"))
        ) : (
          <>
            <div className="flex flex-col bg-paper">
              {top.map((p, i) => (
                <div
                  key={`${p.a}+${p.b}`}
                  className={cn("flex min-w-0 items-center gap-2.5 px-3 py-2 text-ink", i > 0 && "border-t-[1.5px]")}
                  style={i > 0 ? { borderTopColor: "var(--line)" } : undefined}
                >
                  <span className="flex shrink-0">
                    <EmotionFace name={p.a} size={24} />
                    <span className="-ml-1.5">
                      <EmotionFace name={p.b} size={24} />
                    </span>
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] font-black">
                    {emotionName(p.a, t)} + {emotionName(p.b, t)}
                  </span>
                  <span className="shrink-0 font-mono text-[11.5px] font-bold tabular-nums">{t("moodan.recordsN", { n: p.n })}</span>
                </div>
              ))}
            </div>
            {pr.multi >= 5 && <ReadLine text={t("moodan.pairsRead", { p: pctFmt.format(pr.mixed / pr.multi) })} />}
          </>
        )}
      </Section>
    );
  }

  // ── Haftanın günleri: dönem ortalamasından sapma ──
  let weekdays: ReactNode = null;
  if (long && avg !== null) {
    const wd = weekdayStats(days);
    const ok = wd.map((w, i) => ({ avg: w.avg, n: w.n, i })).filter((w) => w.n >= 3 && w.avg !== null);
    const wdName = (i: number, style: "short" | "long") => new Date(MONDAY + i * 86400000).toLocaleDateString(tag, { weekday: style });
    const best = ok.reduce((a, b) => (b.avg! > a.avg! ? b : a), ok[0]);
    const worst = ok.reduce((a, b) => (b.avg! < a.avg! ? b : a), ok[0]);
    weekdays = (
      <Section
        color={LEAD.weekdays}
        glyph={CalendarRange}
        title={t("moodan.weekdays")}
        hint={ok.length >= 4 ? t("moodan.weekdaysHint", { n: nf1.format(avg) }) : undefined}
      >
        {ok.length < 4 ? (
          thin(t("moodan.weekdaysThin", { n: ok.length }))
        ) : (
          <>
            <div className="bg-paper px-3 pb-2 pt-2.5">
              <WeekdayChart
                stats={wd}
                mean={avg}
                names={wd.map((_, i) => wdName(i, "short"))}
                colorOf={colorOf}
                signed={signed}
                daysLabel={(n) => t("moodan.daysN", { n })}
              />
              {wd.some((w) => w.n > 0 && w.n < 3) && <p className="mt-1 text-[10.5px] font-bold text-ink/60">○ {t("moodan.hollow")}</p>}
            </div>
            {best.i !== worst.i && (
              <ReadLine
                text={t("moodan.weekdaysRead", {
                  a: wdName(best.i, "long"),
                  x: signed(best.avg! - avg),
                  b: wdName(worst.i, "long"),
                  y: signed(worst.avg! - avg),
                })}
              />
            )}
          </>
        )}
      </Section>
    );
  }

  // ── Günün saatleri: sabah, öğle, akşam, gece ──
  let dayParts: ReactNode = null;
  if (long && rated > 0) {
    const ps = partStats(cur);
    const ok = DAY_PARTS.filter((p) => ps[p].n >= 3).map((p) => ({ p, avg: ps[p].avg! }));
    const used = DAY_PARTS.filter((p) => ps[p].n > 0);
    const partName = (p: DayPart) => t(`moodan.part.${p}` as const);
    const best = ok.reduce((a, b) => (b.avg > a.avg ? b : a), ok[0]);
    const worst = ok.reduce((a, b) => (b.avg < a.avg ? b : a), ok[0]);
    dayParts = (
      <Section color={LEAD.parts} glyph={SunMoon} title={t("moodan.parts")} hint={ok.length >= 2 ? t("moodan.partsBar") : undefined}>
        {ok.length < 2 ? (
          thin(
            used.length === 1
              ? t("moodan.partsOne", { p: partName(used[0]).toLocaleLowerCase(tag) })
              : t("moodan.partsThin", { n: ok.length })
          )
        ) : (
          <>
            <div className="grid grid-cols-4 gap-[2px]">
              {DAY_PARTS.map((p) => {
                const s = ps[p];
                const qt = QUAD_STACK.reduce((a, q) => a + s.quad[q], 0);
                return (
                  <div key={p} className="flex min-w-0 flex-col items-center gap-1 bg-paper px-1 pb-2 pt-2 text-ink">
                    <span className={cn(LABEL, "max-w-full truncate")}>{partName(p)}</span>
                    <span className="font-mono text-[9px] font-bold leading-none text-ink/55">{DAY_PART_HOURS[p]}</span>
                    <span className={s.n < 3 ? "opacity-45" : undefined}>
                      {s.avg !== null ? face(s.avg, 26) : <span className="block h-[26px] w-[26px] rounded-full border-2" style={DASHED} />}
                    </span>
                    <b className={cn("font-mono text-[14px] font-bold leading-none tabular-nums", s.n < 3 && "text-ink/45")}>
                      {s.avg !== null ? nf1.format(s.avg) : "–"}
                    </b>
                    <span className="text-[9.5px] font-bold leading-none text-ink/55">{s.n ? t("moodan.recordsN", { n: s.n }) : t("moodan.noRecord")}</span>
                    <span
                      className="mt-0.5 flex h-[8px] w-full gap-px overflow-hidden rounded-full border-[1.5px] bg-paper-2"
                      style={{ borderColor: qt ? "var(--line)" : "color-mix(in srgb, var(--ink) 20%, transparent)" }}
                    >
                      {QUAD_STACK.map((q) =>
                        s.quad[q] ? (
                          <i key={q} style={{ flex: s.quad[q], background: QUAD_COLOR[q] }} title={`${t(`moodan.q.${q}` as const)} ${pctFmt.format(s.quad[q] / qt)}`} />
                        ) : null
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
            {best.p !== worst.p && (
              <ReadLine
                text={t("moodan.partsRead", {
                  a: partName(best.p),
                  x: nf1.format(best.avg),
                  b: partName(worst.p).toLocaleLowerCase(tag),
                  y: nf1.format(worst.avg),
                })}
              />
            )}
          </>
        )}
      </Section>
    );
  }

  // ── Dalgalanma: art arda kayıtlı iki gün arasındaki fark ──
  let vol: ReactNode = null;
  if (!isDay && avg !== null) {
    const ch = dayChanges(days);
    if (ch.length >= 5) {
      const v = ch.reduce((s, x) => s + x.v, 0) / ch.length;
      const big = ch.reduce((a, b) => (b.v > a.v ? b : a), ch[0]);
      const pc = view.prevChanges;
      const prevV = pc.length >= 5 ? pc.reduce((s, x) => s + x.v, 0) / pc.length : null;
      const vg: Granularity =
        period.kind === "week" || period.kind === "month" ? "day" : period.kind === "year" ? "week" : chooseGranularity(rangeStart, rangeEnd);
      const vb = buildSeriesBuckets(rangeStart, rangeEnd, vg);
      const vi = new Map(vb.map((b, i) => [b.key, i]));
      const sums = vb.map(() => ({ s: 0, n: 0, big: false }));
      for (const c of ch) {
        const i = vi.get(bucketKeyOf(new Date(c.day + "T12:00:00").getTime(), vg));
        if (i === undefined) continue;
        sums[i].s += c.v;
        sums[i].n++;
        // Haftalık ya da aylık çubukta ortalama var; tek sıçramanın kovası en uzun olmayabilir, vurgulanmaz
        if (c === big && vg === "day") sums[i].big = true;
      }
      const dayLong = (d: string) => new Date(d + "T12:00:00").toLocaleDateString(tag, { day: "numeric", month: "long" });
      vol = (
        <Section color={LEAD.vol} glyph={Activity} title={t("moodan.vol")}>
          <div className="flex flex-col gap-2 bg-paper px-3 pb-2.5 pt-3 text-ink">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <b className="font-mono text-[28px] font-bold leading-none tabular-nums">{nf1.format(v)}</b>
              <span className="text-[12px] font-bold text-ink/60">{t("moodan.volUnit")}</span>
              {prevV !== null && ref && (
                <span
                  className="ml-auto rounded-full border-[1.5px] px-2 py-px font-mono text-[11px] font-bold leading-[16px] tabular-nums"
                  style={{ borderColor: "var(--line)", background: blockFill("#f1ede4") }}
                >
                  {ref.label} · {nf1.format(prevV)}
                </span>
              )}
            </div>
            <VolBars bars={sums.map((x, i) => (x.n ? { v: x.s / x.n, big: x.big, title: `${vb[i].full}: ${nf1.format(x.s / x.n)}` } : null))} />
            <span className="text-[10.5px] font-bold text-ink/60">
              ▮ {t(vg === "day" ? "moodan.volDaily" : vg === "week" ? "moodan.volWeekly" : "moodan.volMonthly")}
            </span>
          </div>
          <ReadLine text={t("moodan.volRead", { v: nf1.format(v), d: dayLong(big.day), a: nf1.format(big.from), b: nf1.format(big.to) })} />
        </Section>
      );
    } else if (long) {
      vol = (
        <Section color={LEAD.vol} glyph={Activity} title={t("moodan.vol")}>
          {thin(t("moodan.volThin", { n: ch.length }))}
        </Section>
      );
    }
  }

  // ══ 3. adım: uyku ve öteki kayıtlarla bağlantı ══
  const durText = (h: number) => {
    const m = Math.round(h * 60);
    return t("sleep.durHM", { h: Math.floor(m / 60), m: String(m % 60).padStart(2, "0") });
  };
  const rowLine = (i: number) => (i > 0 ? { borderTopColor: "var(--line)" } : undefined);
  const groupLabel = (text: string, first: boolean) => (
    <span className={cn(LABEL, "bg-paper-2 px-3 py-1.5", !first && "border-t-[1.5px]")} style={first ? undefined : { borderTopColor: "var(--line)" }}>
      {text}
    </span>
  );

  // ── Uyku ve ertesi gün (ay, yıl, tümü) ──
  let sleepBlock: ReactNode = null;
  if (long && context && avg !== null) {
    const sv = sleepVsMood(days, context.nights);
    const okDur = sv.duration.filter((x) => x.n >= 3).length;
    const okQual = sv.quality.filter((x) => x.n >= 3).length;
    const row = (key: string, label: string, x: { avg: number | null; n: number }, i: number) => (
      <div
        key={key}
        className={cn(
          "grid grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)_30px_50px] items-center gap-2 px-3 py-2 text-ink",
          i > 0 && "border-t-[1.5px]"
        )}
        style={rowLine(i)}
      >
        <span className={cn("truncate text-[12.5px] font-black", x.n < 3 && "text-ink/45")}>{label}</span>
        {x.avg !== null ? (
          <span className={x.n < 3 ? "opacity-40" : undefined}>
            <ScaleTrack value={x.avg} mean={avg} scale={scale} colorOf={colorOf} />
          </span>
        ) : (
          <span />
        )}
        <b className={cn("text-right font-mono text-[12.5px] font-bold tabular-nums", x.n < 3 && "text-ink/45")}>
          {x.avg !== null ? nf1.format(x.avg) : "–"}
        </b>
        <span className="whitespace-nowrap text-right font-mono text-[10px] font-bold text-ink/55">
          {x.n ? t("moodan.nightsN", { n: x.n }) : t("moodan.noNights")}
        </span>
      </div>
    );
    sleepBlock = (
      <Section color={LEAD.sleep} glyph={Moon} title={t("moodan.sleep")} hint={okDur >= 2 ? t("moodan.nightsN", { n: sv.paired }) : undefined}>
        {context.nights.size === 0 ? (
          thin(t("moodan.sleepNone"))
        ) : okDur < 2 ? (
          thin(t("moodan.sleepThin", { n: okDur }))
        ) : (
          <>
            <div className="flex flex-col bg-paper">
              {groupLabel(t("moodan.byDuration"), true)}
              {sv.duration.map((x, i) => row(x.bucket, t(`moodan.sl.${x.bucket}` as const), x, i))}
              {okQual >= 2 && (
                <>
                  {groupLabel(t("moodan.byQuality"), false)}
                  {sv.quality.map((x, i) => row(`q${x.q}`, `${t("moodan.qualityN", { n: x.q })}/${context.qualityMax}`, x, i))}
                </>
              )}
            </div>
            {sv.short.n >= 3 && sv.long.n >= 3 && (
              <ReadLine text={t("moodan.sleepRead", { a: nf1.format(sv.long.avg!), b: nf1.format(sv.short.avg!) })} />
            )}
          </>
        )}
      </Section>
    );
  }

  // ── Kayıtlarla bağlantı (ay, yıl, tümü): olan − olmayan günler ──
  let linksBlock: ReactNode = null;
  if (long && context && avg !== null && context.rows.length > 0) {
    const ok = context.rows.filter((r) => r.diff !== null).sort((a, b) => b.diff! - a.diff! || b.withN - a.withN);
    const out = context.rows.filter((r) => r.diff === null && r.withN > 0).length;
    const list = ok.length > 8 && !allLinks ? [...ok.slice(0, 4), null, ...ok.slice(-4)] : ok;
    const top = ok[0];
    const bot = ok[ok.length - 1];
    // Çubuk ölçeği: listedeki en büyük fark, en az bir basamak
    const barMax = Math.max(1, ...ok.map((r) => Math.abs(r.diff!)));
    linksBlock = (
      <Section color={LEAD.links} glyph={Shapes} title={t("moodan.links")} hint={ok.length ? t("moodan.linksHint") : undefined}>
        {!ok.length ? (
          thin(t("moodan.linksThin"))
        ) : (
          <>
            <div className="flex flex-col bg-paper">
              {list.map((r, i) =>
                r === null ? (
                  <button
                    key="gap"
                    type="button"
                    onClick={() => setAllLinks(true)}
                    className="border-t-[1.5px] py-1.5 text-center text-[12px] font-black text-ink/70 active:bg-paper-2"
                    style={{ borderTopColor: "var(--line)" }}
                  >
                    ⋯ {t("moodan.showAll", { n: ok.length })}
                  </button>
                ) : (
                  <div
                    key={r.id}
                    className={cn("grid grid-cols-[minmax(0,1fr)_88px_36px] items-center gap-2 px-3 py-2 text-ink", i > 0 && "border-t-[1.5px]")}
                    style={rowLine(i)}
                    title={`${r.item.name}: ${t("moodan.linkDays", { w: r.withN, o: r.withoutN })}`}
                  >
                    <span className="min-w-0">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <i className="h-2.5 w-2.5 shrink-0 rounded-[3px] border-[1.5px]" style={{ background: r.item.color, borderColor: "var(--line)" }} />
                        <span className="truncate text-[13px] font-black leading-tight">{r.item.name}</span>
                      </span>
                      <span className="block truncate text-[10px] font-bold leading-tight text-ink/55">
                        {r.item.cat ? `${r.item.cat} · ` : ""}
                        {t("moodan.linkDays", { w: r.withN, o: r.withoutN })}
                        {r.withN < 14 || r.withoutN < 14 ? ` · ${t("moodan.early")}` : ""}
                      </span>
                    </span>
                    <DiffBar diff={r.diff!} max={barMax} />
                    <b className="text-right font-mono text-[12.5px] font-bold tabular-nums">{signed(r.diff!)}</b>
                  </div>
                )
              )}
              {ok.length > 8 && allLinks && (
                <button
                  type="button"
                  onClick={() => setAllLinks(false)}
                  className="border-t-[1.5px] px-3 py-2 text-center text-[12.5px] font-black text-ink active:bg-paper-2"
                  style={{ borderTopColor: "var(--line)" }}
                >
                  {t("moodan.showLess")}
                </button>
              )}
              {out > 0 && (
                <p className="border-t-[1.5px] px-3 py-2 text-[11px] font-bold text-ink/55" style={{ borderTopColor: "var(--line)" }}>
                  {t("moodan.linksOut", { n: out })}
                </p>
              )}
            </div>
            <ReadLine
              text={
                ok.length > 1 && top.diff! > 0.05 && bot.diff! < -0.05
                  ? t("moodan.linksRead", { a: top.item.name, x: signed(top.diff!), b: bot.item.name, y: signed(bot.diff!) })
                  : t("moodan.linksReadOne", {
                      a: (Math.abs(top.diff!) >= Math.abs(bot.diff!) ? top : bot).item.name,
                      x: signed((Math.abs(top.diff!) >= Math.abs(bot.diff!) ? top : bot).diff!),
                    })
              }
            />
          </>
        )}
      </Section>
    );
  }

  // ── Günde: bu sabaha bağlanan gece ve günün diğer kayıtları ──
  let lastNight: ReactNode = null;
  let dayOthers: ReactNode = null;
  if (isDay && context) {
    const night = context.nights.get(dayKey(period.start));
    if (night) {
      const sv = sleepVsMood(view.recentDays, context.nights);
      lastNight = (
        <Section color={LEAD.sleep} glyph={Moon} title={t("moodan.lastNight")}>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 bg-paper px-3.5 py-3 text-ink">
            <b className="font-mono text-[24px] font-bold leading-none tabular-nums">{durText(night.hours)}</b>
            <span className="font-mono text-[12px] font-bold tabular-nums text-ink/60">
              {timeOf(night.start)} → {timeOf(night.end)}
            </span>
            {night.quality !== null && (
              <span
                className="rounded-full border-[1.5px] px-2 py-px font-mono text-[11px] font-bold leading-[16px] tabular-nums"
                style={{ borderColor: "var(--line)", background: blockFill("#eef0fb") }}
              >
                {t("moodan.quality", { n: night.quality, m: context.qualityMax })}
              </span>
            )}
          </div>
          {sv.short.n >= 3 && sv.long.n >= 3 && (
            <ReadLine text={t("moodan.night30", { a: nf1.format(sv.short.avg!), b: nf1.format(sv.long.avg!) })} />
          )}
        </Section>
      );
    }
    if (context.dayOthers.length) {
      dayOthers = (
        <Section color={LEAD.links} glyph={Shapes} title={t("moodan.dayOthers")}>
          <div className="flex flex-wrap gap-1.5 bg-paper p-3">
            {context.dayOthers.map((o) => (
              <span
                key={o.key}
                className="inline-flex max-w-full items-center gap-1.5 rounded-full border-2 bg-paper px-2.5 py-1 text-[12px] font-black text-ink"
                style={{ borderColor: "var(--line)" }}
              >
                <i className="h-2.5 w-2.5 shrink-0 rounded-[3px] border-[1.5px]" style={{ background: o.color, borderColor: "var(--line)" }} />
                <span className="truncate">{o.name}</span>
                {o.n > 1 && <b className="font-mono text-[11px]">×{o.n}</b>}
              </span>
            ))}
          </div>
          {thin(t("moodan.dayOthersHint"))}
        </Section>
      );
    }
  }

  // ── Girdiler (gün dışında; günde gün akışı zaten listeliyor) ──
  const entryRows: EntryListRow[] = isDay
    ? []
    : [...cur]
        .sort((a, b) => b.at - a.at)
        .map((r: MoodRecord) => ({
          id: r.id,
          occurredAt: r.at,
          subLabel: r.level !== null ? (stepName(r.level) ?? String(r.level)) : catName,
          title: r.emotions.map((n) => emotionName(n, t)).join(", ") || undefined,
          notes: r.notes,
          valueLabel: r.level !== null ? `${r.level}/${scale.max}` : undefined,
        }));

  return (
    <div className="flex flex-col gap-4">
      {head}
      {timeMap}
      {trend}
      {distribution}
      {emotions}
      {lastNight}
      {dayOthers}
      {emoMap}
      {flow}
      {emoHap}
      {together}
      {weekdays}
      {dayParts}
      {sleepBlock}
      {linksBlock}
      {standout}
      {vol}
      {!isDay && <EntryListBlock title={t("objects.entries")} accent={category.color} rows={entryRows} />}
    </div>
  );
}

/** Yılın piksellerinin bir satırı — ay etiketi (o aya gider) ve 31 kare */
function MonthPixels({
  label,
  onLabel,
  cells,
}: {
  label: string;
  onLabel: () => void;
  cells: ({ key: string; color?: string; title?: string } | null)[];
}) {
  return (
    <>
      <button type="button" onClick={onLabel} className="truncate text-left font-mono text-[9px] font-bold text-ink/70 underline-offset-2 active:underline">
        {label}
      </button>
      {cells.map((c, i) =>
        c ? (
          <i
            key={c.key}
            title={c.title}
            className="block aspect-square rounded-[2px]"
            style={c.color ? { background: c.color } : { boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--shade) 22%, transparent)" }}
          />
        ) : (
          <span key={i} />
        )
      )}
    </>
  );
}

/** Ekseni zamanın kendisi olan çizgi: boş kovada çizgi kesilir, gelecek çizilmez */
function TrendChart({
  points,
  labels,
  titles,
  scale,
  mean,
  colorOf,
  fmt,
}: {
  points: ({ avg: number; min: number | null; max: number | null } | null)[];
  labels: [number, string][];
  titles: string[];
  scale: MoodScale;
  mean: number;
  colorOf: (v: number) => string;
  fmt: (v: number) => string;
}) {
  const W = 320;
  const H = 150;
  const L = 24;
  const R = 8;
  const T = 9;
  const B = 20;
  const n = points.length;
  const iw = W - L - R;
  const x = (i: number) => L + ((i + 0.5) * iw) / n;
  const y = (v: number) => T + ((scale.max - v) / Math.max(1, scale.max - scale.min)) * (H - T - B);
  const segs: string[] = [];
  let seg: string[] = [];
  points.forEach((p, i) => {
    if (!p) {
      if (seg.length > 1) segs.push("M" + seg.join("L"));
      seg = [];
      return;
    }
    seg.push(`${x(i).toFixed(1)},${y(p.avg).toFixed(1)}`);
  });
  if (seg.length > 1) segs.push("M" + seg.join("L"));
  const ticks = scale.values.length <= 7 ? scale.values : [scale.min, scale.max];
  const r = n > 40 ? 3 : 4.2;
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="trend" className="block">
        {ticks.map((v) => (
          <line key={v} x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="color-mix(in srgb, var(--ink) 10%, transparent)" strokeWidth={1} />
        ))}
        {points.map((p, i) =>
          p && p.min !== null && p.max !== null && p.max > p.min ? (
            <line
              key={`r${i}`}
              x1={x(i)}
              x2={x(i)}
              y1={y(p.min)}
              y2={y(p.max)}
              stroke="color-mix(in srgb, var(--ink) 16%, transparent)"
              strokeWidth={Math.max(2, Math.min(7, (iw / n) * 0.55))}
              strokeLinecap="round"
            />
          ) : null
        )}
        {segs.map((d, i) => (
          <path key={`s${i}`} d={d} fill="none" stroke="var(--ink)" strokeWidth={2} strokeLinejoin="round" />
        ))}
        <line x1={L} x2={W - R} y1={y(mean)} y2={y(mean)} stroke="var(--ink)" strokeWidth={1.2} strokeDasharray="4 3" opacity={0.55} />
        {points.map((p, i) =>
          p ? (
            <circle key={`p${i}`} cx={x(i)} cy={y(p.avg)} r={r} fill={colorOf(p.avg)} stroke="var(--ink)" strokeWidth={1.5}>
              <title>{`${titles[i]}: ${fmt(p.avg)}`}</title>
            </circle>
          ) : null
        )}
        {labels.map(([i, text]) => (
          <text key={`l${i}`} x={x(i)} y={H - 5} textAnchor="middle" fontSize={9} fontWeight={700} fill="color-mix(in srgb, var(--ink) 60%, transparent)" fontFamily="var(--font-mono), monospace">
            {text}
          </text>
        ))}
      </svg>
      {/* Eksenin basamakları yüzle — SVG içinde HTML yüz çizilmiyor, üstüne yerleşir */}
      {ticks.map((v) => {
        const s = levelSlot(v, scale);
        return (
          <span key={v} className="pointer-events-none absolute left-0" style={{ top: `${(y(v) / H) * 100}%`, transform: "translateY(-50%)" }}>
            <ScaleFace index={s.index} total={s.total} size={14} />
          </span>
        );
      })}
    </div>
  );
}

/** Kova anahtarının günü */
function bucketDate(key: string, g: Granularity): Date {
  if (g === "month") {
    const [y, m] = key.split("-").map(Number);
    return new Date(y, m - 1, 1);
  }
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Noktanın ipucu — "14 Eki", "13 Eki haftası", "Eki 2026" */
function bucketTitle(key: string, g: Granularity, tag: string): string {
  const d = bucketDate(key, g);
  if (g === "month") return d.toLocaleDateString(tag, { month: "long", year: "numeric" });
  return d.toLocaleDateString(tag, { day: "numeric", month: "short" });
}

/** Eksen yazıları — kalabalıksa seyreltilmiş; dönemin sonundan sonrası yazılmaz */
function axisLabels(keys: string[], g: Granularity, tag: string, end: number): [number, string][] {
  const out: [number, string][] = [];
  if (g === "day") {
    if (keys.length <= 7) return keys.map((k, i) => [i, bucketDate(k, g).toLocaleDateString(tag, { weekday: "short" })]);
    keys.forEach((k, i) => {
      const d = bucketDate(k, g).getDate();
      if ((d - 1) % 7 === 0) out.push([i, String(d)]);
    });
    return out;
  }
  if (g === "week") {
    // Ayın 1'ini içeren haftanın altına o ayın adı
    keys.forEach((k, i) => {
      const s = bucketDate(k, g);
      for (let j = 0; j < 7; j++) {
        const d = new Date(s.getFullYear(), s.getMonth(), s.getDate() + j);
        if (d.getDate() === 1 && d.getTime() < end) out.push([i, shortMonth(d.getMonth())]);
      }
    });
    const step = Math.ceil(out.length / 12);
    return out.filter((_, j) => j % step === 0);
  }
  keys.forEach((k, i) => {
    const d = bucketDate(k, g);
    out.push([i, d.getMonth() === 0 || i === 0 ? `${shortMonth(d.getMonth())} ${String(d.getFullYear()).slice(2)}` : shortMonth(d.getMonth())]);
  });
  const step = Math.ceil(out.length / 8);
  return out.filter((_, j) => j % step === 0);
}

/** Gün akışı — kayıtlar saat ekseninde (06–24), aynı günün kayıtları birleşik */
function DayFlowChart({ records, scale }: { records: MoodRecord[]; scale: MoodScale }) {
  const W = 320;
  const H = 112;
  const L = 14;
  const R = 14;
  const T = 14;
  const B = 20;
  const rated = records.filter((r) => r.level !== null);
  const hourOf = (ms: number) => {
    const d = new Date(ms);
    return d.getHours() + d.getMinutes() / 60;
  };
  // Gece yarısından sonra ya da sabah 6'dan önce girilen kayıt eksene sığsın
  const minH = Math.min(6, ...rated.map((r) => Math.floor(hourOf(r.at))));
  const x = (h: number) => L + ((h - minH) / (24 - minH)) * (W - L - R);
  const y = (v: number) => T + ((scale.max - v) / Math.max(1, scale.max - scale.min)) * (H - T - B);
  const ticks = [minH, 9, 12, 15, 18, 21, 24].filter((h, i, a) => h >= minH && a.indexOf(h) === i);
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="day" className="block">
        {scale.values.length <= 7 &&
          scale.values.map((v) => <line key={v} x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="color-mix(in srgb, var(--ink) 10%, transparent)" strokeWidth={1} />)}
        {rated.length > 1 && (
          <path
            d={"M" + rated.map((r) => `${x(hourOf(r.at)).toFixed(1)},${y(r.level!).toFixed(1)}`).join("L")}
            fill="none"
            stroke="var(--ink)"
            strokeWidth={2}
            strokeLinejoin="round"
          />
        )}
        {ticks.map((h) => (
          <text key={h} x={x(h)} y={H - 5} textAnchor="middle" fontSize={9} fontWeight={700} fill="color-mix(in srgb, var(--ink) 60%, transparent)" fontFamily="var(--font-mono), monospace">
            {String(h % 24 === 0 && h ? 24 : h).padStart(2, "0")}
          </text>
        ))}
      </svg>
      {rated.map((r) => {
        const s = levelSlot(r.level!, scale);
        return (
          <span
            key={r.id}
            className="pointer-events-none absolute"
            style={{ left: `${(x(hourOf(r.at)) / W) * 100}%`, top: `${(y(r.level!) / H) * 100}%`, transform: "translate(-50%, -50%)" }}
          >
            <ScaleFace index={s.index} total={s.total} size={22} />
          </span>
        );
      })}
    </div>
  );
}

/** Bloğun altındaki okuma cümlesi — **iki yıldız** arası kalın; eşiğin altındaki not soluk */
function ReadLine({ text, muted = false }: { text: string; muted?: boolean }) {
  return (
    <p className={cn("bg-paper px-3.5 py-2.5 text-[12px] font-semibold leading-snug", muted ? "text-ink/55" : "text-ink/75")}>
      {text.split("**").map((p, i) =>
        i % 2 ? (
          <b key={i} className="font-black text-ink">
            {p}
          </b>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </p>
  );
}

/** Bölge akışı — her dilim dört bölgenin payıyla yığılı bir sütun; dokununca o dönem */
function FlowChart({
  cols,
  showShare,
  pct,
  qName,
  onPick,
}: {
  cols: { key: string; periodKey: string; title: string; label: string; q: QuadCounts; future: boolean }[];
  showShare: boolean;
  pct: (v: number) => string;
  qName: (q: EmotionQuadrant) => string;
  onPick: (periodKey: string) => void;
}) {
  return (
    <div className="flex items-stretch gap-[3px]">
      {cols.map((c) => {
        const tot = QUAD_STACK.reduce((s, q) => s + c.q[q], 0);
        const bar = tot ? (
          <span className="flex h-full w-full max-w-[34px] flex-col-reverse gap-[2px]">
            {QUAD_STACK.map((q) =>
              c.q[q] ? (
                <span
                  key={q}
                  className="min-h-[4px] rounded-[4px] border-[1.5px]"
                  style={{ flex: c.q[q], background: QUAD_COLOR[q], borderColor: "var(--line)" }}
                  title={`${c.title} · ${qName(q)}: ${pct(c.q[q] / tot)}`}
                />
              ) : null
            )}
          </span>
        ) : c.future ? null : (
          // Kayıtsız dilim yerini korur — kesik taban
          <span className="mt-auto block h-0 w-full max-w-[34px] border-t-2" style={{ borderTopStyle: "dashed", borderTopColor: "color-mix(in srgb, var(--ink) 35%, transparent)" }} />
        );
        return (
          <div key={c.key} className="flex min-w-0 flex-1 flex-col items-center">
            <span className="h-[15px] font-mono text-[9px] font-bold leading-[15px] tabular-nums">
              {showShare && tot ? pct((c.q.serene + c.q.lively) / tot) : ""}
            </span>
            {tot ? (
              <button type="button" onClick={() => onPick(c.periodKey)} aria-label={c.title} className="flex h-[118px] w-full justify-center active:opacity-75">
                {bar}
              </button>
            ) : (
              <span className="flex h-[118px] w-full justify-center">{bar}</span>
            )}
            <span className="h-[15px] whitespace-nowrap pt-1 font-mono text-[9px] font-bold leading-none text-ink/60">{c.label}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Bir değerin skaladaki yeri — basamak noktaları, dönem ortalaması kesik çizgi */
function ScaleTrack({
  value,
  mean,
  scale,
  colorOf,
}: {
  value: number;
  mean: number | null;
  scale: MoodScale;
  colorOf: (v: number) => string;
}) {
  const pos = (v: number) => `${((v - scale.min) / Math.max(1, scale.max - scale.min)) * 100}%`;
  return (
    <span className="relative mx-[7px] block h-[18px]">
      <span className="absolute inset-x-0 top-1/2 h-[2px] -translate-y-1/2 rounded-full bg-ink/20" />
      {scale.values.length <= 7 &&
        scale.values.map((v) => (
          <span
            key={v}
            className="absolute top-1/2 h-[6px] w-[6px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[1px]"
            style={{ left: pos(v), background: colorOf(v), borderColor: "var(--line)" }}
          />
        ))}
      {mean !== null && (
        <span
          className="absolute top-0 h-full w-0 border-l-[1.5px]"
          style={{ left: pos(mean), borderLeftStyle: "dashed", borderLeftColor: "color-mix(in srgb, var(--ink) 55%, transparent)" }}
        />
      )}
      <span
        className="absolute top-1/2 h-[13px] w-[13px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2"
        style={{ left: pos(value), background: colorOf(value), borderColor: "var(--line)" }}
      />
    </span>
  );
}

/** Haftanın günleri — her günün ortalamadan sapması; 3 günden az veride içi boş nokta */
function WeekdayChart({
  stats,
  mean,
  names,
  colorOf,
  signed,
  daysLabel,
}: {
  stats: { avg: number | null; n: number }[];
  mean: number;
  names: string[];
  colorOf: (v: number) => string;
  signed: (v: number) => string;
  daysLabel: (n: number) => string;
}) {
  const W = 320;
  const H = 170;
  const T = 16;
  const B = 34;
  const ch = H - T - B;
  const slot = W / 7;
  const range = Math.max(0.5, ...stats.filter((s) => s.avg !== null).map((s) => Math.abs(s.avg! - mean))) * 1.25;
  const y = (v: number) => T + ch / 2 - ((v - mean) / range) * (ch / 2);
  const mono = "var(--font-mono), monospace";
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="weekdays" className="block">
      <line x1={0} x2={W} y1={y(mean)} y2={y(mean)} stroke="var(--ink)" strokeWidth={1.2} strokeDasharray="4 3" opacity={0.55} />
      {stats.map((s, i) => {
        const cx = slot * (i + 0.5);
        const few = s.n < 3;
        return (
          <g key={i}>
            {s.avg !== null && (
              <>
                <line x1={cx} x2={cx} y1={y(mean)} y2={y(s.avg)} stroke="var(--ink)" strokeWidth={2} opacity={few ? 0.35 : 1} />
                <circle
                  cx={cx}
                  cy={y(s.avg)}
                  r={7}
                  fill={few ? "var(--paper)" : colorOf(s.avg)}
                  stroke="var(--ink)"
                  strokeWidth={2}
                  strokeDasharray={few ? "2 2" : undefined}
                >
                  <title>{`${names[i]}: ${signed(s.avg - mean)} · ${daysLabel(s.n)}`}</title>
                </circle>
                {!few && (
                  <text
                    x={cx}
                    y={s.avg >= mean ? y(s.avg) - 12 : y(s.avg) + 20}
                    textAnchor="middle"
                    fontSize={9.5}
                    fontWeight={800}
                    fill="var(--ink)"
                    fontFamily={mono}
                  >
                    {signed(s.avg - mean)}
                  </text>
                )}
              </>
            )}
            <text x={cx} y={H - 18} textAnchor="middle" fontSize={10.5} fontWeight={800} fill="var(--ink)">
              {names[i]}
            </text>
            <text x={cx} y={H - 5} textAnchor="middle" fontSize={8.5} fontWeight={700} fill="color-mix(in srgb, var(--ink) 55%, transparent)" fontFamily={mono}>
              {daysLabel(s.n)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Dalgalanmanın çubukları — zaman ekseninde, boş yerde çubuk yok; en büyük sıçrama koyu */
function VolBars({ bars }: { bars: ({ v: number; big: boolean; title: string } | null)[] }) {
  const W = 320;
  const H = 48;
  const bw = W / Math.max(1, bars.length);
  // En az bir basamaklık ölçek — küçük değişimler olduğundan büyük görünmesin
  const mx = Math.max(1, ...bars.map((b) => b?.v ?? 0));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="changes" className="block">
      <line x1={0} x2={W} y1={H - 0.75} y2={H - 0.75} stroke="color-mix(in srgb, var(--ink) 25%, transparent)" strokeWidth={1.5} />
      {bars.map((b, i) => {
        if (!b) return null;
        const h = Math.max(2, (b.v / mx) * (H - 6));
        return (
          <rect
            key={i}
            x={i * bw + bw * 0.15}
            y={H - 1.5 - h}
            width={Math.max(1.5, bw * 0.7)}
            height={h}
            rx={Math.min(2, bw * 0.3)}
            fill={b.big ? "var(--ink)" : "color-mix(in srgb, var(--ink) 35%, transparent)"}
          >
            <title>{b.title}</title>
          </rect>
        );
      })}
    </svg>
  );
}

/** Olan − olmayan farkı: ortadan sağa yeşil (olan günler daha iyi), sola mor; `max` farkta yarı dolu */
function DiffBar({ diff, max }: { diff: number; max: number }) {
  const w = (Math.min(Math.abs(diff), max) / max) * 50;
  return (
    <span className="relative block h-[14px]">
      <span className="absolute inset-y-[-2px] left-1/2 w-[2px] -translate-x-1/2 bg-line" />
      {w > 0 && (
        <span
          className="absolute top-[1px] h-[12px] rounded-[3px] border-[1.5px]"
          style={{
            width: `${w}%`,
            ...(diff >= 0 ? { left: "50%" } : { right: "50%" }),
            background: diff >= 0 ? "#5fcf86" : "#8b7cf6",
            borderColor: "var(--line)",
          }}
        />
      )}
    </span>
  );
}
