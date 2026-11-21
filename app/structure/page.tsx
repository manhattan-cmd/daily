"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Layers } from "lucide-react";
import { listCategoryTree, listUserCategories } from "@/lib/db/queries";
import { db } from "@/lib/db";
import { matchesSearch, normalizeSearch } from "@/lib/search";
import { StructureSearch } from "@/components/structure/structure-search";
import { BrutCategoryTree, useIsBrutal } from "@/components/structure/brutal";
import { EmptyState } from "@/components/ui/empty-state";
import { CategoryForm } from "@/components/structure/category-form";
import { SubCategoryForm } from "@/components/structure/subcategory-form";
import { CategoryTile } from "@/components/structure/category-tile";
import {
  StructureAddButton,
  StructureHeader,
} from "@/components/structure/structure-header";
import { ExampleHint } from "@/components/structure/example-hint";
import { StructureHead } from "@/components/structure/structure-head";
import { useT } from "@/lib/i18n";
import { routes } from "@/lib/routes";
import { PageSheet } from "@/components/ui/layer";
import { SummaryEmpty } from "@/components/ui/summary-block";
import type { Category } from "@/types";

export default function StructurePage() {
  const t = useT();
  const categories = useLiveQuery(() => listUserCategories(), []);
  // Brütal temada kategoriler ağaç: alt kategoriler ve girdi sayılarıyla
  const brutal = useIsBrutal();
  const tree = useLiveQuery(() => (brutal ? listCategoryTree() : undefined), [brutal]);
  // Arama kategorinin ve alt kategorilerinin adında: "koşu" yazınca Spor
  // kalır. Alt kategoriler hafif okunur (ağaç sorgusu bütün girdileri sayar)
  const [query, setQuery] = useState("");
  const allSubs = useLiveQuery(() => db.subcategories.toArray(), []);
  const q = normalizeSearch(query.trim());
  const shown = !q
    ? categories
    : categories?.filter(
        (c) =>
          matchesSearch(c.name, q) ||
          (allSubs ?? []).some((s) => s.categoryId === c.id && !s.isCategoryRoot && matchesSearch(s.name, q))
      );

  // Kategori ekleme girdi ekleme ekranındakiyle AYNI pencere (CategoryForm).
  // Eskiden burada açılır küçük bir menü vardı: hazır listeye dokununca
  // sormadan kategori açıyor, "kendin yaz" satırı sıkışık kalıyordu.
  const [addOpen, setAddOpen] = useState(false);
  // Brütal: kategori bloğunun + Alt kategori karosu. Kategori kapanışta da
  // durur — pencere kapanırken adı boşalmasın
  const [subCat, setSubCat] = useState<Category | null>(null);
  const [subOpen, setSubOpen] = useState(false);

  return (
    <PageSheet
      top={
        <StructureHeader
          action={
            brutal ? undefined : (
              <StructureAddButton labelKey="structure.addCategory" onClick={() => setAddOpen(true)} />
            )
          }
        />
      }
    >

      {/* Brütal: sayfa başı (bkz. StructureHead) — ad, sayı, Ara ve Ekle;
          hiç kategori yoksa boş pencere başın içinde */}
      {brutal ? (
        <StructureHead
          count={categories && t("struct.cats.count", { n: categories.length })}
          add={{ label: t("structure.addCategory"), onClick: () => setAddOpen(true) }}
          search={
            categories?.length
              ? { value: query, onChange: setQuery, placeholder: t("structure.searchCategories") }
              : undefined
          }
          rows={
            categories?.length === 0 ? (
              <SummaryEmpty text={t("structure.empty.title")} action={{ label: t("action.create"), onClick: () => setAddOpen(true) }} />
            ) : undefined
          }
        />
      ) : (
        !!categories?.length && (
          <StructureSearch value={query} onChange={setQuery} placeholder={t("structure.searchCategories")} />
        )
      )}
      {/* Kategori kalmadıysa "Bu kategoriler örnek" boş pencerenin üstünde yanlış */}
      {!!categories?.length && !q && <ExampleHint />}

      {/* Brütal: hiç kategori yoksa boş pencere — yazı ve ufak Oluştur */}
      {categories === undefined ? null : categories.length === 0 ? (
        brutal ? null : (
        <EmptyState
          icon={Layers}
          title={t("structure.empty.title")}
          description={t("structure.empty.body")}
        />
        )
      ) : shown && shown.length === 0 ? (
        <p className="px-1 text-[13px] font-medium text-muted-foreground">{t("structure.noMatch")}</p>
      ) : brutal ? (
        <BrutCategoryTree
          categories={shown ?? categories}
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
          {(shown ?? categories).map((cat) => (
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
