"use client";

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Bölüm bantlarının tram benekleri (bkz. globals.css "bolum bantlari") */
export const bandDots = (color: string): CSSProperties => ({
  backgroundColor: color,
  backgroundImage: "radial-gradient(rgba(17, 17, 17, 0.16) 1.2px, transparent 1.5px)",
  backgroundSize: "11px 11px",
});

/** Bant sınıfından bölümün rengi — sayfalar başlığa bantlarını sınıfla veriyor */
const BANDS: [string, string][] = [
  ["yapi-band", "#ffd23f"],
  ["band-an", "#8ea6ff"],
  ["band-cal", "#7ae582"],
  ["band-home", "#6366f1"],
];
export const bandColor = (className?: string): string =>
  BANDS.find(([k]) => className?.split(/\s+/).includes(k))?.[1] ?? "#ffffff";

/**
 * Sayfa başlığı (Brütal) — ana sayfanın blok dili başlıkta: tek blok, ortak
 * 2 px çizgiler. Ortada bölümün rengindeki benekli hücre (eski kenardan
 * kenara bandın kendisi), iki yanında karolar (geri, ‹ ›, Ayarlar,
 * + Kategori, düzenle…), altında satırlar (Yapı sekmeleri, Analiz'in dönem
 * ve yer seçicileri).
 *
 * Eskiden başlık ekranın iki yanına uzanan renkli bir şeritti; altındaki
 * sayfa zemini ve bloklarla iki ayrı dil konuşuyordu. Kenarları sayfa
 * zeminiyle hizalı (solda 10, sağda gölgesiyle 10 px).
 *
 * Yapışkan başlıkta krem döşeme bloğun çevresini doldurur: kayan içerik
 * bloğun altından görünmesin.
 */
export function HeaderBlock({
  color,
  leading,
  trailing,
  rows,
  children,
  sticky = true,
  center = false,
  className,
  style,
}: {
  color: string;
  /** Soldaki karo(lar) — geri, önceki */
  leading?: ReactNode;
  /** Sağdaki karo(lar) — eylemler, sonraki */
  trailing?: ReactNode;
  /** Ana satırın altındaki satırlar; zeminleri çağıranın (hücreler beyaz) */
  rows?: ReactNode;
  children?: ReactNode;
  sticky?: boolean;
  /** Ortadaki hücrenin içi ortalı (Takvim, Gün) */
  center?: boolean;
  className?: string;
  /** Ortadaki hücrenin içine (Takvim'in kaydırma kayması) */
  style?: CSSProperties;
}) {
  return (
    <header
      data-header-block=""
      className={cn(
        // !mb-0: sayfa zemininin "üst kısmın altı 12 px" kuralı burada pb-3
        "-mx-4 !mb-0 bg-background pb-3 pl-[10px] pr-[8px] pt-[max(12px,calc(env(safe-area-inset-top,0px)+8px))]",
        sticky && "sticky top-0 z-30",
        className
      )}
    >
      <div className="grid gap-[2px] overflow-hidden rounded-[18px] border-2 border-[#111] bg-[#111] text-[#111] shadow-[4px_4px_0_#111]">
        <div className="flex min-h-[64px] gap-[2px]">
          {leading}
          <div
            className={cn(
              "flex min-w-0 flex-1 flex-col justify-center px-3.5 py-2.5",
              center && "items-center text-center"
            )}
            style={bandDots(color)}
          >
            <div className={cn("flex min-w-0 max-w-full flex-col", center && "items-center")} style={style}>
              {children}
            </div>
          </div>
          {trailing}
        </div>
        {rows}
      </div>
    </header>
  );
}

/** Başlık — siyah kutuda bandın renginde harf (eski bantların başlığı gibi) */
export function HeaderTitle({
  children,
  color,
  size = 26,
  center = false,
}: {
  children: ReactNode;
  color: string;
  size?: number;
  center?: boolean;
}) {
  return (
    <h1
      className={cn(
        "inline-block max-w-full break-words rounded-[11px] bg-[#111] px-3 pb-1.5 pt-1 font-black leading-none tracking-tight shadow-[3px_3px_0_rgba(17,17,17,0.25)]",
        center ? "self-center" : "self-start"
      )}
      style={{ color: color === "#ffffff" ? "#fff4dc" : color, fontSize: size }}
    >
      {children}
    </h1>
  );
}

/** Başlığın üstündeki küçük kalın yazı (selam, açıklama) */
export function HeaderOverline({ children }: { children: ReactNode }) {
  return <p className="mb-1.5 truncate text-[11.5px] font-extrabold uppercase tracking-wider">{children}</p>;
}

/**
 * Başlığın karosu — bloğun yanındaki kare hücre: simge (varsa altında kısa
 * ad). Ekleme işleri yeşil, silme kırmızı, gerisi beyaz.
 */
export function HeaderTile({
  icon: Icon,
  label,
  href,
  onClick,
  color = "#ffffff",
  ariaLabel,
  disabled,
  width = 52,
}: {
  icon: LucideIcon;
  label?: string;
  href?: string;
  onClick?: () => void;
  color?: string;
  ariaLabel?: string;
  disabled?: boolean;
  width?: number;
}) {
  const cls = cn(
    "flex shrink-0 flex-col items-center justify-center gap-1 text-[#111] active:brightness-95 disabled:opacity-35",
    label && "px-2"
  );
  const st: CSSProperties = { background: color, minWidth: width };
  const body = (
    <>
      <Icon className="h-5 w-5 shrink-0" strokeWidth={2.5} />
      {label && <span className="whitespace-nowrap text-[11px] font-black leading-none">{label}</span>}
    </>
  );
  return href ? (
    <Link href={href} aria-label={ariaLabel ?? label} title={ariaLabel ?? label} prefetch={false} className={cls} style={st}>
      {body}
    </Link>
  ) : (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel ?? label}
      title={ariaLabel ?? label}
      disabled={disabled}
      className={cls}
      style={st}
    >
      {body}
    </button>
  );
}
