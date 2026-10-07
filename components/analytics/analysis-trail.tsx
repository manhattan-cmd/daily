"use client";

import { LayoutGrid } from "lucide-react";
import { HScroll } from "@/components/ui/h-scroll";
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
  return (
    <div className="flex h-8 min-w-0 items-center text-[12.5px] font-semibold">
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
        <HScroll
          className="items-center"
          wrapperClassName="min-w-0 flex-1"
          followEnd={rest.map((s) => s.key).join("|")}
        >
          {rest.map((s) => {
            const isPlace = s.key === placeKey;
            return (
              <span key={s.key} className="flex shrink-0 items-center">
                {sep}
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
        </HScroll>
      )}
    </div>
  );
}
