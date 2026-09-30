"use client";

import { useEffect, useRef, useState } from "react";

/**
 * İçeriği görünür alana yaklaşınca çizer — ağır, ekranın aşağısında kalan
 * bölümler için (grafikler, uzun listeler).
 *
 * Analiz açılırken kategori detayı ve girdi listeleri ekranın altında kalıyor
 * ama grafikleriyle birlikte hepsi o anda çiziliyordu; ilk görüntü onları
 * bekliyordu. Artık yer tutucu duruyor, kullanıcı kaydırıp `margin` kadar
 * yaklaşınca içerik çiziliyor. Pay geniş (varsayılan ~1 ekran): hızlı
 * kaydırmada bile boş alan görünmesin.
 *
 * Bir kez çizilen içerik kalır — yukarı çıkıp inince yeniden kurulmaz.
 * `minHeight` yer tutucunun boyu: içeriğin yaklaşık boyu verilirse sayfanın
 * kaydırma çubuğu sonradan zıplamaz.
 */
export function LazyMount({
  children,
  minHeight = 320,
  margin = "900px",
}: {
  children: React.ReactNode;
  minHeight?: number;
  margin?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (shown) return;
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin: `${margin} 0px` }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [shown, margin]);

  if (shown) return <>{children}</>;
  return <div ref={ref} aria-hidden style={{ minHeight }} />;
}
