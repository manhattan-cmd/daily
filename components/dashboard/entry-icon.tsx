"use client";

import { CategoryIcon, CATEGORY_ICON_MAP } from "@/lib/category-icons";
import { cn } from "@/lib/utils";
import type { Category, SubCategory } from "@/types";

/**
 * Standart ikon rozeti — uygulama genelinde girdi/kategori sembolü tek dilden:
 * degrade zemin + ince renk halkası. Biçim hiyerarşiyi anlatır:
 * alt kategorinin KENDİ ikonu varsa daire (girdi düzeyi), kategori ikonuna
 * düşülüyorsa squircle (kategori düzeyi).
 */
export function EntryIcon({
  category,
  subcategory,
  size = "md",
  className,
}: {
  category: Category;
  subcategory?: SubCategory;
  size?: "sm" | "md";
  className?: string;
}) {
  const ownIcon = subcategory?.icon;
  const iconName = ownIcon || category.icon;
  const isLucide = !!iconName && iconName in CATEGORY_ICON_MAP;
  const color = category.color;
  const shapeCls = ownIcon ? "rounded-full" : size === "sm" ? "rounded-lg" : "rounded-xl";

  const boxCls = size === "sm" ? "h-7 w-7" : "h-9 w-9";
  const iconCls = size === "sm" ? "h-3.5 w-3.5" : "h-[18px] w-[18px]";
  const emojiCls = size === "sm" ? "text-sm" : "text-lg";

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center",
        boxCls,
        shapeCls,
        className
      )}
      style={{
        background: `linear-gradient(135deg, ${color}30, ${color}12)`,
        boxShadow: `inset 0 0 0 1px ${color}2e`,
      }}
    >
      {isLucide ? (
        <CategoryIcon
          name={iconName}
          className={iconCls}
          style={{ color }}
        />
      ) : iconName ? (
        <span className={cn("leading-none select-none", emojiCls)}>
          {iconName}
        </span>
      ) : (
        <span
          className={cn(
            "font-semibold leading-none select-none",
            size === "sm" ? "text-xs" : "text-sm"
          )}
          style={{ color }}
        >
          {(subcategory?.name ?? category.name).charAt(0).toLocaleUpperCase("tr-TR")}
        </span>
      )}
    </div>
  );
}
