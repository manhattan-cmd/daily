"use client";

import Link from "next/link";
import { Folder, Plus } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { SymbolIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";

/** 0–255 arası değeri iki haneli hex alfaya çevirir */
const alpha = (v: number) =>
  Math.round(Math.max(0, Math.min(255, v)))
    .toString(16)
    .padStart(2, "0");

/**
 * Kategori rafı — atomların karesi. Özellik atomlarıyla aynı boyut ve
 * ızgara düzeni; daire yerine yumuşak kare, kategori kendi renginde parlar.
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
  const g = Math.max(0, Math.min(1, glow));
  const iconSize = size === "lg" ? 28 : size === "sm" ? 16 : 20;
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center transition-shadow",
        size === "lg"
          ? "h-16 w-16 rounded-2xl"
          : size === "sm"
          ? "h-9 w-9 rounded-lg"
          : "h-12 w-12 rounded-xl"
      )}
      style={{
        background: `linear-gradient(145deg, ${color}${alpha(0x42 + 0x2e * g)}, ${color}14)`,
        boxShadow: `inset 0 0 0 1px ${color}${alpha(0x55 + 0xaa * g)}, 0 0 ${
          14 + 18 * g
        }px ${color}${alpha(0x1f + 0x55 * g)}`,
      }}
    >
      {icon ? (
        <SymbolIcon
          name={icon}
          size={iconSize}
          className="select-none"
          style={{ color }}
        />
      ) : (
        <Fallback
          style={{ color, width: iconSize, height: iconSize }}
          strokeWidth={1.75}
        />
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
