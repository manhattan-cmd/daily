"use client";

import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * Üst menü — sayfanın tepesindeki kare düğmeler şeridi (Brütal). Solda geri,
 * sağda sayfanın eylemleri. Yapışkan: sayfa kayarken düğmeler elde kalır.
 * Katmanla (bkz. Layer) birlikte sayfaların ortak iskeleti: gün, kategori,
 * alt kategori… hepsi bunu kullanır, düzeltme tek yerden hepsine geçer.
 */
export function TopBar({
  back,
  backLabel,
  children,
  className,
}: {
  back?: string;
  backLabel?: string;
  /** Sağdaki düğmeler (TopBarButton) */
  children?: ReactNode;
  className?: string;
}) {
  const t = useT();
  return (
    <div
      data-top-bar=""
      className={cn(
        "sticky top-0 z-30 -mx-4 mb-4 flex items-center justify-between bg-background px-4 pb-3 pt-safe",
        className
      )}
    >
      <div className="pt-3">
        {back ? <TopBarButton icon={ArrowLeft} label={backLabel ?? t("action.back")} href={back} /> : <span />}
      </div>
      {children && <div className="flex gap-2 pt-3">{children}</div>}
    </div>
  );
}

const TONE: Record<"add" | "danger", CSSProperties> = {
  add: { background: "#7ae582" },
  danger: { background: "#ff6b6b" },
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
  const props = {
    "data-brut-sq": "",
    "aria-label": label,
    title: label,
    style: tone ? TONE[tone] : undefined,
    className: "flex h-10 w-10 shrink-0 items-center justify-center",
  };
  const icon = <Icon className="h-[18px] w-[18px]" strokeWidth={tone === "add" ? 3 : 2.5} />;
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
