"use client";

import { useEffect, useRef, useState } from "react";
import { Locate, Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

const MIN_SCALE = 0.6;
const MAX_SCALE = 2;
/** Tuvalin bu kadarı hep ekranda kalır — tamamen kaçırılamaz */
const KEEP_VISIBLE = 80;

/**
 * Ağın gezinilebilir penceresi — küçük bir uzay.
 *
 * Kalabalık bir kategoride çokgen ekrana sığmıyor, sığdırmak için küçültmek
 * de etiketleri okunmaz yapıyor. Onun yerine pencere: sürükle, iki parmakla
 * yakınlaştır, kaybolursan ortala.
 *
 * Sınırlar bilerek dar (0.6×–2×, kenarın bir kısmı hep görünür). Sınırsız
 * bırakınca kullanıcı boşlukta kayboluyor ve geri dönüş yolunu bulamıyor.
 *
 * Düğümlerin kendi dokunma/basılı-tutma davranışı var; kaydırma yalnız boş
 * alandan başlar (`data-net-node` taşıyanlar hariç), yoksa bir kalemi
 * taşımak isterken tuval kayıyordu.
 */
export function CanvasViewport({
  /** Tuvalin kare kenarı (px) */
  size,
  /** Değişince görünüm sıfırlanır — başka bir düğüme geçildi demektir */
  resetKey,
  children,
}: {
  size: number;
  resetKey: string;
  children: React.ReactNode;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [frameW, setFrameW] = useState(0);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      if (e.contentRect.width > 0) setFrameW(e.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Yeni sayfaya geçince sıfırla — render sırasında, effect turu beklemesin
  const [prevKey, setPrevKey] = useState(resetKey);
  if (prevKey !== resetKey) {
    setPrevKey(resetKey);
    setScale(1);
    setPan({ x: 0, y: 0 });
  }

  const clamp = (p: { x: number; y: number }, s: number) => {
    const half = (size * s) / 2;
    const limitX = Math.max(0, half + frameW / 2 - KEEP_VISIBLE);
    const limitY = Math.max(0, half + frameW / 2 - KEEP_VISIBLE);
    return {
      x: Math.max(-limitX, Math.min(limitX, p.x)),
      y: Math.max(-limitY, Math.min(limitY, p.y)),
    };
  };

  const zoomBy = (factor: number) =>
    setScale((s) => {
      const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, s * factor));
      setPan((p) => clamp(p, next));
      return next;
    });

  // ── Sürükleme + iki parmakla yakınlaştırma ────────────────────────────
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const start = useRef<{
    pan: { x: number; y: number };
    scale: number;
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
      scale,
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
      const next = Math.max(
        MIN_SCALE,
        Math.min(MAX_SCALE, g.scale * (distOf() / g.dist))
      );
      setScale(next);
      setPan(clamp(moved, next));
      return;
    }
    setPan(clamp(moved, scale));
  };

  const onUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    start.current = pointers.current.size
      ? { pan, scale, dist: 0, mid: midOf() }
      : null;
  };

  const moved = pan.x !== 0 || pan.y !== 0 || scale !== 1;

  return (
    <div className="relative">
      <div
        ref={frameRef}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onWheel={(e) => zoomBy(e.deltaY < 0 ? 1.1 : 1 / 1.1)}
        className="relative overflow-hidden overscroll-contain touch-none"
        style={{ height: size }}
      >
        <div
          className="absolute inset-0 origin-center will-change-transform"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
          }}
        >
          {children}
        </div>
      </div>

      {/* Parmakla da yapılabiliyor ama görünür bir çıkış yolu olmalı —
          kaybolan kullanıcı buraya bakıyor */}
      <div className="pointer-events-none absolute bottom-1 right-1 flex flex-col gap-1">
        <ViewBtn onClick={() => zoomBy(1.25)} label="+" off={scale >= MAX_SCALE}>
          <Plus className="h-3.5 w-3.5" />
        </ViewBtn>
        <ViewBtn onClick={() => zoomBy(0.8)} label="−" off={scale <= MIN_SCALE}>
          <Minus className="h-3.5 w-3.5" />
        </ViewBtn>
        <ViewBtn
          onClick={() => {
            setScale(1);
            setPan({ x: 0, y: 0 });
          }}
          label="Ortala"
          off={!moved}
        >
          <Locate className="h-3.5 w-3.5" />
        </ViewBtn>
      </div>
    </div>
  );
}

function ViewBtn({
  onClick,
  label,
  off,
  children,
}: {
  onClick: () => void;
  label: string;
  off?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={off}
      aria-label={label}
      className={cn(
        "pointer-events-auto flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-card/85 text-muted-foreground backdrop-blur transition-colors",
        off ? "opacity-25" : "hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}
