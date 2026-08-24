"use client";

import { SymbolIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import type { Category, SubCategory } from "@/types";

/**
 * Standart ikon rozeti — uygulama genelinde girdi/kategori sembolü tek dilden:
 * degrade zemin + ince renk halkası. Biçim hiyerarşiyi anlatır:
 * alt kategorinin KENDİ ikonu varsa daire (girdi düzeyi), kategori ikonuna
 * düşülüyorsa squircle (kategori düzeyi).
 *
 * `shape="square"` bu ayrımı bilerek kapatır: girdi kartında sembol kendi
 * penceresinde duruyor ve o pencere kare — içine daire koymak kutu içinde kutu
 * gibi duruyordu. Orada sembolün kime ait olduğu ayrımından vazgeçildi.
 */
export function EntryIcon({
  category,
  subcategory,
  size = "md",
  shape = "auto",
  className,
}: {
  category: Category;
  subcategory?: SubCategory;
  size?: "sm" | "md" | "lg" | "fill";
  /** "square" ise kendi ikonu olan alt kategori de kare çizilir */
  shape?: "auto" | "square";
  className?: string;
}) {
  const ownIcon = subcategory?.icon;
  const iconName = ownIcon || category.icon;
  const color = category.color;
  const shapeCls =
    shape === "square" || !ownIcon
      ? size === "sm"
        ? "rounded-lg"
        : "rounded-xl"
      : "rounded-full";

  const boxCls =
    size === "sm"
      ? "h-7 w-7"
      : size === "lg"
        ? "h-11 w-11"
        : size === "fill"
          ? "h-full w-full"
          : "h-9 w-9";
  const iconSize = size === "sm" ? 14 : size === "md" ? 18 : 22;

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
      {iconName ? (
        <SymbolIcon
          name={iconName}
          size={iconSize}
          className="select-none"
          style={{ color }}
        />
      ) : (
        <span
          className={cn(
            "font-semibold leading-none select-none",
            size === "sm" ? "text-xs" : size === "md" ? "text-sm" : "text-base"
          )}
          style={{ color }}
        >
          {(subcategory?.name ?? category.name).charAt(0).toLocaleUpperCase("en-US")}
        </span>
      )}
    </div>
  );
}
