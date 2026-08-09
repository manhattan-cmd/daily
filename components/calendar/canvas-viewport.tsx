"use client";

import { useEffect, useRef, useState } from "react";
import { Locate } from "lucide-react";

/** Sığdırılmış hale göre en çok bu kadar yakınlaşılır */
const MAX_ZOOM = 2.5;
/** Pencere yüksekliği — telefonda sheet'in geri kalanına yer bırakır */
const FRAME_H = 360;

/**
 * Ağın gezinilebilir penceresi.
 *
 * Sınırın kuralı: AÇILIŞ HALİ EN UZAK HALDİR. Şekil pencereye sığdırılıp
 * ortalanmış olarak gelir; daha fazla uzaklaşmak yok, çünkü uzaklaştıkça
 * şekil küçülüp okunmaz hale geliyor ve kullanıcı boşlukta kayboluyordu.
 * Yakınlaşmak serbest (2.5 katına kadar), kaydırma da yalnız yakınlaşılmış
 * haldeyken anlamlı — sığan bir şekli kaydırmak onu ekrandan çıkarmaktan
 * başka işe yaramaz, o yüzden o durumda kaydırma kilitli.
 *
 * Düğümlerin kendi dokunma/basılı-tutma davranışı var; kaydırma yalnız boş
 * alandan başlar (`data-net-node` taşıyanlar hariç).
 */
export function CanvasViewport({
  width,
  height,
  /** Değişince görünüm sıfırlanır — başka bir düğüme geçildi demektir */
  resetKey,
  children,
}: {
  width: number;
  height: number;
  resetKey: string;
  children: React.ReactNode;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [frame, setFrame] = useState({ w: 0, h: FRAME_H });
  /** Sığdırılmış hale göre kaç kat — 1 = açılış hali */
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const r = e.contentRect;
      if (r.width > 0) setFrame({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Yeni sayfaya geçince sıfırla — render sırasında, effect turu beklemesin
  const [prevKey, setPrevKey] = useState(resetKey);
  if (prevKey !== resetKey) {
    setPrevKey(resetKey);
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }

  /** Şekli pencereye tam sığdıran ölçek — asla büyütmez, yalnız küçültür */
  const fit =
    frame.w > 0 && width > 0
      ? Math.min(1, frame.w / width, frame.h / height)
      : 1;
  const scale = fit * zoom;

  /** Taşan kısmın yarısı kadar kaydırılabilir; sığıyorsa hiç */
  const clamp = (p: { x: number; y: number }) => {
    const overX = Math.max(0, (width * scale - frame.w) / 2);
    const overY = Math.max(0, (height * scale - frame.h) / 2);
    return {
      x: Math.max(-overX, Math.min(overX, p.x)),
      y: Math.max(-overY, Math.min(overY, p.y)),
    };
  };

  const zoomBy = (factor: number) =>
    setZoom((z) => {
      const next = Math.max(1, Math.min(MAX_ZOOM, z * factor));
      setPan((p) => clampAt(p, fit * next));
      return next;
    });

  // clamp'in ölçeği parametreden alan hali — setZoom içinde güncel scale yok
  const clampAt = (p: { x: number; y: number }, s: number) => {
    const overX = Math.max(0, (width * s - frame.w) / 2);
    const overY = Math.max(0, (height * s - frame.h) / 2);
    return {
      x: Math.max(-overX, Math.min(overX, p.x)),
      y: Math.max(-overY, Math.min(overY, p.y)),
    };
  };

  // ── Sürükleme + iki parmakla yakınlaştırma ────────────────────────────
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const start = useRef<{
    pan: { x: number; y: number };
    zoom: number;
    dist: number;
    mid: { x: number; y: number };
  } | null>(null);

  const midOf = () => {
    const pts = [...pointers.current.values()];
    if (!pts.length) return { x: 0, y: 0 };
    return {
      x: pts.reduce((a, p) => a + p.x, 0) / pts.length,
      y: pts.reduce((a, p) => a + p.y, 0) / pts.length,
    };
  };
  const distOf = () => {
    const [a, b] = [...pointers.current.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };

  const onDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("[data-net-node]")) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    e.currentTarget.setPointerCapture(e.pointerId);
    start.current = {
      pan,
      zoom,
      dist: pointers.current.size === 2 ? distOf() : 0,
      mid: midOf(),
    };
  };

  const onMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId) || !start.current) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = start.current;
    const mid = midOf();
    const moved = { x: g.pan.x + mid.x - g.mid.x, y: g.pan.y + mid.y - g.mid.y };

    if (pointers.current.size === 2 && g.dist > 0) {
      const next = Math.max(1, Math.min(MAX_ZOOM, g.zoom * (distOf() / g.dist)));
      setZoom(next);
      setPan(clampAt(moved, fit * next));
      return;
    }
    setPan(clamp(moved));
  };

  const onUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    start.current = pointers.current.size
      ? { pan, zoom, dist: 0, mid: midOf() }
      : null;
  };

  const moved = zoom !== 1 || pan.x !== 0 || pan.y !== 0;

  return (
    <div className="relative">
      <div
        ref={frameRef}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onWheel={(e) => zoomBy(e.deltaY < 0 ? 1.12 : 1 / 1.12)}
        className="relative overflow-hidden overscroll-contain touch-none"
        style={{ height: FRAME_H }}
      >
        {/* Şekil pencerenin ortasında durur; ölçek ve kaydırma onun üstüne
            biner — böylece "ortala" gerçekten başlangıç haline döner */}
        <div
          className="absolute left-1/2 top-1/2 will-change-transform"
          style={{
            width,
            height,
            marginLeft: -width / 2,
            marginTop: -height / 2,
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
          }}
        >
          {children}
        </div>
      </div>

      {/* Yakınlaştırma düğmesi yok — parmakla yapılıyor. Yalnız kullanıcı
          şekli oynattığında bir dönüş yolu beliriyor; hiç oynatmadıysa
          ekranda duracak bir şey de yok. */}
      {moved && (
        <button
          type="button"
          onClick={() => {
            setZoom(1);
            setPan({ x: 0, y: 0 });
          }}
          aria-label="Ortala"
          className="absolute bottom-1 right-1 flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card/85 text-muted-foreground backdrop-blur transition-colors hover:text-foreground"
        >
          <Locate className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
