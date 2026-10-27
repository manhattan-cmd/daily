import { db } from "./index";
import { STARTER_CATEGORIES } from "./starter";
import { computeStreaks } from "@/lib/analytics";
import { toLocalDateValue } from "@/lib/utils";
import type { Category, SubCategory } from "@/types";

/** Ana sayfanın "Sık eklediklerin" satırı — son kaç günün girdilerine bakılır */
const FREQUENT_WINDOW_DAYS = 30;
const FREQUENT_LIMIT = 6;

export type FrequentItem = {
  sub: SubCategory;
  category: Category;
  /** Kategorinin kendisine yapılan girdi (gizli kök alt kategori) — ad kategorininki */
  isRoot: boolean;
  count: number;
};

export type HomeSnapshot = {
  /**
   * Bugün — gün sayfasının özetiyle aynı sayım: uyku, ruh hali ve nesne
   * durumları sayılmaz (onlar eylem değil). Eskiden ana sayfa bütün kayıtları
   * sayıyordu, iki sayfa aynı gün için farklı sayı gösterebiliyordu.
   */
  today: {
    entries: number;
    categories: number;
    /** Kategori renkleri ve payları — özet bloğunun alt şeridi */
    bars: { key: string; color: string; weight: number; title: string }[];
    lastAt?: number;
  };
  totalEntries: number;
  streak: { current: number; best: number };
  frequent: FrequentItem[];
  /**
   * Kategoriler yapıdaki sırasıyla, son 30 günün girdi sayısıyla — ana
   * sayfada girdilerle dolan kareler (yerleşikler hariç)
   */
  categories: { category: Category; count: number }[];
  /** Örnek yapının dışında (ya da adı değiştirilmiş) bir kategori var mı */
  ownCategory: boolean;
  goalsEver: number;
  counts: { categories: number; subcategories: number; features: number };
};

// Örnek kategorilerin iki dildeki adları — adı aynı duran kategori "örnek" sayılır
const STARTER_NAMES = new Set(
  STARTER_CATEGORIES.flatMap((c) =>
    typeof c.name === "string" ? [c.name] : [c.name.en, c.name.tr]
  ).map((n) => n.trim().toLocaleLowerCase("en-US"))
);

/**
 * Ana sayfanın bir kerede okuduğu her şey: seri, sık eklenen kalemler,
 * başlarken adımlarının durumu ve yapının sayıları.
 */
export async function loadHomeSnapshot(now = new Date()): Promise<HomeSnapshot> {
  const since = new Date(now);
  since.setDate(since.getDate() - (FREQUENT_WINDOW_DAYS - 1));
  since.setHours(0, 0, 0, 0);

  const [occurred, recent, categories, subcategories, features, goalsEver] = await Promise.all([
    // Yalnız dizin anahtarları — kayıtları okumadan bütün geçmişin günleri
    db.entries.orderBy("occurredAt").keys(),
    db.entries.where("occurredAt").aboveOrEqual(since.getTime()).toArray(),
    db.categories.toArray(),
    db.subcategories.toArray(),
    db.mods.count(),
    db.goals.count(),
  ]);

  const days = new Set((occurred as number[]).map((ms) => toLocalDateValue(ms)));
  const streak = computeStreaks(days, now);

  const catById = new Map(categories.map((c) => [c.id, c]));
  const subById = new Map(subcategories.map((s) => [s.id, s]));
  const bySub = new Map<string, number>();
  for (const e of recent) bySub.set(e.subcategoryId, (bySub.get(e.subcategoryId) ?? 0) + 1);
  const frequent: FrequentItem[] = [];
  for (const [subId, count] of [...bySub.entries()].sort((a, b) => b[1] - a[1])) {
    const sub = subById.get(subId);
    const category = sub && catById.get(sub.categoryId);
    // Uyku, ruh hali, nesne kendi akışlarıyla Ekle menüsünde
    if (!sub || !category || category.isBuiltIn) continue;
    frequent.push({ sub, category, isRoot: !!sub.isCategoryRoot, count });
    if (frequent.length === FREQUENT_LIMIT) break;
  }

  const todayKey = toLocalDateValue(now.getTime());
  const todayByCat = new Map<string, number>();
  let todayEntries = 0;
  let lastAt: number | undefined;
  for (const e of recent) {
    if (toLocalDateValue(e.occurredAt) !== todayKey) continue;
    const sub = subById.get(e.subcategoryId);
    const category = sub && catById.get(sub.categoryId);
    if (!category || category.isBuiltIn) continue;
    todayEntries++;
    todayByCat.set(category.id, (todayByCat.get(category.id) ?? 0) + 1);
    if (lastAt === undefined || e.occurredAt > lastAt) lastAt = e.occurredAt;
  }
  const bars = [...todayByCat.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id, n]) => {
      const c = catById.get(id)!;
      return { key: id, color: c.color, weight: n, title: `${c.name} · ${n}` };
    });

  const userCats = categories.filter((c) => !c.isBuiltIn);
  const byCat = new Map<string, number>();
  for (const e of recent) {
    const catId = subById.get(e.subcategoryId)?.categoryId;
    if (catId) byCat.set(catId, (byCat.get(catId) ?? 0) + 1);
  }
  const catList = [...userCats]
    .sort((a, b) => a.order - b.order)
    .map((category) => ({ category, count: byCat.get(category.id) ?? 0 }));
  const ownCategory = userCats.some(
    (c) => !STARTER_NAMES.has(c.name.trim().toLocaleLowerCase("en-US"))
  );

  return {
    today: { entries: todayEntries, categories: todayByCat.size, bars, lastAt },
    totalEntries: (occurred as number[]).length,
    streak,
    frequent,
    categories: catList,
    ownCategory,
    goalsEver,
    counts: {
      categories: userCats.length,
      subcategories: subcategories.filter((s) => !s.isCategoryRoot && !!catById.get(s.categoryId) && !catById.get(s.categoryId)!.isBuiltIn).length,
      features,
    },
  };
}
