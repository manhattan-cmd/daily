import { db } from "@/lib/db";
import { goalTitle, listAllGoals, listMods, noteIsEmpty, type ModWithType } from "@/lib/db/queries";
import { matchesSearch, normalizeSearch } from "@/lib/search";
import { toLocalDateValue } from "@/lib/utils";
import type { Category, Collection, GoalWithContext, Note, SubCategory, Thing } from "@/types";

export interface SearchAllFilters {
  query: string;
  /** Yalnız bu kategoriye ait olanlar */
  categoryId?: string;
  /** [from, to) — dönem seçiliyse */
  from?: number;
  to?: number;
}

export interface SearchAllResult {
  categories: Category[];
  subs: { sub: SubCategory; category: Category }[];
  features: ModWithType[];
  collections: Collection[];
  things: { thing: Thing; collection: Collection | undefined }[];
  planned: { goal: GoalWithContext; doneDays: Set<string> }[];
  notes: Note[];
}

/** Notun aranan metni — başlık, paragraflar, takma adlar */
const noteText = (n: Note) => [n.title ?? "", ...n.blocks.map((b) => b.text), ...(n.aliases ?? [])].join(" ");

/**
 * Genel arama (ana sayfadaki Ara) — girdilerden başka her şey: notlar,
 * planlı girdiler, nesneler ve listeleri, kategoriler ve kalemleri,
 * özellikler. Girdiler ayrı (bkz. searchEntries): sayfa sayfa taranıyorlar,
 * bunlar küçük tablolar, bir kerede okunur.
 *
 * Süzgeçler anlamlı olduğu yerde işler:
 *  - Dönem: tarihi olanlarda (notun günü; planın günü ya da tekrarının
 *    sürdüğü aralık). Tarihi olmayanlar (yapı, nesneler, özellikler) dönem
 *    seçiliyken çıkmaz — "bu ay" diye bakan bir zamana bakıyor.
 *  - Kategori: kalemler ve planlar o kategoriden; kategorisi olmayanlar
 *    (notlar, nesneler, özellikler) çıkmaz.
 * Sorgu boşsa (yalnız kategori seçili) yalnız o kategorinin planları —
 * girdileri gibi; "bütün kalemler" bir arama sonucu değil.
 */
export async function searchEverything(filters: SearchAllFilters): Promise<SearchAllResult> {
  const q = normalizeSearch(filters.query.trim());
  const timed = filters.from !== undefined || filters.to !== undefined;
  const scoped = !!filters.categoryId;
  // Dönemin günleri (dahil) — notlar ve planlar gün anahtarıyla
  const firstDay = filters.from !== undefined ? toLocalDateValue(filters.from) : undefined;
  const lastDay = filters.to !== undefined ? toLocalDateValue(filters.to - 1) : undefined;
  const inPeriod = (day: string) => (!firstDay || day >= firstDay) && (!lastDay || day <= lastDay);

  const empty: SearchAllResult = { categories: [], subs: [], features: [], collections: [], things: [], planned: [], notes: [] };
  if (!q && !scoped) return empty;

  // Yapı, nesneler, özellikler — yalnız sorguyla, dönem ve kategori yokken
  const structural = !!q && !timed;
  const [cats, subs, mods, cols, things, goals, notes] = await Promise.all([
    structural || scoped ? db.categories.toArray() : Promise.resolve([] as Category[]),
    structural ? db.subcategories.toArray() : Promise.resolve([] as SubCategory[]),
    structural && !scoped ? listMods() : Promise.resolve([] as ModWithType[]),
    structural && !scoped ? db.collections.toArray() : Promise.resolve([] as Collection[]),
    structural && !scoped ? db.things.toArray() : Promise.resolve([] as Thing[]),
    listAllGoals(),
    q && !scoped ? db.notes.toArray() : Promise.resolve([] as Note[]),
  ]);
  const catById = new Map(cats.map((c) => [c.id, c]));
  const colById = new Map(cols.map((c) => [c.id, c]));
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "tr");

  const out: SearchAllResult = { ...empty };
  if (structural) {
    // Yerleşik akışlar (Uyku, Ruh hali, Nesneler) yapıda gezilmiyor
    out.categories = scoped ? [] : cats.filter((c) => !c.isBuiltIn && matchesSearch(c.name, q)).sort(byName);
    out.subs = subs
      .filter((s) => !s.isCategoryRoot && (!scoped || s.categoryId === filters.categoryId) && matchesSearch(s.name, q))
      .map((s) => ({ sub: s, category: catById.get(s.categoryId)! }))
      .filter((r) => r.category && !r.category.isBuiltIn)
      .sort((a, b) => byName(a.sub, b.sub));
    out.features = mods.filter((m) => matchesSearch(m.name, q)).sort(byName);
    out.collections = cols.filter((c) => matchesSearch(c.name, q)).sort(byName);
    out.things = things
      .filter((th) => matchesSearch(th.name, q))
      .sort((a, b) => Number(!!a.archivedAt) - Number(!!b.archivedAt) || byName(a, b))
      .map((th) => ({ thing: th, collection: colById.get(th.collectionId) }));
  }

  out.planned = goals
    .filter(({ goal: g }) => {
      if (scoped && g.category.id !== filters.categoryId) return false;
      if (q && !matchesSearch(`${goalTitle(g)} ${g.category.name} ${g.note ?? ""}`, q)) return false;
      if (!timed) return true;
      // Tek günlük: günü dönemde; tekrar eden: dönemle kesişen aralıkta
      if (!g.repeat) return inPeriod(g.date);
      return (!lastDay || g.date <= lastDay) && (!firstDay || !g.until || g.until >= firstDay);
    })
    .sort((a, b) => b.goal.date.localeCompare(a.goal.date));

  out.notes = notes
    .filter((n) => !noteIsEmpty(n) && inPeriod(n.date) && matchesSearch(noteText(n), q))
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);

  return out;
}
