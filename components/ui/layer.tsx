"use client";

import { createContext, useContext, type CSSProperties, type ReactNode } from "react";
import { useSkin } from "@/lib/skin";
import { cn } from "@/lib/utils";

/**
 * Yapının kategori ve alt kategori sayfalarında katmanlar solda o kategorinin
 * renginde şerit taşır — sayfanın tamamı aynı renge bağlanır.
 */
const LayerAccentContext = createContext<string | undefined>(undefined);
export function LayerAccent({ color, children }: { color?: string; children: ReactNode }) {
  return <LayerAccentContext.Provider value={color}>{children}</LayerAccentContext.Provider>;
}

/**
 * Katman — bölümün yüzeyi. Üç kat var: en arkada sayfanın döşemesi (krem),
 * üstünde her bölümün kendi katmanı, en üstte kartlar. Özetle kayıtlar aynı
 * zeminde arka arkaya dizilince birbirine karışıyordu; katman bir bölümü tek
 * parça okutur. Yalnız Brütal temada çizilir, ötekilerde düz bir kutu.
 */
export function Layer({
  label,
  count,
  extra,
  action,
  className,
  style,
  children,
}: {
  /** Katmanın başında küçük ad (Gün özeti, Günün girdileri…) */
  label?: string;
  count?: number;
  /** Adın yanında küçük, normal harfli ek ("(Toplam)" gibi) */
  extra?: ReactNode;
  /** Başlık satırının sağında düğme (Ara gibi) */
  action?: ReactNode;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const brutal = useSkin() === "brutal";
  const pageAccent = useContext(LayerAccentContext);
  if (!brutal) return <div className={className} style={style}>{children}</div>;
  return (
    <div
      data-layer=""
      // Yapının kategori sayfalarında Yapı → Kategoriler kartlarının dili:
      // solda kategorinin renginde şerit ve siyah ayırıcı çizgi (şerit zeminin
      // parçası, düzen bozulmaz). Öteki sayfalarda düz beyaz pencere.
      style={
        pageAccent
          ? { backgroundImage: `linear-gradient(90deg, ${pageAccent} 0 12px, #111 12px 14px, #fff 14px)`, ...style }
          : style
      }
      className={cn(
        "mb-4 rounded-[22px] border-2 border-[#111] bg-white py-3.5 pr-3.5 shadow-[4px_4px_0_#111]",
        pageAccent ? "pl-[26px]" : "pl-3.5",
        // Pencereler arası brütalde hep aynı, sıkı aralık (diğer temalardaki mb-6 burada geçmez)
        className?.replace(/mb-6/, "mb-4")
      )}
    >
      {label && (
        <div className="mb-3 ml-0.5 flex items-center gap-2 text-[12px] font-black uppercase leading-none tracking-[0.09em] text-[#111]">
          {label}
          {extra && <span className="-ml-1 font-bold normal-case tracking-normal text-[#111]/60">{extra}</span>}
          {count != null && count > 0 && (
            <b className="rounded-full border-[1.5px] border-[#111] bg-white px-2 py-[2px] font-mono font-bold tracking-normal text-[#111]">
              {count}
            </b>
          )}
          {action && <span className="ml-auto normal-case tracking-normal">{action}</span>}
        </div>
      )}
      {children}
    </div>
  );
}
