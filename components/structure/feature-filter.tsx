"use client";

import { useEffect, useState } from "react";
import { Check, ChevronDown, Circle, Search, X } from "lucide-react";
import { useT } from "@/lib/i18n";
import { MEASURE_KIND_META, type MeasureUiKind } from "@/lib/measure-kinds";
import { cn } from "@/lib/utils";

/** Süzgeçteki bir tür — `kind: null` = Tümü */
export type KindCount = { kind: MeasureUiKind | null; label: string; n: number };

/** Türün simgesi; Tümü için daire (daire = özellik) */
function KindIcon({ kind, className }: { kind: MeasureUiKind | null; className?: string }) {
  const Icon = kind ? MEASURE_KIND_META[kind].icon : Circle;
  return <Icon className={className} strokeWidth={2.4} />;
}

/**
 * Yapı › Özellikler'in arama kapsülü — tür süzgeci kapsülün sağ ucunda tek
 * düğme (Brütal).
 *
 * Süzgeç eskiden aramanın altında çip satırlarıydı: 8 türde üç satıra çıkıp
 * bandla ilk pencere arasında 190 px yer tutuyordu, ilk ekranda 12 özellik
 * kalıyordu. Yana kayan tek satır da denendi, kenara taşıyordu. Burada sayfa
 * özelliklere kalıyor (88 px, ilk ekranda 16); türler dokununca alt alta
 * açılıyor, uzun adlar ("Çoktan seçmeli") sıkışmıyor. Seçili tür kapsülün
 * ucunda siyah zeminde sarı simgesiyle — hangi süzgecin açık olduğu bakar
 * bakmaz belli, düğmenin genişliği değişmiyor.
 */
export function FeatureFilter({
  search,
  onSearch,
  kinds,
  active,
  onActive,
}: {
  search: string;
  onSearch: (q: string) => void;
  /** İlki Tümü; sayılar aramaya uyanlardan */
  kinds: KindCount[];
  active: MeasureUiKind | null;
  onActive: (k: MeasureUiKind | null) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const cur = kinds.find((k) => k.kind === active) ?? kinds[0];

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="relative mb-5 mt-1">
      {/* Gölge yalnız aramaya yazarken: focus-within tür düğmesine
          dokununca da yakıyordu, menü her açılışta bar büyüyüp seçince
          küçülüyor gibi görünüyordu */}
      <div className="flex h-11 items-stretch overflow-hidden rounded-full border-[1.5px] border-[#111] bg-white transition-shadow has-[input:focus]:shadow-[2px_2px_0_#111]">
        <label className="relative flex min-w-0 flex-1 items-center">
          <Search className="pointer-events-none absolute left-3.5 h-4 w-4 text-[#111]/45" strokeWidth={2} />
          <input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder={t("features.searchPlaceholder")}
            aria-label={t("features.searchPlaceholder")}
            className="h-full w-full bg-transparent pl-10 pr-10 text-[14px] font-medium text-[#111] outline-none placeholder:font-normal placeholder:text-[#111]/40"
          />
          {search && (
            <button
              type="button"
              onClick={() => onSearch("")}
              className="absolute right-2 flex h-6 w-6 items-center justify-center rounded-full bg-[#111]/[0.07] text-[#111]/70"
              aria-label={t("features.clearSearch")}
            >
              <X className="h-3 w-3" strokeWidth={2.4} />
            </button>
          )}
        </label>
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={`${t("features.filterByKind")}: ${cur?.label ?? ""}`}
          onClick={() => setOpen((v) => !v)}
          // Sabit genişlik: düğmede türün adı yazarken "Çoktan seçmeli"de
          // 168, "Sayı"da 95 px oluyordu, arama kutusu her seçimde daralıp
          // genişliyordu. Tümü yazıyla, seçili tür yalnız simgesiyle (adı
          // menüde ve altındaki katmanın başında zaten yazıyor).
          className={cn(
            "flex w-[84px] shrink-0 items-center justify-center gap-1 border-l-[1.5px] border-[#111] text-[13px] font-extrabold",
            active ? "bg-[#111] text-[#fff4dc]" : "bg-[#fff4dc] text-[#111]"
          )}
        >
          {active ? (
            <KindIcon kind={active} className="h-[18px] w-[18px] text-[#ffd23f]" />
          ) : (
            <span className="truncate">{cur?.label}</span>
          )}
          <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 transition-transform", open && "rotate-180")} strokeWidth={2.6} />
        </button>
      </div>
      {open && (
        <>
          {/* Boşluğa dokununca kapanır */}
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div
            role="menu"
            aria-label={t("features.filterByKind")}
            className="absolute right-0 top-[calc(100%+8px)] z-40 flex w-[236px] flex-col gap-0.5 rounded-2xl border-2 border-[#111] bg-white p-1.5 shadow-[4px_4px_0_#111]"
          >
            {kinds.map((k) => {
              const on = active === k.kind;
              return (
                <button
                  key={k.kind ?? "all"}
                  type="button"
                  role="menuitemradio"
                  aria-checked={on}
                  onClick={() => {
                    onActive(k.kind);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex h-10 items-center gap-2.5 rounded-xl px-2.5 text-left text-[13.5px] font-extrabold",
                    on ? "bg-[#111] text-[#fff4dc]" : "text-[#111]"
                  )}
                >
                  <KindIcon kind={k.kind} className={cn("h-4 w-4 shrink-0", on ? "text-[#ffd23f]" : "text-[#111]/60")} />
                  <span className="min-w-0 flex-1 truncate">{k.label}</span>
                  <span className={cn("font-mono text-[11px] font-bold", on ? "text-[#ffd23f]" : "text-[#111]/40")}>{k.n}</span>
                  {on && <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={3} />}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
