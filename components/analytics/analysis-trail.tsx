"use client";

import { useEffect, useRef, useState } from "react";
import { LayoutGrid } from "lucide-react";
import { cn } from "@/lib/utils";

export interface TrailStep {
  key: string;
  label: string;
  /** Renk noktası — kategori ve alt kalemlerde kategorinin rengi */
  color?: string;
  /** Yolun kökü ("Kategoriler") — nokta yerine ızgara simgesi */
  root?: boolean;
  onClick: () => void;
}

/**
 * Konum yolu — analizde NEREDE olduğun, başlık bandında düz yazı:
 * "▦ Kategoriler / Harcamalar / ● Dışarıda yeme-içme".
 *
 * Kutusuz: bir ara her adım dolu bir kapsüldü ve bant dört renkli bloğun
 * yarıştığı bir yere dönmüştü. Şimdi tek vurgu BULUNULAN YER (kalın, renk
 * noktalı); önceki adımlar sönük ama dokunulabilir; kök mor yazılı. İncelenen
 * özellik burada değil — aşağıdaki özellik kapsüllerinde ve rengi içeriğe
 * siniyor.
 *
 * Kök solda SABİT, yolun geri kalanı uzayınca kendi içinde kayar (sona
 * yaslanır, bulunulan yer hep görünür).
 */
export function AnalysisTrail({ steps }: { steps: TrailStep[] }) {
  const root = steps.find((s) => s.root);
  const rest = steps.filter((s) => !s.root);
  const placeKey = steps[steps.length - 1]?.key;
  const sep = <span className="shrink-0 px-1 text-muted-foreground/35">/</span>;

  // Yolun kayan kısmı — kendi kaydırması: ok YOK (genel kaydırma bileşeninin
  // kenar okları "Kategoriler"in dibine biniyordu), kayan kenar yumuşakça
  // söner. Yol değişince sona yaslanır: bulunulan yer hep görünür.
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const pathKey = rest.map((s) => s.key).join("|");
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ left: el.scrollWidth, behavior: "smooth" });
  }, [pathKey]);
  const onScroll = () => {
    const el = scrollRef.current;
    if (el) setScrolled(el.scrollLeft > 1);
  };
  return (
    // Yol bir kapsülün içinde — içeriği kadar geniş, uzayınca bandın
    // genişliğinde durup kendi içinde kayar
    <div className="inline-flex h-8 max-w-full items-center rounded-full bg-[var(--sf-2)] px-3 text-[12.5px] font-semibold ring-1 ring-inset ring-[var(--ln-1)]">
      {root && (
        <button
          type="button"
          onClick={root.onClick}
          aria-current={root.key === placeKey ? "location" : undefined}
          className={cn(
            "flex shrink-0 items-center gap-1.5 transition-colors",
            root.key === placeKey ? "text-[#a5b4fc]" : "text-[#8b93f8] hover:text-[#a5b4fc]"
          )}
        >
          <LayoutGrid className="h-3.5 w-3.5 shrink-0" />
          {root.label}
        </button>
      )}
      {rest.length > 0 && (
        <>
        {/* Kökten sonraki ayraç SABİT — kayan yazı köke yapışmasın */}
        {sep}
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="no-scrollbar flex min-w-0 items-center overflow-x-auto"
          style={
            scrolled
              ? {
                  maskImage: "linear-gradient(to right, transparent, #000 18px)",
                  WebkitMaskImage: "linear-gradient(to right, transparent, #000 18px)",
                }
              : undefined
          }
        >
          {rest.map((s, i) => {
            const isPlace = s.key === placeKey;
            return (
              <span key={s.key} className="flex shrink-0 items-center">
                {i > 0 && sep}
                <button
                  type="button"
                  onClick={s.onClick}
                  aria-current={isPlace ? "location" : undefined}
                  className={cn(
                    "flex max-w-[180px] items-center gap-1.5 transition-colors",
                    isPlace ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {isPlace && (
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: s.color }}
                    />
                  )}
                  <span className="truncate">{s.label}</span>
                </button>
              </span>
            );
          })}
        </div>
        </>
      )}
    </div>
  );
}
