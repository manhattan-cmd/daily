"use client";

import { useRef, useState } from "react";
import { Plus } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

export type AddMenuItem = {
  key: string;
  label: string;
  icon: LucideIcon;
  /** İkon rengi (tailwind class) */
  iconClass?: string;
  onSelect: () => void;
};

/** Daire + etiketin kapladığı yarım genişlik ve yükseklik (taşma payı için) */
const HALF_ITEM = 26;
const ITEM_BELOW = 44;
const EDGE = 10;

/**
 * Ana "Ekle" butonu — dokununca yanına dairesel (yay şeklinde) menü açılır.
 * Buton sağ üstte durduğu için yay sola-aşağı doğru açılır.
 */
export function AddMenu({ items }: { items: AddMenuItem[] }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  // Yayın sığabileceği en büyük yarıçap — menü açılırken ölçülür
  const [maxR, setMaxR] = useState(Infinity);

  // Düzgün çeyrek yay: ilk daire tam solda (180°), son daire tam aşağıda (90°);
  // aradakiler eşit açıyla dağılır. Yay 90°–180° ARASINDA kalmak zorunda:
  // buton sağ üstte duruyor, sağa açılsa ekranın dışına çıkar.
  const n = items.length;
  const start = 180;
  const step = n > 1 ? 90 / (n - 1) : 0;
  // 48px daire + altındaki etiket + nefes payı — etiketler alt alta gelmesin
  const minChord = 92;
  // Kirişi koruyan yarıçap. Eleman sayısıyla birlikte SINIRSIZ büyüyor: 90°'lik
  // yay sabit olduğu için her yeni eleman adımı daraltıyor, aynı kirişi tutmak
  // için yarıçap şişiyor. 6 elemanda 294px'e çıkıyordu ve soldaki daire dar
  // ekranda dışarı taşıyordu (360'ta 15px, 320'de 55px).
  const idealR =
    n > 1
      ? Math.max(100, minChord / (2 * Math.sin((step * Math.PI) / 360)))
      : 100;
  // Sığmıyorsa kiriş feda edilir, taşma değil: daireler birbirine yaklaşır ama
  // 48px'lik çaplar kirişten küçük kaldığı sürece üst üste binmezler.
  const R = Math.max(100, Math.min(idealR, maxR));
  const angleFor = (i: number) => (n === 1 ? 135 : start - i * step);

  /**
   * Yayın sığacağı yarıçap. Sol uçtaki eleman 180°'de (x = −R), alttaki 90°'de
   * (y = +R) duruyor; ikisi de ekranın içinde kalmalı. Açılış anında ölçülüyor:
   * düzen değiştiğinde (klavye, döndürme) bir sonraki açılışta güncelleniyor,
   * render sırasında ölçüm yapılmıyor.
   */
  function measure() {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    setMaxR(
      Math.min(
        cx - HALF_ITEM - EDGE,
        window.innerHeight - cy - ITEM_BELOW - EDGE
      )
    );
  }

  function pick(item: AddMenuItem) {
    setOpen(false);
    item.onSelect();
  }

  return (
    <>
      {/* Backdrop — menü açıkken sayfayı karartır, dışarı dokununca kapanır */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px] transition-opacity duration-200",
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={() => setOpen(false)}
      />

      <div ref={wrapRef} className={cn("relative shrink-0", open && "z-50")}>
        {/* Yay elemanları — buton merkezinden açılır */}
        {items.map((item, i) => {
          const a = (angleFor(i) * Math.PI) / 180;
          const x = Math.cos(a) * R;
          const y = Math.sin(a) * R;
          const Icon = item.icon;
          return (
            <div
              key={item.key}
              className={cn(
                "absolute left-1/2 top-1/2 flex flex-col items-center transition-all duration-300 ease-out",
                open
                  ? "opacity-100"
                  : "opacity-0 pointer-events-none"
              )}
              style={{
                transform: open
                  ? `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`
                  : "translate(-50%, -50%) scale(0.4)",
                transitionDelay: open ? `${i * 45}ms` : "0ms",
              }}
            >
              <button
                onClick={() => pick(item)}
                className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-card shadow-xl transition-transform hover:scale-105 active:scale-95"
                aria-label={item.label}
              >
                <Icon className={cn("h-5 w-5", item.iconClass ?? "text-primary")} />
              </button>
              <span className="pointer-events-none mt-1.5 whitespace-nowrap select-none text-[11px] font-medium text-white/90 [text-shadow:0_1px_4px_rgba(0,0,0,0.8)]">
                {item.label}
              </span>
            </div>
          );
        })}

        {/* Ana buton */}
        <button
          onClick={() => {
            if (!open) measure();
            setOpen((o) => !o);
          }}
          className={cn(
            "relative flex items-center gap-1.5 rounded-xl px-4 h-9 text-sm font-medium transition-all active:scale-95",
            open
              ? "bg-foreground text-background"
              : "bg-primary text-primary-foreground hover:bg-primary/90"
          )}
          aria-expanded={open}
          aria-label={open ? t("action.close") : t("day.add")}
        >
          <Plus
            className={cn(
              "h-4 w-4 transition-transform duration-200",
              open && "rotate-45"
            )}
          />
          {t("day.add")}
        </button>
      </div>
    </>
  );
}
