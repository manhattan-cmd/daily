import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const p2 = (n: number) => String(n).padStart(2, "0");

/**
 * Form alanları için yerel takvim günü ("YYYY-MM-DD"). toISOString() UTC'ye
 * çevirdiği için gece yarısına yakın saatlerde günü kaydırıyordu.
 */
export function toLocalDateValue(timestamp: number = Date.now()): string {
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}

/**
 * Form alanları için yerel tarih+saat ("YYYY-MM-DDTHH:mm"). `new Date(...)` bu
 * biçimi yerel kabul ettiğinden gidiş-dönüş kayıpsız olur; toISOString ile
 * üretilirse her kayıtta zaman UTC farkı kadar kayıyordu.
 */
export function toLocalDateTimeValue(timestamp: number): string {
  const d = new Date(timestamp);
  return `${toLocalDateValue(timestamp)}T${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

export function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const isToday = date.toDateString() === today.toDateString();
  const isYesterday = date.toDateString() === yesterday.toDateString();

  if (isToday) return "Bugün";
  if (isYesterday) return "Dün";

  return date.toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "short",
    year: date.getFullYear() === today.getFullYear() ? undefined : "numeric",
  });
}

export function formatDateTime(timestamp: number): string {
  return `${formatDate(timestamp)} · ${formatTime(timestamp)}`;
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat("tr-TR").format(n);
}

export function formatMoney(amount: number, currency: string = "TL"): string {
  return `${formatNumber(amount)} ${currency}`;
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} dk`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return `${h} sa`;
  return `${h} sa ${m} dk`;
}
