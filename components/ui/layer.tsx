"use client";

import { type CSSProperties, type ReactNode } from "react";
import { useSkin, isBlockSkin } from "@/lib/skin";
import { cn } from "@/lib/utils";

/**
 * Sayfa zemini — en arkadaki krem döşemenin önünde, ekranı kaplayan ikinci
 * yüzey (beyaz, kalın çerçeve, üst köşeleri yuvarlak). Üst menü döşemede
 * kalır; sayfanın bütün malzemesi (özet bloğu, katmanlar) bunun üstünde.
 * Kısa sayfada da alt menüye kadar iner (sarmalayıcı min-h-full, zemin
 * flex-1; -mb-4 AppShell main'inin alt payını yer). Yalnız Brütal temada;
 * ötekilerde üst kısım ve içerik olduğu gibi dizilir.
 *
 * Kenar payları kaydırma çubuğunun ayrılmış yerine göre: solda -6, sağda
 * -12 px ile iki yanda 10'ar px döşeme kalıyor (bkz. AppShell'in main'i).
 * İlk hali kenarlara 6 px yaklaşıyordu, ekranın tamamı gibi duruyordu;
 * kullanıcı küçültülmesini istedi. İç pay da inceldi (8 → 6 px), içerik
 * eskisinden daralmasın. Üst kısmın (bant, üst menü) altındaki boşluk her
 * sayfada aynı: 12 px.
 *
 * Sayfanın kendi sarmalayıcısı flex sütunsa (Takvim) flex-1 ile dolar.
 *
 * `fit`: zemin içeriğinin boyunda, alt menüye kadar inmez — dört kenarı
 * çerçeveli, köşeleri yuvarlak bir pencere (Takvim: pencere ayın
 * ızgarasıyla biter; eskiden altında ekranın sonuna kadar boş beyazlık vardı).
 *
 * --bleed: kenardan kenara uzanan kaydırmalı şeritlerin (çipler, kutu
 * sıraları) taşma payı. Zeminsiz sayfada main'in kenar payı (1rem); zeminde
 * zeminin iç payı — yoksa şerit zeminin çerçevesini aşıp sayfayı yana
 * kaydırıyordu. Katmanın içinde eskisi gibi 1rem.
 */
export function PageSheet({ top, fit = false, children }: { top?: ReactNode; fit?: boolean; children?: ReactNode }) {
  const brutal = isBlockSkin(useSkin());
  if (!brutal) {
    return (
      <>
        {top}
        {children}
      </>
    );
  }
  return (
    <div className="flex min-h-full flex-1 flex-col [&>:not([data-page-sheet])]:mb-3">
      {top}
      <div
        data-page-sheet=""
        className={cn(
          "-ml-[6px] -mr-[12px] border-2 border-line bg-paper px-1.5 pt-3 [--bleed:6px]",
          fit ? "rounded-[20px] pb-1" : "-mb-4 flex-1 rounded-t-[20px] border-b-0 pb-8"
        )}
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
  const brutal = isBlockSkin(useSkin());
  if (!brutal) return <div className={className} style={style}>{children}</div>;
  if (bare) return <div className={cn("mb-4", className?.replace(/mb-6/, "mb-4"))} style={style}>{children}</div>;
  return (
    <div
      data-layer=""
      style={style}
      className={cn(
        "mb-4 rounded-[22px] border-2 border-line bg-paper-2 p-3.5 shadow-[4px_4px_0_var(--shade)] [--bleed:1rem]",
        // Pencereler arası brütalde hep aynı, sıkı aralık (diğer temalardaki mb-6 burada geçmez)
        className?.replace(/mb-6/, "mb-4")
      )}
    >
      {label && (
        <div className="mb-3 ml-0.5 flex items-center gap-2 text-[12px] font-black uppercase leading-none tracking-[0.09em] text-ink">
          {label}
          {extra && <span className="-ml-1 font-bold normal-case tracking-normal text-ink/60">{extra}</span>}
          {count != null && count > 0 && (
            <b className="rounded-full border-[1.5px] border-line bg-paper px-2 py-[2px] font-mono font-bold tracking-normal text-ink">
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
