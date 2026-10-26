"use client";

import { type CSSProperties, type ReactNode } from "react";
import { useSkin } from "@/lib/skin";
import { cn } from "@/lib/utils";

/**
 * Sayfa zemini — en arkadaki krem döşemenin önünde, ekranı kaplayan ikinci
 * yüzey (beyaz, kalın çerçeve, üst köşeleri yuvarlak). Üst menü döşemede
 * kalır; sayfanın bütün malzemesi (özet bloğu, katmanlar) bunun üstünde.
 * Kısa sayfada da alt menüye kadar iner (sarmalayıcı min-h-full, zemin
 * flex-1; -mb-4 AppShell main'inin alt payını yer). Yalnız Brütal temada;
 * ötekilerde üst kısım ve içerik olduğu gibi dizilir.
 *
 * Kenar payları kaydırma çubuğunun ayrılmış yerine göre: solda -10, sağda
 * -16 px ile iki yanda 6'şar px döşeme kalıyor (bkz. AppShell'in main'i).
 */
export function PageSheet({ top, children }: { top?: ReactNode; children: ReactNode }) {
  const brutal = useSkin() === "brutal";
  if (!brutal) {
    return (
      <>
        {top}
        {children}
      </>
    );
  }
  return (
    <div className="flex min-h-full flex-col">
      {top}
      <div
        data-page-sheet=""
        className="-mb-4 -ml-[10px] -mr-[16px] flex-1 rounded-t-[26px] border-2 border-b-0 border-[#111] bg-white px-2 pb-8 pt-4"
      >
        {children}
      </div>
    </div>
  );
}

/**
 * Katman — bölümün yüzeyi. Dört kat var: en arkada sayfanın döşemesi (krem),
 * önünde ekranı kaplayan sayfa zemini (PageSheet), üstünde her bölümün kendi
 * katmanı, en üstte kartlar. Özetle kayıtlar aynı
 * zeminde arka arkaya dizilince birbirine karışıyordu; katman bir bölümü tek
 * parça okutur. Yalnız Brütal temada çizilir, ötekilerde düz bir kutu.
 */
export function Layer({
  label,
  count,
  extra,
  action,
  bare = false,
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
  /** İçerik zaten kendi penceresiyse dış katman çizilmez (iç içe iki pencere olmasın) */
  bare?: boolean;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const brutal = useSkin() === "brutal";
  if (!brutal) return <div className={className} style={style}>{children}</div>;
  if (bare) return <div className={cn("mb-4", className?.replace(/mb-6/, "mb-4"))} style={style}>{children}</div>;
  return (
    <div
      data-layer=""
      style={style}
      className={cn(
        "mb-4 rounded-[22px] border-2 border-[#111] bg-[#f5f1e8] p-3.5 shadow-[4px_4px_0_#111]",
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
