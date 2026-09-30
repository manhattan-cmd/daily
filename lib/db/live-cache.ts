"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "./index";
import { getEntryCountsBySubcategory } from "./queries";
import { usageSince } from "@/lib/usage";
import type { Category, SubCategory } from "@/types";

/**
 * Önbellekli canlı sorgu — son sonuç hafızada, ilk çizimde o kullanılır.
 *
 * Girdi ekleme penceresi artık yalnız açılınca kuruluyor (bkz.
 * useSheetPresence); sorguları da açılışta başlıyordu ve pencere yarı boş
 * kayıp kategori listesi, sık kullanılanlar sonradan beliriyordu (telefonda
 * ~150 ms). Önbellek o aralığı dolduruyor; taze sonuç gelince sessizce
 * güncelleniyor. Açılıştan sonra tarayıcı boşa çıkınca önceden dolduruluyor
 * (warmSheetData, AppShell).
 */
const store = new Map<string, unknown>();

export function useCachedLiveQuery<T>(
  key: string,
  load: () => Promise<T>,
  deps: unknown[] = []
): T | undefined {
  return useLiveQuery(
    async () => {
      const v = await load();
      store.set(key, v);
      return v;
    },
    deps,
    store.get(key) as T | undefined
  );
}

async function warm<T>(key: string, load: () => Promise<T>) {
  if (store.has(key)) return;
  try {
    store.set(key, await load());
  } catch {
    // önden okuma başarısızsa bileşen kendisi okuyacak
  }
}

// ── Girdi ekleme penceresinin verisi ──────────────────────────────────────

export type EntryGroup = {
  category: Category;
  topSubs: SubCategory[];
  allSubs: SubCategory[];
};

export const ENTRY_GROUPS_KEY = "entry-sheet:groups";
/** Kategoriler ve alt kategorileri — yerleşik akışlar (Uyku…) hariç */
export async function loadEntryGroups(): Promise<EntryGroup[]> {
  const [cats, subs] = await Promise.all([
    db.categories.orderBy("order").toArray(),
    db.subcategories.toArray(),
  ]);
  return cats
    .filter((cat) => !cat.isBuiltIn) // Uyku'nun kendi akışı var (Ekle → Uyku)
    .map((cat) => ({
      category: cat,
      topSubs: subs
        .filter((s) => s.categoryId === cat.id && !s.parentId && !s.isCategoryRoot)
        .sort((a, b) => a.order - b.order),
      allSubs: subs.filter((s) => s.categoryId === cat.id),
    }));
}

export const USAGE_COUNTS_KEY = "entry-picker:usage";
/** Son 30 günde alt kategori başına girdi sayısı — sık kullanılanlar şeridi */
export const loadUsageCounts = () => getEntryCountsBySubcategory(usageSince());

/** Girdi ekleme penceresinin verisini arka planda hazırla */
export function warmSheetData() {
  void warm(ENTRY_GROUPS_KEY, loadEntryGroups);
  void warm(USAGE_COUNTS_KEY, loadUsageCounts);
}
