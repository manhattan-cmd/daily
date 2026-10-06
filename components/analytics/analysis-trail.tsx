"use client";

import { CalendarDays, ChevronRight } from "lucide-react";
import { HScroll } from "@/components/ui/h-scroll";
import { cn } from "@/lib/utils";

export interface TrailStep {
  key: string;
  label: string;
  /** Renk noktası — kategori ve alt kalemlerde kategorinin, özellikte özelliğin rengi */
  color?: string;
  /** Özellik adımı — elmas işaretli, yolun son halkası */
  feature?: boolean;
  onClick: () => void;
}

/**
 * Konum çubuğu — analizde NEREDE olduğunun yolu, sayfa başlığının yapışkan
 * bandında: "Eylül 2026 › ● Harcamalar › Market › ◆ Para".
 *
 * Kademe yığınında aşağı indikçe yukarıdaki kartlar ekrandan çıkıyor; çubuk
 * kaydırma boyunca yerinde kalıp hangi dönemde, hangi kategori ve kalemde,
 * hangi özelliğe bakıldığını söylüyor. Her adım dokunulabilir: o kademeye
 * döner ve sayfayı oraya kaydırır. Bulunulan yer (son kalem) kategorinin
 * renginde dolu; özellik onun yanında kendi renginde.
 */
export function AnalysisTrail({ steps }: { steps: TrailStep[] }) {
  // Son kalem (özellikten önceki) — "buradasın"
  let placeIdx = -1;
  steps.forEach((s, i) => {
    if (!s.feature) placeIdx = i;
  });
  return (
    <HScroll
      className="items-center gap-1"
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
                !isPlace && !s.feature && "text-muted-foreground hover:text-foreground"
              )}
              style={
                isPlace && s.color
                  ? {
                      background: `${s.color}2e`,
                      color: "var(--foreground)",
                      boxShadow: `inset 0 0 0 1px ${s.color}80`,
                    }
                  : s.feature && s.color
                    ? { background: `${s.color}1f`, color: s.color }
                    : undefined
              }
            >
              {i === 0 ? (
                <CalendarDays className="h-3.5 w-3.5 shrink-0" />
              ) : s.feature ? (
                <span
                  className="h-2 w-2 shrink-0 rotate-45 rounded-[2px]"
                  style={{ backgroundColor: s.color }}
                />
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
  );
}
