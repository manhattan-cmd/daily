"use client";

import { createContext, useContext, type CSSProperties, type ReactNode } from "react";
import { useSkin } from "@/lib/skin";
import { cn } from "@/lib/utils";

/** Adı olan katmanın işaret rengi — adına göre sabit, sayfadan sayfaya aynı */
const ACCENTS = ["#8ea6ff", "#7ae582", "#ffd23f", "#ff8fab", "#c49bff", "#ffa552"];
function accentOf(label: string): string {
  let h = 0;
  for (let i = 0; i < label.length; i++) h = (h * 31 + label.charCodeAt(i)) >>> 0;
  return ACCENTS[h % ACCENTS.length];
}

/**
 * Bir kategoriye ait sayfada (yapı, analiz) katman işaretleri o kategorinin
 * rengini alır — sayfanın tamamı aynı renge bağlanır.
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
 * Adın önündeki renkli kare işaret katmanlara renk katar (bkz. LayerAccent).
 */
export function Layer({
  label,
  count,
  extra,
  className,
  style,
  children,
}: {
  /** Katmanın başında küçük ad (Gün özeti, Günün girdileri…) */
  label?: string;
  count?: number;
  /** Adın yanında küçük, normal harfli ek ("(Toplam)" gibi) */
  extra?: ReactNode;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const brutal = useSkin() === "brutal";
  const pageAccent = useContext(LayerAccentContext);
  if (!brutal) return <div className={className} style={style}>{children}</div>;
  const accent = label ? pageAccent ?? accentOf(label) : undefined;
  return (
    <div
      data-layer=""
      style={style}
      className={cn(
        "mb-6 rounded-[22px] border-2 border-[#111] bg-[#f5f1e8] p-3.5 shadow-[5px_5px_0_#111]",
        className
      )}
    >
      {label && (
        <div className="mb-3 ml-0.5 flex items-center gap-2 text-[12px] font-black uppercase leading-none tracking-[0.09em] text-[#111]">
          <span
            aria-hidden
            className="h-3 w-3 shrink-0 rounded-[4px] border-[1.5px] border-[#111]"
            style={{ background: accent }}
          />
          {label}
          {extra && <span className="-ml-1 font-bold normal-case tracking-normal text-[#111]/60">{extra}</span>}
          {count != null && count > 0 && (
            <b
              className="rounded-md border-[1.5px] border-[#111] px-1.5 py-[2px] font-mono font-bold tracking-normal text-[#111]"
              style={{ background: accent }}
            >
              {count}
            </b>
          )}
        </div>
      )}
      {children}
    </div>
  );
}
