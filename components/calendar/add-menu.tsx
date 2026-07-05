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

  const R = 84; // yay yarıçapı (px)
  // Yay: soldan (180°) aşağıya (90°) doğru; eleman sayısına göre eşit dağıt
  const n = items.length;
  const spread = Math.min(90, Math.max(50, (n - 1) * 62));
  const start = 175;
  const angleFor = (i: number) =>
    n === 1 ? 135 : start - (i * spread) / (n - 1);

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
              <span className="mt-1.5 text-[10px] font-medium text-white/90 whitespace-nowrap select-none">
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
