"use client";

import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useT } from "@/lib/i18n";
import { HeaderBlock } from "@/components/ui/header-block";

/**
 * Üst menü — sayfanın tepesindeki kare düğmeler şeridi (Brütal). Solda geri,
 * sağda sayfanın eylemleri. Yapışkan: sayfa kayarken düğmeler elde kalır.
 * Katmanla (bkz. Layer) birlikte sayfaların ortak iskeleti: gün, kategori,
 * alt kategori… hepsi bunu kullanır, düzeltme tek yerden hepsine geçer.
 */
export function TopBar({
  back,
  backLabel,
  label,
  color = "#ffd23f",
  children,
  className,
}: {
  back?: string;
  backLabel?: string;
  /** Ortadaki hücrede küçük bölüm adı (Yapı) */
  label?: string;
  /** Bölümün rengi — varsayılan Yapı'nın sarısı */
  color?: string;
  /** Sağdaki düğmeler (TopBarButton) */
  children?: ReactNode;
  className?: string;
}) {
  const t = useT();
  // Ana sayfanın blok dili (bkz. HeaderBlock): solda geri karosu, ortada
  // bölümün benekli hücresi, sağda eylem karoları
  return (
    <HeaderBlock
      color={color}
      className={className}
      leading={back ? <TopBarButton icon={ArrowLeft} label={backLabel ?? t("action.back")} href={back} /> : undefined}
      trailing={children ? <div data-top-bar="" className="flex shrink-0 gap-[2px]">{children}</div> : undefined}
    >
      {label && <span className="truncate text-[11.5px] font-extrabold uppercase tracking-wider">{label}</span>}
    </HeaderBlock>
  );
}

const TONE: Record<"add" | "danger", string> = {
  add: "#7ae582",
  danger: "#ff6b6b",
};

/** Kare, çerçeveli, gölgeli düğme — görünümü [data-brut-sq] kuralından */
export function TopBarButton({
  icon: Icon,
  label,
  href,
  onClick,
  tone,
  prefetch,
}: {
  icon: LucideIcon;
  label: string;
  href?: string;
  onClick?: () => void;
  /** Ana eylem yeşil, silme kırmızı; gerisi beyaz */
  tone?: "add" | "danger";
  prefetch?: boolean;
}) {
  // Başlık bloğunun karosu: hücreyi boydan doldurur (eskiden çerçeveli,
  // gölgeli kare düğmeydi)
  const props = {
    "aria-label": label,
    title: label,
    style: { background: tone ? TONE[tone] : "#ffffff" } as CSSProperties,
    className: "flex w-[48px] shrink-0 items-center justify-center text-[#111] active:brightness-95",
  };
  const icon = <Icon className="h-5 w-5" strokeWidth={tone === "add" ? 3 : 2.5} />;
  return href ? (
    <Link href={href} prefetch={prefetch} {...props}>
      {icon}
    </Link>
  ) : (
    <button type="button" onClick={onClick} {...props}>
      {icon}
    </button>
  );
}
