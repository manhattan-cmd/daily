import { db } from "@/lib/db";
import { goalTitle, listAllGoals, listMods, noteIsEmpty, type ModWithType } from "@/lib/db/queries";
import { matchesSearch, normalizeSearch } from "@/lib/search";
import { subsWithTag, type TagFilter } from "@/lib/tags";
import { toLocalDateValue } from "@/lib/utils";
import type { Category, Collection, GoalWithContext, Note, SubCategory, Thing } from "@/types";

export interface SearchAllFilters {
  query: string;
  /** Yalnız bu kategoriye ait olanlar */
  categoryId?: string;
  /** [from, to) — dönem seçiliyse */
  from?: number;
  to?: number;
  /** Etiket süzgeci — yalnız bu etiketli yerler ya da onlar hariç */
  tagFilter?: TagFilter | null;
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
 *  - Etiket "yalnız": kategori gibi bir kapsam — kalemler ve planlar
 *    etiketli yerlerden, yeri olmayanlar çıkmaz. Sorgu boşsa etiketin
 *    doğrudan takılı olduğu kategori ve kalemler listelenir ("Sabit
 *    ödemeler nerelerde?"). Etiket "hariç": etiketli yerler düşer, gerisi
 *    süzgeçsiz gibi.
 * Sorgu boşsa (yalnız kategori seçili) yalnız o kategorinin planları —
 * girdileri gibi; "bütün kalemler" bir arama sonucu değil.
 */
export async function searchEverything(filters: SearchAllFilters): Promise<SearchAllResult> {
  const q = normalizeSearch(filters.query.trim());
  const timed = filters.from !== undefined || filters.to !== undefined;
  const tag = filters.tagFilter ?? null;
  const tagOnly = tag?.mode === "only";
  const scoped = !!filters.categoryId || tagOnly;
  // Dönemin günleri (dahil) — notlar ve planlar gün anahtarıyla
  const firstDay = filters.from !== undefined ? toLocalDateValue(filters.from) : undefined;
  const lastDay = filters.to !== undefined ? toLocalDateValue(filters.to - 1) : undefined;
  const inPeriod = (day: string) => (!firstDay || day >= firstDay) && (!lastDay || day <= lastDay);

  const empty: SearchAllResult = { categories: [], subs: [], features: [], collections: [], things: [], planned: [], notes: [] };
  if (!q && !scoped) return empty;

  // Yapı, nesneler, özellikler — yalnız sorguyla (ya da etiketin yerleri),
  // dönem ve kategori yokken
  const tagPlaces = !q && tagOnly;
  const structural = (!!q || tagPlaces) && !timed;
  const needTree = structural || scoped || !!tag;
  const [cats, subs, mods, cols, things, goals, notes] = await Promise.all([
    needTree ? db.categories.toArray() : Promise.resolve([] as Category[]),
    needTree ? db.subcategories.toArray() : Promise.resolve([] as SubCategory[]),
    structural && !scoped ? listMods() : Promise.resolve([] as ModWithType[]),
    structural && !scoped ? db.collections.toArray() : Promise.resolve([] as Collection[]),
    structural && !scoped ? db.things.toArray() : Promise.resolve([] as Thing[]),
    listAllGoals(),
    q && !scoped ? db.notes.toArray() : Promise.resolve([] as Note[]),
  ]);
  const catById = new Map(cats.map((c) => [c.id, c]));
  const colById = new Map(cols.map((c) => [c.id, c]));
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "tr");
  // Etiketli kalemler (mirasla) — yerin süzgeçten geçip geçmediği
  const tagged = tag ? subsWithTag(tag.tagId, cats, subs) : null;
  const passSub = (id: string) => !tagged || tagged.has(id) === tagOnly;
  const passCat = (c: Category) => !tag || (c.tagIds ?? []).includes(tag.tagId) === tagOnly;
  const inCat = (catId: string) => !filters.categoryId || catId === filters.categoryId;

  const out: SearchAllResult = { ...empty };
  if (structural) {
    // Yerleşik akışlar (Uyku, Ruh hali, Nesneler) yapıda gezilmiyor
    out.categories = tagPlaces
      ? cats.filter((c) => !c.isBuiltIn && inCat(c.id) && passCat(c)).sort(byName)
      : filters.categoryId
        ? []
        : cats.filter((c) => !c.isBuiltIn && passCat(c) && matchesSearch(c.name, q)).sort(byName);
    out.subs = subs
      .filter((s) => !s.isCategoryRoot && inCat(s.categoryId))
      // Sorgusuz etiket: etiketin DOĞRUDAN takılı olduğu kalemler (mirasla
      // gelen torunlar listeyi boğuyordu); sorguyla: adı eşleşen, süzgeçten geçen
      .filter((s) => (tagPlaces ? (s.tagIds ?? []).includes(tag!.tagId) : passSub(s.id) && matchesSearch(s.name, q)))
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
      if (!inCat(g.category.id)) return false;
      if (tag && !passSub(g.subcategoryId)) return false;
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
