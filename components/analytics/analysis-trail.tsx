"use client";

import { ChevronRight, LayoutGrid } from "lucide-react";
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
export function AnalysisTrail({ steps }: { steps: TrailStep[] }) {
  // Son kalem — "buradasın"
  const placeIdx = steps.length - 1;
  return (
    <HScroll
      className="items-center gap-1"
      followEnd={steps.map((s) => s.key).join("|")}
    >
      {steps.map((s, i) => {
        const isPlace = i === placeIdx;
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
                "flex h-7 max-w-[170px] shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium transition-colors",
                !isPlace && !s.root && "text-muted-foreground hover:text-foreground",
                // Kök hep canlı: yolun başlangıcı, her yerden tek dokunuşla dönülen yer
                s.root && "font-semibold text-white"
              )}
              style={
                s.root
                  ? {
                      background: "linear-gradient(135deg, #6366f1, #a855f7)",
                      boxShadow: isPlace
                        ? "0 0 0 2px var(--background), 0 0 0 3px #a855f7aa, 0 4px 14px #6366f155"
                        : "0 2px 10px #6366f140",
                    }
                  : isPlace && s.color
                    ? {
                        background: `${s.color}2e`,
                        color: "var(--foreground)",
                        boxShadow: `inset 0 0 0 1px ${s.color}80`,
                      }
                    : undefined
              }
            >
              {s.root ? (
                <LayoutGrid className="h-3.5 w-3.5 shrink-0" />
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

/**
 * Mercek — incelenen özellik. Yolun bir adımı DEĞİL: yol (alttaki satır)
 * nerede olduğunu söyler, mercek ona hangi gözle bakıldığını. Bu yüzden ayrı
 * bir düzlemde, sayfa başlığının sağında durur. Özellik seçiliyken kendi
 * renginde — aynı renk aşağıda o özelliğin gösterildiği her yere (kademe
 * çubukları, kutular, grafikler, liste) siner; "Girdi"de sade, çünkü orada
 * renk yere (kategoriye) ait.
 */
export function AnalysisLens({ lens }: { lens: TrailLens & { neutral?: boolean } }) {
  return (
    <button
      type="button"
      onClick={lens.onClick}
      className={cn(
        "flex h-7 max-w-[130px] items-center gap-1.5 rounded-full px-2.5 text-[12px] font-semibold transition-colors",
        lens.neutral && "bg-[var(--sf-2)] text-muted-foreground hover:text-foreground"
      )}
      style={
        lens.neutral
          ? undefined
          : {
              background: `${lens.color}24`,
              color: lens.color,
              boxShadow: `inset 0 0 0 1px ${lens.color}66`,
            }
      }
    >
      <span
        className="h-2 w-2 shrink-0 rotate-45 rounded-[2px]"
        style={{ backgroundColor: lens.neutral ? "currentColor" : lens.color }}
      />
      <span className="truncate">{lens.label}</span>
    </button>
  );
}
