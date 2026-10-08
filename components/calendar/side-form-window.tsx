"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { RAIL_COMPACT_W } from "@/components/calendar/entry-picker";

/**
 * Pencere hâlinde üst kenar = seçicinin üst çubuğunun altı = rayın başladığı
 * yer (form açıkken arama satırı kapanıyor). Pencere ile ray aynı hizadan
 * başlayıp ekranın altına iniyor: yan yana iki sütun, ekran bir bütün.
 * (Üst çubuk: 12 px üst boşluk + 40 px düğme + 4 px alt boşluk.)
 */
const WINDOW_TOP = 56;
const GAP = 8;
/** Bu kadar üst bölgeden (tutamaç + başlık) dikey çekiş pencereyi büyütür */
const TOP_ZONE = 100;

/**
 * Girdi formunun PENCERESİ. Ray sağda (sağ başparmak); form soldan gelir ve
 * rayın yanında, dikeyde ortalanmış kısa bir pencere olarak durur.
 *
 * Hareketler:
 * - sola kaydır → pencere sola çekilip kapanır (forma girmeden seçiciye)
 * - tutamaçtan / başlıktan yukarı çek → tam ekran; tam ekrandan aşağı çek →
 *   yeniden pencere. Tutamaca dokunmak da ikisi arasında geçer.
 *
 * Dokunmatikte İŞARETÇİ (pointer) olayları değil DOKUNMA olayları
 * dinleniyor: parmak hafif çapraz başlayınca tarayıcı hareketi kendi
 * kaydırması sayıp işaretçiyi iptal ediyordu (telefonda sola kaydırma hiç
 * tutmuyordu). Dokunma olayında yön belli olunca tarayıcının kaydırması
 * durduruluyor (preventDefault), hareket bütünüyle pencerenin oluyor.
 *
 * Kaydırma sırasında her karede React çizmesin diye parmağı izleyen dönüşüm
 * doğrudan öğeye yazılıyor; kalıcı durum yalnız tam ekran mı değil mi.
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
  // Yerel dinleyiciler bir kez kuruluyor; değişen değerler ref'lerden okunur
  const fullRef = useRef(full);
  const dismissRef = useRef(onDismiss);
  useEffect(() => {
    fullRef.current = full;
    dismissRef.current = onDismiss;
  });
  // Sürükleme biten dokunuşun "tıklama"sı bir düğmeyi tetiklemesin
  const dragged = useRef(false);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    let g: {
      x: number;
      y: number;
      t: number;
      axis: "x" | "y" | null;
      fromTop: boolean;
      onGrip: boolean;
    } | null = null;
    let closing = false;

    const setTransform = (v: string, animate: boolean) => {
      el.style.transition = animate
        ? "transform 260ms cubic-bezier(0.2, 0.8, 0.2, 1), " + GEOMETRY_TRANSITION
        : GEOMETRY_TRANSITION;
      el.style.transform = v;
    };

    const start = (x: number, y: number, time: number, target: EventTarget | null) => {
      if (closing) return;
      const onGrip = !!(target as Element | null)?.closest?.("[data-grip]");
      g = {
        x,
        y,
        t: time,
        axis: null,
        // Dikey çekiş yalnız üst bölgeden: içerikte yukarı kaydırmak formun
        // kendi kaydırması
        fromTop: onGrip || y - el.getBoundingClientRect().top < TOP_ZONE,
        onGrip,
      };
      dragged.current = false;
    };

    /** true: hareket pencerenin — tarayıcı kaydırmasın */
    const move = (x: number, y: number): boolean => {
      if (!g) return false;
      const mx = x - g.x;
      const my = y - g.y;
      if (!g.axis) {
        if (Math.abs(mx) < 6 && Math.abs(my) < 6) return false;
        // Sola doğru ve yataya yakın (biraz çapraz da sayılır)
        if (mx < 0 && Math.abs(mx) > Math.abs(my) * 0.75) g.axis = "x";
        else if (g.fromTop && Math.abs(my) >= Math.abs(mx)) g.axis = "y";
        else {
          g = null;
          return false;
        }
        dragged.current = true;
      }
      if (g.axis === "x") setTransform(`translateX(${Math.min(0, mx)}px)`, false);
      else {
        // Yalnız gidilebilecek yöne: pencereyken yukarı, tam ekranken aşağı
        const v = fullRef.current ? Math.max(0, my) : Math.min(0, my);
        setTransform(`translateY(${v}px)`, false);
      }
      return true;
    };

    const end = (x: number, y: number, time: number) => {
      const s = g;
      g = null;
      if (!s) return;
      // Tutamaca dokunuş (sürüklemeden): pencere ↔ tam ekran
      if (!s.axis) {
        if (s.onGrip) setFull((f) => !f);
        return;
      }
      const mx = x - s.x;
      const my = y - s.y;
      const v = (s.axis === "x" ? mx : my) / Math.max(1, time - s.t);
      if (s.axis === "x") {
        const w = el.offsetWidth;
        if (mx < -w * 0.25 || v < -0.35) {
          closing = true;
          setTransform(`translateX(${-w - 2 * GAP}px)`, true);
          setTimeout(() => dismissRef.current(), 220);
        } else setTransform("none", true);
        return;
      }
      if (!fullRef.current && (my < -40 || v < -0.35)) setFull(true);
      else if (fullRef.current && (my > 40 || v > 0.35)) setFull(false);
      setTransform("none", true);
    };

    const cancel = () => {
      if (!g) return;
      g = null;
      setTransform("none", true);
    };

    // Dokunmatik
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return cancel();
      const p = e.touches[0];
      start(p.clientX, p.clientY, e.timeStamp, e.target);
    };
    const onTouchMove = (e: TouchEvent) => {
      const p = e.touches[0];
      if (p && move(p.clientX, p.clientY) && e.cancelable) e.preventDefault();
    };
    const onTouchEnd = (e: TouchEvent) => {
      const p = e.changedTouches[0];
      if (p) end(p.clientX, p.clientY, e.timeStamp);
    };
    // Fare (masaüstü) — dokunuş zaten yukarıda
    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      start(e.clientX, e.clientY, e.timeStamp, e.target);
    };
    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && move(e.clientX, e.clientY))
        el.setPointerCapture?.(e.pointerId);
    };
    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerType === "mouse") end(e.clientX, e.clientY, e.timeStamp);
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", cancel);
    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", onPointerUp);
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", cancel);
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", onPointerUp);
    };
  }, []);

  return (
    <div
      ref={boxRef}
      data-side-form
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
        bottom: full ? 0 : `calc(env(safe-area-inset-bottom, 0px) + ${GAP}px)`,
        left: full ? 0 : GAP,
        right: full ? 0 : RAIL_COMPACT_W + GAP / 2,
        borderRadius: full ? 0 : 26,
      }}
    >
      {/* Tutamaç — yukarı çek: tam ekran, aşağı çek: pencere; dokunmak
          ikisi arasında geçer. Dokunuş yerel dinleyicide; bu tıklama
          klavye (Enter/Boşluk) içindir. */}
      <button
        type="button"
        data-grip
        onClick={(e) => {
          if (e.detail === 0) setFull((f) => !f);
        }}
        aria-label={full ? t("entry.windowed") : t("entry.fullscreen")}
        className="flex h-5 shrink-0 cursor-grab touch-none items-center justify-center"
      >
        <span className="h-1 w-10 rounded-full bg-[var(--ln-2)]" />
      </button>
      <div className="relative flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}

const GEOMETRY_TRANSITION =
  "top 320ms cubic-bezier(0.2, 0.8, 0.2, 1), bottom 320ms cubic-bezier(0.2, 0.8, 0.2, 1), left 320ms cubic-bezier(0.2, 0.8, 0.2, 1), right 320ms cubic-bezier(0.2, 0.8, 0.2, 1), border-radius 320ms";
