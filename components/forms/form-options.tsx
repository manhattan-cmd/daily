"use client";

import { useState } from "react";
import { ChevronRight, MoreHorizontal, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Girdi formlarının ikincil ayarları (zaman, paralel perspektif, takma ad...)
 * ana akışın ortasında durup işi karıştırmasın diye başlıktaki küçük menüye
 * toplanır. Menü satırı o an geçerli değeri altında gösterir; seçilen bölüm
 * formun gövdesinde `PanelBlock` ile yerinde açılır.
 * Hem girdi ekleme sheet'i hem düzenleme modalı bunu kullanır.
 */
export type OptionItem = {
  key: string;
  icon: LucideIcon;
  title: string;
  /** O anki değer — "1 Ağu · 16:27", "2 seçili", "Kapalı" gibi */
  subtitle: string;
  /** Aç/kapa satırlarında verilir; eylem satırlarında verilmez */
  active?: boolean;
  /** Satır ikonunu vurgula (eylem satırlarında birincil eylemi belirtmek için) */
  emphasis?: boolean;
  /** Yıkıcı eylemler en altta, ayrı bir bölmede ve kırmızı durur */
  tone?: "default" | "destructive";
  onSelect: () => void;
};

export function OptionsMenu({
  items,
  /** Ayarlanmış bir şey varsa düğmede nokta belirir */
  touched,
  /** Menünün üstünde bağlam şeridi — hangi öğenin menüsü olduğunu söyler */
  header,
  className,
}: {
  items: OptionItem[];
  touched?: boolean;
  header?: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  if (!items.length) return null;
  // Yıkıcı eylemler ayrı bölmede, en altta
  const normal = items.filter((i) => i.tone !== "destructive");
  const destructive = items.filter((i) => i.tone === "destructive");

  return (
    <div className={cn("relative shrink-0", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Seçenekler"
        aria-expanded={open}
        className={cn(
          "relative flex h-7 w-7 items-center justify-center rounded-full transition-colors",
          open
            ? "bg-primary/20 text-primary"
            : "bg-white/8 text-muted-foreground hover:bg-white/12 hover:text-foreground"
        )}
      >
        <MoreHorizontal className="h-4 w-4" />
        {touched && !open && (
          <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-primary" />
        )}
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-30 bg-black/60 backdrop-blur-[2px]"
            onClick={() => setOpen(false)}
          />
          <div className="animate-in absolute right-0 top-10 z-40 w-64 origin-top-right overflow-hidden rounded-2xl border border-white/[0.09] bg-card/95 shadow-[0_16px_48px_rgba(0,0,0,0.55)] backdrop-blur-xl">
            {header && (
              <div className="border-b border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
                {header}
              </div>
            )}
            <div className="p-1.5">
              {normal.map((item) => (
                <MenuRow
                  key={item.key}
                  item={item}
                  onClick={() => {
                    setOpen(false);
                    item.onSelect();
                  }}
                />
              ))}
            </div>
            {destructive.length > 0 && (
              <div className="border-t border-white/[0.06] p-1.5">
                {destructive.map((item) => (
                  <MenuRow
                    key={item.key}
                    item={item}
                    onClick={() => {
                      setOpen(false);
                      item.onSelect();
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function MenuRow({ item, onClick }: { item: OptionItem; onClick: () => void }) {
  const Icon = item.icon;
  const bad = item.tone === "destructive";
  const lit = !bad && (item.active || item.emphasis);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={item.active}
      className={cn(
        "group flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition-colors",
        bad
          ? "hover:bg-destructive/10 active:bg-destructive/15"
          : item.active
            ? "bg-primary/[0.09]"
            : "hover:bg-white/[0.06] active:bg-white/[0.09]"
      )}
    >
      <span
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors",
          bad
            ? "bg-destructive/12 text-destructive"
            : lit
              ? "bg-primary/20 text-primary"
              : "bg-white/[0.06] text-muted-foreground group-hover:text-foreground"
        )}
      >
        <Icon className="h-4 w-4" />
      </span>

      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block text-[13px] font-medium leading-tight",
            bad ? "text-destructive" : "text-foreground"
          )}
        >
          {item.title}
        </span>
        <span className="mt-0.5 block truncate text-[11px] leading-tight text-muted-foreground/70">
          {item.subtitle}
        </span>
      </span>

      {/* Açık olan bölüm nokta ile, diğerleri ok ile işaretlenir */}
      {item.active ? (
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
      ) : (
        <ChevronRight
          className={cn(
            "h-3.5 w-3.5 shrink-0 transition-colors",
            bad
              ? "text-destructive/40"
              : "text-muted-foreground/30 group-hover:text-muted-foreground/70"
          )}
        />
      )}
    </button>
  );
}

/** Menüden açılan bölüm — başlık satırı + kapatma */
export function PanelBlock({
  icon: Icon,
  title,
  onClose,
  children,
}: {
  icon: LucideIcon;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1.5">
        <Icon className="h-3 w-3 text-primary/70" />
        <span className="flex-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/60">
          {title}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label={`${title} bölümünü kapat`}
          className="flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground/50 transition-colors hover:text-foreground"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
      {children}
    </div>
  );
}
