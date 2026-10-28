"use client";

import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Layers } from "lucide-react";
import { listCategoryTree, listUserCategories } from "@/lib/db/queries";
import { BrutCategoryTree, useIsBrutal } from "@/components/structure/brutal";
import { EmptyState } from "@/components/ui/empty-state";
import { CategoryForm } from "@/components/structure/category-form";
import { SubCategoryForm } from "@/components/structure/subcategory-form";
import { CategoryNav } from "@/components/structure/category-nav";
import { CategoryTile } from "@/components/structure/category-tile";
import {
  StructureAddButton,
  StructureHeader,
} from "@/components/structure/structure-header";
import { ExampleHint } from "@/components/structure/example-hint";
import { useT } from "@/lib/i18n";
import { routes } from "@/lib/routes";
import { PageSheet } from "@/components/ui/layer";
import type { Category } from "@/types";

export default function StructurePage() {
  const t = useT();
  const categories = useLiveQuery(() => listUserCategories(), []);
  // Brütal temada kategoriler ağaç: alt kategoriler ve girdi sayılarıyla
  const brutal = useIsBrutal();
  const tree = useLiveQuery(() => (brutal ? listCategoryTree() : undefined), [brutal]);

  // Kategori ekleme girdi ekleme ekranındakiyle AYNI pencere (CategoryForm).
  // Eskiden burada açılır küçük bir menü vardı: hazır listeye dokununca
  // sormadan kategori açıyor, "kendin yaz" satırı sıkışık kalıyordu.
  const [addOpen, setAddOpen] = useState(false);
  // Brütal: kategori bloğunun + Alt kategori karosu. Kategori kapanışta da
  // durur — pencere kapanırken adı boşalmasın
  const [subCat, setSubCat] = useState<Category | null>(null);
  const [subOpen, setSubOpen] = useState(false);

  // Brütal: başlığın kategori şeridi (bkz. CategoryNav) — seçili hücre göz
  // önündeki bloğu izler, dokununca o bloğa kayar. Kayma sürerken izleme
  // durur: yoksa şerit aradaki kategorileri tek tek yakıp söndürüyordu.
  const [activeCat, setActiveCat] = useState<string>();
  const sliding = useRef(false);
  useEffect(() => {
    if (!brutal) return;
    const main = document.querySelector<HTMLElement>("[data-app-main]");
    if (!main) return;
    let raf = 0;
    const spy = () => {
      raf = 0;
      if (sliding.current) return;
      const top = headerBottom();
      let id: string | undefined;
      for (const b of main.querySelectorAll<HTMLElement>("[data-cat-block]")) {
        if (id === undefined || b.getBoundingClientRect().top <= top + 48) id = b.dataset.catBlock;
        else break;
      }
      setActiveCat(id);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(spy);
    };
    main.addEventListener("scroll", onScroll, { passive: true });
    raf = requestAnimationFrame(spy);
    return () => {
      main.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [brutal, categories?.length]);

  const pickCategory = (id: string) => {
    const main = document.querySelector<HTMLElement>("[data-app-main]");
    const block = main?.querySelector<HTMLElement>(`[data-cat-block="${CSS.escape(id)}"]`);
    if (!main || !block) return;
    setActiveCat(id);
    sliding.current = true;
    const done = () => {
      sliding.current = false;
    };
    main.addEventListener("scrollend", done, { once: true });
    setTimeout(done, 1200);
    main.scrollTo({ top: main.scrollTop + block.getBoundingClientRect().top - headerBottom() - 12, behavior: "smooth" });
  };

  return (
    <PageSheet
      top={
        <StructureHeader
          below={
            brutal && categories?.length ? (
              <CategoryNav categories={categories} activeId={activeCat} onPick={pickCategory} />
            ) : undefined
          }
          action={
            <StructureAddButton
              labelKey="structure.addCategory"
              onClick={() => setAddOpen(true)}
            />
          }
        />
      }
    >

      <ExampleHint />

      {categories === undefined ? null : categories.length === 0 ? (
        <EmptyState
          icon={Layers}
          title={t("structure.empty.title")}
          description={t("structure.empty.body")}
        />
      ) : brutal ? (
        <BrutCategoryTree
          categories={categories}
          subs={tree?.subs ?? []}
          counts={tree?.counts}
          onAddSub={(c) => {
            setSubCat(c);
            setSubOpen(true);
          }}
        />
      ) : (
        /* Kategori rafları — atomlarla aynı ızgara, kare karolar */
        <div className="grid grid-cols-4 gap-x-1.5 gap-y-1">
          {categories.map((cat) => (
            <CategoryTile
              key={cat.id}
              href={routes.structureCategory(cat.id)}
              color={cat.color}
              icon={cat.icon}
              name={cat.name}
            />
          ))}
        </div>
      )}
      <CategoryForm open={addOpen} onOpenChange={setAddOpen} />
      {subCat && (
        <SubCategoryForm
          open={subOpen}
          onOpenChange={setSubOpen}
          categoryId={subCat.id}
          categoryName={subCat.name}
        />
      )}
    </PageSheet>
  );
}

/** Yapışkan başlık bloğunun alt kenarı — bloklar bunun altına kayar */
function headerBottom(): number {
  return document.querySelector("[data-header-block]")?.getBoundingClientRect().bottom ?? 0;
}
