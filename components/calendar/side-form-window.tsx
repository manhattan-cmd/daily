"use client";

import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { RAIL_COMPACT_W } from "@/components/calendar/entry-picker";

/**
 * Pencere hâlinde üst kenar: boydan kısa, ekranın alt dörtte üçünde durur —
 * başparmağın eriştiği yarıda; üstte seçici ve ray görünür kalır.
 */
const WINDOW_TOP = "26%";
const GAP = 8;

/**
 * Girdi formunun PENCERESİ. Ray sağda (sağ başparmak); form soldan gelir ve
 * rayın yanında, boydan kısa bir pencere olarak durur.
 *
 * Hareketler:
 * - sola kaydır → pencere sola çekilip kapanır (forma girmeden seçiciye)
 * - tutamaçtan / başlıktan yukarı çek → tam ekran; tam ekrandan aşağı çek →
 *   yeniden pencere. Tutamaca dokunmak da ikisi arasında geçer.
 *
 * Kaydırma sırasında her karede React çizmesin diye parmağı izleyen
 * dönüşüm doğrudan öğeye yazılıyor; kalıcı durum yalnız tam ekran mı değil mi.
 */
export function SideFormWindow({
  children,
  onDismiss,
}: {
  children: React.ReactNode;
  /** Sola kaydırarak kapatıldı */
  onDismiss: () => void;
}) {
  const t = useT();
  const [full, setFull] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<{
    id: number;
    x: number;
    y: number;
    t: number;
    axis: "x" | "y" | null;
    fromTop: boolean;
    onGrip: boolean;
  } | null>(null);
  // Sürükleme biten dokunuşun "tıklama"sı bir düğmeyi tetiklemesin
  const dragged = useRef(false);
  const closing = useRef(false);

  function setTransform(v: string, animate: boolean) {
    const el = boxRef.current;
    if (!el) return;
    el.style.transition = animate
      ? "transform 260ms cubic-bezier(0.2, 0.8, 0.2, 1), " + GEOMETRY_TRANSITION
      : GEOMETRY_TRANSITION;
    el.style.transform = v;
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (closing.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const target = e.target as Element;
    const onGrip = !!target.closest("[data-grip]");
    gesture.current = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      t: e.timeStamp,
      axis: null,
      // Dikey çekiş yalnız tutamaçtan ya da başlıktan: içerikte yukarı
      // kaydırmak formun kendi kaydırması
      fromTop: onGrip || e.clientY - rect.top < 92,
      onGrip,
    };
    dragged.current = false;
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    const mx = e.clientX - g.x;
    const my = e.clientY - g.y;
    if (!g.axis) {
      if (Math.abs(mx) < 8 && Math.abs(my) < 8) return;
      if (Math.abs(mx) > Math.abs(my) && mx < 0) g.axis = "x";
      else if (g.fromTop && Math.abs(my) > Math.abs(mx)) g.axis = "y";
      else {
        gesture.current = null;
        return;
      }
      dragged.current = true;
      e.currentTarget.setPointerCapture?.(e.pointerId);
    }
    if (g.axis === "x") setTransform(`translateX(${Math.min(0, mx)}px)`, false);
    else {
      // Gidilebilecek yöne serbest, öbür yöne dirençli
      const toward = full ? Math.max(0, my) : Math.min(0, my);
      setTransform(`translateY(${toward * 0.5}px)`, false);
    }
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    gesture.current = null;
    if (!g) return;
    // Tutamaca dokunuş (sürüklemeden): pencere ↔ tam ekran. Dokunmatikte
    // tutamağın tıklama olayı güvenilir gelmediği için burada yakalanıyor.
    if (!g.axis) {
      if (g.onGrip) setFull((f) => !f);
      return;
    }
    const mx = e.clientX - g.x;
    const my = e.clientY - g.y;
    const dt = Math.max(1, e.timeStamp - g.t);
    if (g.axis === "x") {
      const w = boxRef.current?.offsetWidth ?? 320;
      if (mx < -w * 0.3 || mx / dt < -0.5) {
        closing.current = true;
        setTransform(`translateX(${-w - 2 * GAP}px)`, true);
        setTimeout(onDismiss, 220);
      } else setTransform("none", true);
      return;
    }
    if (!full && (my < -56 || my / dt < -0.5)) setFull(true);
    else if (full && (my > 56 || my / dt > 0.5)) setFull(false);
    setTransform("none", true);
  }

  function onPointerCancel() {
    if (!gesture.current) return;
    gesture.current = null;
    setTransform("none", true);
  }

  return (
    <div
      ref={boxRef}
      data-side-form
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onClickCapture={(e) => {
        if (!dragged.current) return;
        dragged.current = false;
        e.preventDefault();
        e.stopPropagation();
      }}
      className={cn(
        "form-slide-in-left absolute z-50 flex flex-col overflow-hidden border-[var(--ln-2)] bg-background",
        full
          ? "border-0"
          : "border shadow-[0_28px_60px_-24px_rgba(0,0,0,0.95)]"
      )}
      style={{
        transition: GEOMETRY_TRANSITION,
        top: full ? 0 : WINDOW_TOP,
        bottom: full ? 0 : `calc(env(safe-area-inset-bottom, 0px) + ${GAP + 4}px)`,
        left: full ? 0 : GAP,
        right: full ? 0 : RAIL_COMPACT_W + GAP / 2,
        borderRadius: full ? 0 : 28,
      }}
    >
      {/* Tutamaç — yukarı çek: tam ekran, aşağı çek: pencere; dokunmak
          ikisi arasında geçer */}
      <button
        type="button"
        data-grip
        // Klavyeyle (Enter/Boşluk) geçiş; dokunuş onPointerUp'ta
        onClick={(e) => {
          if (e.detail === 0) setFull((f) => !f);
        }}
        aria-label={full ? t("entry.windowed") : t("entry.fullscreen")}
        className="flex h-5 shrink-0 cursor-grab touch-none items-end justify-center"
      >
        <span className="h-1 w-10 rounded-full bg-[var(--ln-2)]" />
      </button>
      <div className="relative flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}

const GEOMETRY_TRANSITION =
  "top 320ms cubic-bezier(0.2, 0.8, 0.2, 1), bottom 320ms cubic-bezier(0.2, 0.8, 0.2, 1), left 320ms cubic-bezier(0.2, 0.8, 0.2, 1), right 320ms cubic-bezier(0.2, 0.8, 0.2, 1), border-radius 320ms";
