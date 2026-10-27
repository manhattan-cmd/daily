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
              "flex min-w-0 flex-1 flex-col justify-center px-3 py-2.5",
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

/**
 * Etiketin yazı rengi — bandın kendi rengi; koyu bantta (ana sayfanın
 * moru) siyah kutuda okunmuyor, açık tonu; beyaz bantta krem.
 */
const chipInk = (color: string) =>
  color === "#ffffff" ? "#fff4dc" : color === "#6366f1" ? "#c7cbff" : color;

/**
 * Başlık — bandın üstünde düz, kalın siyah yazı.
 *
 * İlk hali siyah kutuda bandın renginde ters yazıydı (eski bantların
 * başlığı); blokta kaba, ağır duruyordu — kutu bütün hücreyi kaplıyor,
 * yanındaki her şeyi eziyordu. Bloklarda olduğu gibi siyah kutu yalnız
 * küçük etikette (bkz. HeaderOverline).
 */
export function HeaderTitle({
  children,
  size = 24,
  center = false,
}: {
  children: ReactNode;
  size?: number;
  center?: boolean;
}) {
  return (
    <h1
      className={cn(
        "max-w-full break-words font-black leading-[1.02] tracking-[-0.02em] text-[#111]",
        center ? "self-center text-center" : "self-start"
      )}
      style={{ fontSize: size }}
    >
      {children}
    </h1>
  );
}

/**
 * Başlığın üstündeki etiket — bloklardaki "BUGÜN", "SON GİRDİLER"
 * etiketinin aynısı: siyah kutuda bandın renginde küçük kalın harf,
 * isteğe bağlı simgeyle (selamın güneşi/ayı).
 */
export function HeaderOverline({
  children,
  color = "#ffffff",
  icon: Icon,
  center = false,
}: {
  children: ReactNode;
  color?: string;
  icon?: LucideIcon;
  center?: boolean;
}) {
  return (
    <span
      className={cn(
        "mb-1.5 inline-flex max-w-full items-center gap-1 rounded-md bg-[#111] px-1.5 py-[2px] text-[10px] font-black uppercase leading-tight tracking-wider",
        center ? "self-center" : "self-start"
      )}
      style={{ color: chipInk(color) }}
    >
      {Icon && <Icon className="h-3 w-3 shrink-0" strokeWidth={3} />}
      <span className="truncate">{children}</span>
    </span>
  );
}

/** Başlığın yanındaki beyaz kare simge — blokların kalem karosu gibi (bkz. SummaryLead "thing") */
export function HeaderIcon({ icon: Icon, fill }: { icon: LucideIcon; /** Şekli bandın renginde doldur (Yapı: seçili sekmenin şekli gibi) */ fill?: string }) {
  return (
    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[11px] border-2 border-[#111] bg-white text-[#111] shadow-[2px_2px_0_#111]">
      <Icon className="h-[22px] w-[22px]" strokeWidth={2.5} fill={fill ?? "none"} />
    </span>
  );
}

/**
 * Başlık hücresinin olağan içi: solda simge karosu (ya da ana sayfanın
 * tarih yaprağı gibi özel bir karo), yanında etiket, başlık ve altında
 * küçük bir satır.
 */
export function HeaderLead({
  color,
  icon,
  iconFill = false,
  tile,
  overline,
  overlineIcon,
  title,
  sub,
  size = 24,
  badge,
}: {
  color: string;
  icon?: LucideIcon;
  iconFill?: boolean;
  /** Simge yerine özel karo */
  tile?: ReactNode;
  overline?: string;
  overlineIcon?: LucideIcon;
  title: ReactNode;
  sub?: ReactNode;
  size?: number;
  /** Başlığın yanındaki küçük sayı */
  badge?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      {tile ?? (icon && <HeaderIcon icon={icon} fill={iconFill ? color : undefined} />)}
      <div className="flex min-w-0 flex-1 flex-col">
        {overline && (
          <HeaderOverline color={color} icon={overlineIcon}>
            {overline}
          </HeaderOverline>
        )}
        <div className="flex min-w-0 items-center gap-2">
          <HeaderTitle size={size}>{title}</HeaderTitle>
          {badge}
        </div>
        {sub && <p className="mt-1 truncate text-[12px] font-bold leading-tight text-[#111]/80">{sub}</p>}
      </div>
    </div>
  );
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
