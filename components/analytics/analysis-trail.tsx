"use client";

import { ChevronRight, LayoutGrid } from "lucide-react";
import { HScroll } from "@/components/ui/h-scroll";
import { cn } from "@/lib/utils";
import { RAIL, RAIL_ITEM } from "./header-rail";

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
  // Kök ("Kategoriler") rayın solunda SABİT: yol uzayıp sona kayınca kök
  // kayan kısmın kenar solmasına giriyor, yarım ve soluk kalıyordu
  const root = steps.find((s) => s.root);
  const rest = steps.filter((s) => !s.root);
  const placeKey = steps[steps.length - 1]?.key;
  return (
    <div className={RAIL}>
      {root && (
        <button
          type="button"
          onClick={root.onClick}
          aria-current={root.key === placeKey ? "location" : undefined}
          className={cn(RAIL_ITEM, "gap-1.5 px-2.5")}
          // Kök hep aynı: dolu mor, beyaz yazı. Bir ara seçili değilken
          // açık tona dönüyordu; telefonda neredeyse okunmuyordu
          style={{ background: "#6366f1", color: "#fff" }}
        >
          <LayoutGrid className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{root.label}</span>
        </button>
      )}
      {rest.length > 0 && (
        <HScroll
          className="items-center gap-0.5"
          wrapperClassName="min-w-0 flex-1"
          followEnd={rest.map((s) => s.key).join("|")}
        >
          {rest.map((s) => {
            const isPlace = s.key === placeKey;
            return (
              <span key={s.key} className="flex shrink-0 items-center gap-0.5">
                <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/35" />
                <button
                  type="button"
                  onClick={s.onClick}
                  aria-current={isPlace ? "location" : undefined}
                  className={cn(
                    RAIL_ITEM,
                    "max-w-[170px] gap-1.5 px-2.5",
                    !isPlace && "text-muted-foreground hover:text-foreground"
                  )}
                  style={
                    isPlace && s.color
                      ? {
                          background: `${s.color}33`,
                          color: "var(--foreground)",
                          boxShadow: `inset 0 0 0 1px ${s.color}73`,
                        }
                      : undefined
                  }
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: s.color }}
                  />
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
        "flex h-7 max-w-[130px] items-center gap-1.5 rounded-[9px] px-2.5 text-[12px] font-semibold transition-colors",
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
