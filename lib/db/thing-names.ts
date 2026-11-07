"use client";

import { useSyncExternalStore } from "react";
import { liveQuery } from "dexie";
import { db } from "./index";
import { splitThingIds } from "./things";

/**
 * Nesne adları — girdi kartı gibi saf okuma yerlerinde kimliği ada çevirmek
 * için tek, canlı bir dizin. Değer "a1,b2" biçiminde kimlik taşıyor;
 * readValue gibi zaman uyumlu yardımcılar her çağrıda veritabanına gidemez.
 * Dizin ilk kullanımda kurulur ve nesneler değiştikçe kendini tazeler;
 * useThingNames() çağıran bileşen de o anda yeniden çizilir.
 *
 * `icons`: nesnenin listesinin sembolü (Arabalarım → araba). Girdi kartındaki
 * nesne kapsülünün başında durur. Listeler de dinlenir, sembol değişince
 * kapsül de değişir.
 */

type Index = { names: Map<string, string>; archived: Set<string>; icons: Map<string, string> };

let index: Index = { names: new Map(), archived: new Set(), icons: new Map() };
let started = false;
const listeners = new Set<() => void>();

function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  liveQuery(async () => ({
    things: await db.things.toArray(),
    collections: await db.collections.toArray(),
  })).subscribe({
    next({ things, collections }) {
      const colIcon = new Map(collections.flatMap((c) => (c.icon ? [[c.id, c.icon] as const] : [])));
      index = {
        names: new Map(things.map((t) => [t.id, t.name])),
        archived: new Set(things.filter((t) => t.archivedAt).map((t) => t.id)),
        icons: new Map(
          things.flatMap((t) => {
            const icon = colIcon.get(t.collectionId);
            return icon ? [[t.id, icon] as const] : [];
          })
        ),
      };
      for (const l of listeners) l();
    },
  });
}

function subscribe(l: () => void) {
  start();
  listeners.add(l);
  return () => listeners.delete(l);
}

const snapshot = () => index;
const empty: Index = { names: new Map(), archived: new Set(), icons: new Map() };

/** Bileşende kullan — adlar değişince yeniden çizer */
export function useThingNames(): Index {
  return useSyncExternalStore(subscribe, snapshot, () => empty);
}

/** "a1,b2" → "Sapiens, Dune". Bilinmeyen kimlik "?" olarak görünür */
export function thingLabel(value: string): string {
  start();
  const ids = splitThingIds(value);
  return ids.map((i) => index.names.get(i) ?? "?").join(", ");
}
