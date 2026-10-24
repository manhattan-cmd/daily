"use client";

import type { CSSProperties, ReactNode } from "react";
import { useSkin } from "@/lib/skin";
import { cn } from "@/lib/utils";

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
  if (!brutal) return <div className={className} style={style}>{children}</div>;
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
          {label}
          {extra && <span className="-ml-1 font-bold normal-case tracking-normal text-[#111]/60">{extra}</span>}
          {count != null && count > 0 && (
            <b className="rounded-md bg-[#111] px-1.5 py-[3px] font-mono font-bold tracking-normal text-[#f5f1e8]">
              {count}
            </b>
          )}
        </div>
      )}
      {children}
    </div>
  );
}
