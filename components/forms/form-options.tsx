"use client";

import { useState } from "react";
import { MoreHorizontal, X } from "lucide-react";
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
            className="fixed inset-0 z-30 bg-black/55 backdrop-blur-[1px]"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-9 z-40 w-60 overflow-hidden rounded-2xl border border-white/10 bg-card shadow-2xl">
            {header && (
              <div className="border-b border-border bg-white/[0.03] px-3 py-2.5">
                {header}
              </div>
            )}
            {items.map((item) => (
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
        </>
      )}
    </div>
  );
}

function MenuRow({ item, onClick }: { item: OptionItem; onClick: () => void }) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={item.active}
      className="flex w-full items-center gap-3 border-t border-border/60 px-3 py-2.5 text-left transition-colors first:border-t-0 hover:bg-white/5 active:bg-white/[0.07]"
    >
      <span
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
          item.active || item.emphasis ? "bg-primary/15" : "bg-white/5"
        )}
      >
        <Icon
          className={cn(
            "h-4 w-4",
            item.active || item.emphasis
              ? "text-primary"
              : "text-muted-foreground"
          )}
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{item.title}</span>
        <span className="block truncate text-[11px] text-muted-foreground">
          {item.subtitle}
        </span>
      </span>
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
