"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type AddMenuItem = {
  key: string;
  label: string;
  icon: LucideIcon;
  /** İkon rengi (tailwind class) */
  iconClass?: string;
  onSelect: () => void;
};

/**
 * Ana "Ekle" butonu — dokununca yanına dairesel (yay şeklinde) menü açılır.
 * Buton sağ üstte durduğu için yay sola-aşağı doğru açılır.
 */
export function AddMenu({ items }: { items: AddMenuItem[] }) {
  const [open, setOpen] = useState(false);

  // Düzgün çeyrek yay: ilk daire tam solda (180°), son daire tam aşağıda (90°);
  // aradakiler eşit açıyla dağılır. Yarıçap, komşu daire merkezleri arasında en
  // az minChord boşluk kalacak şekilde eleman sayısıyla birlikte büyür —
  // 4 elemanda daireler sıkışmaz.
  const n = items.length;
  const start = 180;
  const step = n > 1 ? 90 / (n - 1) : 0;
  const minChord = 68; // 48px daire + ~20px nefes payı
  const R =
    n > 1
      ? Math.max(100, minChord / (2 * Math.sin((step * Math.PI) / 360)))
      : 100;
  const angleFor = (i: number) => (n === 1 ? 135 : start - i * step);

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

      <div className={cn("relative shrink-0", open && "z-50")}>
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
                "absolute left-1/2 top-1/2 transition-all duration-300 ease-out",
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
              {/* Etiket dairenin solunda — yay sola açıldığından komşu dairelerle çakışmaz */}
              <span className="pointer-events-none absolute right-full top-1/2 mr-2 -translate-y-1/2 whitespace-nowrap select-none rounded-lg bg-black/55 px-2 py-1 text-[11px] font-medium text-white/95 backdrop-blur-sm">
                {item.label}
              </span>
            </div>
          );
        })}

        {/* Ana buton */}
        <button
          onClick={() => setOpen((o) => !o)}
          className={cn(
            "relative flex items-center gap-1.5 rounded-xl px-4 h-9 text-sm font-medium transition-all active:scale-95",
            open
              ? "bg-foreground text-background"
              : "bg-primary text-primary-foreground hover:bg-primary/90"
          )}
          aria-expanded={open}
          aria-label={open ? "Menüyü kapat" : "Ekle"}
        >
          <Plus
            className={cn(
              "h-4 w-4 transition-transform duration-200",
              open && "rotate-45"
            )}
          />
          Ekle
        </button>
      </div>
    </>
  );
}
