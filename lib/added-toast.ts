"use client";

import { useSyncExternalStore } from "react";

/**
 * "Eklendi" bildirimi — girdi kaydedilince pencere kapanıyor, bildirim
 * sayfada (app-shell) görünmeli; aradaki köprü bu küçük depo.
 */
export type AddedNotice = { entryId: string; name: string; at: number };

let current: AddedNotice | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());

export function announceAdded(entryId: string, name: string, at: number): void {
  current = { entryId, name, at };
  emit();
}

export function clearAdded(): void {
  current = null;
  emit();
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function useAddedNotice(): AddedNotice | null {
  return useSyncExternalStore(subscribe, () => current, () => null);
}
