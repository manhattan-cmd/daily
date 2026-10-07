"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

interface PageHeaderProps {
  title: string;
  description?: string;
  /** Açıklama satır sayısı — varsayılan 1 (tek satır, kırpılır); 2 iki satıra sarar */
  descriptionLines?: 1 | 2;
  back?: string;
  action?: React.ReactNode;
  /**
   * Başlığın altına, AYNI yapışkan bandın içine giren gezinme şeridi.
   *
   * Şerit eskiden sayfa gövdesindeydi: içerikle aynı zeminde duruyordu, yani
   * "bu sayfanın bir parçası mı, bölümün menüsü mü" belli olmuyordu ve
   * kaydırınca kayboluyordu. Bandın içinde menü sayfadan ayrılıyor ve
   * kaydırma boyunca yerinde kalıyor.
   */
  nav?: React.ReactNode;
  /**
   * Sade başlık: küçük tek satır, açıklama başlığın yanında sönük. Bandın asıl
   * işi menülerse (analizde zaman + yol) odak başlıkta kalmasın diye.
   */
  compact?: boolean;
  /**
   * Kısılmış hal — sayfa aşağı kaydırılınca. Başlık küçülür, açıklama gizlenir,
   * bandın içindeki öğeler data-collapsed işaretine bakarak incelir.
   */
  collapsed?: boolean;
  /** Başlık satırının YERİNE çizilecek içerik (ör. ortalanmış tarih kumandası) */
  titleSlot?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  description,
  descriptionLines = 1,
  back,
  action,
  nav,
  compact = false,
  collapsed = false,
  titleSlot,
  className,
}: PageHeaderProps) {
  const t = useT();
  return (
    <header
      data-collapsed={collapsed}
      className={cn(
        "group/hdr sticky top-0 z-30 -mx-4 mb-6 border-b border-border bg-background/85 px-4 pt-safe backdrop-blur-xl",
        nav ? (collapsed || compact ? "pb-2.5" : "pb-3") : "pb-4",
        className
      )}
    >
      {titleSlot ? (
        <div className="pt-2.5">{titleSlot}</div>
      ) : (
      <div
        className={cn(
          "flex items-center",
          compact ? (collapsed ? "gap-2 pt-1.5" : "gap-2 pt-2.5") : "gap-3 pt-4"
        )}
      >
        {back ? (
          <Link
            href={back}
            className={cn(
              "flex shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
              compact ? (collapsed ? "-ml-1.5 h-7 w-7" : "-ml-1.5 h-8 w-8") : "h-9 w-9"
            )}
            aria-label={t("action.back")}
          >
            <ArrowLeft className={compact ? "h-[18px] w-[18px]" : "h-5 w-5"} />
          </Link>
        ) : null}
        {compact ? (
          <div className="flex min-w-0 flex-1 items-baseline gap-2">
            <h1
              className={cn(
                "truncate font-semibold tracking-tight",
                collapsed ? "text-[13px]" : "text-[14px]"
              )}
            >
              {title}
            </h1>
            {description && !collapsed ? (
              <span className="shrink-0 truncate text-[12px] text-muted-foreground">
                {description}
              </span>
            ) : null}
          </div>
        ) : (
        <div className="flex-1 min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight">
            {title}
          </h1>
          {description ? (
            <p
              className={cn(
                "text-sm text-muted-foreground",
                descriptionLines === 2 ? "line-clamp-2" : "truncate"
              )}
            >
              {description}
            </p>
          ) : null}
        </div>
        )}
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      )}
      {nav ? <div className={collapsed || compact ? "mt-2" : "mt-3"}>{nav}</div> : null}
    </header>
  );
}
