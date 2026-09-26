"use client";

import { useLayoutEffect, useRef } from "react";
import { HScroll } from "@/components/ui/h-scroll";
import { cn } from "@/lib/utils";

/**
 * Seçimli kapsül satırı — kategori detayındaki kategori ve özellik sıraları.
 *
 * Seçili kapsül HEP başta: neye bakıldığı satırın ilk kelimesinden okunur,
 * uzun bir satırın ortasında aranmaz. Başa geçiş sıçrayarak değil kayarak
 * oluyor (FLIP) — kapsül dokunulduğu yerden başa süzülür, ötekiler yer açar.
 * Satır tek sıra ve yatay kaydırılıyor; seçim olunca başa sarılır.
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

/** Kapsülün başa süzülme süresi (ms) — ötekiler de aynı sürede yer açar */
const GLIDE_MS = 460;
const GLIDE_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

export function ChipRow({ items }: { items: ChipItem[] }) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  // Dokunma anındaki ekran konumları — yeni sıra çizilince fark kadar geriden
  // başlatılıp yerine kaydırılır
  const snapshot = useRef<Map<string, number> | null>(null);

  const active = items.find((c) => c.active);
  const ordered = active ? [active, ...items.filter((c) => c !== active)] : items;
  const order = ordered.map((c) => c.key).join("|");

  const capture = () => {
    const el = scrollRef.current;
    if (!el) return;
    const m = new Map<string, number>();
    el.querySelectorAll<HTMLElement>("[data-chip]").forEach((c) =>
      m.set(c.dataset.chip!, c.getBoundingClientRect().left)
    );
    snapshot.current = m;
  };

  useLayoutEffect(() => {
    const el = scrollRef.current;
    const before = snapshot.current;
    snapshot.current = null;
    if (!el || !before) return;
    // Seçilen başa geçti — satır da başa sarılır ki görünsün. Anında: kayma
    // animasyonu zaten dokunulan yerden başlıyor, ikinci bir hareket bulanık
    el.scrollLeft = 0;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    el.querySelectorAll<HTMLElement>("[data-chip]").forEach((c) => {
      const from = before.get(c.dataset.chip!);
      if (from === undefined) return;
      const dx = from - c.getBoundingClientRect().left;
      const lead = c.dataset.active === "true";
      if (Math.abs(dx) < 1 && !lead) return;
      c.animate(
        lead
          ? [
              { transform: `translateX(${dx}px) scale(0.94)` },
              { transform: "translateX(0) scale(1.04)", offset: 0.7 },
              { transform: "translateX(0) scale(1)" },
            ]
          : [{ transform: `translateX(${dx}px)` }, { transform: "translateX(0)" }],
        { duration: GLIDE_MS, easing: GLIDE_EASE }
      );
    });
  }, [order]);

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
        {ordered.map((c) => (
          <button
            key={c.key}
            type="button"
            data-chip={c.key}
            data-active={c.active}
            aria-pressed={c.active}
            onClick={() => {
              if (c.active) return;
              capture();
              c.onPick();
            }}
            className={cn(
              "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border px-3 py-1.5 text-xs font-medium",
              "transition-[background-color,border-color,color,opacity] duration-300",
              // Başa süzülen kapsül ötekilerin ÜSTÜNDEN geçer
              c.active
                ? "relative z-[1] text-foreground"
                : c.dim
                  ? "border-border/50 bg-card/50 text-muted-foreground/50 hover:text-muted-foreground"
                  : "border-border bg-card text-muted-foreground hover:text-foreground"
            )}
            style={
              c.active
                ? {
                    borderColor: `${c.color}8c`,
                    // Opak zemin: kartın üstüne kendi tonu — başa süzülürken
                    // altından geçtiği kapsüllerin yazısı içinden görünmesin
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
