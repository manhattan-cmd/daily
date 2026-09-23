"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Analizdeki seçim menüsü — kutuya ya da grafiğe dokununca açılan küçük liste.
 *
 * Tercih artık özelliğin kendi sayfasında değil, BAKILAN YERDE: yürüyüşteki
 * "Süre" ile sprintteki "Süre" başka sorulara cevap veriyor, ikisini de
 * baktığı ekranda seçmek gerekiyor. Sonucu aynı anda gördüğü için seçim
 * denenerek yapılıyor, tahminle değil.
 *
 * Liste GÖVDEYE taşınıyor (portal) ve sabit konumlanıyor: kutular yatay
 * kaydırılan bir sırada duruyor ve o sıranın taşma kapağı normal bir açılır
 * listeyi kırpıyordu. Altta yer yoksa yukarı doğru açılır.
 *
 * Radix yerine elle yazıldı: tek iş için (dışarı tıkla-kapat + Esc) yeni bir
 * bağımlılık ve odak tuzağı taşımaya değmiyor.
 */
export function ViewMenu({
  options,
  value,
  onPick,
  align = "start",
  children,
  label,
}: {
  options: { key: string; label: string; hint?: string }[];
  value: string;
  onPick: (key: string) => void;
  align?: "start" | "end";
  /** Tetikleyici — kutunun ya da grafik başlığının kendisi */
  children: React.ReactNode;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{
    top: number;
    left?: number;
    right?: number;
  } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  /**
   * Konum tıklama anında hesaplanıyor, efekt içinde değil: efektte setState
   * çağırmak zincirleme çizime yol açıyor (lint de haklı olarak uyarıyor).
   * Yükseklik seçenek sayısından tahmin ediliyor — tam ölçmek için önce
   * görünmez çizip sonra yerleştirmek gerekirdi, menü bir kare zıplardı.
   */
  const openAt = () => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const height = Math.min(300, options.length * 46 + 8);
    const below = window.innerHeight - r.bottom;
    const top =
      below < height + 16 ? Math.max(8, r.top - height - 4) : r.bottom + 4;
    setPos(
      align === "end"
        ? { top, right: Math.max(8, window.innerWidth - r.right) }
        : { top, left: Math.max(8, r.left) }
    );
    setOpen(true);
  };


  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    // Sayfa ya da sıra kaydırılınca menü havada kalmasın. Dinleyici kısa bir
    // gecikmeyle bağlanıyor: kutuyu görünür kılmak için yapılan kaydırma
    // (tarayıcının kendi "scroll into view"u) menüyü daha açılır açılmaz
    // kapatıyordu.
    const onScroll = () => setOpen(false);
    const timer = window.setTimeout(
      () => window.addEventListener("scroll", onScroll, true),
      300
    );
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  if (options.length < 2) return <>{children}</>;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openAt())}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        className="block h-full w-full text-left"
      >
        {children}
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            role="listbox"
            style={{ position: "fixed", ...(pos ?? { top: -9999, left: 0 }) }}
            className={cn(
              "animate-in z-[60] max-h-[300px] min-w-[190px] max-w-[260px] overflow-y-auto overscroll-contain",
              "rounded-xl border border-border bg-card shadow-xl"
            )}
          >
            {options.map((o) => {
              const on = o.key === value;
              return (
                <button
                  key={o.key}
                  type="button"
                  role="option"
                  aria-selected={on}
                  onClick={() => {
                    onPick(o.key);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-start gap-2 px-3 py-2 text-left transition-colors hover:bg-[var(--sf-2)]",
                    on && "bg-primary/10"
                  )}
                >
                  <Check
                    className={cn(
                      "mt-0.5 h-3.5 w-3.5 shrink-0",
                      on ? "text-primary" : "opacity-0"
                    )}
                  />
                  <span className="min-w-0">
                    <span
                      className={cn(
                        "block text-[12.5px] font-medium",
                        on ? "text-primary" : "text-foreground"
                      )}
                    >
                      {o.label}
                    </span>
                    {o.hint && (
                      <span className="mt-0.5 block text-[10.5px] leading-snug text-muted-foreground/70">
                        {o.hint}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>,
          document.body
        )}
    </>
  );
}
