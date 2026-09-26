"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

/**
 * Analizdeki seçim penceresi — kutuya ya da grafiğe dokununca açılan liste.
 *
 * Tercih artık özelliğin kendi sayfasında değil, BAKILAN YERDE: yürüyüşteki
 * "Süre" ile sprintteki "Süre" başka sorulara cevap veriyor, ikisini de
 * baktığı ekranda seçmek gerekiyor. Sonucu aynı anda gördüğü için seçim
 * denenerek yapılıyor, tahminle değil.
 *
 * Önceden tetikleyicinin altına yapışan bir açılır listeydi: yatay kaydırılan
 * kutu sırasında konumu tahmin ediliyor, kimi zaman yukarı, kimi zaman
 * kenara kayıyordu. Artık hep ekranın ortasında, karartılmış zeminin üstünde
 * açılıyor — nereye dokunulursa dokunulsun aynı yerde.
 *
 * Radix yerine elle yazıldı: tek iş için (dışarı tıkla-kapat + Esc) odak
 * tuzağı taşımaya değmiyor, ve analiz zaten başka bir Dialog'un içinde
 * açılmıyor.
 */
export function ViewMenu({
  options,
  value,
  onPick,
  children,
  label,
}: {
  options: { key: string; label: string; hint?: string; danger?: boolean }[];
  value: string;
  onPick: (key: string) => void;
  /** Tetikleyici — kutunun ya da grafik başlığının kendisi */
  children: React.ReactNode;
  /** Pencerenin başlığı da bu — "Bu kutuda ne görünsün?" */
  label: string;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const selectedRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    // Seçili satır uzun listenin altında kalmasın
    selectedRef.current?.scrollIntoView({ block: "center" });
    // Arkadaki sayfa pencereyle birlikte kaymasın
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (options.length < 2) return <>{children}</>;

  const choices = options.filter((o) => !o.danger);
  const dangers = options.filter((o) => o.danger);
  const pick = (key: string) => {
    onPick(key);
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
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
            className="fixed inset-0 z-[60] flex items-center justify-center p-4"
            onPointerDown={(e) => {
              if (e.target === e.currentTarget) setOpen(false);
            }}
          >
            <div
              aria-hidden
              className="animate-in pointer-events-none absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-label={label}
              className={cn(
                "animate-zoom-in relative flex max-h-[min(380px,60dvh)] w-full max-w-[300px] flex-col",
                "overflow-hidden rounded-[20px] border border-border bg-card shadow-2xl"
              )}
            >
              <div className="px-4 pb-1.5 pt-3 text-[13px] font-semibold text-foreground">
                {label}
              </div>

              <div
                role="listbox"
                className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1.5 pb-1.5"
              >
                {choices.map((o) => {
                  const on = o.key === value;
                  return (
                    <button
                      key={o.key}
                      ref={on ? selectedRef : undefined}
                      type="button"
                      role="option"
                      aria-selected={on}
                      onClick={() => pick(o.key)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-[10px] px-2.5 py-1.5 text-left transition-colors",
                        on ? "bg-primary/10" : "hover:bg-[var(--sf-2)]"
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span
                          className={cn(
                            "block text-[13px] font-medium leading-tight",
                            on ? "text-primary" : "text-foreground"
                          )}
                        >
                          {o.label}
                        </span>
                        {o.hint && (
                          <span className="mt-0.5 block truncate text-[10.5px] leading-tight text-muted-foreground/70">
                            {o.hint}
                          </span>
                        )}
                      </span>
                      {on && <Check className="h-4 w-4 shrink-0 text-primary" />}
                    </button>
                  );
                })}
              </div>

              {/* Seçim zaten anında uygulanıyor; Tamam yalnız pencereyi kapatır */}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="border-t border-border px-4 py-2.5 text-center text-[13px] font-semibold text-primary transition-colors hover:bg-primary/10"
              >
                {t("board.done")}
              </button>

              {/* Yıkıcı satır (kaldır) listenin dışında, hep görünür */}
              {dangers.map((o) => (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => pick(o.key)}
                  className="border-t border-border px-4 py-2.5 text-center text-[13px] font-medium text-destructive transition-colors hover:bg-destructive/10"
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
