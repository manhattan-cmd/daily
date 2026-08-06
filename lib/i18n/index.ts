"use client";

import { useSyncExternalStore } from "react";
import { messages, type MessageKey } from "./messages";

/**
 * Dil katmanı.
 *
 * Uygulama tek dilde donmuş olmasın diye metinler sözlükten geliyor; dil
 * kullanıcı ayarı, varsayılanı tarayıcının dili. Biçimlendirme (tarih, saat,
 * sayı) de aynı dili kullanır — ayrı bir "locale" kavramı tutmuyoruz, dil
 * seçimi ikisini birden belirler.
 */

export const LOCALES = ["en", "tr"] as const;
export type Locale = (typeof LOCALES)[number];

/** Dil seçicide görünen adlar — her dil kendi adıyla yazılır */
export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  tr: "Türkçe",
};

/** Intl'e verilecek etiket */
const INTL_TAG: Record<Locale, string> = { en: "en-US", tr: "tr-TR" };

const STORAGE_KEY = "routine:locale";
const DEFAULT_LOCALE: Locale = "en";

const isLocale = (v: unknown): v is Locale =>
  typeof v === "string" && (LOCALES as readonly string[]).includes(v);

/** Kullanıcı seçmediyse tarayıcının dili — desteklenmiyorsa İngilizce */
function detect(): Locale {
  if (typeof navigator === "undefined") return DEFAULT_LOCALE;
  for (const tag of navigator.languages ?? [navigator.language]) {
    const base = tag?.split("-")[0];
    if (isLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}

let current: Locale | null = null;
const listeners = new Set<() => void>();

/**
 * Etkin dil. React dışından da (biçimlendirme yardımcıları) okunabilsin diye
 * modül düzeyinde önbelleklenir.
 */
export function getLocale(): Locale {
  if (current) return current;
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  current = isLocale(stored) ? stored : detect();
  return current;
}

export function setLocale(next: Locale): void {
  current = next;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, next);
    document.documentElement.lang = next;
  }
  for (const fn of listeners) fn();
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Etkin dil — değişince bileşen yeniden çizilir */
export function useLocale(): Locale {
  return useSyncExternalStore(subscribe, getLocale, () => DEFAULT_LOCALE);
}

/** Intl API'lerine verilecek dil etiketi (tarih/sayı biçimi) */
export function intlTag(locale: Locale = getLocale()): string {
  return INTL_TAG[locale];
}

type Vars = Record<string, string | number>;

/**
 * Anahtarı etkin dile çevirir. Sözlükte yoksa İngilizcesine, o da yoksa
 * anahtarın kendisine düşer — eksik çeviri ekranı boş bırakmaz.
 * `{ad}` yer tutucuları vars ile doldurulur.
 */
export function translate(
  key: MessageKey,
  vars?: Vars,
  locale: Locale = getLocale()
): string {
  const dict = messages[locale] as Partial<Record<MessageKey, string>>;
  let text = dict[key] ?? messages.en[key] ?? key;
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      text = text.split(`{${name}}`).join(String(value));
    }
  }
  return text;
}

/** Bileşen içinde çeviri — dil değişince bileşen kendiliğinden yenilenir */
export function useT(): (key: MessageKey, vars?: Vars) => string {
  const locale = useLocale();
  return (key, vars) => translate(key, vars, locale);
}

export type { MessageKey };
