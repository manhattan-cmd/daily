import type { Goal, GoalRepeat } from "@/types";
import { toLocalDateValue } from "@/lib/utils";

/**
 * Hedefin takvimi: hangi günlerde var, hangi gün yapılmış, hatırlatmaları
 * ne zaman. Veritabanına dokunmuyor; sorgular ve bildirim katmanı bunu
 * kullanıyor (bkz. lib/db/queries goal bölümü, lib/goal-reminders).
 *
 * Gün anahtarları yerel "YYYY-MM-DD". Haftanın günleri getDay() sırasında
 * (0 = pazar); ekranda pazartesiden başlanır (WEEK_ORDER).
 */

/** Ekrandaki sıra: pazartesi → pazar */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
export const WEEKDAYS = [1, 2, 3, 4, 5] as const;
export const WEEKEND = [6, 0] as const;

function parts(key: string): [number, number, number] {
  const [y, m, d] = key.split("-").map(Number);
  return [y, m, d];
}

export function dayStart(key: string): number {
  const [y, m, d] = parts(key);
  return new Date(y, m - 1, d).getTime();
}

export function weekdayOf(key: string): number {
  const [y, m, d] = parts(key);
  return new Date(y, m - 1, d).getDay();
}

/** Takvim günü kaydırma — yaz saatinde de doğru (saat değil gün eklenir) */
export function addDays(key: string, n: number): string {
  const [y, m, d] = parts(key);
  return toLocalDateValue(new Date(y, m - 1, d + n).getTime());
}

export function isRecurring(goal: Pick<Goal, "repeat">): boolean {
  return !!goal.repeat;
}

/** Tekrarın günleri; her gün = yedisi */
export function repeatDays(repeat: GoalRepeat | undefined): number[] {
  if (!repeat) return [];
  if (repeat.kind === "daily") return [0, 1, 2, 3, 4, 5, 6];
  return [...new Set(repeat.days)].filter((d) => d >= 0 && d <= 6).sort();
}

/** Seçilen günlerden tekrar: hiçbiri → tekrar yok, yedisi → her gün */
export function repeatFromDays(days: Iterable<number>): GoalRepeat | undefined {
  const set = [...new Set(days)].filter((d) => d >= 0 && d <= 6).sort();
  if (set.length === 0) return undefined;
  if (set.length === 7) return { kind: "daily" };
  return { kind: "weekly", days: set };
}

export type RepeatShape = "daily" | "weekdays" | "weekend" | "custom";

/** Hazır kalıplardan biri mi (etiket için) */
export function repeatShape(repeat: GoalRepeat): RepeatShape {
  const days = repeatDays(repeat);
  const same = (a: readonly number[]) =>
    a.length === days.length && a.every((d) => days.includes(d));
  if (days.length === 7) return "daily";
  if (same(WEEKDAYS)) return "weekdays";
  if (same(WEEKEND)) return "weekend";
  return "custom";
}

/** Hedef bu günde var mı */
export function occursOn(
  goal: Pick<Goal, "date" | "repeat" | "until">,
  key: string
): boolean {
  if (!goal.repeat) return key === goal.date;
  if (key < goal.date) return false;
  if (goal.until && key > goal.until) return false;
  return repeatDays(goal.repeat).includes(weekdayOf(key));
}

/** [from, to] aralığında hedefin günleri (ikisi de dahil) */
export function occurrencesBetween(
  goal: Pick<Goal, "date" | "repeat" | "until">,
  from: string,
  to: string
): string[] {
  const out: string[] = [];
  if (!goal.repeat) {
    if (goal.date >= from && goal.date <= to) out.push(goal.date);
    return out;
  }
  let key = from < goal.date ? goal.date : from;
  // 400 gün sınırı: yanlış bir aralık sonsuz döngüye girmesin
  for (let i = 0; i < 400 && key <= to; i++) {
    if (occursOn(goal, key)) out.push(key);
    key = addDays(key, 1);
  }
  return out;
}

/** İki gün arasındaki takvim günü farkı (b − a) */
export function daysBetween(a: string, b: string): number {
  return Math.round((dayStart(b) - dayStart(a)) / 86400000);
}

/**
 * Saat aralığı değerini ({"start":"…T23:00","end":"…T07:00"}) gün gün
 * kaydırır. Tekrar eden uyku hedefi ilk günüyle kuruluyor; başka bir günü
 * yapılınca aralık o güne taşınır, gece yarısını aşması korunur.
 */
export function shiftRange(raw: string, days: number): string {
  if (!days) return raw;
  let v: { start?: string; end?: string };
  try {
    v = JSON.parse(raw);
  } catch {
    return raw;
  }
  const move = (s?: string) => {
    if (!s) return s;
    const [d, time] = s.split("T");
    return d ? `${addDays(d, days)}${time ? `T${time}` : ""}` : s;
  };
  return JSON.stringify({ ...v, start: move(v.start), end: move(v.end) });
}

/** Günün bulunduğu haftanın yedi günü, pazartesiden */
export function weekOf(key: string): string[] {
  const back = (weekdayOf(key) + 6) % 7;
  const monday = addDays(key, -back);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** Yapıldı bilgisinin anahtarı: hedef × gün */
export const doneKey = (goalId: string, date: string) => `${goalId}|${date}`;

/**
 * Bildirim kimliği: hedef × gün için sabit, pozitif 31 bit tam sayı.
 * Android bildirim kimliği int; aynı gün yeniden planlanınca aynı kimlik
 * eskisinin yerine geçer.
 */
export function reminderId(goalId: string, date: string): number {
  const s = `${goalId}|${date}`;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 1) || 1;
}

/** "HH:mm" → o günün yerel zamanı */
export function atTime(key: string, hhmm: string): number {
  const [y, m, d] = parts(key);
  const [hh = 0, mm = 0] = hhmm.split(":").map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0).getTime();
}

export interface PlannedReminder {
  id: number;
  goalId: string;
  date: string;
  at: number;
}

/**
 * Kurulacak hatırlatmalar: bugünden itibaren `horizonDays` gün, saati
 * geçmemiş ve henüz yapılmamış her hedef günü. Tekrar eden hedefte
 * işletim sisteminin "her gün" alarmı kullanılmıyor — yapılmış günün
 * bildirimi gelmesin diye günler tek tek kuruluyor; uygulama her açılışta
 * pencereyi ileri taşıyor.
 *
 * `limit`: Android uygulama başına 500 alarmla sınırlı; en yakınlar kalır.
 */
export function planReminders(
  goals: Pick<Goal, "id" | "date" | "repeat" | "until" | "remindAt">[],
  done: Set<string>,
  now: number,
  horizonDays = 21,
  limit = 300
): PlannedReminder[] {
  const today = toLocalDateValue(now);
  const last = addDays(today, horizonDays - 1);
  const out: PlannedReminder[] = [];
  for (const g of goals) {
    if (!g.remindAt) continue;
    for (const date of occurrencesBetween(g, today, last)) {
      if (done.has(doneKey(g.id, date))) continue;
      const at = atTime(date, g.remindAt);
      // Geçmiş saat kurulmaz: eklenti onu hemen çalıyor
      if (at <= now + 30_000) continue;
      out.push({ id: reminderId(g.id, date), goalId: g.id, date, at });
    }
  }
  out.sort((a, b) => a.at - b.at);
  return out.slice(0, limit);
}
