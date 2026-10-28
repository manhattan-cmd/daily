"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { listUserCategories } from "@/lib/db/queries";
import { SymbolIcon } from "@/lib/icons";
import { useT } from "@/lib/i18n";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import type { Category } from "@/types";

/**
 * Kategori şeridi (Brütal) — Yapı'nın başlık bloğunun en alt satırı: bütün
 * kategoriler yan yana hücrelerde (kategorinin renginde küçük simge karosu
 * ve adı), ortak 2 px çizgiler, yana kayar. Gün sayfasının hafta şeridinin
 * Yapı'daki karşılığı: bulunulan kategori kendi renginde dolu.
 *
 * Üç sayfada aynı şerit: Yapı → Kategoriler'de dokununca o kategorinin
 * bloğuna kayar (seçili hücre sayfa kaydıkça göz önündeki bloğu izler);
 * kategori ve alt kategori sayfalarında o kategorinin sayfasına geçer
 * (geçmişe yazmadan — geri tuşu Yapı'ya döner).
 */
export function CategoryNav({
  activeId,
  onPick,
  categories: given,
}: {
  /** Seçili hücre — açık kategori ya da Yapı'da göz önündeki blok */
  activeId?: string;
  /** Verilirse hücre düğme (Yapı: bloğa kay); yoksa kategorinin sayfasına bağlantı */
  onPick?: (id: string) => void;
  /** Sayfa zaten yüklediyse; yoksa şerit kendi okur */
  categories?: Category[];
}) {
  const t = useT();
  const loaded = useLiveQuery(() => (given ? undefined : listUserCategories()), [!!given]);
  const categories = given ?? loaded;
  const rowRef = useRef<HTMLDivElement>(null);

  // Seçili hücre şeridin dışında kaldıysa yana kaydır (sayfayı dikey
  // kaydırmadan — scrollIntoView ana kaydırıcıyı da oynatıyordu)
  useEffect(() => {
    const row = rowRef.current;
    if (!row || !activeId) return;
    const cell = row.querySelector<HTMLElement>(`[data-cat-cell="${CSS.escape(activeId)}"]`);
    if (!cell) return;
    const pad = 24;
    const left = cell.offsetLeft;
    const right = left + cell.offsetWidth;
    if (left - pad < row.scrollLeft) row.scrollTo({ left: Math.max(0, left - pad), behavior: "smooth" });
    else if (right + pad > row.scrollLeft + row.clientWidth)
      row.scrollTo({ left: right + pad - row.clientWidth, behavior: "smooth" });
  }, [activeId, categories?.length]);

  if (!categories?.length) return null;

  return (
    // min-w-0: ızgara hücresi içeriğin boyuna uzamasın — yoksa yana kayan
    // şerit bütün başlık bloğunu ekrandan taşırıyordu
    <nav aria-label={t("structure.categories")} className="min-w-0">
      <div ref={rowRef} data-category-nav="" className="no-scrollbar flex gap-[2px] overflow-x-auto">
        {categories.map((c) => {
          const on = c.id === activeId;
          const cls = cn(
            "flex shrink-0 grow items-center justify-center gap-2 py-2 pl-2 pr-3 text-[#111]",
            !on && "bg-white active:bg-[#f5f1e8]"
          );
          const body = (
            <>
              <span
                className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[8px] border-[1.5px] border-[#111]"
                style={{ background: on ? "#ffffff" : c.color }}
              >
                {c.icon && <SymbolIcon name={c.icon} size={15} style={{ color: "#111" }} />}
              </span>
              <span className="whitespace-nowrap text-[12.5px] font-extrabold leading-none tracking-[-0.01em]">{c.name}</span>
            </>
          );
          const common = {
            "data-cat-cell": c.id,
            "aria-current": on ? ("page" as const) : undefined,
            className: cls,
            style: on ? { background: c.color } : undefined,
          };
          return onPick ? (
            <button key={c.id} type="button" onClick={() => onPick(c.id)} {...common}>
              {body}
            </button>
          ) : (
            <Link key={c.id} href={routes.structureCategory(c.id)} prefetch={false} replace {...common}>
              {body}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
