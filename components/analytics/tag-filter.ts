"use client";

import { useMemo, useSyncExternalStore } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { subsWithTag, TAG_FILTER_STORAGE_KEY, type TagFilter } from "@/lib/tags";
import type { Category, SubCategory, Tag } from "@/types";

/**
 * Analizin etiket süzgeci — "yalnız Sabit ödemeler" ya da "Sabit ödemeler
 * hariç". Eski "Sabitler hariç" anahtarının (yalnız bir kategorinin
 * panelinde, tek etiket, yalnız hariç) genel hali: her yerde (kategoriler,
 * kategori, alt kategori) aynı süzgeç, seçimi Analiz'in üst menüsünde.
 *
 * Tercih cihazda (localStorage) — dönem ve yer değişse de süzgeç durur;
 * sayfa başı her zaman söyler. Harici store: effect içinde setState yerine
 * (bkz. eski regular-toggle).
 */

const listeners = new Set<() => void>();
let cachedRaw: string | null | undefined;
let cachedValue: TagFilter | null = null;

const read = (): TagFilter | null => {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(TAG_FILTER_STORAGE_KEY);
  } catch {}
  // Aynı ham değer → aynı nesne (useSyncExternalStore kimlik ister)
  if (raw === cachedRaw) return cachedValue;
  cachedRaw = raw;
  try {
    const v = raw ? (JSON.parse(raw) as TagFilter) : null;
    cachedValue = v && typeof v.tagId === "string" && (v.mode === "only" || v.mode === "exclude") ? v : null;
  } catch {
    cachedValue = null;
  }
  return cachedValue;
};

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

export function setTagFilter(v: TagFilter | null): void {
  try {
    if (v) localStorage.setItem(TAG_FILTER_STORAGE_KEY, JSON.stringify(v));
    else localStorage.removeItem(TAG_FILTER_STORAGE_KEY);
  } catch {}
  for (const fn of listeners) fn();
}

/** Bütün etiketler, sıralı — süzgeç ve sayfa başı için */
export function useTags(): Tag[] | undefined {
  return useLiveQuery(async () => (await db.tags.toArray()).sort((a, b) => a.order - b.order || a.createdAt - b.createdAt), []);
}

/**
 * Geçerli süzgeç: kayıtlı tercih ve etiketi hâlâ var mı. Etiket silinmişse
 * süzgeç yok sayılır (tercih durur ama hiçbir şeyi süzmez).
 */
export function useTagFilter(): { filter: TagFilter | null; tag: Tag | null; tags: Tag[] | undefined } {
  const stored = useSyncExternalStore(subscribe, read, () => null);
  const tags = useTags();
  const tag = (stored && tags?.find((x) => x.id === stored.tagId)) || null;
  return { filter: tag ? stored : null, tag, tags };
}

/** Süzgecin etiketini taşıyan kalemler (mirasla) — süzgeç yoksa null */
export function useTaggedSubIds(
  filter: TagFilter | null,
  cats: Pick<Category, "id" | "tagIds">[] | undefined,
  subs: Pick<SubCategory, "id" | "categoryId" | "parentId" | "tagIds">[] | undefined
): Set<string> | null {
  return useMemo(
    () => (filter && cats && subs ? subsWithTag(filter.tagId, cats, subs) : null),
    [filter, cats, subs]
  );
}
