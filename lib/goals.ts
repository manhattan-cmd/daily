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

/**
 * Planın gün içindeki saatleri, sıralı ve tekrarsız. Eski kayıtlarda tek
 * remindAt vardı; okuma buradan geçer ki iki biçim de aynı davransın.
 */
export function goalTimes(g: Pick<Goal, "times" | "remindAt">): string[] {
  const list = g.times?.length ? g.times : g.remindAt ? [g.remindAt] : [];
  return [...new Set(list)].sort();
}

/** Günün anları: her saat bir an; saatsiz planda tek an ("") */
export function goalSlots(g: Pick<Goal, "times" | "remindAt">): string[] {
  const times = goalTimes(g);
  return times.length ? times : [""];
}

/**
 * Bir günün girdilerini anlara dağıt. Önce anını taşıyan girdi kendi anına;
 * kalanlar (anı yok — eski kayıt, Ekle'den kendiliğinden bağlanan — ya da
 * saati sonradan değişmiş) boş anlara, erken girdi erken ana. Anı dolu
 * olmayan girdi artakalır, hiçbir anı karşılamaz.
 */
export function assignSlots<E extends { occurredAt: number; goalSlot?: string }>(
  slots: string[],
  entries: E[]
): Map<string, E> {
  const out = new Map<string, E>();
  const rest: E[] = [];
  for (const e of [...entries].sort((a, b) => a.occurredAt - b.occurredAt)) {
    const own = e.goalSlot ?? "";
    if (slots.includes(own) && !out.has(own)) out.set(own, e);
    else rest.push(e);
  }
  for (const slot of slots) {
    if (out.has(slot)) continue;
    const e = rest.shift();
    if (!e) break;
    out.set(slot, e);
  }
  return out;
}

/** Yapıldı bilgisinin anahtarı: plan × gün × an */
export const doneKey = (goalId: string, date: string, slot = "") => `${goalId}|${date}|${slot}`;

/**
 * Bildirim kimliği: plan × gün × an için sabit, pozitif 31 bit tam sayı.
 * Android bildirim kimliği int; aynı an yeniden planlanınca aynı kimlik
 * eskisinin yerine geçer.
 */
export function reminderId(goalId: string, date: string, slot = ""): number {
  const s = `${goalId}|${date}${slot ? `|${slot}` : ""}`;
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
  /** Günün hangi anı ("HH:mm") */
  slot: string;
  at: number;
}

/**
 * Kurulacak hatırlatmalar: bugünden itibaren `horizonDays` gün, saati
 * geçmemiş ve henüz yapılmamış her an (plan × gün × saat). Tekrar eden hedefte
 * işletim sisteminin "her gün" alarmı kullanılmıyor — yapılmış günün
 * bildirimi gelmesin diye günler tek tek kuruluyor; uygulama her açılışta
 * pencereyi ileri taşıyor.
 *
 * `limit`: Android uygulama başına 500 alarmla sınırlı; en yakınlar kalır.
 */
export function planReminders(
  goals: Pick<Goal, "id" | "date" | "repeat" | "until" | "times" | "remindAt">[],
  done: Set<string>,
  now: number,
  horizonDays = 21,
  limit = 300
): PlannedReminder[] {
  const today = toLocalDateValue(now);
  const last = addDays(today, horizonDays - 1);
  const out: PlannedReminder[] = [];
  for (const g of goals) {
    const times = goalTimes(g);
    if (!times.length) continue;
    for (const date of occurrencesBetween(g, today, last)) {
      for (const slot of times) {
        if (done.has(doneKey(g.id, date, slot))) continue;
        const at = atTime(date, slot);
        // Geçmiş saat kurulmaz: eklenti onu hemen çalıyor
        if (at <= now + 30_000) continue;
        out.push({ id: reminderId(g.id, date, slot), goalId: g.id, date, slot, at });
      }
    }
  }
  out.sort((a, b) => a.at - b.at);
  return out.slice(0, limit);
}
