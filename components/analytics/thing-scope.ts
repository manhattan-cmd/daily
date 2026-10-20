import { db } from "@/lib/db";
import { choiceLabel } from "@/lib/choice-level";
import {
  boolToNumber,
  classifyMod,
  dtrDurationHours,
  parseNumeric,
  textToNumber,
  type Metric,
  type MetricMod,
} from "@/lib/analytics";
import type { Category, Entry, EntryValue, Mod, SubCategory, Thing } from "@/types";

/**
 * Nesne analizinin ortak verisi: verilen nesnelerin iliştirildiği girdiler
 * ve bu girdilerdeki değerler. Değerler iki türlü: girdinin kendi değerleri
 * (yakıt parası, okuma süresi) ve nesne için yazılanlar (Mevcut km, sayfa).
 * Başka nesnelere ait değerler dışarıda kalır.
 *
 * Nesnenin kendi özellikleri bir DURUMDUR (km, bulunulan sayfa): özelliğe
 * ayrıca bir analiz biçimi seçilmemişse "seviye" okunur — son değer,
 * ortalama, aralık; kovalar toplanmaz. Girdinin kendi değerleri olağan
 * biçimiyle (para toplanır).
 */
export interface ThingScope {
  things: Thing[];
  entries: Entry[];
  values: EntryValue[];
  mods: MetricMod[];
  /** Nesnenin özelliği olan (durum) özellikler */
  stateModIds: Set<string>;
  modById: Map<string, Mod>;
  subById: Map<string, SubCategory>;
  catById: Map<string, Category>;
}

export async function loadThingScope(thingIds: string[]): Promise<ThingScope> {
  const ids = new Set(thingIds);
  const things = (await db.things.bulkGet(thingIds)).filter((t): t is Thing => !!t);
  const entries = thingIds.length
    ? await db.entries.where("thingIds").anyOf(thingIds).distinct().toArray()
    : [];
  const values = entries.length
    ? (await db.entryValues.where("entryId").anyOf(entries.map((e) => e.id)).toArray()).filter(
        (v) => !v.thingId || ids.has(v.thingId)
      )
    : [];
  const [subs, cats, allMods, collections] = await Promise.all([
    db.subcategories.toArray(),
    db.categories.toArray(),
    db.mods.toArray(),
    db.collections.bulkGet([...new Set(things.map((t) => t.collectionId))]),
  ]);
  const stateModIds = new Set<string>([
    ...collections.flatMap((c) => c?.modIds ?? []),
    ...things.flatMap((t) => t.extraModIds ?? []),
  ]);
  const used = new Set(values.map((v) => v.modId).filter((x): x is string => !!x));
  const mods = allMods
    .filter((m) => used.has(m.id))
    .map((m) =>
      classifyMod(
        stateModIds.has(m.id) && !m.analysis && (m.valueType ?? "number") === "number"
          ? { ...m, analysis: { preset: "level" } }
          : m
      )
    )
    .filter((m): m is MetricMod => !!m)
    // Önce nesnenin durumları, sonra girdinin değerleri
    .sort(
      (a, b) =>
        Number(stateModIds.has(b.id)) - Number(stateModIds.has(a.id)) ||
        a.name.localeCompare(b.name, "tr")
    );
  return {
    things,
    entries,
    values,
    mods,
    stateModIds,
    modById: new Map(allMods.map((m) => [m.id, m])),
    subById: new Map(subs.map((s) => [s.id, s])),
    catById: new Map(cats.map((c) => [c.id, c])),
  };
}

/** Sayısal metrikte bir değerin karşılığı (süre saate, evet 1'e…) */
export function amountOf(metric: Metric, raw: string): number {
  if (metric.type !== "mod") return 1;
  const k = metric.mod.kind;
  return k === "duration"
    ? dtrDurationHours(raw)
    : k === "rate"
      ? boolToNumber(raw)
      : k === "presence"
        ? textToNumber(raw)
        : parseNumeric(raw);
}

/**
 * Girdi başına metrik değeri. `thingId` verilirse nesneye ait değerlerden
 * yalnız o nesneninkiler sayılır (iki araba aynı girdide olabilir).
 */
export function perEntry(
  scope: ThingScope,
  metric: Metric,
  thingId?: string
): { num: Map<string, number>; labels: Map<string, string[]> } {
  const num = new Map<string, number>();
  const labels = new Map<string, string[]>();
  if (metric.type === "count") return { num, labels };
  for (const v of scope.values) {
    if (v.modId !== metric.mod.id) continue;
    if (thingId && v.thingId && v.thingId !== thingId) continue;
    if (metric.type === "choice") {
      const l = choiceLabel(v.value).trim();
      if (l) labels.set(v.entryId, [...(labels.get(v.entryId) ?? []), l]);
    } else {
      num.set(v.entryId, (num.get(v.entryId) ?? 0) + amountOf(metric, v.value));
    }
  }
  return { num, labels };
}

/** Seviye okunan metrikte bir girdi kümesinin son değeri (zamana göre) */
export function lastOf(entries: Entry[], num: Map<string, number>): number | undefined {
  let best: { at: number; v: number } | undefined;
  for (const e of entries) {
    const v = num.get(e.id);
    if (v === undefined) continue;
    if (!best || e.occurredAt >= best.at) best = { at: e.occurredAt, v };
  }
  return best?.v;
}
