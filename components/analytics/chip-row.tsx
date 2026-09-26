"use client";

import { useEffect, useRef } from "react";
import { HScroll } from "@/components/ui/h-scroll";
import { cn } from "@/lib/utils";

/**
 * Seçimli kapsül satırı — kategori detayındaki kategori ve özellik sıraları.
 *
 * Satır tek sıra ve yatay kaydırılıyor; kapsüller yerinde kalır (seçileni
 * başa alma denendi, geri alındı). Seçili kapsül görünür alanın dışındaysa
 * satır ona kayar.
 *
 * Seçimin rengi satıra da siner: satırın boyunca hafif bir ton. Hangi
 * kategori/özellik içinde olunduğu, kapsülün yazısını okumadan da hissedilsin.
 */
export interface ChipItem {
  key: string;
  label: React.ReactNode;
  color: string;
  active: boolean;
  /** Kapsülün sonundaki sönük sayı (dönemdeki girdi sayısı gibi) */
  count?: number;
  /** Dönemde verisi yok — sönük çizilir ama seçilebilir */
  dim?: boolean;
  onPick: () => void;
}

export function ChipRow({ items }: { items: ChipItem[] }) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const active = items.find((c) => c.active);
  const activeKey = active?.key;

  // Seçili kapsül satırın dışında kalmasın — başka dönemden taşınan ya da
  // uzun satırın sonundaki bir seçim görünür alana kaydırılır. Satır kendi
  // içinde kayar, sayfa dikeyde oynamaz.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !activeKey) return;
    const chip = el.querySelector<HTMLElement>(`[data-chip="${CSS.escape(activeKey)}"]`);
    if (!chip) return;
    const left = chip.offsetLeft - el.offsetLeft;
    const right = left + chip.offsetWidth;
    const pad = 16;
    if (left - pad < el.scrollLeft) {
      el.scrollTo({ left: Math.max(0, left - pad), behavior: "smooth" });
    } else if (right + pad > el.scrollLeft + el.clientWidth) {
      el.scrollTo({ left: right + pad - el.clientWidth, behavior: "smooth" });
    }
  }, [activeKey]);

  const tint = active?.color;

  return (
    <div className="relative -mx-4">
      {/* Satırın tonu — seçim değişince yeni renk sönerek gelir */}
      {tint && (
        <div
          key={tint}
          aria-hidden
          className="chip-row-tint pointer-events-none absolute inset-0"
          // Satırın boyunca eşit ton — solda yoğunlaşıp sönen ışık satırın
          // yalnız bir kısmını boyuyormuş gibi duruyordu
          style={{ backgroundColor: `${tint}1c` }}
        />
      )}
      <HScroll scrollRef={scrollRef} className="relative gap-2 px-4 py-2">
        {items.map((c) => (
          <button
            key={c.key}
            type="button"
            data-chip={c.key}
            data-active={c.active}
            aria-pressed={c.active}
            onClick={() => {
              if (!c.active) c.onPick();
            }}
            className={cn(
              "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border px-3 py-1.5 text-xs font-medium",
              "transition-[background-color,border-color,color,opacity] duration-300",
              c.active
                ? "text-foreground"
                : c.dim
                  ? "border-border/50 bg-card/50 text-muted-foreground/50 hover:text-muted-foreground"
                  : "border-border bg-card text-muted-foreground hover:text-foreground"
            )}
            style={
              c.active
                ? {
                    borderColor: `${c.color}8c`,
                    // Kartın üstüne kendi tonu — satırın renkli zemininde de
                    // kapsül ayrı bir nesne olarak okunur
                    background: `linear-gradient(${c.color}26, ${c.color}26), var(--card)`,
                  }
                : undefined
            }
          >
            <span
              className={cn(
                "h-1.5 w-1.5 shrink-0 rounded-full",
                c.dim && !c.active && "opacity-40"
              )}
              style={{ backgroundColor: c.color }}
            />
            {c.label}
            {c.count !== undefined && c.count > 0 && (
              <span className="tabular-nums text-muted-foreground/60">{c.count}</span>
            )}
          </button>
        ))}
      </HScroll>
    </div>
  );
}
