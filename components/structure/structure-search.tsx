"use client";

import { Search, X } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useSkin, isBlockSkin } from "@/lib/skin";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Yapı sayfalarının arama çubuğu — Özellikler'deki kapsülün aynısı (bkz.
 * FeatureFilter), tür süzgeci olmadan. Kategoriler, Nesneler, Girdiler ve
 * Notlar'da sayfanın başında hep açık durur; listeyi yerinde süzer. Notlar'da
 * eskiden Ara karosuyla açılıyordu, Özellikler'de hep açıktı: aynı bölümün
 * sayfaları aramayı iki ayrı yoldan veriyordu. Harita'da yok (gezinme orada
 * sürükleyerek).
 */
export function StructureSearch({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (q: string) => void;
  placeholder: string;
  className?: string;
}) {
  const t = useT();
  const brutal = isBlockSkin(useSkin());

  if (brutal) {
    return (
      <div data-structure-search="" className={cn("relative mb-5 mt-1", className)}>
        <label className="relative flex h-11 items-center overflow-hidden rounded-full border-[1.5px] border-line bg-paper transition-shadow has-[input:focus]:shadow-[2px_2px_0_var(--shade)]">
          <Search className="pointer-events-none absolute left-3.5 h-4 w-4 text-ink/45" strokeWidth={2} />
          <input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            aria-label={placeholder}
            className="h-full w-full bg-transparent pl-10 pr-10 text-[14px] font-medium text-ink outline-none placeholder:font-normal placeholder:text-ink/40"
          />
          {value && (
            <button
              type="button"
              onClick={() => onChange("")}
              className="absolute right-2 flex h-6 w-6 items-center justify-center rounded-full bg-ink/[0.07] text-ink/70"
              aria-label={t("features.clearSearch")}
            >
              <X className="h-3 w-3" strokeWidth={2.4} />
            </button>
          )}
        </label>
      </div>
    );
  }

  return (
    <div data-structure-search="" className={cn("relative mb-5 mt-1", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/45" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-9 rounded-full pl-9 pr-8"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground/60 transition-colors hover:text-foreground"
          aria-label={t("features.clearSearch")}
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
