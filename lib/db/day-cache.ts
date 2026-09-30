"use client";

import { useLiveQuery } from "dexie-react-hooks";
import type { EntryWithContext, Note } from "@/types";
import {
  listEntriesByDate,
  listGoalsByDate,
  listNotesByDate,
  noteIsEmpty,
} from "./queries";

/**
 * Gün sayfasının son bilinen verisi — anında çizmek için.
 *
 * Gün sayfası her açılışta girdileri veritabanından okuyor; telefonda bu
 * ~150–250 ms sürüyor ve o arada iskelet görünüp kartlar sonradan beliriyordu
 * (hedefler ve notlar da sonradan gelip sayfayı aşağı itiyordu). Önbellek o
 * aralığı dolduruyor: günün son hali hemen çiziliyor, canlı sorgu gelince
 * sessizce güncelleniyor. Açılan günün bir öncesi ve bir sonrası arka planda
 * okunuyor — oklarla/kaydırarak geçince kart beklenmiyor.
 *
 * Bayat kalabilir mi: yalnız canlı sorgu dönene kadar (birkaç yüz ms), o da
 * başka bir sayfada değişiklik yapıldıysa. Veri hiçbir zaman buradan yazılmaz.
 */

type DayGoals = Awaited<ReturnType<typeof listGoalsByDate>>;

const cache = new Map<string, unknown>();
/** Bu kadar kayıttan sonra en eski düşer (her gün için 3 kayıt) */
const MAX = 60;

function put(key: string, value: unknown) {
  cache.delete(key); // en sona taşı — en yeni
  cache.set(key, value);
  while (cache.size > MAX) cache.delete(cache.keys().next().value!);
}

const loaders = {
  entries: (date: string) => listEntriesByDate(date),
  goals: (date: string) => listGoalsByDate(date),
  // Boş bırakılıp geri dönülen notlar listede görünmez
  notes: async (date: string) =>
    (await listNotesByDate(date)).filter((n) => !noteIsEmpty(n)),
};
type Kind = keyof typeof loaders;
const keyOf = (kind: Kind, date: string) => `${kind}:${date}`;

/** Canlı sorgu + önbellek: ilk çizimde günün son bilinen hali, sonra canlı veri */
function useDay<T>(kind: Kind, date: string): T | undefined {
  return useLiveQuery(
    async () => {
      const v = await loaders[kind](date);
      put(keyOf(kind, date), v);
      return v as T;
    },
    [kind, date],
    cache.get(keyOf(kind, date)) as T | undefined
  );
}

export const useDayEntries = (date: string) => useDay<EntryWithContext[]>("entries", date);
export const useDayGoals = (date: string) => useDay<DayGoals>("goals", date);
export const useDayNotes = (date: string) => useDay<Note[]>("notes", date);

/**
 * İşi tarayıcı boşa çıkınca yap — açılış ve sayfa çizimiyle yarışmasın.
 * requestIdleCallback olmayan tarayıcıda (Safari) biraz gecikmeyle.
 * Döndürdüğü fonksiyon iptal eder.
 */
export function whenIdle(fn: () => void, fallbackMs = 1200): () => void {
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(fn, { timeout: 3000 });
    return () => window.cancelIdleCallback(id);
  }
  const t = window.setTimeout(fn, fallbackMs);
  return () => window.clearTimeout(t);
}

/**
 * Bir güne giden bağlantıya: parmak değdiği an okumaya başla. Dokunuşla
 * parmağın kalkması arasındaki ~100 ms, gün sayfası açılmadan kartları
 * hazırlamaya yetiyor. Sonuç önbellekte; bağlantı yine normal çalışır.
 */
export const prefetchDayOnPress = (date: string) => ({
  onPointerDown: () => void prefetchDay(date),
  onFocus: () => void prefetchDay(date),
});

/**
 * Günü arka planda önbelleğe al — zaten varsa dokunmaz. Kullanıcıyı
 * bekletmesin diye çağıran bir boşluk anında (setTimeout) çağırmalı.
 */
export async function prefetchDay(date: string): Promise<void> {
  await Promise.all(
    (Object.keys(loaders) as Kind[]).map(async (kind) => {
      const key = keyOf(kind, date);
      if (cache.has(key)) return;
      try {
        put(key, await loaders[kind](date));
      } catch {
        // önden okuma başarısızsa sayfa zaten kendisi okuyacak
      }
    })
  );
}
