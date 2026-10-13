/**
 * Analiz cümlesi — "ne · nerede · ne zaman".
 *
 * Her analiz ekranı bir cümle: hangi özellik (ya da her şey), hangi yer (ya
 * da her yer), hangi dönem. Bu dosya ekrandan bağımsız hesapları tutuyor:
 * veriyi satırlara çevirmek (her değer bir yolda, bir sayıda), cümlenin
 * kapsamına süzmek, okumaya göre toplamak (toplam · seviye · ortalama ·
 * oran · dağılım), kırılım, seri ve açılış özetleri.
 */

import {
  analysisKindOf,
  boolToNumber,
  bucketKeyOf,
  buildSeriesBuckets,
  chooseGranularity,
  dtrDurationHours,
  fmtNum,
  fmtPct,
  frameDailySeries,
  framePeriodSeries,
  parseNumeric,
  presetOf,
  startOfDayMs,
  type DayBucket,
  type ScaleRange,
  type SeriesFrame,
} from "@/lib/analytics";
import { choiceLabel } from "@/lib/choice-level";
import { scaleRangeOf } from "@/lib/measure-kinds";
import { modColor } from "@/lib/mod-color";
import { periodShortLabel, shiftPeriod, type Period } from "@/lib/period";
import type { Category, Entry, EntryValue, Mod, SubCategory } from "@/types";

export const DAY = 86400000;

// ─── Veri ────────────────────────────────────────────────────────────────

export type Store = {
  cats: Category[];
  subs: SubCategory[];
  mods: Mod[];
  entries: Entry[];
  values: EntryValue[];
};

/** Ağaçta bir yer: kategori (c:) ya da alt kategori (s:) */
export type Node = {
  key: string;
  name: string;
  color: string;
  icon?: string;
  catId: string;
  parentKey?: string;
  isCat: boolean;
};

/** Özelliğin analizde okunuşu — ölçüden ve özelliğin analiz tercihinden */
export type Reading = "sum" | "peak" | "average" | "level" | "rate" | "choice";

export type ModInfo = {
  mod: Mod;
  /** Birleştirildiyse ana özellik — bu satırlar onun adına sayılır */
  reading: Reading;
  unit: string;
  color: string;
  /** Skala aralığı (ortalama okunan seçenekli özellikler) */
  scale?: ScaleRange;
  /** Süre — saat olarak saklanır, "7 sa 10 dk" diye okunur */
  isDuration: boolean;
};

export type Row = {
  entry: Entry;
  value: number;
  /** Seçenekte etiket (dağılım) */
  label?: string;
  /** Kökten yere: ["c:…", "s:…", …] */
  path: string[];
  /** Hesaplarda kullanılan özellik (birleştirilmiş olabilir) */
  modId: string;
  /** Girildiği özellik */
  origId: string;
};

export type Prefs = {
  /** "Aynı şey" denen yerler */
  things: { name: string; keys: string[] }[];
  /** Sorulup "farklı" denen ad öbekleri */
  dismissed: string[];
  /** Birleştirilen özellik → ana özellik */
  merged: Record<string, string>;
  /** "Farklı" denen özellik çiftleri */
  distinct: string[];
};
export const EMPTY_PREFS: Prefs = { things: [], dismissed: [], merged: {}, distinct: [] };

export const norm = (s: string) => s.toLocaleLowerCase("tr").trim();

function readingOf(m: Mod): { reading: Reading; isDuration: boolean; scale?: ScaleRange } {
  const kind = analysisKindOf(m.valueType, m.choices);
  const preset = presetOf(kind, m.analysis);
  const isDuration = kind === "duration";
  if (kind === "choice" || kind === "presence" || preset === "distribution" || preset === "texts" || preset === "frequency")
    return { reading: "choice", isDuration };
  if (kind === "rate") return { reading: "rate", isDuration };
  if (preset === "level") return { reading: "level", isDuration };
  if (preset === "peak") return { reading: "peak", isDuration };
  if (kind === "scale" || preset === "average") {
    const r = scaleRangeOf(m.choices);
    return { reading: "average", isDuration, scale: { min: r.min, max: r.max, low: m.scaleLabels?.low, high: m.scaleLabels?.high } };
  }
  return { reading: "sum", isDuration };
}

export function buildModel(store: Store, merged: Record<string, string>) {
  const catById = new Map(store.cats.map((c) => [c.id, c]));
  const subById = new Map(store.subs.map((s) => [s.id, s]));
  const nodes = new Map<string, Node>();
  for (const c of store.cats) {
    nodes.set(`c:${c.id}`, { key: `c:${c.id}`, name: c.name, color: c.color, icon: c.icon, catId: c.id, isCat: true });
  }
  for (const s of store.subs) {
    if (s.isCategoryRoot) continue;
    const c = catById.get(s.categoryId);
    if (!c) continue;
    nodes.set(`s:${s.id}`, {
      key: `s:${s.id}`,
      name: s.name,
      color: c.color,
      icon: s.icon ?? c.icon,
      catId: c.id,
      parentKey: s.parentId ? `s:${s.parentId}` : `c:${c.id}`,
      isCat: false,
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

  const info = new Map<string, ModInfo>();
  for (const m of store.mods) {
    const r = readingOf(m);
    info.set(m.id, {
      mod: m,
      reading: r.reading,
      unit: r.isDuration ? "sa" : (m.unit ?? ""),
      color: modColor(m),
      scale: r.scale,
      isDuration: r.isDuration,
    });
  }

  const entryById = new Map(store.entries.map((e) => [e.id, e]));
  const rows: Row[] = [];
  for (const v of store.values) {
    if (!v.modId) continue;
    const mi = info.get(v.modId);
    if (!mi) continue;
    const e = entryById.get(v.entryId);
    if (!e) continue;
    const path = pathOf(e.subcategoryId);
    if (!path.length || !nodes.has(path[0])) continue;
    const vt = mi.mod.valueType ?? "number";
    let value = 0;
    let label: string | undefined;
    if (mi.reading === "choice") {
      label = choiceLabel(v.value).trim();
      if (!label) continue;
      value = 1;
    } else if (vt === "datetime-range") {
      value = dtrDurationHours(v.value);
      if (!value) continue;
    } else if (vt === "boolean") {
      value = boolToNumber(v.value);
    } else {
      if (v.value.trim() === "") continue;
      value = parseNumeric(v.value);
    }
    rows.push({ entry: e, value, label, path, modId: merged[v.modId] ?? v.modId, origId: v.modId });
  }
  // Girdi sayısı için: her girdinin yolu
  const entryPaths = store.entries
    .map((e) => ({ entry: e, path: pathOf(e.subcategoryId) }))
    .filter((x) => x.path.length && nodes.has(x.path[0]));
  return { nodes, rows, info, entryPaths, catById };
}
export type Model = ReturnType<typeof buildModel>;

// ─── Cümle ───────────────────────────────────────────────────────────────

/** "Nerede": her yer, bir düğüm ya da aynı olduğu söylenen birkaç düğüm */
export type Place =
  | { kind: "all" }
  | { kind: "node"; key: string }
  | { kind: "thing"; name: string; keys: string[] };

export function placeKeys(place: Place): string[] | null {
  return place.kind === "all" ? null : place.kind === "node" ? [place.key] : place.keys;
}
export const inPlace = (path: string[], place: Place) => {
  const keys = placeKeys(place);
  return !keys || path.some((k) => keys.includes(k));
};

export function pathTo(model: Model, key: string): string[] {
  const out: string[] = [];
  for (let k: string | undefined = key; k; k = model.nodes.get(k)?.parentKey) out.unshift(k);
  return out;
}
export const pathLabel = (model: Model, path: string[]) =>
  path.map((k) => model.nodes.get(k)?.name ?? "?").join(" › ");

// ─── Dönem ───────────────────────────────────────────────────────────────

export function windowOf(period: Period, rows: { entry: Entry }[], nowMs: number) {
  const today = startOfDayMs(new Date(nowMs));
  let a = period.start;
  if (period.kind === "all") {
    let min = Infinity;
    for (const r of rows) if (r.entry.occurredAt < min) min = r.entry.occurredAt;
    a = Number.isFinite(min) ? startOfDayMs(new Date(min)) : today;
  }
  const b = Math.min(period.end, today + DAY);
  return { a, b, days: Math.max(1, Math.round((b - a) / DAY)) };
}

/** Karşılaştırma penceresi: önceki dönem; sürüyorsa onun aynı uzunluktaki başı */
export function prevWindow(period: Period, nowMs: number) {
  if (period.kind === "all") return null;
  const prev = shiftPeriod(period, -1);
  if (!prev) return null;
  const running = nowMs >= period.start && nowMs < period.end;
  return {
    a: prev.start,
    b: running ? Math.min(prev.end, prev.start + (nowMs - period.start)) : prev.end,
    label: periodShortLabel(prev),
    partial: running,
  };
}

export const inWin = <T extends { entry: Entry }>(rows: T[], a: number, b: number) =>
  rows.filter((r) => r.entry.occurredAt >= a && r.entry.occurredAt < b);

/** Paralel perspektifli olay (linkedGroupId) bir kez */
export function dedupe(rows: Row[]): { rows: Row[]; dropped: number } {
  const seen = new Set<string>();
  const out: Row[] = [];
  for (const r of rows) {
    const k = `${r.modId}|${r.entry.linkedGroupId ?? r.entry.id}|${r.label ?? ""}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return { rows: out, dropped: rows.length - out.length };
}

// ─── Toplama ─────────────────────────────────────────────────────────────

/** Bir okumanın ana rakamı; seviye ve dağılımda kullanılmaz */
export function aggregate(rows: Row[], reading: Reading): number {
  if (!rows.length) return 0;
  const vals = rows.map((r) => r.value);
  switch (reading) {
    case "peak":
      return Math.max(...vals);
    case "average":
    case "level":
      return vals.reduce((a, b) => a + b, 0) / vals.length;
    case "rate":
      return vals.reduce((a, b) => a + b, 0) / vals.length;
    case "choice":
      return new Set(rows.map((r) => r.entry.id)).size;
    default:
      return vals.reduce((a, b) => a + b, 0);
  }
}

export function fmtValue(n: number, mi: ModInfo, opts: { withUnit?: boolean } = {}): string {
  const withUnit = opts.withUnit ?? true;
  if (mi.reading === "rate") return fmtPct(n);
  if (mi.isDuration) {
    const mins = Math.round(n * 60);
    if (mins < 60) return `${mins} dk`;
    const h = Math.floor(mins / 60), m = mins % 60;
    return m ? `${h} sa ${m} dk` : `${h} sa`;
  }
  const s = fmtNum(n);
  return withUnit && mi.unit ? `${s} ${mi.unit}` : s;
}

/** "%28 az" / "%12 fazla" / "puan" — ortalama okumalarda fark puan olarak */
export function changeText(cur: number, prev: number, mi: ModInfo | null): string | null {
  if (!Number.isFinite(prev) || prev === 0) return null;
  if (mi && (mi.reading === "average" || mi.reading === "rate")) {
    const d = (cur - prev) * (mi.reading === "rate" ? 100 : 1);
    if (Math.abs(d) < 0.05) return "aynı";
    return `${fmtNum(Math.abs(d))} puan ${d > 0 ? "yukarı" : "aşağı"}`;
  }
  const pct = ((cur - prev) / prev) * 100;
  if (Math.abs(pct) < 0.5) return "aynı";
  return `%${fmtNum(Math.round(Math.abs(pct)))} ${pct > 0 ? "fazla" : "az"}`;
}

// ─── Seviye ──────────────────────────────────────────────────────────────

export type LevelPlace = {
  key: string;
  node: Node;
  path: string[];
  last?: number;
  delta: number;
  inside: Row[];
  /** Hiç azalmayan sayaç mı (km) — hesaplananlar yalnız bunda */
  counter: boolean;
};

export function levelPlaces(model: Model, rows: Row[], a: number, b: number): LevelPlace[] {
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
      const vals = sorted.map((r) => r.value);
      return {
        key,
        node: model.nodes.get(key)!,
        path: sorted[0].path,
        last: last?.value,
        delta: last && startVal !== undefined && inside.length ? last.value - startVal : 0,
        inside,
        counter: vals.length >= 3 && vals.every((x, i) => i === 0 || x >= vals[i - 1]),
      };
    })
    .filter((p) => p.last !== undefined && p.node)
    .sort((x, y) => (y.last ?? 0) - (x.last ?? 0));
}

// ─── Kırılım ─────────────────────────────────────────────────────────────

/** Bulunulan yerin bir altı. Kendi doğrudan girdileri "__self" */
export function childKeyOf(path: string[], place: Place): string | null {
  if (place.kind === "all") return path[0];
  const keys = placeKeys(place)!;
  const at = path.findIndex((k) => keys.includes(k));
  if (at < 0) return null;
  return path[at + 1] ?? "__self";
}

export type BreakRow = { key: string; rows: Row[]; deeper: boolean };

export function breakdown(rows: Row[], place: Place): BreakRow[] {
  const g = new Map<string, Row[]>();
  for (const r of rows) {
    const k = childKeyOf(r.path, place);
    if (!k) continue;
    const l = g.get(k) ?? [];
    l.push(r);
    g.set(k, l);
  }
  return [...g.entries()].map(([key, list]) => ({
    key,
    rows: list,
    deeper: key !== "__self",
  }));
}

// ─── Seri ────────────────────────────────────────────────────────────────

export function seriesOf(period: Period, rows: Row[], reading: Reading, nowMs: number) {
  const { a, b } = windowOf(period, rows, nowMs);
  const full = period.kind === "week" || period.kind === "month" || period.kind === "year";
  const end = full ? period.end : b;
  if (period.kind === "day" || end - a < 1.5 * DAY) return null;
  const g = period.kind === "month" ? "week" : chooseGranularity(a, end);
  const buckets: DayBucket[] = buildSeriesBuckets(a, end, g);
  const idx = new Map(buckets.map((x, i) => [x.key, i]));
  const per: Row[][] = buckets.map(() => []);
  const sorted = [...rows].sort((x, y) => x.entry.occurredAt - y.entry.occurredAt);
  for (const r of sorted) {
    const i = idx.get(bucketKeyOf(r.entry.occurredAt, g));
    if (i !== undefined) per[i].push(r);
  }
  buckets.forEach((x, i) => {
    const list = per[i];
    const vals = list.map((r) => r.value);
    const sum = vals.reduce((s, v) => s + v, 0);
    x.sum = sum;
    x.avg = vals.length ? sum / vals.length : 0;
    x.count = list.length;
    x.hasData = list.length > 0;
    if (reading === "level") x.value = vals.length ? vals[vals.length - 1] : 0;
    else if (reading === "rate") {
      x.value = sum;
      x.rest = list.length - sum;
    } else if (reading === "average") x.value = x.avg;
    else if (reading === "peak") x.value = vals.length ? Math.max(...vals) : 0;
    else if (reading === "choice") x.value = new Set(list.map((r) => r.entry.id)).size;
    else x.value = sum;
  });
  const frame: SeriesFrame | null = full
    ? framePeriodSeries(period.kind as "week" | "month" | "year", period.start, buckets)
    : g === "day"
      ? frameDailySeries(buckets)
      : null;
  return { buckets, frame };
}

// ─── Öneriler ────────────────────────────────────────────────────────────

/** Farklı kategorilerde aynı adla açılmış yerler — "aynı şey mi?" */
export function sameNameGroups(model: Model, prefs: Prefs) {
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
  const modsUnder = (key: string) => new Set(model.rows.filter((r) => r.path.includes(key)).map((r) => r.modId));
  const depth = (n: Node) => {
    let d = 0;
    for (let k = n.parentKey; k; k = model.nodes.get(k)?.parentKey) d++;
    return d;
  };
  const merged = prefs.things.flatMap((t) => t.keys);
  return groups
    // Üst dalları zaten birlikte eşleşmiş çocuklar ayrı sorulmaz — üst
    // eşleşme bir kategori değilse ("Araçlar" kategorisi ile Giderler ›
    // Araçlar eşleşse de araçlar tek tek sorulmalı)
    .filter((g) => {
      const pg = g.map((n) => (n.parentKey ? keyToGroup.get(n.parentKey) : undefined));
      if (pg.some((x) => x === undefined) || new Set(pg).size !== 1) return true;
      return groups[pg[0]!].some((n) => n.isCat);
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
 * Gelir kelimeleri ayrı öbek ve önce bakılıyor: "Kazanılan Para" ile "Para"
 * aynı sanılmasın.
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
export const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/**
 * Aynı şeyi ölçüyor olabilecek iki özellik. Asla kendiliğinden birleştirmez;
 * şu koşullarda SORAR: aynı birim, ikisi de toplanan özellik, hiçbir girdide
 * birlikte kullanılmamışlar, VE ya aynı adlı bir yerin altında girilmişler
 * ya da adları aynı anlam öbeğinde.
 */
export function duplicateMods(model: Model, prefs: Prefs) {
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
      const ia = model.info.get(ids[i])!, ib = model.info.get(ids[j])!;
      if (!ia.unit || ia.unit !== ib.unit || ia.reading !== "sum" || ib.reading !== "sum") continue;
      if (prefs.distinct.includes(pairKey(ia.mod.id, ib.mod.id))) continue;
      const ea = entriesOf.get(ia.mod.id)!, eb = entriesOf.get(ib.mod.id)!;
      if ([...ea].some((id) => eb.has(id))) continue;
      const common = [...placeNames.get(ia.mod.id)!].find((p) => p && placeNames.get(ib.mod.id)!.has(p));
      const ma = meaningOf(ia.mod.name), mb = meaningOf(ib.mod.name);
      if (!common && !(ma && ma === mb)) continue;
      const [main, other] = ea.size >= eb.size ? [ia.mod, ib.mod] : [ib.mod, ia.mod];
      const placeName = common ? [...model.nodes.values()].find((n) => norm(n.name) === common)?.name : undefined;
      const reason = placeName
        ? `İkisi de ${ia.unit}, ikisi de “${placeName}” altında girilmiş ve hiçbir girdide birlikte kullanılmamış.`
        : `İkisi de ${ia.unit}, adları aynı anlama geliyor olabilir ve hiçbir girdide birlikte kullanılmamış.`;
      out.push({ a: main, b: other, reason });
    }
  return out;
}

// ─── Açılış özeti ────────────────────────────────────────────────────────

export type Insight = {
  key: string;
  /** Kartın üst satırı: "Para · her yer" */
  scope: string;
  title: string;
  sub?: string;
  /** Kartın açacağı cümle */
  ne?: string;
  yer?: string;
  tone: "lead" | "plain" | "absent";
};

/**
 * Dönemin öne çıkanları — basit, açıklanabilir kurallar:
 *  1. En büyük birikenin (önce ₺) toplamı, öncekine göre ve en büyük payı.
 *  2. Diğer birikenlerden en çok değişen ikisi (en az %20).
 *  3. Seviyelerde dönemdeki değişim (sayaçta "+1.016 km").
 *  4. Ortalama okumalar (ruh hali, kalite) öncekiyle.
 *  5. Önceki dönemde harcama olup bu dönemde hiç olmayan yer (bitmiş dönemde).
 */
export function insightsFor(model: Model, period: Period, nowMs: number): Insight[] {
  const { a, b } = windowOf(period, model.rows, nowMs);
  const pw = prevWindow(period, nowMs);
  const out: Insight[] = [];
  const byMod = new Map<string, Row[]>();
  for (const r of model.rows) {
    const l = byMod.get(r.modId) ?? [];
    l.push(r);
    byMod.set(r.modId, l);
  }
  const placeOf = (rows: Row[]): { key?: string; label: string } => {
    // Hepsi tek yerdeyse o yer, tek kategorideyse kategori, yoksa her yer
    const leaves = new Set(rows.map((r) => r.path[r.path.length - 1]));
    if (leaves.size === 1) {
      const k = [...leaves][0];
      return { key: k, label: model.nodes.get(k)?.name ?? "" };
    }
    const cats = new Set(rows.map((r) => r.path[0]));
    if (cats.size === 1) {
      const k = [...cats][0];
      return { key: k, label: model.nodes.get(k)?.name ?? "" };
    }
    return { label: "her yer" };
  };
  const prevPhrase = pw ? (pw.partial ? "önceki dönemin aynı günlerine göre" : "önceki döneme göre") : "";

  const flows = [...byMod.entries()]
    .map(([id, all]) => {
      const mi = model.info.get(id)!;
      return { id, mi, cur: dedupe(inWin(all, a, b)).rows, prev: pw ? dedupe(inWin(all, pw.a, pw.b)).rows : [] };
    })
    .filter((f) => f.mi.reading === "sum" && f.cur.length > 0);

  // 1 · Öncü: en büyük ₺, yoksa en çok girilen biriken
  const money = flows.filter((f) => f.mi.unit === "₺").sort((x, y) => aggregate(y.cur, "sum") - aggregate(x.cur, "sum"));
  const lead = money[0] ?? [...flows].sort((x, y) => y.cur.length - x.cur.length)[0];
  if (lead) {
    const total = aggregate(lead.cur, "sum");
    const prevTotal = aggregate(lead.prev, "sum");
    const ch = pw ? changeText(total, prevTotal, lead.mi) : null;
    const tops = breakdown(lead.cur, { kind: "all" })
      .map((g) => ({ key: g.key, v: aggregate(g.rows, "sum") }))
      .sort((x, y) => y.v - x.v);
    // Tek kategori varsa onun bir altına bak: "en çok Araçlar"
    let topName = "";
    let topShare = 0;
    if (tops.length === 1) {
      const inner = breakdown(lead.cur, { kind: "node", key: tops[0].key })
        .map((g) => ({ key: g.key, v: aggregate(g.rows, "sum") }))
        .sort((x, y) => y.v - x.v);
      if (inner.length > 1 && inner[0].key !== "__self") {
        topName = model.nodes.get(inner[0].key)?.name ?? "";
        topShare = inner[0].v / total;
      }
    } else if (tops.length > 1) {
      topName = model.nodes.get(tops[0].key)?.name ?? "";
      topShare = tops[0].v / total;
    }
    out.push({
      key: `lead-${lead.id}`,
      scope: `${lead.mi.mod.name} · her yer`,
      title: fmtValue(total, lead.mi),
      sub: [ch && ch !== "aynı" ? `${prevPhrase} ${ch}` : ch === "aynı" ? `${prevPhrase} aynı` : null, topName ? `en çok ${topName} (${fmtPct(topShare)})` : null]
        .filter(Boolean)
        .join(" · "),
      ne: lead.id,
      tone: "lead",
    });
  }

  // 2 · En çok değişen birikenler
  if (pw) {
    const changes = flows
      .filter((f) => f !== lead && f.prev.length >= 2 && f.cur.length >= 1)
      .map((f) => {
        const cur = aggregate(f.cur, "sum"), prev = aggregate(f.prev, "sum");
        return { f, cur, prev, pct: prev ? ((cur - prev) / prev) * 100 : 0 };
      })
      .filter((x) => Math.abs(x.pct) >= 20)
      .sort((x, y) => Math.abs(y.pct) - Math.abs(x.pct));
    const seenPlaces = new Set<string>();
    let shown = 0;
    for (const c of changes) {
      const where = placeOf(c.f.cur);
      // Koşunun mesafesi ve süresi gibi aynı yerin iki ölçüsü ayrı kart olmasın
      const pk = where.key ?? "*";
      if (seenPlaces.has(pk) || shown >= 2) continue;
      seenPlaces.add(pk);
      shown++;
      out.push({
        key: `chg-${c.f.id}`,
        scope: `${c.f.mi.mod.name} · ${where.label}`,
        title: `${where.key ? where.label : c.f.mi.mod.name} ${c.pct > 0 ? "arttı" : "azaldı"}: ${fmtValue(c.cur, c.f.mi)}`,
        sub: `${pw.label}: ${fmtValue(c.prev, c.f.mi)}`,
        ne: c.f.id,
        yer: where.key,
        tone: "plain",
      });
    }
  }

  // 3 · Seviyeler: dönemdeki değişim
  for (const [id, all] of byMod) {
    const mi = model.info.get(id)!;
    if (mi.reading !== "level") continue;
    const places = levelPlaces(model, all, a, b).filter((p) => p.inside.length > 0);
    const top = [...places].sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta))[0];
    if (!top) continue;
    out.push({
      key: `lvl-${id}`,
      scope: `${mi.mod.name} · ${model.nodes.get(top.path[0])?.name ?? ""}`,
      title: top.delta
        ? `${top.node.name} ${top.delta > 0 ? "+" : "−"}${fmtValue(Math.abs(top.delta), mi)}`
        : `${top.node.name} ${fmtValue(top.last ?? 0, mi)}`,
      sub: top.delta ? `son ölçüm ${fmtValue(top.last ?? 0, mi)}` : "son ölçüm",
      ne: id,
      yer: top.key,
      tone: "plain",
    });
    if (out.length >= 5) break;
  }

  // 4 · Ortalama okumalar
  for (const [id, all] of byMod) {
    const mi = model.info.get(id)!;
    if (mi.reading !== "average") continue;
    const cur = inWin(all, a, b);
    if (cur.length < 2) continue;
    const avg = aggregate(cur, "average");
    const prev = pw ? inWin(all, pw.a, pw.b) : [];
    const ch = prev.length ? changeText(avg, aggregate(prev, "average"), mi) : null;
    out.push({
      key: `avg-${id}`,
      scope: `${mi.mod.name} · ortalama`,
      title: `${mi.mod.name}: ${fmtNum(avg)}${mi.scale ? ` / ${mi.scale.max}` : ""}`,
      sub: ch ? `${prevPhrase} ${ch}` : `${cur.length} kayıt`,
      ne: id,
      tone: "plain",
    });
    break;
  }

  // 5 · Biten dönemde harcaması kesilen yer
  if (pw && !pw.partial && lead && lead.mi.unit === "₺") {
    const curLeaves = new Set(lead.cur.map((r) => r.path[r.path.length - 1]));
    const gone = new Map<string, number>();
    for (const r of lead.prev) {
      const leaf = r.path[r.path.length - 1];
      if (!curLeaves.has(leaf)) gone.set(leaf, (gone.get(leaf) ?? 0) + r.value);
    }
    const top = [...gone.entries()].sort((x, y) => y[1] - x[1])[0];
    if (top && top[1] > 0) {
      const n = model.nodes.get(top[0]);
      out.push({
        key: `gone-${top[0]}`,
        scope: `${lead.mi.mod.name} · ${n?.name ?? ""}`,
        title: `${n?.name ?? ""}: bu dönem harcama yok`,
        sub: `${pw.label}: ${fmtValue(top[1], lead.mi)}`,
        ne: lead.id,
        yer: top[0],
        tone: "absent",
      });
    }
  }
  return out.slice(0, 6);
}
