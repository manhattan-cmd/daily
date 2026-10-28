"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { listUserCategories } from "@/lib/db/queries";
import { useT } from "@/lib/i18n";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import type { SubCategory } from "@/types";

type Step = { key: string; label: string; href: string; fill: string; mark: string };

/** Ok ucunun derinliği */
const TIP = 10;
const YAPI = "#ffd23f";

/**
 * Konum yolu (Brütal) — Kategoriler sekmesinin üç sayfasında başlık
 * bloğunun en alt satırı, hep aynı hizada: "Kategoriler › Harcamalar ›
 * Faturalar › Su". Duraklar ok biçimli parçalar, aralarındaki 2 px siyah ok
 * çizgisi bloğun ortak çizgileri gibi. Önceki duraklar renkli — kök Yapı'nın
 * sarısı, kategori kendi rengi, alt kategoriler o rengin derine indikçe
 * açılan tonları — dokununca o sayfa. Bulunulan yer beyaz parça (kalın adı,
 * önünde rengi), yol kısaysa satırın kalanını doldurur; her sayfada soldan
 * kayarak gelir. Kategoriler'de yalnız o, yanında kategori sayısı.
 *
 * Bütün yol hep tam adlarıyla: sığmazsa satır yana kayar. Açılışta sona
 * yaslı gelir (bulunulan yer görünür) — kaydırma animasyonsuz, boyamadan
 * önce; görünmeyen bir kısım varsa o kenarda hafif gölge. Bir ara sığmayan
 * katlar "…" durağında toplanıyordu — kullanıcıya göre ilerledikçe alt
 * kategoriler kayboluyordu.
 *
 * Denenip bırakılanlar: bütün kategorilerin yan yana durduğu şerit; sönük
 * yazılı düz yol; bloğun içinde beyaz satırda gölgeli oklar ("beyaz bölme
 * oklarla uyuşmuyor"); bloğun altında krem zeminde aşağı kayan oklar.
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
    // Zemin siyah: parçaların arasında kalan 2 px ok çizgisi
    <nav aria-label={t("structure.title")} className="relative min-w-0 bg-[#111]">
      <ol
        ref={rowRef}
        data-structure-trail=""
        onScroll={measure}
        className="no-scrollbar flex h-[40px] min-w-0 overflow-x-auto overscroll-x-contain"
      >
        {steps.slice(0, -1).map((s, i) => (
          <li key={s.key} className={cn("flex flex-none", i > 0 && "-ml-[8px]")}>
            <Link
              href={s.href}
              prefetch={false}
              className={cn(
                "flex items-center whitespace-nowrap text-[12.5px] font-black leading-none text-[#111] active:brightness-90",
                i === 0 ? "pl-3" : "pl-[19px]",
                "pr-[15px]"
              )}
              style={{ background: s.fill, ...arrow(i === 0, false) }}
            >
              {s.label}
            </Link>
          </li>
        ))}
        {/* Yol kısaysa satırın kalanını doldurur, uzunsa kendi boyunda */}
        <li key={here.key} className={cn("crumb-in flex", !rootOnly && "-ml-[8px]")} style={{ flex: "1 0 auto" }}>
          <span
            aria-current="page"
            className={cn(
              "flex flex-1 items-center gap-2 whitespace-nowrap bg-white text-[13px] font-black leading-none text-[#111]",
              rootOnly ? "pl-3" : "pl-[20px]",
              "pr-3"
            )}
            style={arrow(rootOnly, true)}
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
      {/* Görünmeyen kısım var: o kenarda hafif gölge */}
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-y-0 left-0 w-5 bg-gradient-to-r from-[#111]/40 to-transparent transition-opacity",
          edges.start ? "opacity-100" : "opacity-0"
        )}
      />
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-y-0 right-0 w-5 bg-gradient-to-l from-[#111]/40 to-transparent transition-opacity",
          edges.end ? "opacity-100" : "opacity-0"
        )}
      />
    </nav>
  );
}

/** Ok biçimi: sağda uç (son değilse), solda bir öncekinin ucunu alan çentik (ilk değilse) */
function arrow(first: boolean, last: boolean): CSSProperties {
  const pts = [
    "0 0",
    last ? "100% 0" : `calc(100% - ${TIP}px) 0`,
    ...(last ? ["100% 100%"] : ["100% 50%", `calc(100% - ${TIP}px) 100%`]),
    "0 100%",
    ...(first ? [] : [`${TIP}px 50%`]),
  ];
  return { clipPath: `polygon(${pts.join(", ")})` };
}
