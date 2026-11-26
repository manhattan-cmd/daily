import { nanoid } from "nanoid";
import { db } from "./index";
import type { Tag } from "@/types";
import { getLocale } from "@/lib/i18n";
import { nextTagColor, normTagName, TAG_FILTER_STORAGE_KEY } from "@/lib/tags";

/**
 * ETİKETLER — kategori ağacının dışında "ne tür" ekseni (bkz. types Tag).
 * Kategori ve alt kategori `tagIds` taşır; miras ve süzgeç hesabı saf
 * fonksiyonlarda (lib/tags).
 */

const now = () => Date.now();

export async function listTags(): Promise<Tag[]> {
  const all = await db.tags.toArray();
  return all.sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
}

/** Aynı adlı etiket varsa onu döndürür — ad tekil */
export async function createTag(name: string, color?: string): Promise<Tag> {
  const clean = name.trim();
  const all = await db.tags.toArray();
  const same = all.find((t) => normTagName(t.name) === normTagName(clean));
  if (same) return same;
  const tag: Tag = {
    id: nanoid(12),
    name: clean,
    color: color ?? nextTagColor(all),
    order: all.reduce((m, t) => Math.max(m, t.order), 0) + 1,
    createdAt: now(),
    updatedAt: now(),
  };
  await db.tags.add(tag);
  return tag;
}

export async function updateTag(tagId: string, patch: Partial<Pick<Tag, "name" | "color">>): Promise<void> {
  const clean = patch.name !== undefined ? { ...patch, name: patch.name.trim() } : patch;
  if (clean.name === "") return;
  await db.tags.update(tagId, clean);
}

/** Etiketi siler; takılı olduğu bütün kategori ve kalemlerden de çıkar */
export async function deleteTag(tagId: string): Promise<void> {
  await db.transaction("rw", [db.tags, db.categories, db.subcategories], async () => {
    await db.tags.delete(tagId);
    const strip = <T extends { id: string; tagIds?: string[] }>(rows: T[]) =>
      rows.filter((r) => r.tagIds?.includes(tagId)).map((r) => ({ id: r.id, tagIds: r.tagIds!.filter((x) => x !== tagId) }));
    for (const c of strip(await db.categories.toArray())) await db.categories.update(c.id, { tagIds: c.tagIds });
    for (const s of strip(await db.subcategories.toArray())) await db.subcategories.update(s.id, { tagIds: s.tagIds });
  });
}

/** Bir kategorinin ya da kalemin KENDİ etiketleri (miras dışında) */
export async function setTargetTags(
  targetType: "category" | "subcategory",
  targetId: string,
  tagIds: string[]
): Promise<void> {
  const ids = [...new Set(tagIds)];
  if (targetType === "category") await db.categories.update(targetId, { tagIds: ids });
  else await db.subcategories.update(targetId, { tagIds: ids });
}

/**
 * Formda yazılıp henüz açılmamış etiketler `new:<ad>` diye taşınır;
 * kayıtta açılır, vazgeçilirse hiç açılmaz (bkz. TagField).
 */
export const NEW_TAG_PREFIX = "new:";

export async function settleTagIds(ids: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const id of ids) {
    out.push(id.startsWith(NEW_TAG_PREFIX) ? (await createTag(id.slice(NEW_TAG_PREFIX.length))).id : id);
  }
  return [...new Set(out)];
}

/** Ada göre etiket — yoksa açar (başlangıç verisi ve göç) */
export async function ensureTag(name: string): Promise<Tag> {
  return createTag(name);
}

/** Göçte açılan etiketin adı — eski anahtarın adı ("Sabitler hariç") */
const REGULAR_TAG_NAME = { tr: "Sabitler", en: "Fixed" } as const;

/**
 * Eski "Düzenli / sabit" işareti (isRegular) → "Sabitler" etiketi. İşaret
 * silinir ki etiket sonradan kaldırılınca geri gelmesin. Analizdeki eski
 * "Sabitler hariç" tercihi açıksa etiket süzgecine çevrilir. Açılışta ve
 * geri yüklemeden sonra çalışır; işaretli kalem yoksa hiçbir şey yapmaz.
 */
export async function migrateRegularToTags(): Promise<void> {
  const flagged = (await db.subcategories.toArray()).filter((s) => s.isRegular !== undefined);
  if (!flagged.length) return;
  const on = flagged.filter((s) => s.isRegular);
  let tagId: string | undefined;
  if (on.length) {
    tagId = (await ensureTag(REGULAR_TAG_NAME[getLocale()] ?? REGULAR_TAG_NAME.tr)).id;
  }
  await db.transaction("rw", db.subcategories, async () => {
    for (const s of flagged) {
      const tagIds = s.isRegular && tagId ? [...new Set([...(s.tagIds ?? []), tagId])] : s.tagIds;
      await db.subcategories.update(s.id, { isRegular: undefined, ...(tagIds ? { tagIds } : {}) });
    }
  });
  if (!tagId) return;
  try {
    if (localStorage.getItem("analytics.excludeRegular") === "1" && !localStorage.getItem(TAG_FILTER_STORAGE_KEY)) {
      localStorage.setItem(TAG_FILTER_STORAGE_KEY, JSON.stringify({ tagId, mode: "exclude" }));
    }
    localStorage.removeItem("analytics.excludeRegular");
  } catch {}
}
