"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { Square } from "lucide-react";
import { db } from "@/lib/db";
import { listUserCategories } from "@/lib/db/queries";
import { useT } from "@/lib/i18n";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import type { SubCategory } from "@/types";

type Step = {
  key: string;
  label: string;
  href: string;
  fill: string;
  mark: string;
  /** Kök yalnız simgesiyle (Kategoriler sekmesinin karesi) — yer darken */
  compact?: boolean;
};

/** Ok ucunun derinliği */
const TIP = 10;
const YAPI = "#ffd23f";

/**
 * Konum yolu (Brütal) — Kategoriler sekmesinin üç sayfasında başlık
 * bloğunun en alt satırı, hep aynı hizada: "Kategoriler › Harcamalar ›
 * Faturalar › Su". Satırı kenardan kenara doldurur: duraklar ok biçimli
 * parçalar, aralarındaki 2 px siyah ok çizgisi bloğun ortak çizgileri gibi.
 * Önceki duraklar renkli — kök Yapı'nın sarısı, kategori kendi rengi, alt
 * kategoriler o rengin derine indikçe açılan tonları — dokununca o sayfa.
 * Bulunulan yer satırın kalanını dolduran beyaz parça: kalın adı, önünde
 * rengi; her sayfada soldan kayarak gelir. Kategoriler'de yalnız o, yanında
 * kategori sayısı.
 *
 * Hiç taşmaz, yana kaymaz: yol sığmazsa aradaki katlar tek "…" durağında
 * toplanır (dokununca gizlenenlerin en yakını; bkz. fitSteps), yine de
 * sığmayan adlar … ile kısalır — ara duraklar önce, bulunulan yer en son.
 *
 * Denenip bırakılanlar: bütün kategorilerin yan yana durduğu şerit; sönük
 * yazılı düz yol; bloğun içinde beyaz satırda gölgeli oklar ("beyaz bölme
 * oklarla uyuşmuyor"); bloğun altında krem zeminde aşağı kayan oklar (yana
 * kayıyor, ekrandan taşıyordu).
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

  const all: Step[] = [
    { key: "root", label: t("structure.categories"), href: "/structure", fill: YAPI, mark: YAPI },
    ...(place?.steps ?? []),
  ];
  // Satırın genişliği — yolun ne kadarının sığacağı buna göre (boyamadan önce)
  const navRef = useRef<HTMLElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = navRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const steps = fitSteps(all, width);
  const here = steps[steps.length - 1];
  const rootOnly = steps.length === 1;

  return (
    // Zemin siyah: parçaların arasında kalan 2 px ok çizgisi
    <nav ref={navRef} aria-label={t("structure.title")} className="min-w-0 bg-[#111]">
      <ol data-structure-trail="" className="flex h-[40px] min-w-0">
        {steps.slice(0, -1).map((s, i) => (
          <li
            key={s.key}
            // Neyin gösterileceğini fitSteps seçti (bunlara bulunulan yer için
            // en az 72 px bırakarak); bunlar kısalmaz — kısalınca yarım piksel
            // gidip ad "Sp…" oluyordu. Sığmayan bulunulan yerin adı kısalır.
            // Çok uzun ad yine de satırın %40ını geçmez.
            className={cn("flex max-w-[40%] flex-none", i > 0 && "-ml-[8px]")}
          >
            <Link
              href={s.href}
              prefetch={false}
              className={cn(
                "flex min-w-0 items-center text-[12.5px] font-black leading-none text-[#111] active:brightness-90",
                i === 0 ? "pl-3" : "pl-[19px]",
                "pr-[15px]"
              )}
              style={{ background: s.fill, ...arrow(i === 0, false) }}
            >
              {s.compact ? (
                <Square aria-label={s.label} className="h-3.5 w-3.5 shrink-0" strokeWidth={3} />
              ) : (
                <span className="truncate">{s.label}</span>
              )}
            </Link>
          </li>
        ))}
        <li key={here.key} className={cn("crumb-in flex min-w-[72px]", !rootOnly && "-ml-[8px]")} style={{ flex: "1 1 auto" }}>
          <span
            aria-current="page"
            className={cn(
              "flex min-w-0 flex-1 items-center gap-2 bg-white text-[13px] font-black leading-none text-[#111]",
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
            <span className="min-w-0 truncate">{here.label}</span>
            {rootOnly && place?.count !== undefined && (
              <span className="ml-auto shrink-0 text-[11.5px] font-bold text-[#111]/50">
                {t("struct.cats.count", { n: place.count })}
              </span>
            )}
          </span>
        </li>
      </ol>
    </nav>
  );
}

/**
 * Sığan en uzun yol. Sırayla denenir: hepsi; kök yalnız simgesiyle (kök
 * zaten üstteki seçili sekme); kategori ile üstü arasındaki katlar "…";
 * kategoriden sonrası "…"; en sonunda kök · "…" · burası. "…" gizlenenlerin
 * bulunulan yere en yakınına gider. Kategori en son gizlenir — rengi yolun
 * kimliği.
 *
 * Genişlik harf sayısından kestirilir (ölçmek her biçimi bir kez çizmek
 * demek); kestirim kaçırırsa adlar … ile kısalır, taşma yine olmaz.
 * Bulunulan yerin uzun adı yolu kısaltmaz — o kendisi kısalır.
 */
function fitSteps(all: Step[], width: number): Step[] {
  const n = all.length;
  if (!width || n < 2) return all;
  const more = (to: Step): Step => ({ ...to, key: "more", label: "…" });
  const r = { ...all[0], compact: true };
  const tries: Step[][] = [all, [r, ...all.slice(1)]];
  if (n >= 5) tries.push([r, all[1], more(all[n - 3]), all[n - 2], all[n - 1]]);
  if (n >= 4) tries.push([r, all[1], more(all[n - 2]), all[n - 1]]);
  if (n >= 3) tries.push([r, more(all[n - 2]), all[n - 1]]);
  // Cömert kestirim (geniş harfler): önceki duraklar kısalmadığı için
  // eksik kestirim taşma demek
  const est = (path: Step[]) =>
    path.reduce((sum, s, i) => {
      const last = i === path.length - 1;
      const w = last
        ? Math.max(72, Math.min(s.label.length * 7.4 + 44, width * 0.45))
        : s.compact
          ? 40
          : Math.min(s.label.length * 7.3 + (i === 0 ? 27 : 26), width * 0.4);
      // Parçalar bir öncekinin ucuna 8 px biner
      return sum + w - (i > 0 ? 8 : 0);
    }, 0);
  return tries.find((p) => est(p) <= width) ?? tries[tries.length - 1];
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
