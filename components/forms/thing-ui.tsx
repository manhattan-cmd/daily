"use client";

import { createContext, useContext } from "react";
import { X } from "lucide-react";
import { SymbolIcon } from "@/lib/icons";
import { measureOf, type CategoryModifierWithType } from "@/lib/db/queries";
import { cn } from "@/lib/utils";
import type { Mod } from "@/types";

export type ThingCurrent = Record<string, { value: string; at: number }>;

/** Nesne değerleri — thingId → modId → değer */
export type ThingVals = Record<string, Record<string, string>>;

/**
 * Kayıtta girdiye yazılacak nesneler: "Nesne" türündeki özelliklerde seçilen
 * kimlikler ve formda onlar için yazılan değerler. Seçimden çıkarılan
 * nesnenin yazılmış değerleri kaydedilmez.
 */
export function collectThings(
  picks: { valueType?: string; value: string | string[] | undefined }[],
  vals: ThingVals
): { thingId: string; values: Record<string, string> }[] {
  const ids: string[] = [];
  for (const p of picks) {
    if (p.valueType !== "object") continue;
    for (const raw of Array.isArray(p.value) ? p.value : [p.value ?? ""])
      for (const id of raw.split(",").map((s) => s.trim()).filter(Boolean))
        if (!ids.includes(id)) ids.push(id);
  }
  return ids.map((thingId) => ({
    thingId,
    values: Object.fromEntries(Object.entries(vals[thingId] ?? {}).filter(([, v]) => v !== "")),
  }));
}

/**
 * Formun nesne değerleri — "Hangi araba"da seçilen Duster'ın "Mevcut km"si
 * gibi. Özelliğin kendi değeri (seçilen nesnenin kimliği) LedgerField'in
 * olağan yolundan gider; seçilen nesnenin özellikleri bu bağlamdan.
 * Formlar (yeni girdi, düzenleme, nesne girdisi) sağlar; kayıtta seçilen
 * nesnelerin değerleri buradan toplanır.
 */
export interface ThingValuesCtx {
  get: (thingId: string, modId: string) => string | undefined;
  set: (thingId: string, modId: string, value: string) => void;
  /** Düzenlenen girdi — kendi değeri "son" diye önerilmesin */
  entryId?: string;
  entryDate?: string;
}
export const ThingValuesContext = createContext<ThingValuesCtx | null>(null);
export const useThingValues = () => useContext(ThingValuesContext);

/** LedgerField bir atama bekliyor — nesnenin özelliği için atama kılığı */
export function asThingField(m: Mod, thingId: string): CategoryModifierWithType {
  return {
    id: `thing-${thingId}-${m.id}`,
    modId: m.id,
    targetType: "subcategory",
    targetId: "",
    order: 0,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
    name: m.name,
    mod: m,
    entryType: measureOf(m),
  };
}

/** Nesnenin şekli — baklava (kare kategori, daire özellik) */
export function Diamond({
  color,
  icon,
  size = 34,
  muted = false,
  brutal,
}: {
  color: string;
  icon?: string;
  size?: number;
  muted?: boolean;
  brutal: boolean;
}) {
  const inner = Math.round(size * 0.68);
  return (
    <span className="relative flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <span
        className={cn("absolute rotate-45 rounded-[7px]", brutal && "border-2 border-[#111]", muted && "opacity-45")}
        style={{ width: inner, height: inner, background: color }}
      />
      {icon && (
        <span className={cn("relative", muted && "opacity-60")}>
          <SymbolIcon name={icon} size={Math.round(size * 0.42)} style={{ color: "#111" }} />
        </span>
      )}
    </span>
  );
}

/** Nesnenin güncel durumunun tek satırı: "53.485 km · Kurumsal" */
export function summaryOf(cur: ThingCurrent | undefined, modIds: string[], mods: Map<string, Mod>): string {
  if (!cur) return "";
  return modIds
    .map((id) => {
      const m = mods.get(id);
      const c = cur[id];
      if (!m || !c) return null;
      if (m.valueType === "boolean") return c.value === "true" ? m.name : null;
      if (m.valueType === "datetime-range" || m.valueType === "object") return null;
      if (m.valueType === "number") {
        const n = Number(c.value);
        const s = Number.isFinite(n) ? n.toLocaleString("tr-TR") : c.value;
        return m.unit ? `${s} ${m.unit}` : `${m.name} ${s}`;
      }
      return c.value;
    })
    .filter(Boolean)
    .slice(0, 2)
    .join(" · ");
}

/** Seçilen / iliştirilen nesnenin başlık satırı */
export function ThingHeader({
  name,
  listName,
  color,
  icon,
  brutal,
  onRemove,
  removeLabel,
}: {
  name: string;
  listName?: string;
  color: string;
  icon?: string;
  brutal: boolean;
  onRemove?: () => void;
  removeLabel?: string;
}) {
  return (
    <div
      data-thing-head=""
      className={cn(
        "flex items-center gap-2.5 rounded-2xl py-1.5 pl-1.5 pr-1",
        brutal ? "border-2 border-[#111] bg-white shadow-[3px_3px_0_#111]" : "ring-1 ring-inset"
      )}
      style={brutal ? undefined : { background: `${color}14`, ["--tw-ring-color" as string]: `${color}55` }}
    >
      <Diamond color={color} icon={icon} brutal={brutal} />
      <span className="min-w-0 flex-1 leading-tight">
        <span className={cn("block truncate text-[15px] font-black", brutal ? "text-[#111]" : "text-foreground")}>{name}</span>
        {listName && (
          <span className={cn("block truncate text-[11px] font-semibold", brutal ? "text-[#111]/55" : "text-muted-foreground")}>
            {listName}
          </span>
        )}
      </span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={removeLabel}
          data-thing-remove=""
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors",
            brutal ? "text-[#111]/60 hover:bg-[#111]/5" : "text-muted-foreground hover:bg-[var(--sf-2)]"
          )}
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

/** Başlıktan inen ip — nesnenin özellik alanları buna asılı */
export function ThingRail({
  color,
  brutal,
  children,
}: {
  color: string;
  brutal: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="relative ml-[22px] flex flex-col gap-2 pl-3 pt-2">
      <span
        aria-hidden
        className="absolute bottom-4 left-0 top-0 w-[2px] -translate-x-1/2 rounded-full"
        style={{ background: brutal ? "#111" : `${color}80` }}
      />
      {children}
    </div>
  );
}
