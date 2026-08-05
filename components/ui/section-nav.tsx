"use client";

import { HScroll } from "@/components/ui/h-scroll";
import { cn } from "@/lib/utils";

/**
 * Sayfa başlığının hemen altındaki yatay gezinme şeridi — Yapı sekmeleri ve
 * Analiz dönem çipleri aynı yerde, aynı biçimde dursun diye tek yerde.
 * Kenarlara taşar (-mx-4) ki kaydırılan sıra ekranın kenarında bitsin.
 */
export function SectionNav({
  children,
  label,
}: {
  children: React.ReactNode;
  /** Verilirse şerit <nav> olur (Yapı sekmeleri gibi gerçek gezinme) */
  label?: string;
}) {
  const row = (
    <HScroll wrapperClassName="-mx-4 -mt-2 mb-5" className="gap-2 px-4 pb-1">
      {children}
    </HScroll>
  );
  return label ? <nav aria-label={label}>{row}</nav> : row;
}

/** Şerit çipi — seçili olan kategori/dönem vurgusuyla aynı dili konuşur */
export function chipClass(active: boolean) {
  return cn(
    "shrink-0 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors",
    active
      ? "border-primary/50 bg-primary/15 text-primary"
      : "border-border bg-card text-muted-foreground hover:bg-card/80 hover:text-foreground"
  );
}
