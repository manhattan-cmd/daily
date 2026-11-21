"use client";

import { useSyncExternalStore } from "react";

/**
 * localStorage'da tutulan basit "görüldü/kapatıldı" bayrağı.
 *
 * useState + useEffect yerine harici store: bayrak render sırasında değil
 * anlık görüntüde okunuyor, aynı bayrağı dinleyen bütün bileşenler tek
 * dokunuşta güncelleniyor.
 */

const listeners = new Map<string, Set<() => void>>();

function notify(key: string): void {
  for (const fn of listeners.get(key) ?? []) fn();
}

function subscribeTo(key: string) {
  return (fn: () => void) => {
    const set = listeners.get(key) ?? new Set();
    set.add(fn);
    listeners.set(key, set);
    window.addEventListener("storage", fn);
    return () => {
      set.delete(fn);
      window.removeEventListener("storage", fn);
    };
  };
}

export function setLocalFlag(key: string, value = true): void {
  if (typeof window === "undefined") return;
  if (value) window.localStorage.setItem(key, "1");
  else window.localStorage.removeItem(key);
  notify(key);
}

/** [bayrak, işaretle] — sunucuda hep true sayılır (yanıp sönmeyi önler) */
export function useLocalFlag(key: string): [boolean, () => void] {
  const value = useSyncExternalStore(
    subscribeTo(key),
    () => window.localStorage.getItem(key) === "1",
    () => true
  );
  return [value, () => setLocalFlag(key)];
}
