"use client";

import { cn } from "@/lib/utils";
import { blockFill, blockFillTint } from "@/lib/fill";
import { isBlockSkin, useSkin } from "@/lib/skin";

/**
 * Etiketin şekli — solu sivri, deliği olan kart (bavul etiketi). Şekil
 * dili: kare = kategori, daire = özellik, baklava = nesne, etiket = etiket.
 */
export function TagGlyph({
  color,
  size = 14,
  hollow = false,
  className,
}: {
  color: string;
  /** Yükseklik (px); en boyun 1.25 katı */
  size?: number;
  /** Boş (zeminsiz) — seçili değilken */
  hollow?: boolean;
  className?: string;
}) {
  const block = isBlockSkin(useSkin());
  // Blok temalarında kâğıt ve çizgi değişkenleri; sade temalarda koyu
  // zeminde rengin kendisi, çizgisi yazının rengi
  const fill = hollow ? (block ? "var(--paper)" : "transparent") : block ? blockFill(color) : color;
  const line = block ? "var(--line)" : hollow ? "currentColor" : "rgba(0,0,0,0.55)";
  const hole = block ? "var(--paper)" : "var(--background)";
  return (
    <svg
      viewBox="0 0 20 16"
      width={Math.round(size * 1.25)}
      height={size}
      aria-hidden
      className={cn("shrink-0", className)}
    >
      <path
        d="M6.4 1.4h10.9a1.6 1.6 0 0 1 1.6 1.6v10a1.6 1.6 0 0 1-1.6 1.6H6.4L1.2 8z"
        style={{ fill, stroke: line }}
        strokeWidth={1.7}
        strokeLinejoin="round"
      />
      <circle cx="6.9" cy="8" r="1.55" style={{ fill: hole, stroke: line }} strokeWidth={1.3} />
    </svg>
  );
}

/**
 * Etiket kapsülü — rengin açık tonunda zemin, önünde etiketin şekli. Seçim
 * listelerinde düğme (açık/kapalı), başka yerde gösterge.
 */
export function TagChip({
  name,
  color,
  on = true,
  muted = false,
  onClick,
  title,
  className,
  trailing,
}: {
  name: string;
  color: string;
  /** Seçili mi — değilse zeminsiz, boş şekil */
  on?: boolean;
  /** Mirasla gelen (üstünden) — kesik çerçeve */
  muted?: boolean;
  onClick?: () => void;
  title?: string;
  className?: string;
  trailing?: React.ReactNode;
}) {
  const block = isBlockSkin(useSkin());
  const body = (
    <>
      <TagGlyph color={color} size={13} hollow={!on} />
      <span className="truncate">{name}</span>
      {trailing}
    </>
  );
  const cls = cn(
    "flex min-w-0 max-w-full items-center gap-1.5 rounded-full py-[3px] pl-1.5 pr-2.5 text-[13px] leading-[18px]",
    block
      ? cn("border-[1.5px] font-bold text-ink", muted ? "border-dashed border-ink/45" : "border-line")
      : cn("font-medium ring-1 ring-inset", muted ? "ring-[var(--ln-1)] text-muted-foreground" : on ? "ring-white/20 text-foreground" : "ring-[var(--ln-1)] text-muted-foreground"),
    onClick && "transition-transform active:scale-95",
    className
  );
  const style = block
    ? { background: on ? blockFillTint(color, 45) : "var(--paper)" }
    : { background: on ? `${color}2e` : "var(--sf-2)" };
  return onClick ? (
    <button type="button" onClick={onClick} title={title} aria-pressed={on} data-tag-chip="" className={cls} style={style}>
      {body}
    </button>
  ) : (
    <span title={title} data-tag-chip="" className={cls} style={style}>
      {body}
    </span>
  );
}
