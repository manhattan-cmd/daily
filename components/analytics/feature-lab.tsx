"use client";

/**
 * DENEME — özellik bazlı analiz ("Özellikler" kapısı). Karar verilene kadar
 * prototip: hesaplar burada, kalıcı tercihler (aynı şey / birleştir)
 * yalnız tarayıcıda (localStorage).
 *
 * Üç soru:
 *  1. Bir özelliğin uygulama GENELİNDEKİ hali — kategori sınırı yok
 *     ("bu ay ne kadar para", nereden geldiği kırılımda).
 *  2. Aynı adla birden çok yerde açılmış şeyler ("Punto") — "aynı şey mi?"
 *     sorusu; evet denirse o şeyin bütün özellikleri tek sayfada ve
 *     aralarından hesaplananlar (₺/km, L/100 km).
 *  3. Aynı şeyi ölçen iki özellik ("Para" / "Tutar") — birlikte sayma önerisi.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, Check, Copy, Link2, Sparkles, X } from "lucide-react";
import { db } from "@/lib/db";
import {
  analysisKindOf,
  bucketKeyOf,
  buildSeriesBuckets,
  chooseGranularity,
  fmtNum,
  fmtPct,
  frameDailySeries,
  framePeriodSeries,
  presetOf,
  startOfDayMs,
  type DayBucket,
  type SeriesFrame,
} from "@/lib/analytics";
import { periodShortLabel, shiftPeriod, type Period } from "@/lib/period";
import { modColor } from "@/lib/mod-color";
import { SymbolIcon } from "@/lib/icons";
import { useSkin } from "@/lib/skin";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import type { Category, Entry, EntryValue, Mod, SubCategory } from "@/types";
import { PageHeader } from "@/components/layout/page-header";
import { ModAtomCore, modAtomIcon } from "@/components/structure/mod-atom";
import { PeriodNav, PeriodTabs } from "./period-switcher";
import { AnalysisTrail } from "./analysis-trail";
import { ANALYSIS_HEADER } from "./period-view";
import { StatTile } from "./stat-tile";
import { ShareBars, type ShareRow } from "./share-bars";
import { DailyBarChart } from "./daily-bar-chart";
import { EntryListSection, type EntryListRow } from "./entry-list";
import { useScopePeriod } from "./scope-period-bar";

const DAY = 86400000;

// ─── Veri ────────────────────────────────────────────────────────────────

type Store = {
  cats: Category[];
  subs: SubCategory[];
  mods: Mod[];
  entries: Entry[];
  values: EntryValue[];
};

type Node = { key: string; name: string; color: string; icon?: string; catId: string; parentKey?: string };

type Row = { entry: Entry; value: number; path: string[]; modId: string; origId: string };

type Prefs = {
  things: { name: string; keys: string[] }[];
  dismissed: string[];
  /** birleştirilen özellik → ana özellik */
  merged: Record<string, string>;
  /** "farklı" denen özellik çiftleri ("idA|idB", sıralı) */
  distinct: string[];
};
const EMPTY_PREFS: Prefs = { things: [], dismissed: [], merged: {}, distinct: [] };
const PREFS_KEY = "lab:feature-prefs";
function readPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) return { ...EMPTY_PREFS, ...JSON.parse(raw) };
  } catch {}
  return EMPTY_PREFS;
}
function usePrefs(): [Prefs, (p: Prefs) => void] {
  const [prefs, setPrefs] = useState<Prefs>(() =>
    typeof window === "undefined" ? EMPTY_PREFS : readPrefs()
  );
  const save = (p: Prefs) => {
    setPrefs(p);
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(p));
    } catch {}
  };
  return [prefs, save];
}

const norm = (s: string) => s.toLocaleLowerCase("tr").trim();

function buildModel(store: Store, merged: Record<string, string>) {
  const catById = new Map(store.cats.map((c) => [c.id, c]));
  const subById = new Map(store.subs.map((s) => [s.id, s]));
  const nodes = new Map<string, Node>();
  for (const c of store.cats) {
    if (c.isBuiltIn) continue;
    nodes.set(`c:${c.id}`, { key: `c:${c.id}`, name: c.name, color: c.color, icon: c.icon, catId: c.id });
  }
  for (const s of store.subs) {
    if (s.isCategoryRoot) continue;
    const c = catById.get(s.categoryId);
    if (!c || c.isBuiltIn) continue;
    nodes.set(`s:${s.id}`, {
      key: `s:${s.id}`,
      name: s.name,
      color: c.color,
      icon: s.icon ?? c.icon,
      catId: c.id,
      parentKey: s.parentId ? `s:${s.parentId}` : `c:${c.id}`,
    });
  }
  const pathCache = new Map<string, string[]>();
  const pathOf = (subId: string): string[] => {
    const hit = pathCache.get(subId);
    if (hit) return hit;
    const s = subById.get(subId);
    if (!s) return [];
    const up: string[] = [];
    for (let cur: SubCategory | undefined = s; cur; cur = cur.parentId ? subById.get(cur.parentId) : undefined) {
      if (!cur.isCategoryRoot) up.unshift(`s:${cur.id}`);
    }
    const p = [`c:${s.categoryId}`, ...up];
    pathCache.set(subId, p);
    return p;
  };
  const entryById = new Map(store.entries.map((e) => [e.id, e]));
  const modById = new Map(store.mods.map((m) => [m.id, m]));
  // Sayısal özellikler (sayı ölçüsü) — süre aralığı, seçenek vb. bu denemede yok
  const rows: Row[] = [];
  for (const v of store.values) {
    if (!v.modId) continue;
    const m = modById.get(v.modId);
    if (!m || (m.valueType ?? "number") !== "number") continue;
    const e = entryById.get(v.entryId);
    if (!e) continue;
    const n = parseFloat(v.value);
    if (!Number.isFinite(n)) continue;
    const path = pathOf(e.subcategoryId);
    if (!path.length || !nodes.has(path[0])) continue;
    rows.push({ entry: e, value: n, path, modId: merged[m.id] ?? m.id, origId: m.id });
  }
  return { nodes, rows, modById, catById };
}
type Model = ReturnType<typeof buildModel>;

const isLevelMod = (m: Mod) =>
  presetOf(analysisKindOf(m.valueType, m.choices), m.analysis) === "level";

/** Bağlı girdiler (paralel perspektif) bir kez — aynı olay iki kategoride */
function dedupe(rows: Row[]): { rows: Row[]; dropped: number } {
  const seen = new Set<string>();
  const out: Row[] = [];
  for (const r of rows) {
    const k = `${r.modId}|${r.entry.linkedGroupId ?? r.entry.id}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return { rows: out, dropped: rows.length - out.length };
}

const inWin = (rows: Row[], a: number, b: number) =>
  rows.filter((r) => r.entry.occurredAt >= a && r.entry.occurredAt < b);

/** Karşılaştırma penceresi: önceki dönem; sürüyorsa aynı uzunluktaki başı */
function prevWindow(period: Period, nowMs: number): { a: number; b: number; label: string } | null {
  if (period.kind === "all") return null;
  const prev = shiftPeriod(period, -1);
  if (!prev) return null;
  const running = nowMs >= period.start && nowMs < period.end;
  return {
    a: prev.start,
    b: running ? Math.min(prev.end, prev.start + (nowMs - period.start)) : prev.end,
    label: periodShortLabel(prev),
  };
}

function windowOf(period: Period, rows: Row[]) {
  const now = Date.now();
  const today = startOfDayMs(new Date(now));
  let a = period.start;
  if (period.kind === "all") {
    a = rows.length ? startOfDayMs(new Date(Math.min(...rows.map((r) => r.entry.occurredAt)))) : today;
  }
  const b = Math.min(period.end, today + DAY);
  return { a, b, days: Math.max(1, Math.round((b - a) / DAY)) };
}

function seriesOf(period: Period, rows: Row[], level: boolean) {
  const { a, b } = windowOf(period, rows);
  const full = period.kind === "week" || period.kind === "month" || period.kind === "year";
  const end = full ? period.end : b;
  if (period.kind === "day" || end - a < 1.5 * DAY) return null;
  const g = period.kind === "month" ? "week" : chooseGranularity(a, end);
  const buckets: DayBucket[] = buildSeriesBuckets(a, end, g);
  const idx = new Map(buckets.map((x, i) => [x.key, i]));
  const per: number[][] = buckets.map(() => []);
  for (const r of rows) {
    const i = idx.get(bucketKeyOf(r.entry.occurredAt, g));
    if (i !== undefined) per[i].push(r.value);
  }
  buckets.forEach((x, i) => {
    const vs = per[i];
    const sum = vs.reduce((s, v) => s + v, 0);
    // Seviyede kova = kovadaki son okuma (ortalaması da yakın)
    x.value = level ? (vs.length ? vs[vs.length - 1] : 0) : sum;
    x.sum = sum;
    x.avg = vs.length ? sum / vs.length : 0;
    x.count = vs.length;
    x.hasData = vs.length > 0;
  });
  const frame: SeriesFrame | null = full
    ? framePeriodSeries(period.kind as "week" | "month" | "year", period.start, buckets)
    : g === "day"
      ? frameDailySeries(buckets)
      : null;
  return { buckets, frame };
}

/** Seviye özelliğinde yer başına: son bilinen, dönemdeki değişim */
function levelPlaces(model: Model, rows: Row[], a: number, b: number) {
  const byPlace = new Map<string, Row[]>();
  for (const r of rows) {
    const k = r.path[r.path.length - 1];
    const l = byPlace.get(k) ?? [];
    l.push(r);
    byPlace.set(k, l);
  }
  return [...byPlace.entries()]
    .map(([key, list]) => {
      const sorted = [...list].sort((x, y) => x.entry.occurredAt - y.entry.occurredAt);
      const upTo = sorted.filter((r) => r.entry.occurredAt < b);
      const before = sorted.filter((r) => r.entry.occurredAt < a);
      const inside = upTo.filter((r) => r.entry.occurredAt >= a);
      const last = upTo[upTo.length - 1];
      const startVal = before.length ? before[before.length - 1].value : inside[0]?.value;
      const node = model.nodes.get(key)!;
      return {
        key,
        node,
        path: sorted[0].path,
        last: last?.value,
        lastAt: last?.entry.occurredAt,
        delta: last && startVal !== undefined && inside.length ? last.value - startVal : 0,
        inside,
      };
    })
    .filter((p) => p.last !== undefined)
    .sort((x, y) => (y.last ?? 0) - (x.last ?? 0));
}

const pathLabel = (model: Model, path: string[]) =>
  path.map((k) => model.nodes.get(k)?.name ?? "?").join(" › ");

// ─── Öneriler ─────────────────────────────────────────────────────────────

/** Farklı kategorilerde aynı adla açılmış yerler — en üst eşleşme */
function sameNameGroups(model: Model, prefs: Prefs) {
  const byName = new Map<string, Node[]>();
  for (const n of model.nodes.values()) {
    const k = norm(n.name);
    const l = byName.get(k) ?? [];
    l.push(n);
    byName.set(k, l);
  }
  const groups = [...byName.values()].filter((l) => new Set(l.map((n) => n.catId)).size >= 2);
  const keyToGroup = new Map<string, number>();
  groups.forEach((g, i) => g.forEach((n) => keyToGroup.set(n.key, i)));
  // Bir yerin altında hangi özellikler girilmiş
  const modsUnder = (key: string) => new Set(model.rows.filter((r) => r.path.includes(key)).map((r) => r.modId));
  const depth = (n: Node) => { let d = 0; for (let k = n.parentKey; k; k = model.nodes.get(k)?.parentKey) d++; return d; };
  const merged = prefs.things.flatMap((t) => t.keys);
  return groups
    // Üst dalları zaten birlikte eşleşmiş çocuklar (Clio eşleşince altındaki
    // Yakıt) ayrı sorulmaz — üst eşleşme bir KATEGORİ değilse: "Araçlar"
    // kategorisi ile Giderler › Araçlar eşleşse de araçlar tek tek sorulmalı
    .filter((g) => {
      const pg = g.map((n) => (n.parentKey ? keyToGroup.get(n.parentKey) : undefined));
      if (pg.some((x) => x === undefined) || new Set(pg).size !== 1) return true;
      return groups[pg[0]!].some((n) => n.key.startsWith("c:"));
    })
    .filter((g) => !g.every((n) => merged.includes(n.key)))
    .filter((g) => {
      const name = norm(g[0].name);
      return !prefs.dismissed.includes(name) && !prefs.things.some((t) => norm(t.name) === name);
    })
    .map((g) => {
      // Birleşince yeni bir şey öğreniliyor mu: bir yerde olup ötekinde olmayan özellik
      const sets = g.map((n) => modsUnder(n.key));
      const union = new Set(sets.flatMap((x) => [...x]));
      const complement = [...union].filter((m) => !sets.every((x) => x.has(m))).length;
      const score = complement * 10 + g.reduce((sum, n) => sum + depth(n), 0) / g.length;
      return { name: g[0].name, nodes: g, score };
    })
    .filter((g) => g.score >= 10)
    .sort((x, y) => y.score - x.score);
}

/**
 * Eş anlam öbekleri — özellik adının içinde geçen kelimeyle öbeğe girer.
 * Gelir kelimeleri ayrı öbek: "Kazanılan Para" ile "Para" aynı sanılmasın
 * (gelir öbeği önce bakılır).
 */
const SYNONYMS: { key: string; words: string[] }[] = [
  { key: "income", words: ["gelir", "kazanç", "kazanc", "kazanılan", "maaş", "income", "earned", "salary"] },
  { key: "money", words: ["para", "tutar", "harcama", "harcanan", "gider", "ücret", "fiyat", "maliyet", "masraf", "ödeme", "money", "amount", "cost", "spent", "expense", "price"] },
  { key: "duration", words: ["süre", "zaman", "dakika", "duration", "time"] },
  { key: "distance", words: ["mesafe", "yol", "distance"] },
];
function meaningOf(name: string): string | undefined {
  const words = norm(name).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  return SYNONYMS.find((g) => g.words.some((w) => words.includes(w)))?.key;
}
const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/**
 * Aynı şeyi ölçüyor olabilecek iki özellik. Uygulama asla kendiliğinden
 * birleştirmez; şu koşullarda SORAR:
 *  - aynı birim, ikisi de birikimli (toplanan) özellik;
 *  - hiçbir girdide birlikte kullanılmamışlar (birlikteyse — Para ve
 *    Bahşiş gibi — ayrı şeylerdir);
 *  - VE ya aynı adlı bir yerin altında girilmişler ("Yakıt"), ya da adları
 *    aynı anlam öbeğinde ("Tutar" · "Harcama" · "Para").
 */
function duplicateMods(model: Model, prefs: Prefs) {
  const placeNames = new Map<string, Set<string>>();
  const entriesOf = new Map<string, Set<string>>();
  for (const r of model.rows) {
    const s = placeNames.get(r.origId) ?? new Set<string>();
    s.add(norm(model.nodes.get(r.path[r.path.length - 1])?.name ?? ""));
    placeNames.set(r.origId, s);
    const e = entriesOf.get(r.origId) ?? new Set<string>();
    e.add(r.entry.id);
    entriesOf.set(r.origId, e);
  }
  const ids = [...placeNames.keys()].filter((id) => !prefs.merged[id]);
  const out: { a: Mod; b: Mod; reason: string }[] = [];
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++) {
      const a = model.modById.get(ids[i])!, b = model.modById.get(ids[j])!;
      if (!a.unit || a.unit !== b.unit || isLevelMod(a) || isLevelMod(b)) continue;
      if (prefs.distinct.includes(pairKey(a.id, b.id))) continue;
      const ea = entriesOf.get(a.id)!, eb = entriesOf.get(b.id)!;
      if ([...ea].some((id) => eb.has(id))) continue;
      const common = [...placeNames.get(a.id)!].find((p) => p && placeNames.get(b.id)!.has(p));
      const ma = meaningOf(a.name), mb = meaningOf(b.name);
      const sameMeaning = !!ma && ma === mb;
      if (!common && !sameMeaning) continue;
      // Daha çok kullanılan ana özellik olur
      const [main, other] = ea.size >= eb.size ? [a, b] : [b, a];
      const placeName = common ? [...model.nodes.values()].find((n) => norm(n.name) === common)?.name : undefined;
      const reason = placeName
        ? `İkisi de ${a.unit}, ikisi de “${placeName}” altında girilmiş ve hiçbir girdide birlikte kullanılmamış.`
        : `İkisi de ${a.unit}, adları aynı anlama geliyor olabilir ve hiçbir girdide birlikte kullanılmamış.`;
      out.push({ a: main, b: other, reason });
    }
  return out;
}

// ─── Görünüm parçaları ────────────────────────────────────────────────────

const fmtVal = (n: number, unit?: string) => (unit ? `${fmtNum(n)} ${unit}` : fmtNum(n));

function useBrutal() {
  return useSkin() === "brutal";
}

function Card({ children, className, onClick }: { children: React.ReactNode; className?: string; onClick?: () => void }) {
  const C = onClick ? "button" : "div";
  return (
    <C
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn("block w-full rounded-2xl border border-border bg-card p-3.5 text-left", onClick && "transition-transform active:scale-[0.99]", className)}
    >
      {children}
    </C>
  );
}

function SectionHead({ children, note }: { children: React.ReactNode; note?: string }) {
  return (
    <div className="mb-2 flex items-baseline gap-2 px-1">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{children}</h3>
      {note && <span className="text-[11px] text-muted-foreground/70">{note}</span>}
    </div>
  );
}

/** Kategori paylarının tek çubukta renkli dilimleri */
function SplitBar({ parts }: { parts: { key: string; color: string; value: number; name: string }[] }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  if (total <= 0) return null;
  return (
    <div className="mt-2.5">
      <div data-split-bar="" className="flex h-2.5 w-full overflow-hidden rounded-full bg-[var(--sf-2)]">
        {parts.map((p) => (
          <span key={p.key} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} />
        ))}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
        {parts.slice(0, 4).map((p) => (
          <span key={p.key} className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
            {p.name} {fmtPct(p.value / total)}
          </span>
        ))}
        {parts.length > 4 && <span>+{parts.length - 4}</span>}
      </div>
    </div>
  );
}

function NodeIcon({ node, size = 40 }: { node: Node; size?: number }) {
  const brutal = useBrutal();
  return (
    <span
      className={cn("flex shrink-0 items-center justify-center", brutal ? "rounded-xl border-2 border-[#111] shadow-[2px_2px_0_#111]" : "rounded-xl")}
      style={{ width: size, height: size, background: brutal ? node.color : `${node.color}22` }}
    >
      {node.icon && <SymbolIcon name={node.icon} size={size * 0.5} style={{ color: brutal ? "#111" : node.color }} />}
    </span>
  );
}

function growthSub(cur: number, prev: number | null, prevLabel?: string) {
  if (prev === null || prevLabel === undefined) return undefined;
  if (prev <= 0) return "önceki dönem boş";
  const pct = ((cur - prev) / prev) * 100;
  return `öncekine göre ${pct >= 0 ? "+" : "−"}${fmtPct(Math.abs(pct) / 100)}`;
}

// ─── Sayfa ────────────────────────────────────────────────────────────────

export function FeatureLab() {
  const params = useSearchParams();
  const router = useRouter();
  const [period, setPeriod] = useScopePeriod();
  const [prefs, savePrefs] = usePrefs();
  const modId = params.get("mod");
  const thing = params.get("thing");
  const drill = (params.get("path") ?? "").split(",").filter(Boolean);

  const store = useLiveQuery(async () => {
    const [cats, subs, mods, entries, values] = await Promise.all([
      db.categories.toArray(),
      db.subcategories.toArray(),
      db.mods.toArray(),
      db.entries.toArray(),
      db.entryValues.toArray(),
    ]);
    return { cats, subs, mods, entries, values } as Store;
  }, []);
  const model = useMemo(() => (store ? buildModel(store, prefs.merged) : null), [store, prefs.merged]);

  const go = (q: Record<string, string | undefined>) => {
    const u = new URLSearchParams();
    u.set("p", period.key);
    for (const [k, v] of Object.entries(q)) if (v) u.set(k, v);
    router.push(`/analytics/features?${u.toString()}`);
  };

  const mod = modId && model ? model.modById.get(modId) : undefined;
  const thingDef = thing ? prefs.things.find((t) => norm(t.name) === norm(thing)) : undefined;

  const trail =
    mod && model
      ? [
          { key: "root", label: "Özellikler", root: true, onClick: () => go({}) },
          { key: mod.id, label: mod.name, color: modColor(mod), onClick: () => go({ mod: mod.id }) },
          ...drill.map((k, i) => ({
            key: k,
            label: model.nodes.get(k)?.name ?? "?",
            color: model.nodes.get(k)?.color,
            onClick: () => go({ mod: mod.id, path: drill.slice(0, i + 1).join(",") }),
          })),
        ]
      : thingDef
        ? [
            { key: "root", label: "Özellikler", root: true, onClick: () => go({}) },
            { key: "thing", label: thingDef.name, onClick: () => {} },
          ]
        : null;

  return (
    <>
      <LabHeader period={period} onPick={setPeriod} trail={trail} back={mod || thingDef ? `/analytics/features?p=${period.key}` : undefined} />
      {!model ? null : mod ? (
        <FeatureDetail model={model} mod={mod} period={period} drill={drill} onDrill={(path) => go({ mod: mod.id, path: path.join(",") })} prefs={prefs} savePrefs={savePrefs} />
      ) : thingDef ? (
        <ThingDetail model={model} thing={thingDef} period={period} go={go} onUnmerge={() => { savePrefs({ ...prefs, things: prefs.things.filter((t) => t !== thingDef) }); go({}); }} />
      ) : (
        <FeatureList model={model} period={period} prefs={prefs} savePrefs={savePrefs} go={go} />
      )}
    </>
  );
}

function LabHeader({
  period,
  onPick,
  trail,
  back,
}: {
  period: Period;
  onPick: (p: Period) => void;
  trail: Parameters<typeof AnalysisTrail>[0]["steps"] | null;
  back?: string;
}) {
  const brutal = useBrutal();
  const t = useT();
  return (
    <PageHeader
      compact
      className={ANALYSIS_HEADER}
      title="Özellikler"
      titleSlot={
        <div className="flex items-center gap-1">
          {back ? (
            <Link
              href={back}
              aria-label={t("action.back")}
              className={cn(
                "flex shrink-0 items-center justify-center",
                brutal ? "h-[30px] w-[30px] rounded-[9px] border-[1.5px] border-[#111] text-[#111]" : "-ml-1.5 h-8 w-8 rounded-lg text-muted-foreground"
              )}
            >
              <ArrowLeft className="h-[18px] w-[18px]" />
            </Link>
          ) : (
            <span className="w-8 shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <PeriodNav period={period} onPick={onPick} />
          </div>
          <span className="w-8 shrink-0" aria-hidden />
        </div>
      }
      nav={
        <div className="flex flex-col">
          <PeriodTabs period={period} onPick={onPick} />
          <div data-trail-wrap="" className="py-2">
            {trail ? (
              <AnalysisTrail steps={trail} />
            ) : (
              /* Analizin iki kapısı */
              <div data-door="" className={cn("flex gap-1 rounded-xl p-[3px]", brutal ? "border-[1.5px] border-[#111] bg-white" : "bg-[var(--sf-2)]")}>
                <Link
                  href="/analytics"
                  className={cn("flex h-8 flex-1 items-center justify-center rounded-lg text-[12.5px] font-semibold", brutal ? "text-[#111]" : "text-muted-foreground")}
                >
                  Kategoriler
                </Link>
                <span
                  className={cn(
                    "flex h-8 flex-1 items-center justify-center rounded-lg text-[12.5px] font-bold",
                    brutal ? "bg-[#111] text-[#fff4dc]" : "bg-card text-foreground shadow-sm"
                  )}
                >
                  Özellikler
                </span>
              </div>
            )}
          </div>
        </div>
      }
    />
  );
}

// ─── Liste ───────────────────────────────────────────────────────────────

function FeatureList({
  model,
  period,
  prefs,
  savePrefs,
  go,
}: {
  model: Model;
  period: Period;
  prefs: Prefs;
  savePrefs: (p: Prefs) => void;
  go: (q: Record<string, string | undefined>) => void;
}) {
  const brutal = useBrutal();
  const [showAll, setShowAll] = useState(false);
  const { a, b } = windowOf(period, model.rows);
  const suggestions = sameNameGroups(model, prefs);
  const dups = duplicateMods(model, prefs);

  const features = [...model.modById.values()]
    .filter((m) => !prefs.merged[m.id])
    .map((m) => {
      const all = model.rows.filter((r) => r.modId === m.id);
      const level = isLevelMod(m);
      const { rows, dropped } = level ? { rows: inWin(all, a, b), dropped: 0 } : dedupe(inWin(all, a, b));
      const byCat = new Map<string, number>();
      for (const r of rows) byCat.set(r.path[0], (byCat.get(r.path[0]) ?? 0) + r.value);
      const places = level ? levelPlaces(model, all, a, b) : [];
      return { m, level, rows, dropped, byCat, places, used: all.length };
    })
    .filter((f) => f.used > 0)
    .sort((x, y) => y.rows.length - x.rows.length);

  return (
    <div className="flex flex-col gap-5 pb-6">
      {prefs.things.length > 0 && (
        <section>
          <SectionHead note="aynı olduğunu söylediğin yerler">Şeyler</SectionHead>
          <div className="flex flex-col gap-2">
            {prefs.things.map((t) => (
              <ThingCard key={t.name} model={model} thing={t} period={period} onOpen={() => go({ thing: t.name })} />
            ))}
          </div>
        </section>
      )}

      {suggestions.length > 0 && (
        <section className="flex flex-col gap-2">
          {suggestions.slice(0, showAll ? suggestions.length : 1).map((s) => (
            <Card key={s.name} className={cn(brutal ? "border-dashed" : "border-dashed border-[var(--ln-2)]")}>
              <div className="flex items-start gap-3">
                <Sparkles className={cn("mt-0.5 h-4 w-4 shrink-0", brutal ? "text-[#111]" : "text-violet-400")} />
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-semibold">
                    “{s.name}” {s.nodes.length} yerde geçiyor. Aynı şey mi?
                  </p>
                  <ul className="mt-1.5 flex flex-col gap-0.5 text-[12px] text-muted-foreground">
                    {s.nodes.map((n) => (
                      <li key={n.key} className="truncate">
                        {pathLabel(model, pathTo(model, n.key))}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1.5 text-[11.5px] text-muted-foreground/80">
                    Aynıysa harcaması, km’si ve diğer bütün özellikleri tek sayfada birleşir.
                  </p>
                  <div className="mt-2.5 flex gap-2">
                    <button
                      type="button"
                      onClick={() => savePrefs({ ...prefs, things: [...prefs.things, { name: s.name, keys: s.nodes.map((n) => n.key) }] })}
                      className={cn(
                        "flex h-8 items-center gap-1.5 rounded-lg px-3 text-[12.5px] font-bold",
                        brutal ? "border-2 border-[#111] bg-[#7ae582] text-[#111] shadow-[2px_2px_0_#111]" : "bg-violet-500/90 text-white"
                      )}
                    >
                      <Check className="h-3.5 w-3.5" /> Evet, aynı
                    </button>
                    <button
                      type="button"
                      onClick={() => savePrefs({ ...prefs, dismissed: [...prefs.dismissed, norm(s.name)] })}
                      className={cn("flex h-8 items-center gap-1.5 rounded-lg px-3 text-[12.5px] font-semibold", brutal ? "border-2 border-[#111] bg-white text-[#111]" : "bg-[var(--sf-2)] text-muted-foreground")}
                    >
                      <X className="h-3.5 w-3.5" /> Farklı
                    </button>
                  </div>
                </div>
              </div>
            </Card>
          ))}
          {suggestions.length > 1 && !showAll && (
            <button type="button" onClick={() => setShowAll(true)} className="self-start px-1 text-[12px] font-semibold text-muted-foreground underline decoration-dotted underline-offset-4">
              +{suggestions.length - 1} öneri daha
            </button>
          )}
        </section>
      )}

      {dups.map((d) => (
        <Card key={d.b.id} className="border-dashed">
          <div className="flex items-start gap-3">
            <Copy className={cn("mt-0.5 h-4 w-4 shrink-0", brutal ? "text-[#111]" : "text-amber-400")} />
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-semibold">
                “{d.b.name}” ile “{d.a.name}” aynı şeyi mi ölçüyor?
              </p>
              <p className="mt-1 text-[12px] text-muted-foreground">
                {d.reason} Birlikte sayarsak toplam tek yerde görünür.
              </p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => savePrefs({ ...prefs, merged: { ...prefs.merged, [d.b.id]: d.a.id } })}
                  className={cn(
                    "flex h-8 items-center gap-1.5 rounded-lg px-3 text-[12.5px] font-bold",
                    brutal ? "border-2 border-[#111] bg-[#ffd23f] text-[#111] shadow-[2px_2px_0_#111]" : "bg-amber-500/90 text-black"
                  )}
                >
                  <Link2 className="h-3.5 w-3.5" /> “{d.a.name}” ile birlikte say
                </button>
                <button
                  type="button"
                  onClick={() => savePrefs({ ...prefs, distinct: [...prefs.distinct, pairKey(d.a.id, d.b.id)] })}
                  className={cn("flex h-8 items-center gap-1.5 rounded-lg px-3 text-[12.5px] font-semibold", brutal ? "border-2 border-[#111] bg-white text-[#111]" : "bg-[var(--sf-2)] text-muted-foreground")}
                >
                  <X className="h-3.5 w-3.5" /> Farklı
                </button>
              </div>
            </div>
          </div>
        </Card>
      ))}

      <section>
        <SectionHead note={periodShortLabel(period)}>Özellikler</SectionHead>
        <div className="flex flex-col gap-2">
          {features.map((f) => {
            const color = modColor(f.m);
            const total = f.rows.reduce((s, r) => s + r.value, 0);
            const parts = [...f.byCat.entries()]
              .map(([k, v]) => ({ key: k, value: v, color: model.nodes.get(k)!.color, name: model.nodes.get(k)!.name }))
              .sort((x, y) => y.value - x.value);
            const mergedNames = Object.entries(prefs.merged)
              .filter(([, to]) => to === f.m.id)
              .map(([from]) => model.modById.get(from)?.name)
              .filter(Boolean);
            return (
              <Card key={f.m.id} onClick={() => go({ mod: f.m.id })}>
                <div className="flex items-center gap-3">
                  <ModAtomCore icon={modAtomIcon({ name: f.m.name, entryType: { valueType: f.m.valueType } as never })} size="sm" color={color} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-semibold">
                      {f.m.name}
                      {mergedNames.length > 0 && <span className="text-[11px] font-normal text-muted-foreground"> + {mergedNames.join(", ")}</span>}
                    </div>
                    <div className="truncate text-[11.5px] text-muted-foreground">
                      {f.level
                        ? `${f.places.length} yerde ölçülüyor`
                        : `${f.byCat.size} kategoriden · ${f.rows.length} girdi`}
                    </div>
                  </div>
                  {!f.level && (
                    <div className="shrink-0 text-right">
                      <div className="text-[17px] font-bold tabular-nums tracking-tight">{fmtNum(total)}</div>
                      <div className="text-[10.5px] text-muted-foreground">{f.m.unit}</div>
                    </div>
                  )}
                </div>
                {f.level ? (
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {f.places.map((p) => (
                      <span key={p.key} data-place-chip="" className="flex items-center gap-1.5 rounded-lg bg-[var(--sf-2)] px-2 py-1 text-[11.5px]">
                        <span className="h-2 w-2 rounded-full" style={{ background: p.node.color }} />
                        <b className="font-semibold">{p.node.name}</b>
                        <span className="tabular-nums">{fmtVal(p.last!, f.m.unit)}</span>
                        {p.delta > 0 && <span className="tabular-nums text-muted-foreground">+{fmtNum(p.delta)}</span>}
                      </span>
                    ))}
                  </div>
                ) : (
                  parts.length > 1 && <SplitBar parts={parts} />
                )}
                {f.dropped > 0 && (
                  <p className="mt-1.5 text-[10.5px] text-muted-foreground/80">Bağlı {f.dropped} girdi bir kez sayıldı</p>
                )}
              </Card>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function pathTo(model: Model, key: string): string[] {
  const out: string[] = [];
  for (let k: string | undefined = key; k; k = model.nodes.get(k)?.parentKey) out.unshift(k);
  return out;
}

// ─── Özellik ayrıntısı ───────────────────────────────────────────────────

function FeatureDetail({
  model,
  mod,
  period,
  drill,
  onDrill,
  prefs,
  savePrefs,
}: {
  model: Model;
  mod: Mod;
  period: Period;
  drill: string[];
  onDrill: (path: string[]) => void;
  prefs: Prefs;
  savePrefs: (p: Prefs) => void;
}) {
  const mergedIn = Object.entries(prefs.merged).filter(([, to]) => to === mod.id).map(([from]) => model.modById.get(from)).filter((m): m is Mod => !!m);
  const brutal = useBrutal();
  const color = modColor(mod);
  const level = isLevelMod(mod);
  const all = model.rows.filter((r) => r.modId === mod.id);
  const scoped = all.filter((r) => drill.every((k, i) => r.path[i] === k));
  const { a, b, days } = windowOf(period, scoped);
  const win = level ? { rows: inWin(scoped, a, b), dropped: 0 } : dedupe(inWin(scoped, a, b));
  const total = win.rows.reduce((s, r) => s + r.value, 0);
  const [nowMs] = useState(() => Date.now());
  const pw = prevWindow(period, nowMs);
  const prevTotal = pw && !level ? dedupe(inWin(scoped, pw.a, pw.b)).rows.reduce((s, r) => s + r.value, 0) : null;
  const series = seriesOf(period, win.rows, level);

  // Kırılım: bulunulan yerin bir altı
  const depth = drill.length;
  const groups = new Map<string, Row[]>();
  for (const r of win.rows) {
    const k = r.path[depth] ?? "__self";
    const l = groups.get(k) ?? [];
    l.push(r);
    groups.set(k, l);
  }
  const shareRows: ShareRow[] = [...groups.entries()].map(([k, l]) => {
    const n = k === "__self" ? model.nodes.get(drill[depth - 1]) : model.nodes.get(k);
    const v = l.reduce((s, r) => s + r.value, 0);
    return {
      id: k,
      name: k === "__self" ? `${n?.name ?? ""} (doğrudan)` : (n?.name ?? "?"),
      color: n?.color ?? color,
      value: v,
      display: fmtVal(v, mod.unit),
      drillable: k !== "__self" && l.some((r) => r.path.length > depth + 1),
    };
  });

  const entryRows: EntryListRow[] = [...win.rows]
    .sort((x, y) => y.entry.occurredAt - x.entry.occurredAt)
    .slice(0, 40)
    .map((r) => ({
      id: r.entry.id,
      occurredAt: r.entry.occurredAt,
      title: r.entry.title,
      notes: r.entry.notes,
      subLabel: pathLabel(model, r.path.slice(Math.max(depth, r.path.length - 2))),
      valueLabel: fmtVal(r.value, mod.unit),
    }));

  const places = level ? levelPlaces(model, scoped, a, b) : [];

  return (
    <div className="flex flex-col gap-4 pb-6">
      <div className="flex items-center gap-3 px-1">
        <span className={cn(brutal && "rounded-full border-2 border-[#111] shadow-[2px_2px_0_#111]")}>
          <ModAtomCore icon={modAtomIcon({ name: mod.name, entryType: { valueType: mod.valueType } as never })} size="lg" color={color} />
        </span>
        <div className="min-w-0">
          <div className={cn("text-[12px]", brutal ? "font-extrabold uppercase tracking-wider" : "text-muted-foreground")}>
            {drill.length ? pathLabel(model, drill) : "Uygulamanın tamamında"}
          </div>
          <h2 className={cn("leading-tight", brutal ? "text-[30px] font-black tracking-tight" : "text-[22px] font-semibold")}>{mod.name}</h2>
        </div>
      </div>
      {mergedIn.length > 0 && (
        <div className="-mt-1 flex flex-wrap items-center gap-2 px-1 text-[12px] text-muted-foreground">
          {mergedIn.map((m) => (
            <span key={m.id} className="flex items-center gap-1.5">
              “{m.name}” de birlikte sayılıyor
              <button
                type="button"
                onClick={() => {
                  const next = { ...prefs.merged };
                  delete next[m.id];
                  savePrefs({ ...prefs, merged: next });
                }}
                className="font-semibold underline decoration-dotted underline-offset-4"
              >
                Ayır
              </button>
            </span>
          ))}
        </div>
      )}

      {level ? (
        <>
          <SectionHead note="her yerin kendi ölçümü — toplanmaz">Yerler</SectionHead>
          <div className="-mt-2 flex flex-col gap-2">
            {places.map((p) => {
              const s = seriesOf(period, p.inside, true);
              return (
                <Card key={p.key}>
                  <div className="flex items-center gap-3">
                    <NodeIcon node={p.node} size={36} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[14px] font-semibold">{p.node.name}</div>
                      <div className="truncate text-[11.5px] text-muted-foreground">{pathLabel(model, p.path.slice(0, -1))}</div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-[17px] font-bold tabular-nums">{fmtVal(p.last!, mod.unit)}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {p.delta ? `bu dönemde ${p.delta > 0 ? "+" : "−"}${fmtNum(Math.abs(p.delta))}` : "son ölçüm"}
                      </div>
                    </div>
                  </div>
                  {s && p.inside.length > 1 && (
                    <div className="mt-2">
                      <DailyBarChart data={s.buckets} color={p.node.color} unit={mod.unit} variant="line" caption={s.frame?.caption} showAllTicks={s.frame?.showAllTicks} />
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <StatTile color={color} label="Toplam" value={fmtNum(total)} unit={mod.unit} sub={periodShortLabel(period)} />
            <StatTile color={color} label="Günlük ort." value={fmtNum(total / days)} unit={mod.unit} sub={`${days} gün`} />
            <StatTile color={color} label="Girdi" value={fmtNum(win.rows.length)} sub={growthSub(total, prevTotal, pw?.label)} />
          </div>
          {win.dropped > 0 && (
            <p className="-mt-2 px-1 text-[11px] text-muted-foreground">Paralel perspektifli {win.dropped} girdi bir kez sayıldı.</p>
          )}

          <div className="flex flex-col gap-2">
            <SectionHead note={drill.length ? "dokununca bir kademe iner" : "kategoriler — dokununca iner"}>Nereden geliyor</SectionHead>
            <div className="-mt-2 rounded-2xl border border-border bg-card p-4">
              <ShareBars rows={shareRows} onSelect={(id) => id !== "__self" && onDrill([...drill, id])} emptyText="Bu dönemde veri yok" />
            </div>
          </div>

          {series && (
            <div className="flex flex-col gap-2">
              <SectionHead note={periodShortLabel(period)}>Zaman içinde</SectionHead>
              <div className="-mt-2 rounded-2xl border border-border bg-card p-4">
                <DailyBarChart data={series.buckets} color={color} unit={mod.unit} caption={series.frame?.caption} showAllTicks={series.frame?.showAllTicks} />
              </div>
            </div>
          )}
        </>
      )}

      <EntryListSection title="Girdiler" accent={color} rows={entryRows} emptyText="Bu dönemde veri yok" />
    </div>
  );
}

// ─── Şey (aynı olduğu söylenen yerler) ────────────────────────────────────

function thingStats(model: Model, thing: { keys: string[] }, period: Period) {
  const rows = model.rows.filter((r) => r.path.some((k) => thing.keys.includes(k)));
  const { a, b, days } = windowOf(period, rows);
  const byMod = new Map<string, Row[]>();
  for (const r of rows) {
    const l = byMod.get(r.modId) ?? [];
    l.push(r);
    byMod.set(r.modId, l);
  }
  const feats = [...byMod.entries()].map(([id, list]) => {
    const m = model.modById.get(id)!;
    const level = isLevelMod(m);
    const win = level ? inWin(list, a, b) : dedupe(inWin(list, a, b)).rows;
    const places = level ? levelPlaces(model, list, a, b) : [];
    return {
      m,
      level,
      win,
      total: win.reduce((s, r) => s + r.value, 0),
      last: places[0]?.last,
      delta: places.reduce((s, p) => s + p.delta, 0),
      all: list,
    };
  });
  // Hesaplananlar: birikenin, SAYACIN dönemdeki artışına oranı (₺/km,
  // L/100 km). Sayaç = her yerde hiç azalmayan seviye (kilometre); kilo
  // gibi inip çıkan bir seviyeye bölmek anlamsız olurdu
  const isCounter = (list: Row[]) => {
    const byPlace = new Map<string, Row[]>();
    for (const r of list) { const k = r.path[r.path.length - 1]; byPlace.set(k, [...(byPlace.get(k) ?? []), r]); }
    return [...byPlace.values()].every((l) => {
      const v = [...l].sort((x, y) => x.entry.occurredAt - y.entry.occurredAt).map((r) => r.value);
      return v.length >= 3 && v.every((x, i) => i === 0 || x >= v[i - 1]);
    });
  };
  const distance = feats.find((f) => f.level && f.delta > 0 && isCounter(f.all));
  const derived = distance
    ? feats
        .filter((f) => !f.level && f.total > 0)
        .map((f) =>
          f.m.unit === "L"
            ? { label: `${f.m.unit}/100 ${distance.m.unit}`, value: (f.total / distance.delta) * 100, name: f.m.name }
            : { label: `${f.m.unit}/${distance.m.unit}`, value: f.total / distance.delta, name: f.m.name }
        )
    : [];
  return { feats, derived, a, b, days, distance };
}

function ThingCard({ model, thing, period, onOpen }: { model: Model; thing: { name: string; keys: string[] }; period: Period; onOpen: () => void }) {
  const node = model.nodes.get(thing.keys[thing.keys.length - 1]) ?? model.nodes.get(thing.keys[0]);
  const { feats, derived } = thingStats(model, thing, period);
  if (!node) return null;
  return (
    <Card onClick={onOpen}>
      <div className="flex items-center gap-3">
        <NodeIcon node={node} size={40} />
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-bold">{thing.name}</div>
          <div className="truncate text-[11.5px] text-muted-foreground">{thing.keys.length} yer birleşik</div>
        </div>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {feats.map((f) => (
          <span key={f.m.id} data-place-chip="" className="rounded-lg bg-[var(--sf-2)] px-2 py-1 text-[11.5px]">
            <b className="font-semibold">{f.m.name}</b>{" "}
            <span className="tabular-nums">
              {f.level ? (f.delta ? `+${fmtNum(f.delta)} ${f.m.unit}` : fmtVal(f.last ?? 0, f.m.unit)) : fmtVal(f.total, f.m.unit)}
            </span>
          </span>
        ))}
        {derived.map((d) => (
          <span key={d.label} data-derived-chip="" className="rounded-lg bg-violet-500/15 px-2 py-1 text-[11.5px] font-semibold text-violet-300 [:root[data-skin=brutal]_&]:border-[1.5px] [:root[data-skin=brutal]_&]:border-[#111] [:root[data-skin=brutal]_&]:bg-[#c9b8ff] [:root[data-skin=brutal]_&]:text-[#111]">
            {fmtNum(d.value)} {d.label}
          </span>
        ))}
      </div>
    </Card>
  );
}

function ThingDetail({
  model,
  thing,
  period,
  go,
  onUnmerge,
}: {
  model: Model;
  thing: { name: string; keys: string[] };
  period: Period;
  go: (q: Record<string, string | undefined>) => void;
  onUnmerge: () => void;
}) {
  const brutal = useBrutal();
  const node = model.nodes.get(thing.keys[thing.keys.length - 1]) ?? model.nodes.get(thing.keys[0])!;
  const { feats, derived, a, b, distance } = thingStats(model, thing, period);
  const money = feats.find((f) => !f.level && f.m.unit === "₺");
  // Paranın kırılımı: birleşik yerin bir altı (Yakıt · Bakım · Muayene)
  const moneyRows: ShareRow[] = [];
  if (money) {
    const g = new Map<string, number>();
    for (const r of money.win) {
      const at = r.path.findIndex((k) => thing.keys.includes(k));
      const k = r.path[at + 1] ?? r.path[at];
      g.set(k, (g.get(k) ?? 0) + r.value);
    }
    for (const [k, v] of g) {
      const n = model.nodes.get(k);
      moneyRows.push({ id: k, name: n?.name ?? "?", color: n?.color ?? "#888", value: v, display: fmtVal(v, "₺") });
    }
  }
  const km = distance ? levelPlaces(model, distance.all, a, b)[0] : undefined;
  const kmSeries = km ? seriesOf(period, km.inside, true) : null;

  return (
    <div className="flex flex-col gap-4 pb-6">
      <div className="flex items-center gap-3 px-1">
        <NodeIcon node={node} size={brutal ? 56 : 48} />
        <div className="min-w-0">
          <div className={cn("text-[12px]", brutal ? "font-extrabold uppercase tracking-wider" : "text-muted-foreground")}>{thing.keys.length} yer birleşik</div>
          <h2 className={cn("leading-tight", brutal ? "text-[32px] font-black tracking-tight" : "text-[22px] font-semibold")}>{thing.name}</h2>
        </div>
      </div>
      <div className="-mt-1 flex flex-col gap-0.5 px-1 text-[11.5px] text-muted-foreground">
        {thing.keys.map((k) => (
          <span key={k} className="truncate">• {pathLabel(model, pathTo(model, k))}</span>
        ))}
        <button type="button" onClick={onUnmerge} className="mt-1 self-start font-semibold underline decoration-dotted underline-offset-4">
          Aynı değil — birleştirmeyi kaldır
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {feats.map((f) => (
          <StatTile
            key={f.m.id}
            color={modColor(f.m)}
            label={f.m.name}
            value={fmtNum(f.level ? (f.delta || (f.last ?? 0)) : f.total)}
            unit={f.m.unit}
            sub={f.level ? (f.delta ? `yapıldı · son ${fmtNum(f.last ?? 0)}` : "son ölçüm") : `${f.win.length} girdi`}
          />
        ))}
      </div>

      {derived.length > 0 && (
        <div className="flex flex-col gap-2">
          <SectionHead note="yaklaşık · dönemdeki km farkına göre">Hesaplananlar</SectionHead>
          <div className="-mt-2 grid grid-cols-2 gap-2">
            {derived.map((d) => (
              <StatTile key={d.label} color="#8b5cf6" label={d.name.includes("litre") ? "Tüketim" : "Km başına"} value={fmtNum(d.value)} unit={d.label} sub={d.name} />
            ))}
          </div>
        </div>
      )}

      {moneyRows.length > 0 && (
        <div className="flex flex-col gap-2">
          <SectionHead note={periodShortLabel(period)}>Para nereye gitti</SectionHead>
          <div className="-mt-2 rounded-2xl border border-border bg-card p-4">
            <ShareBars rows={moneyRows} onSelect={(k) => money && go({ mod: money.m.id, path: pathTo(model, k).join(",") })} />
          </div>
        </div>
      )}

      {kmSeries && km && km.inside.length > 1 && (
        <div className="flex flex-col gap-2">
          <SectionHead note={km.node.name}>{distance!.m.name}</SectionHead>
          <div className="-mt-2 rounded-2xl border border-border bg-card p-4">
            <DailyBarChart data={kmSeries.buckets} color={node.color} unit={distance!.m.unit} variant="line" caption={kmSeries.frame?.caption} showAllTicks={kmSeries.frame?.showAllTicks} />
          </div>
        </div>
      )}
    </div>
  );
}
