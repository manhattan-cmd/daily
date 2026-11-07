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
 * `looks`: nesnenin listesinin sembolü ve rengi (Arabalarım → araba, mavi).
 * Girdi kartındaki nesne kapsülünün baklavası bunlarla çizilir. Listeler de
 * dinlenir, sembol ya da renk değişince kapsül de değişir.
 */

export type ThingLook = { icon?: string; color?: string };

type Index = { names: Map<string, string>; archived: Set<string>; looks: Map<string, ThingLook> };

let index: Index = { names: new Map(), archived: new Set(), looks: new Map() };
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
      const cols = new Map(collections.map((c) => [c.id, c]));
      index = {
        names: new Map(things.map((t) => [t.id, t.name])),
        archived: new Set(things.filter((t) => t.archivedAt).map((t) => t.id)),
        looks: new Map(
          things.map((t) => {
            const c = cols.get(t.collectionId);
            return [t.id, { icon: c?.icon || undefined, color: c?.color || undefined }];
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
const empty: Index = { names: new Map(), archived: new Set(), looks: new Map() };

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
