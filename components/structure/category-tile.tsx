"use client";

import Link from "next/link";
import { Folder, Plus } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { CategoryIcon, CATEGORY_ICON_MAP } from "@/lib/category-icons";
import { cn } from "@/lib/utils";

/**
 * Kategori rafı — atomların karesi. Özellik atomlarıyla aynı boyut ve
 * ızgara düzeni; daire yerine yumuşak kare, kategori kendi renginde parlar.
 */
export function CategoryTileCore({
  color,
  icon,
  fallback: Fallback = Folder,
  size = "md",
}: {
  color: string;
  /** Lucide adı ya da emoji; yoksa fallback ikonu */
  icon?: string;
  fallback?: LucideIcon;
  size?: "md" | "lg";
}) {
  const isLucide = !!icon && icon in CATEGORY_ICON_MAP;
  const iconCls = cn(size === "lg" ? "h-7 w-7" : "h-5 w-5");
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center",
        size === "lg" ? "h-16 w-16 rounded-2xl" : "h-12 w-12 rounded-xl"
      )}
      style={{
        background: `linear-gradient(145deg, ${color}42, ${color}14)`,
        boxShadow: `inset 0 0 0 1px ${color}55, 0 0 14px ${color}1f`,
      }}
    >
      {isLucide ? (
        <CategoryIcon name={icon} className={iconCls} style={{ color }} />
      ) : icon ? (
        <span
          className={cn(
            "leading-none select-none",
            size === "lg" ? "text-2xl" : "text-xl"
          )}
        >
          {icon}
        </span>
      ) : (
        <Fallback className={iconCls} style={{ color }} strokeWidth={1.75} />
      )}
    </span>
  );
}

const tileWrapCls =
  "flex flex-col items-center gap-1.5 rounded-2xl px-1 py-2 transition-all hover:bg-white/5 active:scale-[0.92]";
const tileLabelCls =
  "w-full truncate text-center text-[11px] font-medium leading-tight";

/** Raf karosu — bağlantı ya da düğme olarak, sık 4 sütunlu ızgarada dizilir */
export function CategoryTile({
  color,
  icon,
  fallback,
  name,
  href,
  onClick,
}: {
  color: string;
  icon?: string;
  fallback?: LucideIcon;
  name: string;
  href?: string;
  onClick?: () => void;
}) {
  const content = (
    <>
      <CategoryTileCore color={color} icon={icon} fallback={fallback} />
      <span className={tileLabelCls}>{name}</span>
    </>
  );
  if (href) {
    return (
      <Link href={href} className={tileWrapCls}>
        {content}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={tileWrapCls}>
      {content}
    </button>
  );
}

/** Izgara sonuna eklenen "yeni" karosu — kesikli boş raf */
export function CategoryTileAdd({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(tileWrapCls, "group")}
    >
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-dashed border-primary/35 text-primary/60 transition-colors group-hover:border-primary/60 group-hover:text-primary">
        <Plus className="h-5 w-5" strokeWidth={1.75} />
      </span>
      <span
        className={cn(
          tileLabelCls,
          "text-muted-foreground group-hover:text-foreground"
        )}
      >
        {label}
      </span>
    </button>
  );
}
