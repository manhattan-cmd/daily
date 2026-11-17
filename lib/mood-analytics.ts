import { splitChoiceLevel } from "@/lib/choice-level";
import { dayKey } from "@/lib/analytics";
import { EMOTION_LOOKS, type EmotionQuadrant } from "@/lib/icons/emotions";
import type { Entry, EntryValue, Mod } from "@/types";

/**
 * Ruh hali analizinin hesabı — saf işlevler (bkz. components/analytics/mood-panel).
 *
 * Bir ruh hali kaydı: saat, mutluluk (skalanın bir basamağı), duygular (aynı
 * özellikten birden çok değer) ve not. Hesabın iki kuralı var:
 *
 * 1. GÜN ORTALAMASI günün kayıtlarının basit ortalaması; dönem ortalaması da
 *    gün ortalamalarının ortalaması (Daylio'nun yöntemi). Kayıt ortalaması
 *    alınsaydı günde üç kayıt giren gün, bir kayıt girilen günden üç kat
 *    ağır basardı.
 * 2. KAYITSIZ GÜN tahmin edilmez: ortalamaya girmez, takvimde boş kalır,
 *    çizgi orada kesilir. Kötü günlerde kayıt atlanması daha olası; boş günü
 *    "orta" saymak dönemi olduğundan iyi ya da kötü gösterir.
 */

/** Yerleşik ruh hali özelliklerinin kayıttaki adları (bkz. BUILT_IN_CATEGORIES) */
export const MOOD_SCALE_NAME = "Happiness";
export const MOOD_EMOTIONS_NAME = "Emotions";

export interface MoodRecord {
  id: string;
  at: number;
  /** Takvim günü — "2026-10-14" */
  day: string;
  /** Mutluluk; girilmemişse null */
  level: number | null;
  /** Duygu adları (yoğunluk ayıklanmış, tekrar yok) */
  emotions: string[];
  notes?: string;
}

/** Skalanın basamakları — seçenekleri sayı olan özellikten; yoksa 1–5 */
export interface MoodScale {
  values: number[];
  min: number;
  max: number;
}

const isNumericSelect = (m: Mod) =>
  m.valueType === "select" && !!m.choices?.length && m.choices.every((c) => /^\d+$/.test(c));

/**
 * Kayıtlardaki özelliklerden hangisi mutluluk, hangisi duygular. Önce
 * yerleşik adlar; ad değişmişse biçimden: seçenekleri sayı olan skala,
 * seçeneklerinin çoğu duygu haritasında olan duygular.
 */
export function pickMoodMods(mods: Mod[]): { scale?: Mod; emotion?: Mod } {
  const scale = mods.find((m) => m.name === MOOD_SCALE_NAME && isNumericSelect(m)) ?? mods.find(isNumericSelect);
  const emotion =
    mods.find((m) => m.name === MOOD_EMOTIONS_NAME && m !== scale) ??
    mods.find((m) => {
      if (m === scale || m.valueType !== "select" || !m.choices?.length) return false;
      const known = m.choices.filter((c) => c in EMOTION_LOOKS).length;
      return known >= m.choices.length / 2;
    });
  return { scale, emotion };
}

/** Yerleşik ruh hali özelliği mi (özel sayfa bunları birlikte okuyor) */
export function isMoodModName(name: string): boolean {
  return name === MOOD_SCALE_NAME || name === MOOD_EMOTIONS_NAME;
}

export function scaleOf(mod?: Mod): MoodScale {
  const values = (mod?.choices ?? [])
    .map(Number)
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
  const v = values.length >= 2 ? values : [1, 2, 3, 4, 5];
  return { values: v, min: v[0], max: v[v.length - 1] };
}

/** Değerin skaladaki yeri — yüzü ve rengi seçmek için (bkz. ScaleFace) */
export function levelSlot(value: number, scale: MoodScale): { index: number; total: number } {
  const total = scale.values.length;
  if (scale.max <= scale.min) return { index: 0, total };
  const ratio = (value - scale.min) / (scale.max - scale.min);
  return { index: Math.max(0, Math.min(total - 1, Math.round(ratio * (total - 1)))), total };
}

/** Girdiler ve değerlerinden kayıtlar — eskiden yeniye */
export function buildRecords(
  entries: Entry[],
  values: EntryValue[],
  scaleId: string | undefined,
  emotionId: string | undefined
): MoodRecord[] {
  const byEntry = new Map<string, EntryValue[]>();
  for (const v of values) {
    const list = byEntry.get(v.entryId);
    if (list) list.push(v);
    else byEntry.set(v.entryId, [v]);
  }
  return entries
    .map((e) => {
      const vs = byEntry.get(e.id) ?? [];
      const lv = scaleId ? vs.find((v) => v.modId === scaleId) : undefined;
      const n = lv ? Number(lv.value) : NaN;
      const emotions = emotionId
        ? [...new Set(vs.filter((v) => v.modId === emotionId).map((v) => splitChoiceLevel(v.value).label))]
        : [];
      return {
        id: e.id,
        at: e.occurredAt,
        day: dayKey(e.occurredAt),
        level: Number.isFinite(n) ? n : null,
        emotions,
        notes: e.notes?.trim() || undefined,
      };
    })
    .sort((a, b) => a.at - b.at);
}

export interface DayStat {
  day: string;
  records: MoodRecord[];
  /** Günün mutluluk ortalaması; hiç mutluluk girilmemişse null */
  avg: number | null;
  min: number | null;
  max: number | null;
}

/** Kayıtları güne topla — gün anahtarı sırasıyla */
export function byDay(records: MoodRecord[]): DayStat[] {
  const map = new Map<string, MoodRecord[]>();
  for (const r of records) {
    const list = map.get(r.day);
    if (list) list.push(r);
    else map.set(r.day, [r]);
  }
  return [...map.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([day, rs]) => {
      const lv = rs.map((r) => r.level).filter((x): x is number => x !== null);
      return {
        day,
        records: rs,
        avg: lv.length ? lv.reduce((s, x) => s + x, 0) / lv.length : null,
        min: lv.length ? Math.min(...lv) : null,
        max: lv.length ? Math.max(...lv) : null,
      };
    });
}

/** Gün ortalamalarının ortalaması — mutluluk girilmiş gün yoksa null */
export function averageOfDays(days: DayStat[]): number | null {
  const v = days.map((d) => d.avg).filter((x): x is number => x !== null);
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
}

/** Basamak başına kayıt sayısı (skalanın sırasıyla) */
export function levelDistribution(records: MoodRecord[], scale: MoodScale): number[] {
  const out = scale.values.map(() => 0);
  for (const r of records) {
    if (r.level === null) continue;
    const i = scale.values.indexOf(r.level);
    if (i >= 0) out[i]++;
  }
  return out;
}

/** Duygu başına kaç kayıtta geçtiği — çoktan aza, eşitse ada göre */
export function emotionCounts(records: MoodRecord[]): [string, number][] {
  const map = new Map<string, number>();
  for (const r of records) for (const e of r.emotions) map.set(e, (map.get(e) ?? 0) + 1);
  return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

/** Duygu seçimlerinin haritanın bölgelerine dağılımı; haritada olmayanlar ayrı */
export function quadrantCounts(counts: [string, number][]): Record<EmotionQuadrant, number> & { other: number } {
  const out = { tense: 0, lively: 0, low: 0, serene: 0, other: 0 };
  for (const [name, n] of counts) {
    const q = EMOTION_LOOKS[name]?.quadrant;
    if (q) out[q] += n;
    else out.other += n;
  }
  return out;
}

/**
 * Dönemin en iyi ve en zor günü. En az üç ortalamalı gün yoksa ya da bütün
 * günler eşitse yok — iki günden "en iyi" seçmek bir şey anlatmıyor. Eşit
 * ortalamada daha çok kaydı olan, o da eşitse daha yakın gün.
 */
export function highlights(days: DayStat[]): { best: DayStat; worst: DayStat } | null {
  const rated = days.filter((d) => d.avg !== null);
  if (rated.length < 3) return null;
  const better = (a: DayStat, b: DayStat) =>
    a.avg! !== b.avg! ? a.avg! > b.avg! : a.records.length !== b.records.length ? a.records.length > b.records.length : a.day > b.day;
  const worse = (a: DayStat, b: DayStat) =>
    a.avg! !== b.avg! ? a.avg! < b.avg! : a.records.length !== b.records.length ? a.records.length > b.records.length : a.day > b.day;
  let best = rated[0];
  let worst = rated[0];
  for (const d of rated) {
    if (better(d, best)) best = d;
    if (worse(d, worst)) worst = d;
  }
  if (best.avg === worst.avg) return null;
  return { best, worst };
}

// ── 2. adım: duygu ilişkileri ve ritimler ──
// Her analizin bir eşiği var; eşiğin altında sonuç yerine ne kadar veri
// gerektiği yazılır (yanlış bir "Pazartesileri kötüsün" sonucundan iyidir).

export type QuadCounts = Record<EmotionQuadrant, number>;

/** Kayıtlardaki duygu seçimlerinin bölgelere dağılımı (haritada olmayanlar sayılmaz) */
export function quadrantsOf(records: MoodRecord[]): QuadCounts {
  const q: QuadCounts = { tense: 0, lively: 0, low: 0, serene: 0 };
  for (const r of records) {
    for (const e of r.emotions) {
      const k = EMOTION_LOOKS[e]?.quadrant;
      if (k) q[k]++;
    }
  }
  return q;
}

/** Hoş bölgeler (canlı, dingin) */
export const isPleasant = (q: EmotionQuadrant) => q === "lively" || q === "serene";

/**
 * Duygunun geçtiği kayıtların ortalama mutluluğu — en az `minN` kaydı olan
 * duygular, iyiden zora. Mutluluğu girilmemiş kayıt sayılmaz.
 */
export function emotionLevels(records: MoodRecord[], minN = 4): { name: string; avg: number; n: number }[] {
  const by = new Map<string, number[]>();
  for (const r of records) {
    if (r.level === null) continue;
    for (const e of r.emotions) {
      const list = by.get(e);
      if (list) list.push(r.level);
      else by.set(e, [r.level]);
    }
  }
  return [...by.entries()]
    .filter(([, a]) => a.length >= minN)
    .map(([name, a]) => ({ name, avg: a.reduce((s, x) => s + x, 0) / a.length, n: a.length }))
    .sort((a, b) => b.avg - a.avg || b.n - a.n || a.name.localeCompare(b.name));
}

/**
 * Aynı kayıtta birlikte seçilen duygu çiftleri (en az `minN` kez) ve birden
 * çok duygulu kayıtlardan kaçında hoş ile hoş olmayan bir arada.
 */
export function emotionPairs(
  records: MoodRecord[],
  minN = 3
): { pairs: { a: string; b: string; n: number }[]; multi: number; mixed: number } {
  const pc = new Map<string, number>();
  let multi = 0;
  let mixed = 0;
  for (const r of records) {
    if (r.emotions.length < 2) continue;
    multi++;
    const qs = r.emotions.map((e) => EMOTION_LOOKS[e]?.quadrant).filter((q): q is EmotionQuadrant => !!q);
    if (qs.some(isPleasant) && qs.some((q) => !isPleasant(q))) mixed++;
    const s = [...r.emotions].sort();
    for (let i = 0; i < s.length; i++) {
      for (let j = i + 1; j < s.length; j++) {
        const k = `${s[i]}\u0000${s[j]}`;
        pc.set(k, (pc.get(k) ?? 0) + 1);
      }
    }
  }
  const pairs = [...pc.entries()]
    .filter(([, n]) => n >= minN)
    .map(([k, n]) => {
      const [a, b] = k.split("\u0000");
      return { a, b, n };
    })
    .sort((x, y) => y.n - x.n || `${x.a}${x.b}`.localeCompare(`${y.a}${y.b}`));
  return { pairs, multi, mixed };
}

/** Haftanın günleri, pazartesiden: gün ortalamalarının ortalaması ve kaç gün */
export function weekdayStats(days: DayStat[]): { avg: number | null; n: number }[] {
  const g: number[][] = [[], [], [], [], [], [], []];
  for (const d of days) {
    if (d.avg === null) continue;
    const wd = (new Date(d.day + "T12:00:00").getDay() + 6) % 7;
    g[wd].push(d.avg);
  }
  return g.map((a) => ({ avg: a.length ? a.reduce((s, x) => s + x, 0) / a.length : null, n: a.length }));
}

/** Günün dilimleri — sabah 05–11, öğle 11–17, akşam 17–22, gece 22–05 */
export const DAY_PARTS = ["morning", "noon", "evening", "night"] as const;
export type DayPart = (typeof DAY_PARTS)[number];
export const DAY_PART_HOURS: Record<DayPart, string> = {
  morning: "05–11",
  noon: "11–17",
  evening: "17–22",
  night: "22–05",
};

export function partOf(ms: number): DayPart {
  const h = new Date(ms).getHours();
  return h >= 5 && h < 11 ? "morning" : h >= 11 && h < 17 ? "noon" : h >= 17 && h < 22 ? "evening" : "night";
}

/** Dilim başına kayıtlar: kayıt sayısı, mutluluk ortalaması (kayıtların) ve bölgeler */
export function partStats(records: MoodRecord[]): Record<DayPart, { n: number; avg: number | null; quad: QuadCounts }> {
  const out = {} as Record<DayPart, { n: number; avg: number | null; quad: QuadCounts }>;
  for (const p of DAY_PARTS) {
    const rs = records.filter((r) => partOf(r.at) === p);
    const lv = rs.map((r) => r.level).filter((x): x is number => x !== null);
    out[p] = {
      n: lv.length,
      avg: lv.length ? lv.reduce((s, x) => s + x, 0) / lv.length : null,
      quad: quadrantsOf(rs),
    };
  }
  return out;
}

/**
 * Dalgalanma: takvimde art arda iki günün ikisi de kayıtlıysa aradaki fark
 * (gün ortalamaları). Araştırmadaki "ardışık farkların karesi" ölçüsünün sade
 * hali; arada boş gün varsa çift sayılmaz.
 */
export function dayChanges(days: DayStat[]): { day: string; from: number; to: number; v: number }[] {
  const byKey = new Map(days.map((d) => [d.day, d]));
  const out: { day: string; from: number; to: number; v: number }[] = [];
  for (const d of days) {
    if (d.avg === null) continue;
    const t = new Date(d.day + "T12:00:00");
    const p = byKey.get(dayKey(new Date(t.getFullYear(), t.getMonth(), t.getDate() - 1, 12).getTime()));
    if (!p || p.avg === null) continue;
    out.push({ day: d.day, from: p.avg, to: d.avg, v: Math.abs(d.avg - p.avg) });
  }
  return out;
}

// ── 3. adım: uyku ve öteki kayıtlarla bağlantı ──
// Dil "birlikte görülüyor", "yol açıyor" değil: kişi neyi hangi gün
// kaydedeceğini kendisi seçiyor, fark neden göstermez.

export interface Night {
  /** Uyanılan gün — gece o sabaha bağlanır */
  day: string;
  hours: number;
  start: number;
  end: number;
  /** Uyku kalitesi (skala); girilmemişse null */
  quality: number | null;
}

/**
 * Uyku kayıtlarından geceler, uyanılan güne göre. Süre aralık değerinden
 * ({start, end}); bir güne birden çok uyku düşerse en uzunu gece sayılır
 * (öğle uykusu geceyi ezmesin).
 */
export function sleepNights(entries: Entry[], values: EntryValue[], qualityModId?: string): Map<string, Night> {
  const byEntry = new Map<string, EntryValue[]>();
  for (const v of values) {
    const list = byEntry.get(v.entryId);
    if (list) list.push(v);
    else byEntry.set(v.entryId, [v]);
  }
  const out = new Map<string, Night>();
  for (const e of entries) {
    const vs = byEntry.get(e.id) ?? [];
    let range: { start: number; end: number } | null = null;
    for (const v of vs) {
      if (!v.value || v.value[0] !== "{") continue;
      try {
        const { start, end } = JSON.parse(v.value) as { start?: string; end?: string };
        const s = start ? new Date(start).getTime() : NaN;
        const en = end ? new Date(end).getTime() : NaN;
        if (Number.isFinite(s) && Number.isFinite(en) && en > s) range = { start: s, end: en };
      } catch {
        // aralık değil
      }
    }
    if (!range) continue;
    const hours = (range.end - range.start) / 3600000;
    if (hours > 24) continue;
    const qv = qualityModId ? vs.find((v) => v.modId === qualityModId) : undefined;
    const q = qv ? Number(qv.value) : NaN;
    const night: Night = { day: dayKey(range.end), hours, start: range.start, end: range.end, quality: Number.isFinite(q) ? q : null };
    const had = out.get(night.day);
    if (!had || had.hours < hours) out.set(night.day, night);
  }
  return out;
}

export const SLEEP_BUCKETS = ["lt6", "6to7", "7to8", "8plus"] as const;
export type SleepBucket = (typeof SLEEP_BUCKETS)[number];
export const sleepBucketOf = (h: number): SleepBucket => (h < 6 ? "lt6" : h < 7 ? "6to7" : h < 8 ? "7to8" : "8plus");

const meanOf = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);

/**
 * Gecenin ertesindeki günün ortalaması — süre kovalarına ve kaliteye göre;
 * ayrıca 7 saatin altı ve üstü. Yalnız ruh hali girilmiş günler.
 */
export function sleepVsMood(days: DayStat[], nights: Map<string, Night>) {
  const dur = new Map<SleepBucket, number[]>(SLEEP_BUCKETS.map((b) => [b, []]));
  const qual = new Map<number, number[]>();
  const short: number[] = [];
  const long: number[] = [];
  let paired = 0;
  for (const d of days) {
    if (d.avg === null) continue;
    const n = nights.get(d.day);
    if (!n) continue;
    paired++;
    dur.get(sleepBucketOf(n.hours))!.push(d.avg);
    (n.hours < 7 ? short : long).push(d.avg);
    if (n.quality !== null) {
      const list = qual.get(n.quality);
      if (list) list.push(d.avg);
      else qual.set(n.quality, [d.avg]);
    }
  }
  return {
    paired,
    duration: SLEEP_BUCKETS.map((b) => ({ bucket: b, avg: meanOf(dur.get(b)!), n: dur.get(b)!.length })),
    quality: [...qual.entries()].sort((a, b) => a[0] - b[0]).map(([q, a]) => ({ q, avg: meanOf(a)!, n: a.length })),
    short: { avg: meanOf(short), n: short.length },
    long: { avg: meanOf(long), n: long.length },
  };
}

/**
 * Kayıtlarla bağlantı: bir kaydın olduğu ve olmadığı günlerin ortalaması ve
 * aradaki fark. Fark ancak en az `min` gün var ve `min` gün yokken
 * hesaplanır (Bearable'ın eşiği); yoksa null.
 */
export function linkStats(
  days: DayStat[],
  items: { id: string; days: Set<string> }[],
  min = 3
): { id: string; withN: number; withoutN: number; withAvg: number | null; diff: number | null }[] {
  const rated = days.filter((d) => d.avg !== null);
  return items.map(({ id, days: has }) => {
    const w: number[] = [];
    const wo: number[] = [];
    for (const d of rated) (has.has(d.day) ? w : wo).push(d.avg!);
    const ok = w.length >= min && wo.length >= min;
    return { id, withN: w.length, withoutN: wo.length, withAvg: meanOf(w), diff: ok ? meanOf(w)! - meanOf(wo)! : null };
  });
}
