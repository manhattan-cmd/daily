import { db } from "./index";
import { noteIsEmpty } from "./queries";
import { toLocalDateValue } from "@/lib/utils";
import type { Category, SubCategory } from "@/types";

/** Ekle › Hızlı — son kaç günün alışkanlığına bakılır */
const WINDOW_DAYS = 30;
const CELL_LIMIT = 10;
const CATEGORY_LIMIT = 4;

/** Kendi sekmesiyle eklenen türler (bkz. AddScreen) */
export type QuickKind = "sleep" | "mood" | "note" | "thing" | "goal" | "activity";

export type QuickCell =
  | {
      kind: "item";
      sub: SubCategory;
      category: Category;
      /** Kategorinin kendisine girdi (gizli kök alt kategori) — ad kategorininki */
      isRoot: boolean;
      days: number;
      count: number;
      /** Sayfanın gününde eklenmiş mi */
      done: boolean;
    }
  | { kind: "type"; type: QuickKind; days: number; count: number; done: boolean };

export type QuickData = {
  /** Türler ve kalemler birlikte, kullanılan gün sayısına göre */
  cells: QuickCell[];
  /** En çok girdi alan kategoriler (yerleşikler hariç) */
  categories: { category: Category; count: number }[];
};

const BUILT_IN_KIND = { sleep: "sleep", mood: "mood", objects: "thing" } as const;

/**
 * Ekle › Hızlı'nın verisi: son 30 günde en çok GÜN kullanılan şeyler — uyku,
 * ruh hali, not gibi türler ve kalemler aynı sırada (her gün eklenen önde;
 * bir günde on kez eklenen su, haftada bir eklenen şeyin önüne yalnız gün
 * sayısıyla geçer, eşitlikte toplam). `date` sayfanın günü: o gün eklenmiş
 * olanlar işaretlenir ama sıraya katılmaz — ekledikçe hücreler yer
 * değiştirmesin (ezber bozulmasın). Pencere bugünden önceki 30 gün ve bugün;
 * sayfanın günü dışarıda, en çok 30 gün sayılır.
 */
export async function loadQuickAdd(date: string, now = new Date()): Promise<QuickData> {
  const since = new Date(now);
  since.setDate(since.getDate() - WINDOW_DAYS);
  since.setHours(0, 0, 0, 0);
  const sinceKey = toLocalDateValue(since.getTime());
  const [y, m, d] = date.split("-").map(Number);
  const dayStart = new Date(y, m - 1, d).getTime();
  const dayEnd = new Date(y, m - 1, d + 1).getTime();

  const [recent, onDay, categories, subcategories, notes, goals, activities] = await Promise.all([
    db.entries.where("occurredAt").aboveOrEqual(since.getTime()).toArray(),
    db.entries.where("occurredAt").between(dayStart, dayEnd, true, false).toArray(),
    db.categories.toArray(),
    db.subcategories.toArray(),
    db.notes.where("date").aboveOrEqual(sinceKey).toArray(),
    db.goals.where("date").aboveOrEqual(sinceKey).toArray(),
    db.activities.where("occurredAt").aboveOrEqual(since.getTime()).toArray(),
  ]);
  // Sayfanın günü pencerenin dışındaysa (eski bir gün) notu, hedefi, aktivitesi ayrıca
  const inWindow = date >= sinceKey;
  const [dayNotes, dayGoals, dayActivities] = inWindow
    ? [notes.filter((n) => n.date === date), goals.filter((g) => g.date === date), activities.filter((a) => a.occurredAt >= dayStart && a.occurredAt < dayEnd)]
    : await Promise.all([
        db.notes.where("date").equals(date).toArray(),
        db.goals.where("date").equals(date).toArray(),
        db.activities.where("occurredAt").between(dayStart, dayEnd, true, false).toArray(),
      ]);

  const catById = new Map(categories.map((c) => [c.id, c]));
  const subById = new Map(subcategories.map((s) => [s.id, s]));
  // Yerleşik kategorinin türü; anahtarı doldurulmamış tek yerleşik = eski kurulumdaki Uyku
  const kindOf = (c: Category): QuickKind | null =>
    c.isBuiltIn ? BUILT_IN_KIND[c.builtInKey ?? "sleep"] : null;

  const tally = new Map<string, { days: Set<string>; count: number }>();
  const bump = (key: string, day: string) => {
    const t = tally.get(key) ?? { days: new Set<string>(), count: 0 };
    t.days.add(day);
    t.count++;
    tally.set(key, t);
  };
  const byCat = new Map<string, number>();
  for (const e of recent) {
    const sub = subById.get(e.subcategoryId);
    const category = sub && catById.get(sub.categoryId);
    if (!sub || !category) continue;
    const day = toLocalDateValue(e.occurredAt);
    if (day === date) continue;
    const kind = kindOf(category);
    if (kind) bump(`type:${kind}`, day);
    else {
      bump(`sub:${sub.id}`, day);
      byCat.set(category.id, (byCat.get(category.id) ?? 0) + 1);
    }
  }
  for (const n of notes) if (n.date !== date && !noteIsEmpty(n)) bump("type:note", n.date);
  for (const g of goals) if (g.date !== date) bump("type:goal", g.date);
  for (const a of activities) {
    const day = toLocalDateValue(a.occurredAt);
    if (day !== date) bump("type:activity", day);
  }

  const doneKeys = new Set<string>();
  for (const e of onDay) {
    const sub = subById.get(e.subcategoryId);
    const category = sub && catById.get(sub.categoryId);
    if (!sub || !category) continue;
    const kind = kindOf(category);
    doneKeys.add(kind ? `type:${kind}` : `sub:${sub.id}`);
  }
  if (dayNotes.some((n) => !noteIsEmpty(n))) doneKeys.add("type:note");
  if (dayGoals.length) doneKeys.add("type:goal");
  if (dayActivities.length) doneKeys.add("type:activity");

  const cells: QuickCell[] = [];
  for (const [key, { days, count }] of tally) {
    const done = doneKeys.has(key);
    if (key.startsWith("type:")) {
      cells.push({ kind: "type", type: key.slice(5) as QuickKind, days: days.size, count, done });
      continue;
    }
    const sub = subById.get(key.slice(4))!;
    const category = catById.get(sub.categoryId)!;
    cells.push({ kind: "item", sub, category, isRoot: !!sub.isCategoryRoot, days: days.size, count, done });
  }
  cells.sort((a, b) => b.days - a.days || b.count - a.count);

  const top = [...byCat.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, CATEGORY_LIMIT)
    .map(([id, count]) => ({ category: catById.get(id)!, count }));

  return { cells: cells.slice(0, CELL_LIMIT), categories: top };
}
