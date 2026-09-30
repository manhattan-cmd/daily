"use client";

import { useEffect, useState } from "react";

/** Alttan açılan pencerelerin kayma animasyonunun süresi (duration-300) */
const EXIT_MS = 300;

/**
 * Alttan açılan pencere yalnız AÇIKKEN (ve kapanış animasyonu boyunca)
 * DOM'da dursun.
 *
 * Pencereler kapalıyken de kurulu kalıp ekranın altına kaydırılıyordu:
 * içindeki kategori seçici tamamen çiziliyor, canlı sorguları her veri
 * değişikliğinde yeniden çalışıyordu. Ana sayfanın ve gün sayfasının her
 * açılışı bunu da ödüyordu; hedef düzenleme penceresi her hedef kartında
 * ayrı kuruluyordu.
 *
 * Kayma animasyonu korunuyor:
 *   açılış — önce kapalı konumda bir kare çizilir, sonraki karede açık
 *            konuma geçilir (CSS geçişi oynar);
 *   kapanış — aşağı kayar, animasyon bitince DOM'dan çıkar.
 *
 * `visible` pencerenin `open` prop'una verilir; `mounted` false ise pencere
 * hiç çizilmez.
 */
export function useSheetPresence(open: boolean): { mounted: boolean; visible: boolean } {
  // "closed": DOM'da değil · "open": açık konumda (ya da kapanıyor)
  const [phase, setPhase] = useState<"closed" | "open">("closed");

  useEffect(() => {
    if (open) {
      // İki kare bekle: ilki kapalı konumun boyanması, ikincisi geçiş
      let inner = 0;
      const outer = requestAnimationFrame(() => {
        inner = requestAnimationFrame(() => setPhase("open"));
      });
      return () => {
        cancelAnimationFrame(outer);
        cancelAnimationFrame(inner);
      };
    }
    const t = window.setTimeout(() => setPhase("closed"), EXIT_MS);
    return () => window.clearTimeout(t);
  }, [open]);

  return { mounted: open || phase === "open", visible: open && phase === "open" };
}
