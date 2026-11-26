import type { Category, SubCategory, Tag } from "@/types";

/**
 * Etiketlerin saf hesapları — veritabanına dokunmaz (bkz. lib/db/tags).
 *
 * Miras: kategoriye takılan etiket bütün kalemlerine, alt kategoriye takılan
 * kendi alt ağacına iner. Bir kalemin etiketleri = kendisinin + bütün
 * atalarının + kategorisinin etiketleri.
 */

/** Analizin etiket süzgeci — yalnız bu etiketli yerler ya da onlar hariç */
export type TagFilter = { tagId: string; mode: "only" | "exclude" };

/** Süzgecin cihazdaki yeri — bütün analiz panelleri aynı süzgeci paylaşır */
export const TAG_FILTER_STORAGE_KEY = "analytics.tagFilter";

/** Etiket renkleri — kategori renklerinden ayrı, sırayla verilir */
export const TAG_COLORS = [
  "#ffd23f", // sarı
  "#7dd3fc", // gök
  "#f9a8d4", // pembe
  "#86efac", // yeşil
  "#c4b5fd", // lila
  "#fdba74", // turuncu
  "#5eead4", // turkuaz
  "#fca5a5", // mercan
] as const;

/** Yeni etiketin rengi — en az kullanılan, eşitlikte sıradaki */
export function nextTagColor(tags: Pick<Tag, "color">[]): string {
  const used = new Map<string, number>();
  for (const t of tags) used.set(t.color, (used.get(t.color) ?? 0) + 1);
  let best: string = TAG_COLORS[0];
  let bestN = Infinity;
  for (const c of TAG_COLORS) {
    const n = used.get(c) ?? 0;
    if (n < bestN) {
      best = c;
      bestN = n;
    }
  }
  return best;
}

type SubLike = Pick<SubCategory, "id" | "categoryId" | "parentId" | "tagIds">;
type CatLike = Pick<Category, "id" | "tagIds">;

/**
 * Bir yerin üstünden gelen etiketler — üst kalemlerin ve kategorinin; her
 * etiket en yakın sahibinin adıyla (formda "Faturalar'dan geliyor"). Mirası
 * olan etiket kalemden çıkarılamaz, üstünden çıkarılır.
 */
export function inheritedTags(
  categoryId: string,
  parentId: string | undefined,
  subById: Map<string, SubLike & { name: string }>,
  catById: Map<string, CatLike & { name: string }>
): { id: string; from: string }[] {
  const out = new Map<string, string>();
  let cur = parentId ? subById.get(parentId) : undefined;
  let hops = 0;
  while (cur && hops++ < 30) {
    for (const id of cur.tagIds ?? []) if (!out.has(id)) out.set(id, cur.name);
    cur = cur.parentId ? subById.get(cur.parentId) : undefined;
  }
  const cat = catById.get(categoryId);
  for (const id of cat?.tagIds ?? []) if (!out.has(id)) out.set(id, cat!.name);
  return [...out.entries()].map(([id, from]) => ({ id, from }));
}

/** Etiketi (kendisinde ya da mirasla) taşıyan kalemlerin kimlikleri */
export function subsWithTag(
  tagId: string,
  cats: CatLike[],
  subs: SubLike[]
): Set<string> {
  const subById = new Map(subs.map((s) => [s.id, s]));
  const taggedCats = new Set(cats.filter((c) => c.tagIds?.includes(tagId)).map((c) => c.id));
  const memo = new Map<string, boolean>();
  const has = (s: SubLike, depth = 0): boolean => {
    const known = memo.get(s.id);
    if (known !== undefined) return known;
    let v = taggedCats.has(s.categoryId) || !!s.tagIds?.includes(tagId);
    if (!v && s.parentId && depth < 30) {
      const p = subById.get(s.parentId);
      v = !!p && has(p, depth + 1);
    }
    memo.set(s.id, v);
    return v;
  };
  const out = new Set<string>();
  for (const s of subs) if (has(s)) out.add(s.id);
  return out;
}

/**
 * Süzgeçten geçen girdiler. Süzgeç yoksa ya da etiketi artık yoksa
 * (silinmiş) dokunulmaz.
 */
export function filterEntriesByTag<E extends { subcategoryId: string }>(
  entries: E[],
  filter: TagFilter | null,
  tagged: Set<string> | null
): E[] {
  if (!filter || !tagged) return entries;
  return filter.mode === "only"
    ? entries.filter((e) => tagged.has(e.subcategoryId))
    : entries.filter((e) => !tagged.has(e.subcategoryId));
}

/** Ad eşleşmesi — büyük/küçük harf ve boşluk yutulur, Türkçe döküm */
export const normTagName = (s: string): string => s.trim().toLocaleLowerCase("tr");
