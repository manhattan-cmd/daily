"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { useT } from "@/lib/i18n";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import type { SubCategory } from "@/types";

type Step = { key: string; label: string; href: string; fill: string; color?: string };

/** Okun ucu ve kuyruğundaki çentiğin derinliği */
const TIP = 9;
const YAPI = "#ffd23f";

/**
 * Konum yolu (Brütal) — kategori ve alt kategori sayfalarında başlık
 * bloğunun hemen altında, krem zeminde: nerede olduğun ve oraya hangi yoldan
 * gelindiği, "Kategoriler › Harcamalar › Faturalar › Su". Yapı →
 * Kategoriler'de yok (orası zaten kök). Her girişte bloğun arkasından aşağı
 * kayarak çıkar (globals.css .trail-drop).
 *
 * Her durak ok biçimli bir parça, bir sonrakinin çentiğine oturur; bütün
 * zincirin altında blokların gölgesi. Kök Yapı'nın sarısında, kategori kendi
 * renginde, alt kategoriler o rengin giderek açılan tonlarında (derinlik
 * renkten okunur), bulunulan yer siyah parçada sarı yazıyla. Öncekilere
 * dokununca o sayfa. Uzayınca yana kayar, hep sona yaslı: bulunulan yer
 * görünür; ara duraklar uzun adda kısalır.
 *
 * Önce yerinde bütün kategorilerin yan yana durduğu bir şerit denendi,
 * sonra düz yazılı bir yol ("Kategoriler › Harcamalar" sönük yazı, sonda
 * siyah etiket), sonra bu oklar bloğun içinde beyaz bir satırda —
 * kullanıcıya göre beyaz bölme oklarla uyuşmuyordu.
 */
export function StructureTrail({ categoryId, subId }: { categoryId: string; subId?: string }) {
  const t = useT();
  // Kategori ve alt kategorinin üst zinciri (kökten bulunulan yere)
  const place = useLiveQuery(async () => {
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
    if (!cat) return steps;
    steps.push({ key: cat.id, label: cat.name, href: routes.structureCategory(cat.id), fill: cat.color, color: cat.color });
    chain.forEach((s, i) =>
      steps.push({
        key: s.id,
        label: s.name,
        href: routes.structureSub(categoryId, s.id),
        // Derinleştikçe açılan ton: 1. kat %55, sonra %40, %28…
        fill: `color-mix(in srgb, ${cat.color} ${Math.max(18, 55 - i * 14)}%, white)`,
      })
    );
    return steps;
  }, [categoryId, subId]);

  const steps: Step[] = [
    { key: "root", label: t("structure.categories"), href: "/structure", fill: YAPI },
    ...(place ?? []),
  ];
  const pathKey = steps.map((s) => s.key).join("/");

  const rowRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const row = rowRef.current;
    if (row) row.scrollTo({ left: row.scrollWidth });
  }, [pathKey]);

  return (
    // min-w-0: ızgara hücresi içeriğin boyuna uzamasın — yoksa uzun yol
    // bütün başlık bloğunu ekrandan taşırıyor
    // Yer açılırken (yükseklik) içi bloğun arkasından iner; blok önde (z-10)
    <nav aria-label={t("structure.title")} className="trail-drop relative h-[42px] min-w-0 overflow-hidden">
      <div ref={rowRef} data-structure-trail="" className="no-scrollbar flex h-full items-end overflow-x-auto pb-[2px] pr-[2px]">
        {/* Gölge bütün zincirin biçimini izler (tek tek parçalarınki
            birbirinin üstüne düşüyordu) */}
        <ol className="flex items-center pr-2" style={{ filter: "drop-shadow(2px 2px 0 #111)" }}>
          {steps.map((s, i) => (
            <Crumb key={s.key} step={s} first={i === 0} last={i === steps.length - 1} />
          ))}
        </ol>
      </div>
    </nav>
  );
}

function Crumb({ step, first, last }: { step: Step; first: boolean; last: boolean }) {
  // Ok: sağda uç, solda (ilk değilse) bir öncekinin ucunu alan çentik; son
  // parçanın sağı düz
  const shape = [
    "0 0",
    last ? "100% 0" : `calc(100% - ${TIP}px) 0`,
    ...(last ? ["100% 100%"] : ["100% 50%", `calc(100% - ${TIP}px) 100%`]),
    "0 100%",
    ...(first ? [] : [`${TIP}px 50%`]),
  ].join(", ");
  const clip: CSSProperties = { clipPath: `polygon(${shape})` };
  const pad = cn(first ? "pl-3" : "pl-[19px]", last ? "pr-3" : "pr-[17px]");
  const body = (
    <>
      {/* Siyah dış biçim, üstünde 2 px içeride rengi — çerçeve gibi */}
      <span aria-hidden className="absolute inset-0 bg-[#111]" style={clip} />
      <span aria-hidden className="absolute inset-[2px]" style={{ ...clip, background: last ? "#111" : step.fill }} />
      <span
        className={cn(
          "relative flex items-center gap-1.5 whitespace-nowrap text-[12.5px] font-black leading-none",
          pad,
          last ? "text-[#ffd23f]" : "max-w-[150px] text-[#111]"
        )}
      >
        {last && step.color && (
          <span
            className="h-[11px] w-[11px] shrink-0 rounded-[3px] border-[1.5px]"
            style={{ background: step.color, borderColor: "#fff4dc" }}
          />
        )}
        <span className={last ? undefined : "truncate"}>{step.label}</span>
      </span>
    </>
  );
  const cls = "relative flex h-[32px] items-center";
  return (
    <li className={cn("flex shrink-0", !first && "-ml-[11px]")}>
      {last ? (
        <span aria-current="page" className={cls}>
          {body}
        </span>
      ) : (
        <Link href={step.href} prefetch={false} className={cn(cls, "active:brightness-90")}>
          {body}
        </Link>
      )}
    </li>
  );
}
