"use client";

import { useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { useT } from "@/lib/i18n";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import type { Collection, SubCategory } from "@/types";
import { HeadTrailRow } from "./structure-head";

export type TrailStep = { key: string; label: string; href: string; fill: string };

/**
 * Konum yolu (Brütal) — Yapı'nın alt sayfalarında sayfa başının ikinci
 * satırı (bkz. StructureHead): "↳ Harcamalar › Faturalar › ■ Su". Yolun
 * kökü (Kategoriler, Nesneler) başın kendisi — üstündeki satır, dokununca
 * oraya çıkılır. Öncekiler kendi renginde küçük köşeli kapsül — kategori
 * kendi rengi, alt kategoriler o rengin derine indikçe açılan tonları —
 * dokununca o sayfa; aralarında › oku. Bulunulan yer sonda kalın yazı,
 * önünde rengi; her sayfada soldan kayarak gelir.
 *
 * Bütün yol hep tam adlarıyla: sığmazsa satır yana kayar. Açılışta sona
 * yaslı gelir (bulunulan yer görünür) — kaydırma animasyonsuz, boyamadan
 * önce; görünmeyen bir kısım varsa o kenarda hafif solma. Bir ara sığmayan
 * katlar "…" durağında toplanıyordu — kullanıcıya göre ilerledikçe alt
 * kategoriler kayboluyordu.
 *
 * Eskiden sarı üst menünün içindeki beyaz kartta, kökü de yolun ilk
 * durağıydı ("Kategoriler › …"). Denenip bırakılanlar: birbirine geçen ok
 * biçimli parçalar ("yapboz gibi"); bütün kategorilerin yan yana durduğu
 * şerit; sönük yazılı düz yol; beyaz satırda gölgeli oklar; krem zeminde
 * aşağı kayan oklar.
 */
export function StructureTrail({ categoryId, subId }: { categoryId: string; subId?: string }) {
  // Kategori ve alt kategorinin üst zinciri (kökten bulunulan yere)
  const steps = useLiveQuery(async () => {
    const cat = await db.categories.get(categoryId);
    if (!cat) return [] as TrailStep[];
    const chain: SubCategory[] = [];
    const seen = new Set<string>();
    for (let id = subId; id && !seen.has(id); ) {
      seen.add(id);
      const s = await db.subcategories.get(id);
      if (!s) break;
      if (!s.isCategoryRoot) chain.unshift(s);
      id = s.parentId;
    }
    const out: TrailStep[] = [{ key: cat.id, label: cat.name, href: routes.structureCategory(cat.id), fill: cat.color }];
    chain.forEach((s, i) => {
      // Derinleştikçe açılan ton: 1. kat %55, sonra %42, %30…
      const tone = `color-mix(in srgb, ${cat.color} ${Math.max(20, 55 - i * 13)}%, white)`;
      out.push({ key: s.id, label: s.name, href: routes.structureSub(cat.id, s.id), fill: tone });
    });
    return out;
  }, [categoryId, subId]);
  return <TrailRow steps={steps ?? []} />;
}

/** Nesneler sekmesinin yolu: "↳ Kitaplarım › ■ Sapiens" */
export function ObjectTrail({ collection, thing }: { collection: Collection | undefined; thing?: { id: string; name: string } }) {
  const color = collection?.color ?? "#94a3b8";
  const steps: TrailStep[] = [];
  if (collection) steps.push({ key: collection.id, label: collection.name, href: routes.structureCollection(collection.id), fill: color });
  if (thing) steps.push({ key: thing.id, label: thing.name, href: routes.structureThing(thing.id), fill: `color-mix(in srgb, ${color} 55%, white)` });
  return <TrailRow steps={steps} />;
}

/** Yolun kendisi — duraklar, sondaki bulunulan yer, kenar solmaları */
export function TrailRow({ steps }: { steps: TrailStep[] }) {
  const t = useT();
  const here = steps[steps.length - 1];
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
    <HeadTrailRow>
      <nav aria-label={t("structure.title")} className="relative min-w-0 bg-white">
        <ol
          ref={rowRef}
          data-structure-trail=""
          onScroll={measure}
          className="no-scrollbar flex h-11 min-w-0 items-center gap-1 overflow-x-auto overscroll-x-contain px-2"
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
          {here && (
            <li key={here.key} className="crumb-in flex items-center" style={{ flex: "1 0 auto" }}>
              <span
                aria-current="page"
                className="flex flex-1 items-center gap-2 whitespace-nowrap pl-1 pr-1.5 text-[13.5px] font-black leading-none text-[#111]"
              >
                <span
                  aria-hidden
                  className="h-3 w-3 shrink-0 rounded-[3px] border-[1.5px]"
                  style={{ background: here.fill, borderColor: "#111" }}
                />
                {here.label}
              </span>
            </li>
          )}
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
    </HeadTrailRow>
  );
}
