"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import type { Period } from "@/lib/period";
import type { Category, Entry, SubCategory } from "@/types";

/**
 * Dönem görünümünün verisi — dönemler arasında gezerken ekran boşalmasın.
 *
 * Dönem değişince (This week → This month) sayfa önce yükleme iskeletine
 * dönüp veri gelince asıl ekranı açıyordu: kullanıcıya "açılıp kapanıp
 * yeniden açılıyor" gibi görünüyordu. Artık:
 *   - yeni dönemin verisi önbellekteyse HEMEN o çiziliyor;
 *   - değilse veri gelene kadar ÖNCEKİ dönem kendi başlığı ve rakamlarıyla
 *     tutarlı biçimde duruyor, sonra tek karede yeni döneme geçiliyor.
 * Veri, ait olduğu dönemi de taşıyor (period) — görünüm onu kullanıyor,
 * yeni dönemin başlığıyla eski dönemin rakamları hiç karışmıyor.
 */
export type PeriodData = {
  periodKey: string;
  period: Period;
  cats: Category[];
  subs: SubCategory[];
  entries: Entry[];
};

const cache = new Map<string, PeriodData>();
const MAX = 24;
function put(v: PeriodData) {
  cache.delete(v.periodKey);
  cache.set(v.periodKey, v);
  while (cache.size > MAX) cache.delete(cache.keys().next().value!);
}

export async function loadPeriodData(period: Period): Promise<PeriodData> {
  const [cats, subs, entries] = await Promise.all([
    db.categories.orderBy("order").toArray(),
    db.subcategories.toArray(),
    db.entries.where("occurredAt").between(period.start, period.end, true, false).toArray(),
  ]);
  return { periodKey: period.key, period, cats, subs, entries };
}

export function usePeriodData(period: Period): PeriodData | undefined {
  const live = useLiveQuery(
    async () => {
      const v = await loadPeriodData(period);
      put(v);
      return v;
    },
    // period her çizimde yeni nesne olabilir; kimliği anahtar
    [period.key],
    cache.get(period.key)
  );
  if (live?.periodKey === period.key) return live;
  // Yeni dönemin canlı sonucu henüz yok: önbellekteyse o, değilse önceki
  // dönemin verisi (kendi dönemiyle birlikte — görünüm tutarlı kalır)
  return cache.get(period.key) ?? live;
}

/** Dönemi arka planda önbelleğe al — zaten varsa dokunmaz */
export async function prefetchPeriod(period: Period): Promise<void> {
  if (cache.has(period.key)) return;
  try {
    put(await loadPeriodData(period));
  } catch {
    // önden okuma başarısızsa görünüm kendisi okuyacak
  }
}
