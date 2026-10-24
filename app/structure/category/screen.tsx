"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n";
import { confirmDialog } from "@/components/ui/confirm";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { BarChart3, Pencil, Trash2 } from "lucide-react";
import {
  getCategory,
  deleteCategory,
  structureSummary,
} from "@/lib/db/queries";
import { BrutHeroCard, BrutTopStrip, useIsBrutal } from "@/components/structure/brutal";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { SubCategoryForm } from "@/components/structure/subcategory-form";
import { CategoryForm } from "@/components/structure/category-form";
import { ModifierSection } from "@/components/structure/modifier-section";
import { SubCategoryTree } from "@/components/structure/subcategory-tree";
import { RecentEntriesSection } from "@/components/structure/recent-entries-section";
import { AnalysisSection } from "@/components/structure/analysis-section";
import { routes } from "@/lib/routes";
import { Layer } from "@/components/ui/layer";

export function CategoryDetailPage({
  params,
}: {
  params: { categoryId: string };
}) {
  const { categoryId } = params;
  const t = useT();
  const router = useRouter();

  const category = useLiveQuery(() => getCategory(categoryId), [categoryId]);

  const [subFormOpen, setSubFormOpen] = useState(false);
  // Ağaçtan gelen ekleme hedefi — undefined kök seviye demek
  const [newParentId, setNewParentId] = useState<string | undefined>();
  const [catFormOpen, setCatFormOpen] = useState(false);

  // Brütal tema: renkli başlık kartı ve sayılar
  const brutal = useIsBrutal();
  const summary = useLiveQuery(
    () => (brutal ? structureSummary(categoryId) : undefined),
    [brutal, categoryId]
  );

  async function onDeleteCategory() {
    if (!category) return;
    const ok = await confirmDialog({
      title: t("confirm.deleteCategory", { name: category.name }),
      body: `${t("confirm.deleteCategoryBody")} ${t("confirm.undoHint")}`,
      destructive: true,
    });
    if (!ok) return;
    await deleteCategory(categoryId);
    router.push("/structure");
  }


  return (
    <>
      {brutal ? (
        <>
          <BrutTopStrip
            back="/structure"
            analyticsHref={routes.analyticsCategory(categoryId)}
            onEdit={() => setCatFormOpen(true)}
            onDelete={onDeleteCategory}
            onAddSub={() => {
              setNewParentId(undefined);
              setSubFormOpen(true);
            }}
          />
          {/* Özet katmanı — gün sayfasındaki "Gün özeti"nin karşılığı */}
          {category && (
            <Layer label={t("structure.catSummary")}>
            <BrutHeroCard
              color={category.color}
              icon={category.icon}
              overline={t("brut.category")}
              title={category.name}
              summary={summary}
              className="mb-0"
            />
            </Layer>
          )}
        </>
      ) : (
      <PageHeader
        title={category?.name ?? "..."}
        description={t("tree.subcategoriesAndFeatures")}
        back="/structure"
        action={
          category && (
            <div className="flex items-center gap-0.5">
              {/* Analiz sayfa düzeyinde — "son girdilerin analizi" sanılmasın */}
              <Link
                href={routes.analyticsCategory(categoryId)}
                aria-label={`${category.name} analizi`}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <BarChart3 className="h-4 w-4" />
              </Link>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-muted-foreground"
                onClick={() => setCatFormOpen(true)}
                aria-label={t("tree.editCategory")}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                onClick={onDeleteCategory}
                aria-label={t("tree.deleteCategory")}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          )
        }
      />
      )}

      {/* Özellik atomları */}
      {category && (
        <ModifierSection
          targetType="category"
          targetId={categoryId}
          targetName={category.name}
        />
      )}

      {/* Alt kategori ağacı — hiyerarşi iç içe açılır */}
      {category && (
        <Layer label={t("structure.subcategories")} className="mb-6">
        <section>
          {!brutal && (
          <h2 className="px-1 mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("structure.subcategories")}
          </h2>
          )}
          <SubCategoryTree
            categoryId={categoryId}
            categoryName={category.name}
            color={category.color}
            onAddChild={(parentSubId) => {
              setNewParentId(parentSubId);
              setSubFormOpen(true);
            }}
          />
        </section>
        </Layer>
      )}

      {/* Analiz — özelliklerin nasıl inceleneceği, kullanıcının seçimi */}
      {category && (
        <AnalysisSection categoryId={categoryId} />
      )}

      {/* Son girdiler + analize kısayol */}
      <RecentEntriesSection
        scope="category"
        categoryId={categoryId}
        selfName={category?.name}
        color={category?.color}
      />


      <SubCategoryForm
        open={subFormOpen}
        onOpenChange={(o) => {
          setSubFormOpen(o);
          if (!o) setNewParentId(undefined);
        }}
        categoryId={categoryId}
        parentSubcategoryId={newParentId}
        categoryName={category?.name}
      />

      <CategoryForm
        open={catFormOpen}
        onOpenChange={setCatFormOpen}
        category={category ?? undefined}
      />
    </>
  );
}
