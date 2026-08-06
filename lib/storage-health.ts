"use client";

import { useSyncExternalStore } from "react";

/**
 * Cihazdaki verinin dayanıklılığı.
 *
 * IndexedDB varsayılan olarak KALICI DEĞİL — tarayıcının atabileceği bir
 * önbellektir: iOS'ta ana ekrana eklenmemiş bir site 7 gün açılmazsa verisi
 * silinir, Android'de depolama dolduğunda "kalıcı" işaretlenmemiş siteler önce
 * boşaltılır. Uygulama mağaza sürümüne taşınana kadar (native kabuk içinde bu
 * sınırlar geçerli değil) tek korumamız kalıcılık izni + yedek.
 */

export interface StorageHealth {
  /** Tarayıcı kalıcı depolama sözü verdi mi */
  persisted: boolean;
  /** Kullanılan alan (bayt) */
  usage?: number;
  /** Tarayıcının ayırdığı kota (bayt) */
  quota?: number;
  /** Uygulama ana ekrana eklenmiş / bağımsız pencerede mi çalışıyor */
  standalone: boolean;
  /** API hiç yok (eski tarayıcı) */
  supported: boolean;
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari'nin kendi bayrağı
    (window.navigator as { standalone?: boolean }).standalone === true
  );
}

/**
 * Kalıcılık ister ve sonucu döner. Tarayıcı kendi kriterine göre karar verir
 * (Chrome: kurulu ya da sık kullanılan siteler; Safari: ana ekrana eklenmişse).
 * Reddedilmesi hata değil — kullanıcıya yedek almasını hatırlatmak için sinyal.
 */
export async function ensurePersistentStorage(): Promise<StorageHealth> {
  if (typeof navigator === "undefined" || !navigator.storage) {
    return { persisted: false, standalone: isStandalone(), supported: false };
  }
  let persisted = false;
  try {
    persisted = (await navigator.storage.persisted?.()) ?? false;
    if (!persisted && navigator.storage.persist) {
      persisted = await navigator.storage.persist();
    }
  } catch {
    // İzin akışı olmayan tarayıcılar — sessizce geç
  }
  let usage: number | undefined;
  let quota: number | undefined;
  try {
    const est = await navigator.storage.estimate?.();
    usage = est?.usage;
    quota = est?.quota;
  } catch {}
  return {
    persisted,
    usage,
    quota,
    standalone: isStandalone(),
    supported: true,
  };
}

export function formatBytes(n?: number): string {
  if (n === undefined) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1073741824) return `${(n / 1048576).toFixed(1)} MB`;
  return `${(n / 1073741824).toFixed(2)} GB`;
}

// ─── Son yedek zamanı ────────────────────────────────────────────────────────
// Cihaza özel bir bilgi (veriyle birlikte taşınmamalı) — localStorage'da durur.

const LAST_BACKUP_KEY = "routine:lastBackupAt";
const listeners = new Set<() => void>();

function read(): number | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(LAST_BACKUP_KEY);
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) ? n : null;
}

export function markBackupTaken(at = Date.now()): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LAST_BACKUP_KEY, String(at));
  for (const fn of listeners) fn();
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  window.addEventListener("storage", fn);
  return () => {
    listeners.delete(fn);
    window.removeEventListener("storage", fn);
  };
}

/** Son yedeğin zamanı (ms) — hiç alınmadıysa null */
export function useLastBackupAt(): number | null {
  return useSyncExternalStore(
    subscribe,
    read,
    () => null // sunucuda bilinmiyor
  );
}

export function daysSince(ts: number): number {
  return Math.floor((Date.now() - ts) / 86400000);
}

// ─── Yedek hatırlatıcısı ─────────────────────────────────────────────────────

/** Bu kadar günden eski yedek "eski" sayılır */
const STALE_DAYS = 14;
/** Hatırlatıcı kapatılınca bu kadar susar */
const SNOOZE_MS = 7 * 86400000;
const SNOOZE_KEY = "routine:backupReminderSnoozedAt";

/** "never": hiç yedek yok · "stale": eskimiş · "hidden": gösterme */
export type BackupReminderState = "never" | "stale" | "hidden";

/**
 * Zaman okuması bilerek burada: render sırasında Date.now() çağırmak
 * bileşeni saf olmaktan çıkarır, store anlık görüntüsü ise güvenli yer.
 */
function reminderSnapshot(): BackupReminderState {
  if (typeof window === "undefined") return "hidden";
  const snoozedAt = Number(window.localStorage.getItem(SNOOZE_KEY) ?? 0);
  if (snoozedAt > 0 && Date.now() - snoozedAt < SNOOZE_MS) return "hidden";
  const last = read();
  if (last === null) return "never";
  return daysSince(last) >= STALE_DAYS ? "stale" : "hidden";
}

export function useBackupReminder(): BackupReminderState {
  return useSyncExternalStore(subscribe, reminderSnapshot, () => "hidden");
}

export function snoozeBackupReminder(): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SNOOZE_KEY, String(Date.now()));
  for (const fn of listeners) fn();
}

/** "3 gün önce" / "bugün" */
export function agoLabel(ts: number): string {
  const d = daysSince(ts);
  if (d <= 0) return "today";
  if (d === 1) return "yesterday";
  return `${d} days ago`;
}
