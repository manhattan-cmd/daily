"use client";

import { Fragment, useEffect, useRef } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { ChevronRight } from "lucide-react";
import { db } from "@/lib/db";
import { useT } from "@/lib/i18n";
import { routes } from "@/lib/routes";
import type { SubCategory } from "@/types";

type Step = { key: string; label: string; href: string; color?: string };

/**
 * Konum yolu (Brütal) — Yapı'nın başlık bloğunun en alt satırı: nerede
 * olduğun ve oraya hangi yoldan gelindiği. Yapı → Kategoriler'de yalnız
 * "Kategoriler"; kategoride "Kategoriler › Harcamalar"; alt kategoride
 * bütün üstleriyle "Kategoriler › Harcamalar › Faturalar › Su". Bulunulan
 * yer siyah etikette (seçili sekme gibi Yapı'nın sarısı), öncekiler sönük ve
 * dokunulabilir; kategorinin önünde kendi renginde küçük kare. Uzayınca yana
 * kayar, hep sona yaslanır: bulunulan yer görünür.
 *
 * Önce yerinde bütün kategorilerin yan yana durduğu bir şerit denendi —
 * kullanıcının kastettiği bu yoldu.
 */
export function StructureTrail({ categoryId, subId }: { categoryId?: string; subId?: string }) {
  const t = useT();
  // Kategori ve alt kategorinin üst zinciri (kökten bulunulan yere)
  const place = useLiveQuery(async () => {
    if (!categoryId) return { steps: [] as Step[] };
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
    if (cat) steps.push({ key: cat.id, label: cat.name, href: routes.structureCategory(cat.id), color: cat.color });
    for (const s of chain) steps.push({ key: s.id, label: s.name, href: routes.structureSub(categoryId, s.id) });
    return { steps };
  }, [categoryId, subId]);

  const steps: Step[] = [
    { key: "root", label: t("structure.categories"), href: "/structure" },
    ...(place?.steps ?? []),
  ];
  const pathKey = steps.map((s) => s.key).join("/");

  const rowRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const row = rowRef.current;
    if (row) row.scrollTo({ left: row.scrollWidth });
  }, [pathKey]);

  return (
    // min-w-0: ızgara hücresi içeriğin boyuna uzamasın — yoksa uzun yol
    // bütün başlık bloğunu ekrandan taşırıyor
    <nav aria-label={t("structure.title")} className="min-w-0 bg-white">
      <ol ref={rowRef} data-structure-trail="" className="no-scrollbar flex h-[42px] items-center gap-1 overflow-x-auto px-3">
        {steps.map((s, i) => {
          const last = i === steps.length - 1;
          const mark = s.color ? (
            <span
              className="h-[11px] w-[11px] shrink-0 rounded-[3px] border-[1.5px]"
              style={{ background: s.color, borderColor: "#111" }}
            />
          ) : null;
          return (
            <Fragment key={s.key}>
              {i > 0 && <ChevronRight aria-hidden className="h-3.5 w-3.5 shrink-0 text-[#111]/35" strokeWidth={3} />}
              <li className="flex shrink-0">
                {last ? (
                  <span
                    aria-current="page"
                    className="flex items-center gap-1.5 whitespace-nowrap rounded-md bg-[#111] px-2 py-[4px] text-[12.5px] font-black leading-none text-[#ffd23f]"
                  >
                    {mark}
                    {s.label}
                  </span>
                ) : (
                  <Link
                    href={s.href}
                    prefetch={false}
                    className="flex items-center gap-1.5 whitespace-nowrap rounded-md px-1 py-[4px] text-[12.5px] font-extrabold leading-none text-[#111]/60 active:bg-[#111]/10 active:text-[#111]"
                  >
                    {mark}
                    {s.label}
                  </Link>
                )}
              </li>
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
