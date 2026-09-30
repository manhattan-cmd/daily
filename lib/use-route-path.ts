"use client";

import { usePathname } from "next/navigation";

/**
 * Sondaki eğik çizgisi atılmış yol — adresi bir sabitle karşılaştıran her
 * yer (hangi sekme etkin, hangi başlık) bunu kullanmalı.
 *
 * Mobil derleme her sayfayı `sayfa/index.html` olarak üretiyor (trailingSlash,
 * bkz. next.config) ve orada yol `/structure/mods/` geliyor; web'de
 * `/structure/mods`. Doğrudan usePathname ile karşılaştırınca uygulamada
 * hiçbir sekme etkin görünmüyordu.
 */
export function useRoutePath(): string {
  const p = usePathname() ?? "/";
  return p.length > 1 && p.endsWith("/") ? p.slice(0, -1) : p;
}
