"use client";

import Link from "next/link";
import { Folder, Plus } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { CategoryIcon, CATEGORY_ICON_MAP } from "@/lib/category-icons";
import { hexCorners, HEX_CLIP } from "@/lib/hex";
import { cn } from "@/lib/utils";

/** 0–255 arası değeri iki haneli hex alfaya çevirir */
const alpha = (v: number) =>
  Math.round(Math.max(0, Math.min(255, v)))
    .toString(16)
    .padStart(2, "0");

/**
 * Kategori gözü — peteğin altıgeni. Özellik atomlarıyla aynı boyut ve ızgara
 * düzeni; kategori kendi renginde parlar. Şekil dili: altıgen = kategori,
 * daire = özellik.
 * `glow` (0–1) parlamayı güçlendirir: girdi ekleme ağında sık kullanılan
 * alt kategoriler bununla öne çıkar.
 */
export function CategoryTileCore({
  color,
  icon,
  fallback: Fallback = Folder,
  size = "md",
  glow = 0,
}: {
  color: string;
  /** Lucide adı ya da emoji; yoksa fallback ikonu */
  icon?: string;
  fallback?: LucideIcon;
  size?: "sm" | "md" | "lg";
  /** 0: sönük · 1: en parlak (kardeşleri arasında en çok kullanılan) */
  glow?: number;
}) {
  const isLucide = !!icon && icon in CATEGORY_ICON_MAP;
  const g = Math.max(0, Math.min(1, glow));
  const iconCls = cn(
    size === "lg" ? "h-7 w-7" : size === "sm" ? "h-4 w-4" : "h-5 w-5"
  );
  // Altıgen: kategorinin şekli artık kare değil, peteğin gözü. Kovan
  // görünümüyle Yapı sayfasındaki ızgara aynı dili konuşsun diye tek yerde.
  //
  // Çerçeve clip-path'in dışında kalıyor (kırpılmış kenarda inset gölge
  // görünmez), o yüzden kenar çizgisi altta duran ikinci bir altıgen katman.
  const frame = `linear-gradient(145deg, ${color}${alpha(0x66 + 0x60 * g)}, ${color}30)`;
  const face = `linear-gradient(145deg, ${color}${alpha(0x42 + 0x2e * g)}, ${color}14)`;
  return (
    <span
      className={cn(
        "relative flex shrink-0 items-center justify-center",
        size === "lg" ? "h-16 w-16" : size === "sm" ? "h-9 w-9" : "h-12 w-12"
      )}
      style={{
        clipPath: HEX_CLIP,
        background: frame,
        filter: g > 0 ? `drop-shadow(0 0 ${5 + 9 * g}px ${color}${alpha(0x30 + 0x60 * g)})` : undefined,
      }}
    >
      <span
        aria-hidden
        className="absolute inset-[1.5px]"
        style={{ clipPath: HEX_CLIP, background: face }}
      />
      <span className="relative flex items-center justify-center">
      {isLucide ? (
        <CategoryIcon name={icon} className={iconCls} style={{ color }} />
      ) : icon ? (
        <span
          className={cn(
            "leading-none select-none",
            size === "lg" ? "text-2xl" : size === "sm" ? "text-base" : "text-xl"
          )}
        >
          {icon}
        </span>
      ) : (
        <Fallback className={iconCls} style={{ color }} strokeWidth={1.75} />
      )}
      </span>
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
      // Kategori ızgarası bir liste: kullanıcı en fazla birine girer.
      // Hepsini önden çekmek telefonda ağı doldurup gezinmeyi geciktiriyordu.
      <Link href={href} prefetch={false} className={tileWrapCls}>
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
      {/* Kesikli kenar clip-path ile çizilemiyor (kırpılan kenarda border
          görünmez) — altıgen çerçeve SVG olarak çiziliyor */}
      <span className="relative flex h-12 w-12 shrink-0 items-center justify-center text-primary/60 transition-colors group-hover:text-primary">
        <svg viewBox="0 0 48 48" className="absolute inset-0 h-full w-full">
          <polygon
            points={hexCorners(24, 24, 23)}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeDasharray="4 3"
            opacity={0.55}
          />
        </svg>
        <Plus className="relative h-5 w-5" strokeWidth={1.75} />
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
