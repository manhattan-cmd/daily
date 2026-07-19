"use client";

import { Plus } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Ölçü parçacığı — atom altı parçacık dili. Özellik atomundan küçük bir
 * çekirdek, çevresinde eğik yörünge elipsi ve elektron noktası. Kapladığı
 * alan atomla aynı (12×12) — kare raf / daire atom / parçacık aynı ızgara
 * ritminde durur.
 */
export function MeasureParticleCore({
  icon: Icon,
  size = "md",
}: {
  icon: LucideIcon;
  size?: "md" | "lg";
}) {
  return (
    <span
      className={cn(
        "relative flex shrink-0 items-center justify-center",
        size === "lg" ? "h-16 w-16" : "h-12 w-12"
      )}
    >
      {/* Yörünge — eğik elips + üstünde elektron */}
      <svg
        viewBox="0 0 48 48"
        className="absolute inset-0 h-full w-full"
        aria-hidden
      >
        <g transform="rotate(-28 24 24)">
          <ellipse
            cx="24"
            cy="24"
            rx="21.5"
            ry="9"
            fill="none"
            stroke="rgba(129,140,248,0.28)"
            strokeWidth="1"
          />
          <circle cx="45.5" cy="24" r="2" fill="rgba(165,180,252,0.85)" />
        </g>
      </svg>
      {/* Çekirdek — atomdan küçük, aynı ışıltı ailesi */}
      <span
        className={cn(
          "flex items-center justify-center rounded-full",
          size === "lg" ? "h-10 w-10" : "h-7 w-7"
        )}
        style={{
          background:
            "radial-gradient(circle at 32% 28%, rgba(129,140,248,0.34), rgba(129,140,248,0.08) 72%)",
          boxShadow:
            "inset 0 0 0 1px rgba(129,140,248,0.26), 0 0 12px rgba(129,140,248,0.12)",
        }}
      >
        <Icon
          className={cn(
            "text-primary",
            size === "lg" ? "h-5 w-5" : "h-3.5 w-3.5"
          )}
          strokeWidth={1.75}
        />
      </span>
    </span>
  );
}

/** Parçacık karosu — dokununca detay; atomlarla aynı 4 sütunlu ızgarada */
export function MeasureParticle({
  icon,
  name,
  onClick,
}: {
  icon: LucideIcon;
  name: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 rounded-2xl px-1 py-2 transition-all hover:bg-white/5 active:scale-[0.92]"
    >
      <MeasureParticleCore icon={icon} />
      <span className="w-full truncate text-center text-[11px] font-medium leading-tight">
        {name}
      </span>
    </button>
  );
}

/** Izgara sonuna eklenen "yeni ölçü" parçacığı — kesikli boş çekirdek */
export function MeasureParticleAdd({
  label = "Yeni",
  onClick,
}: {
  label?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col items-center gap-1.5 rounded-2xl px-1 py-2 transition-all hover:bg-white/5 active:scale-[0.92]"
    >
      <span className="flex h-12 w-12 shrink-0 items-center justify-center">
        <span className="flex h-7 w-7 items-center justify-center rounded-full border border-dashed border-primary/35 text-primary/60 transition-colors group-hover:border-primary/60 group-hover:text-primary">
          <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
        </span>
      </span>
      <span className="w-full truncate text-center text-[11px] font-medium leading-tight text-muted-foreground group-hover:text-foreground">
        {label}
      </span>
    </button>
  );
}
