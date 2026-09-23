"use client";

import { useSyncExternalStore } from "react";

/**
 * Görüntü teması (skin).
 *
 * Tasarımı değil yalnız GÖRÜNTÜ katmanını değiştiriyor: yerleşim, yarıçap,
 * boşluk ve bileşen yapısı aynı kalıyor, renk ve yüzey tonları temaya göre
 * değişiyor. Uygulama tarafında tek iş kök öğeye `data-skin` yazmak; gerisi
 * CSS değişkenlerinde (bkz. app/globals.css).
 */

export const SKINS = [
  "gece",
  "pastel",
  "kagit",
  "nordik",
  "toprak",
  "retro",
  "neon",
  "mono",
] as const;
export type Skin = (typeof SKINS)[number];

/** Seçicide görünen adlar ve bir satırlık karakterleri */
export const SKIN_META: Record<Skin, { name: string; hint: string; swatch: string[] }> = {
  gece: {
    name: "Gece",
    hint: "Koyu zemin, indigo vurgu",
    swatch: ["#09090B", "#131316", "#6366F1", "#FAFAFA"],
  },
  pastel: {
    name: "Pastel",
    hint: "Açık zemin, leylak vurgu",
    swatch: ["#FAF7FD", "#FFFFFF", "#A78BFA", "#3B3550"],
  },
  kagit: {
    name: "Kâğıt",
    hint: "Kirli beyaz kâğıt, sepya mürekkep",
    swatch: ["#F2EDE3", "#FFFCF6", "#9A6B3F", "#2A251E"],
  },
  nordik: {
    name: "Nordik",
    hint: "Buz mavisi griler, sakin",
    swatch: ["#0F141B", "#151D27", "#7FB3D5", "#E4EBF3"],
  },
  toprak: {
    name: "Toprak",
    hint: "Kahve ve kiremit, sıcak",
    swatch: ["#14100C", "#1D1710", "#D98E4A", "#F3E9DC"],
  },
  retro: {
    name: "Retro",
    hint: "Fosfor yeşili, kehribar vurgu",
    swatch: ["#070C07", "#0C140C", "#FFB000", "#CFF5CF"],
  },
  neon: {
    name: "Neon",
    hint: "Mor gece, camgöbeği parıltı",
    swatch: ["#06030F", "#0E0722", "#22E5FF", "#F0E9FF"],
  },
  mono: {
    name: "Mono",
    hint: "Renksiz — yalnız ton",
    swatch: ["#0A0A0A", "#131313", "#FFFFFF", "#9C9C9C"],
  },
};

const STORAGE_KEY = "routine:skin";
const DEFAULT_SKIN: Skin = "gece";

const isSkin = (v: unknown): v is Skin =>
  typeof v === "string" && (SKINS as readonly string[]).includes(v);

let current: Skin | null = null;
const listeners = new Set<() => void>();

export function getSkin(): Skin {
  if (current) return current;
  if (typeof window === "undefined") return DEFAULT_SKIN;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  current = isSkin(stored) ? stored : DEFAULT_SKIN;
  return current;
}

/** Kök öğeye yazar — CSS değişkenleri buradan devralıyor */
export function applySkin(skin: Skin): void {
  if (typeof document === "undefined") return;
  if (skin === DEFAULT_SKIN) delete document.documentElement.dataset.skin;
  else document.documentElement.dataset.skin = skin;
}

export function setSkin(next: Skin): void {
  current = next;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, next);
    applySkin(next);
  }
  for (const fn of listeners) fn();
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function useSkin(): Skin {
  return useSyncExternalStore(subscribe, getSkin, () => DEFAULT_SKIN);
}
