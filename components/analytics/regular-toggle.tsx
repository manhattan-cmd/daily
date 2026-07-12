"use client";

import { useEffect, useState } from "react";
import { CircleSlash } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtNum } from "@/lib/analytics";

/**
 * "Sabitler hariç" anahtarı — düzenli/sabit işaretli alt kategorilerin (kira,
 * fatura gibi) girdilerini analiz penceresinden çıkarır. Yalnızca kapsamda
 * işaretli alt kategori varsa gösterilir (bkz. useCategoryMetrics.hasRegular).
 * Tercih localStorage'da tutulur — tüm kategori panelleri aynı tercihi paylaşır.
 */

const STORAGE_KEY = "analytics.excludeRegular";

export function useExcludeRegular(): [boolean, (v: boolean) => void] {
  // SSR uyumu: ilk render false, mount'ta localStorage'dan okunur
  const [value, setValue] = useState(false);
  useEffect(() => {
    try {
      setValue(localStorage.getItem(STORAGE_KEY) === "1");
    } catch {}
  }, []);
  const set = (v: boolean) => {
    setValue(v);
    try {
      localStorage.setItem(STORAGE_KEY, v ? "1" : "0");
    } catch {}
  };
  return [value, set];
}

export function RegularToggle({
  active,
  onChange,
  color,
  regularSubNames,
  excludedEntryCount,
}: {
  active: boolean;
  onChange: (v: boolean) => void;
  color: string;
  regularSubNames: string[];
  excludedEntryCount: number;
}) {
  return (
    <div className="flex flex-col gap-1 -mt-1">
      <button
        type="button"
        onClick={() => onChange(!active)}
        className={cn(
          "self-start flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors",
          active
            ? "text-foreground"
            : "border-border bg-card text-muted-foreground hover:text-foreground"
        )}
        style={
          active
            ? { borderColor: `${color}70`, backgroundColor: `${color}18` }
            : undefined
        }
      >
        <CircleSlash className="h-3 w-3" />
        Sabitler hariç
      </button>
      {/* Şeffaflık: neyin dışarıda bırakıldığı hep görünür */}
      {active && regularSubNames.length > 0 && (
        <p className="px-1 text-[10px] text-muted-foreground">
          Hariç: {regularSubNames.join(", ")}
          {excludedEntryCount > 0 && ` · ${fmtNum(excludedEntryCount)} girdi`}
        </p>
      )}
    </div>
  );
}
