"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Yatay kaydırılan sıralar (sekmeler, çipler, breadcrumb) — telefonda parmakla
 * kaydırılıyordu ama farede yatay kaydırmanın yolu yoktu. Burada iki ek var,
 * ikisi de dokunmatik davranışa dokunmuyor:
 *
 * - Dikey tekerlek yatay kaydırmaya çevrilir (dokunmatik `wheel` üretmez).
 *   Sıra ucuna dayandığında olay bırakılır, sayfa dikey kaymaya devam eder.
 * - Taşma varken kenarlarda ok düğmeleri belirir — yalnız geniş ekranda
 *   (`md:`), yani telefonda hiç çıkmaz.
 */
export function HScroll({
  children,
  className,
  wrapperClassName,
  followEnd,
}: {
  children: React.ReactNode;
  /** Kaydırılan satıra verilir — hizalama/boşluk sınıfları buraya */
  className?: string;
  wrapperClassName?: string;
  /** Değişince sıra sonuna kaydırılır — derinleşen bir yolda son basamak
   *  ekrandan çıkıyordu, kullanıcı nerede olduğunu göremiyordu */
  followEnd?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  useEffect(() => {
    if (followEnd === undefined) return;
    const el = ref.current;
    if (!el) return;
    el.scrollTo({ left: el.scrollWidth, behavior: "smooth" });
  }, [followEnd]);

  const sync = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setEdges({
      left: el.scrollLeft > 1,
      right: max > 1 && el.scrollLeft < max - 1,
    });
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      // Yatay jest (trackpad) zaten çalışıyor — karışma
      if (e.deltaY === 0 || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      const max = el.scrollWidth - el.clientWidth;
      if (max <= 1) return;
      // Uçtaysa olayı bırak: sayfanın dikey kaydırması kesilmesin
      if ((e.deltaY < 0 && el.scrollLeft <= 0) || (e.deltaY > 0 && el.scrollLeft >= max - 1))
        return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("scroll", sync, { passive: true });
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    for (const child of Array.from(el.children)) ro.observe(child);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("scroll", sync);
      ro.disconnect();
    };
  }, [sync]);

  const nudge = (dir: -1 | 1) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(120, el.clientWidth * 0.7), behavior: "smooth" });
  };

  return (
    <div className={cn("relative", wrapperClassName)}>
      <div
        ref={ref}
        className={cn("no-scrollbar flex overflow-x-auto", className)}
      >
        {children}
      </div>
      <Arrow side="left" show={edges.left} onClick={() => nudge(-1)} />
      <Arrow side="right" show={edges.right} onClick={() => nudge(1)} />
    </div>
  );
}

function Arrow({
  side,
  show,
  onClick,
}: {
  side: "left" | "right";
  show: boolean;
  onClick: () => void;
}) {
  if (!show) return null;
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === "left" ? "Sola kaydır" : "Sağa kaydır"}
      className={cn(
        "absolute top-1/2 z-10 hidden h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full",
        "border border-white/10 bg-background/85 text-muted-foreground shadow-lg backdrop-blur-sm",
        "transition-colors hover:text-foreground md:flex",
        side === "left" ? "left-0.5" : "right-0.5"
      )}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}
