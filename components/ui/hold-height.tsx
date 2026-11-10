"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Anahtar değişince içeriğin eski yüksekliğini bir süre korur.
 *
 * Analiz'de dönem değişince yerin paneli baştan kuruluyor (key) ve verisi
 * gelene kadar hiçbir şey çizmiyor; sayfa bir anlığına kısalınca tarayıcı
 * kaydırmayı başa kırpıyordu — aşağıdaki istatistiklere bakarken zamanı
 * oynatan her dokunuşta başa fırlatılıyordu. Yükseklik aynı çizimde
 * (anahtarın değiştiği) tutulur; içerik yeniden boyunu bulunca ya da
 * yerleşip durunca bırakılır. İçerik gerçekten kısaldıysa sayfa o zaman
 * kısalır.
 */
export function HoldHeight({ holdKey, children }: { holdKey: string; children: ReactNode }) {
  const inner = useRef<HTMLDivElement>(null);
  // İçeriğin kendi (tutulmamış) yüksekliği; -1: anahtar değişti, henüz ölçülmedi
  const [h, setH] = useState(0);
  const [held, setHeld] = useState<number | null>(null);
  const [prevKey, setPrevKey] = useState(holdKey);
  if (prevKey !== holdKey) {
    setPrevKey(holdKey);
    // Eski boy, ölçülmüşse; ölçüm baştan — eski boyla hemen bırakılmasın
    setHeld(h > 0 ? h : held);
    setH(-1);
  }

  useEffect(() => {
    const el = inner.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setH(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // İçerik eski boyuna döndüyse hemen, yoksa boyu yerleşip durunca bırak
  // (her değişimde süre baştan); hiç gelmezse (boş dönem) en geç birkaç saniyede
  useEffect(() => {
    if (held === null) return;
    const t = setTimeout(() => setHeld(null), h >= held ? 0 : h > 0 ? 700 : 3000);
    return () => clearTimeout(t);
  }, [held, h]);

  return (
    <div style={held !== null ? { minHeight: held } : undefined}>
      <div ref={inner}>{children}</div>
    </div>
  );
}
