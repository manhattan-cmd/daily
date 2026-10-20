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
 */

type Index = { names: Map<string, string>; archived: Set<string> };

let index: Index = { names: new Map(), archived: new Set() };
let started = false;
const listeners = new Set<() => void>();

function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  liveQuery(() => db.things.toArray()).subscribe({
    next(things) {
      index = {
        names: new Map(things.map((t) => [t.id, t.name])),
        archived: new Set(things.filter((t) => t.archivedAt).map((t) => t.id)),
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
const empty: Index = { names: new Map(), archived: new Set() };

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
