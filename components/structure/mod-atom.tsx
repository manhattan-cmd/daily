"use client";

import {
  Boxes,
  MoonStar,
  Plus,
  Route,
  Star,
  Timer,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { MEASURE_KIND_META } from "@/lib/measure-kinds";
import type { ModWithType } from "@/lib/db/queries";
import { cn } from "@/lib/utils";

/** Yerleşik atomların simgeleri */
const BUILT_IN_MOD_ICONS: Record<string, LucideIcon> = {
  "Para": Wallet,
  "Süre": Timer,
  "Mesafe": Route,
  "Miktar": Boxes,
  "Uyku Süresi": MoonStar,
  "Uyku Kalitesi": Star,
};

/** Özelliğin atom simgesi: yerleşikse özel simgesi, değilse ölçü türünün simgesi */
export function modAtomIcon(mod: ModWithType): LucideIcon {
  return (
    BUILT_IN_MOD_ICONS[mod.name] ??
    MEASURE_KIND_META[mod.entryType.valueType ?? "number"].icon
  );
}

/** Atom çekirdeği — dairesel, hafif ışıltılı disk */
export function ModAtomCore({
  icon: Icon,
  size = "md",
}: {
  icon: LucideIcon;
  size?: "md" | "lg";
}) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full",
        size === "lg" ? "h-16 w-16" : "h-12 w-12"
      )}
      style={{
        background:
          "radial-gradient(circle at 32% 28%, rgba(129,140,248,0.30), rgba(129,140,248,0.07) 72%)",
        boxShadow:
          "inset 0 0 0 1px rgba(129,140,248,0.22), 0 0 14px rgba(129,140,248,0.10)",
      }}
    >
      <Icon
        className={cn(
          "text-primary",
          size === "lg" ? "h-7 w-7" : "h-5 w-5"
        )}
        strokeWidth={1.75}
      />
    </span>
  );
}

/** Özellik atomu — dairesel çekirdek + altta ad; sık 4 sütunlu ızgarada dizilir */
export function ModAtom({
  icon,
  name,
  onClick,
  disabled,
}: {
  icon: LucideIcon;
  name: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex flex-col items-center gap-1.5 rounded-2xl px-1 py-2 transition-all hover:bg-white/5 active:scale-[0.92] disabled:opacity-50"
    >
      <ModAtomCore icon={icon} />
      <span className="w-full truncate text-center text-[11px] font-medium leading-tight">
        {name}
      </span>
    </button>
  );
}

/** Izgara sonuna eklenen "yeni yarat" atomu — kesikli boş çekirdek */
export function ModAtomAdd({
  label = "Yeni yarat",
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
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-dashed border-primary/35 text-primary/60 transition-colors group-hover:border-primary/60 group-hover:text-primary">
        <Plus className="h-5 w-5" strokeWidth={1.75} />
      </span>
      <span className="w-full truncate text-center text-[11px] font-medium leading-tight text-muted-foreground group-hover:text-foreground">
        {label}
      </span>
    </button>
  );
}
