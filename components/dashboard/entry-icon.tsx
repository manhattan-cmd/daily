"use client";

import { CategoryIcon, CATEGORY_ICON_MAP } from "@/lib/category-icons";
import { cn } from "@/lib/utils";
import type { Category, SubCategory } from "@/types";

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
  const iconName = subcategory?.icon || category.icon;
  const isLucide = !!iconName && iconName in CATEGORY_ICON_MAP;

  const boxCls = size === "sm" ? "h-7 w-7 rounded-lg" : "h-10 w-10 rounded-xl";
  const iconCls = size === "sm" ? "h-3.5 w-3.5" : "h-5 w-5";
  const emojiCls = size === "sm" ? "text-sm" : "text-xl";

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center",
        boxCls,
        className
      )}
      style={{ backgroundColor: `${category.color}22` }}
    >
      {isLucide ? (
        <CategoryIcon
          name={iconName}
          className={iconCls}
          style={{ color: category.color }}
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
          style={{ color: category.color }}
        >
          {(subcategory?.name ?? category.name).charAt(0).toLocaleUpperCase("tr-TR")}
        </span>
      )}
    </div>
  );
}
