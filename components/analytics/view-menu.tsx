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

/** Bir satırın yüksekliği (px) — konum hesabı için; ipucu tek satıra kırpılıyor */
const ROW_H = 38;
/** Menü en fazla bu kadar uzar, gerisi kendi içinde kaydırılır */
const MAX_H = 264;

export function ViewMenu({
  options,
  value,
  onPick,
  align = "start",
  children,
  label,
}: {
  options: { key: string; label: string; hint?: string; danger?: boolean }[];
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
    const height = Math.min(MAX_H, options.length * ROW_H + 10);
    const below = window.innerHeight - r.bottom;
    const top =
      below < height + 16 ? Math.max(8, r.top - height - 6) : r.bottom + 6;
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
    /**
     * Sayfa ya da sıra kaydırılınca menü havada kalmasın — ama MENÜNÜN KENDİ
     * kaydırması sayılmaz. Dinleyici yakalama aşamasında olduğu için menünün
     * içindeki kaydırmayı da görüyordu: uzun listeyi kaydırmaya çalışmak
     * menüyü kapatıyordu.
     *
     * Bağlanması da kısa bir gecikmeyle: kutuyu görünür kılmak için
     * tarayıcının yaptığı kaydırma menüyü daha açılır açılmaz kapatıyordu.
     */
    const onScroll = (e: Event) => {
      const t = e.target as Node | null;
      if (t && menuRef.current?.contains(t)) return;
      setOpen(false);
    };
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
              "animate-in z-[60] min-w-[172px] max-w-[232px] p-1",
              "max-h-[264px] overflow-y-auto overscroll-contain",
              "rounded-[14px] border border-border bg-card shadow-2xl"
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
                    "flex w-full items-center gap-2 rounded-[10px] px-2.5 py-1.5 text-left transition-colors",
                    // Yıkıcı satır (kaldır) ayrı bir bölge: üstünde ince çizgi
                    o.danger
                      ? "mt-1 border-t border-border pt-2 text-destructive hover:bg-destructive/10"
                      : on
                        ? "bg-primary/10"
                        : "hover:bg-[var(--sf-2)]"
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "block truncate text-[12px] font-medium leading-tight",
                        o.danger ? "" : on ? "text-primary" : "text-foreground"
                      )}
                    >
                      {o.label}
                    </span>
                    {/* İpucu tek satıra kırpılıyor: sarınca menü iki katı uzuyordu */}
                    {o.hint && !o.danger && (
                      <span className="mt-0.5 block truncate text-[10px] leading-tight text-muted-foreground/70">
                        {o.hint}
                      </span>
                    )}
                  </span>
                  {on && !o.danger && (
                    <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                  )}
                </button>
              );
            })}
          </div>,
          document.body
        )}
    </>
  );
}
