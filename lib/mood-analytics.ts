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
