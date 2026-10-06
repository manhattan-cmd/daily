"use client";

import { CalendarDays, ChevronRight } from "lucide-react";
import { HScroll } from "@/components/ui/h-scroll";
import { cn } from "@/lib/utils";

export interface TrailStep {
  key: string;
  label: string;
  /** Renk noktası — kategori ve alt kalemlerde kategorinin rengi */
  color?: string;
  onClick: () => void;
}

/** İncelenen özellik — yolun adımı değil, yolun üstüne tutulan mercek */
export interface TrailLens {
  label: string;
  color: string;
  onClick: () => void;
}

/**
 * Konum çubuğu — analizde NEREDE olduğunun yolu, sayfa başlığının yapışkan
 * bandında: "Eylül 2026 › ● Harcamalar › Market" ve sağ uçta incelenen
 * özelliğin merceği "◆ Para".
 *
 * Kademe yığınında aşağı indikçe yukarıdaki kartlar ekrandan çıkıyor; çubuk
 * kaydırma boyunca yerinde kalıp hangi dönemde, hangi kategori ve kalemde,
 * hangi özelliğe bakıldığını söylüyor. Her adım dokunulabilir: o kademeye
 * döner ve sayfayı oraya kaydırır. Bulunulan yer (son kalem) kategorinin
 * renginde dolu; özellik onun yanında kendi renginde.
 */
export function AnalysisTrail({
  steps,
  lens,
}: {
  steps: TrailStep[];
  lens?: TrailLens;
}) {
  // Son kalem — "buradasın"
  const placeIdx = steps.length - 1;
  return (
    <div className="flex items-center gap-2">
    <HScroll
      className="items-center gap-1"
      wrapperClassName="min-w-0 flex-1"
      followEnd={steps.map((s) => s.key).join("|")}
    >
      {steps.map((s, i) => {
        const isPlace = i === placeIdx && i > 0;
        return (
          <span key={s.key} className="flex shrink-0 items-center gap-1">
            {i > 0 && (
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
            )}
            <button
              type="button"
              onClick={s.onClick}
              aria-current={isPlace ? "location" : undefined}
              className={cn(
                "flex h-7 max-w-[160px] shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium transition-colors",
                !isPlace && "text-muted-foreground hover:text-foreground"
              )}
              style={
                isPlace && s.color
                  ? {
                      background: `${s.color}2e`,
                      color: "var(--foreground)",
                      boxShadow: `inset 0 0 0 1px ${s.color}80`,
                    }
                  : undefined
              }
            >
              {i === 0 ? (
                <CalendarDays className="h-3.5 w-3.5 shrink-0" />
              ) : (
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

      {/* Mercek — yolun adımı değil: hangi YERDE olduğun soldaki yol, ona
          HANGİ GÖZLE baktığın burası. Yol kayarken bu sabit durur; rengi
          aşağıda o özelliğin gösterildiği her yere (kademe çubukları,
          kutular, grafikler) siner. */}
      {lens && (
        <button
          type="button"
          onClick={lens.onClick}
          className="flex h-7 max-w-[120px] shrink-0 items-center gap-1.5 rounded-lg pl-2 pr-2.5 text-[12px] font-semibold"
          style={{
            background: `${lens.color}24`,
            color: lens.color,
            boxShadow: `inset 0 -2px 0 ${lens.color}`,
          }}
        >
          <span
            className="h-2 w-2 shrink-0 rotate-45 rounded-[2px]"
            style={{ backgroundColor: lens.color }}
          />
          <span className="truncate">{lens.label}</span>
        </button>
      )}
    </div>
  );
}
