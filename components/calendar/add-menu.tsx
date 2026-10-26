"use client";

import { useEffect, useRef, useState } from "react";
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

/**
 * Gün sayfasının "Ekle" düğmesi — dokununca altına açılan seçenek paneli.
 *
 * Önce dairesel (yay) bir menüydü: daireler butonun merkezinden 90°'lik bir
 * yaya diziliyordu. Altı seçenekte geometri tutmuyor. Yay sabit 90° olduğu
 * için her yeni seçenek adımı daraltıyor; daire+etiketin üst üste binmemesi
 * için gereken kirişi korumak yarıçapı şişiriyordu — ölçtük, 294px. Yani
 * seçenekler butonun yanında değil, ekranın dört bir yanına saçılmış
 * oluyordu (ilk seçenek sol üst köşede, sonuncusu sağ altta) ve etiketler
 * birbirine değiyordu. Yarıçapı kısmak da çözüm değil: kiriş küçülünce bu
 * sefer gerçekten üst üste biniyorlar.
 *
 * Panel bu sorunun ikisini birden bitiriyor: butonun 8px altında açılıyor
 * (yani "yakın"), satırlar akışta olduğu için hiçbir koşulda çakışmıyor ve
 * seçenek sayısı artarsa panel uzuyor, dağılmıyor.
 */
export function AddMenu({
  items,
  tile = false,
}: {
  items: AddMenuItem[];
  /** Brütal gün özetinin kare hücresi (bkz. SummaryBlock): hücreyi doldurur.
   *  Panel ekrana sabitlenir — bloğun yuvarlak köşeleri taşanı kırpıyor */
  tile?: boolean;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [anchor, setAnchor] = useState<{ top?: number; bottom?: number; left: number } | null>(null);
  const toggle = () => {
    if (tile && !open && btnRef.current) {
      // Karonun sağ kenarına yaslı; ekranın solundan taşacaksa karonun sol
      // kenarına (panel 190 px)
      const r = btnRef.current.getBoundingClientRect();
      const left = Math.max(8, r.right - 190 < 8 ? r.left : r.right - 190);
      // Altında yer yoksa karonun üstünde açılır: ana sayfada Başlarken kartı
      // karoyu ekranın altına itiyor, panel alt menünün arkasına düşüyordu
      const floor = document.querySelector("[data-bottom-nav]")?.getBoundingClientRect().top ?? window.innerHeight;
      const need = Math.min(items.length * 48 + 14, window.innerHeight * 0.6);
      const below = floor - r.bottom - 8;
      setAnchor(
        below < need && r.top - 8 > below
          ? { bottom: window.innerHeight - r.top + 8, left }
          : { top: r.bottom + 8, left }
      );
    }
    setOpen((o) => !o);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

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
          open ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        onClick={() => setOpen(false)}
      />

      <div className={cn("relative", "shrink-0", tile && "h-full w-full", open && "z-50")}>
        {tile ? (
          <button
            ref={btnRef}
            onClick={toggle}
            className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-[#7ae582] text-[#111] active:bg-[#5fd36a]"
            aria-expanded={open}
            aria-label={open ? t("action.close") : t("day.add")}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[#111] text-[#7ae582]">
              <Plus
                className={cn("h-6 w-6 transition-transform duration-200", open && "rotate-45")}
                strokeWidth={3}
              />
            </span>
            <span className="text-[13px] font-black leading-none">{t("day.add")}</span>
          </button>
        ) : (
        <button
          onClick={() => setOpen((o) => !o)}
          className={cn(
            "relative flex h-9 items-center gap-1.5 rounded-xl px-4 text-sm font-medium transition-all active:scale-95",
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
        )}

        {/* Panel — düğmeye yaslı, sağdan hizalı. Uzun listede kendi içinde
            kayar ki alt kenardan taşmasın. */}
        <div
          role="menu"
          aria-hidden={!open}
          style={
            tile && anchor
              ? {
                  position: "fixed",
                  top: anchor.top ?? "auto",
                  bottom: anchor.bottom ?? "auto",
                  left: anchor.left,
                  right: "auto",
                  marginTop: 0,
                  transformOrigin: anchor.bottom !== undefined ? "bottom right" : undefined,
                }
              : undefined
          }
          className={cn(
            "absolute right-0 top-full z-50 mt-2 origin-top-right",
            "w-[190px]",
            "rounded-2xl border border-border bg-card p-1.5 shadow-2xl",
            "max-h-[60vh] overflow-y-auto overscroll-contain",
            "transition-all duration-200 ease-out",
            open
              ? "translate-y-0 scale-100 opacity-100"
              : "pointer-events-none -translate-y-1 scale-95 opacity-0"
          )}
        >
          {items.map((item, i) => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                role="menuitem"
                onClick={() => pick(item)}
                tabIndex={open ? 0 : -1}
                className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition-colors hover:bg-[var(--sf-2)] active:scale-[0.98]"
                style={{
                  // Satırlar sırayla belirir — yay menüsündeki açılma hissi
                  // panelde de korunuyor
                  // (gecikme geçişin içinde: ayrı transitionDelay React'te çakışma uyarısı veriyordu)
                  opacity: open ? 1 : 0,
                  transition: `opacity 200ms ease-out ${open ? i * 35 : 0}ms, background-color 150ms`,
                }}
              >
                <span data-menu-icon="" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--sf-2)]">
                  <Icon
                    className={cn("h-4 w-4", item.iconClass ?? "text-primary")}
                  />
                </span>
                <span className="truncate text-[13px] font-medium">
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
