"use client";

import { useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { listUserCategories } from "@/lib/db/queries";
import { useT } from "@/lib/i18n";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import type { SubCategory } from "@/types";

type Step = { key: string; label: string; href: string; fill: string; mark: string };

const YAPI = "#ffd23f";

/**
 * Konum yolu (Brütal) — Kategoriler sekmesinin üç sayfasında üst menünün
 * en alt satırı, beyaz kartta (bkz. StructureHeader), hep aynı hizada:
 * "Kategoriler › Harcamalar › Faturalar › Su". Sırayla dizilen duraklar:
 * öncekiler kendi renginde küçük köşeli kapsül — kök Yapı'nın sarısı,
 * kategori kendi rengi, alt kategoriler o rengin derine indikçe açılan
 * tonları — dokununca o sayfa; aralarında › oku. Bulunulan yer sonda kalın
 * yazı, önünde rengi; her sayfada soldan kayarak gelir. Kategoriler'de
 * yalnız o, yanında kategori sayısı.
 *
 * Bütün yol hep tam adlarıyla: sığmazsa satır yana kayar. Açılışta sona
 * yaslı gelir (bulunulan yer görünür) — kaydırma animasyonsuz, boyamadan
 * önce; görünmeyen bir kısım varsa o kenarda hafif solma. Bir ara sığmayan
 * katlar "…" durağında toplanıyordu — kullanıcıya göre ilerledikçe alt
 * kategoriler kayboluyordu.
 *
 * Denenip bırakılanlar: birbirine geçen ok biçimli parçalar (siyah ok
 * çizgileriyle — "yapboz gibi"); bütün kategorilerin yan yana durduğu
 * şerit; sönük yazılı düz yol; bloğun içinde beyaz satırda gölgeli oklar;
 * bloğun altında krem zeminde aşağı kayan oklar.
 */
export function StructureTrail({ categoryId, subId }: { categoryId?: string; subId?: string }) {
  const t = useT();
  // Kategori ve alt kategorinin üst zinciri (kökten bulunulan yere)
  const place = useLiveQuery(async () => {
    if (!categoryId) return { steps: [] as Step[], count: (await listUserCategories()).length };
    const cat = await db.categories.get(categoryId);
    const chain: SubCategory[] = [];
    const seen = new Set<string>();
    for (let id = subId; id && !seen.has(id); ) {
      seen.add(id);
      const s = await db.subcategories.get(id);
      if (!s) break;
      if (!s.isCategoryRoot) chain.unshift(s);
      id = s.parentId;
    }
    const steps: Step[] = [];
    if (cat) {
      steps.push({ key: cat.id, label: cat.name, href: routes.structureCategory(cat.id), fill: cat.color, mark: cat.color });
      chain.forEach((s, i) => {
        // Derinleştikçe açılan ton: 1. kat %55, sonra %42, %30…
        const tone = `color-mix(in srgb, ${cat.color} ${Math.max(20, 55 - i * 13)}%, white)`;
        steps.push({ key: s.id, label: s.name, href: routes.structureSub(cat.id, s.id), fill: tone, mark: tone });
      });
    }
    return { steps, count: undefined };
  }, [categoryId, subId]);

  const steps: Step[] = [
    { key: "root", label: t("structure.categories"), href: "/structure", fill: YAPI, mark: YAPI },
    ...(place?.steps ?? []),
  ];
  const here = steps[steps.length - 1];
  const rootOnly = steps.length === 1;
  const pathKey = steps.map((s) => s.key).join("/");

  // Sona yaslı aç (boyamadan önce, kaydırma görünmesin); kenar gölgeleri
  const rowRef = useRef<HTMLOListElement>(null);
  const [edges, setEdges] = useState({ start: false, end: false });
  const measure = () => {
    const el = rowRef.current;
    if (!el) return;
    const start = el.scrollLeft > 1;
    const end = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    setEdges((e) => (e.start === start && e.end === end ? e : { start, end }));
  };
  useLayoutEffect(() => {
    const el = rowRef.current;
    if (!el) return;
    el.scrollLeft = el.scrollWidth;
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [pathKey]);

  return (
    <nav aria-label={t("structure.title")} className="relative min-w-0 bg-white">
      <ol
        ref={rowRef}
        data-structure-trail=""
        onScroll={measure}
        className="no-scrollbar flex h-[44px] min-w-0 items-center gap-1 overflow-x-auto overscroll-x-contain px-2"
      >
        {steps.slice(0, -1).map((s) => (
          <li key={s.key} className="flex flex-none items-center gap-1">
            <Link
              href={s.href}
              prefetch={false}
              className="flex h-7 items-center whitespace-nowrap rounded-[8px] border-[1.5px] px-2.5 text-[12.5px] font-extrabold leading-none text-[#111] active:brightness-90"
              style={{ background: s.fill, borderColor: "#111" }}
            >
              {s.label}
            </Link>
            <ChevronRight aria-hidden className="h-3.5 w-3.5 shrink-0 text-[#111]/45" strokeWidth={3} />
          </li>
        ))}
        {/* Bulunulan yer — kısa yolda satırın kalanını doldurur, uzunsa kendi boyunda */}
        <li key={here.key} className="crumb-in flex items-center" style={{ flex: "1 0 auto" }}>
          <span
            aria-current="page"
            className={cn(
              "flex flex-1 items-center gap-2 whitespace-nowrap text-[13.5px] font-black leading-none text-[#111]",
              rootOnly ? "pl-1.5 pr-1.5" : "pl-1 pr-1.5"
            )}
          >
            <span
              aria-hidden
              className="h-3 w-3 shrink-0 rounded-[3px] border-[1.5px]"
              style={{ background: here.mark, borderColor: "#111" }}
            />
            {here.label}
            {rootOnly && place?.count !== undefined && (
              <span className="ml-auto pl-3 text-[11.5px] font-bold text-[#111]/50">
                {t("struct.cats.count", { n: place.count })}
              </span>
            )}
          </span>
        </li>
      </ol>
      {/* Görünmeyen kısım var: o kenarda hafif solma */}
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-white to-transparent transition-opacity",
          edges.start ? "opacity-100" : "opacity-0"
        )}
      />
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-white to-transparent transition-opacity",
          edges.end ? "opacity-100" : "opacity-0"
        )}
      />
    </nav>
  );
}
