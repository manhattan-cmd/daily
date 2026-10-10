"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { BarChart3, Pencil, Trash2 } from "lucide-react";
import { getSubCategory, getCategory, structureSummary } from "@/lib/db/queries";
import { toLocalDateValue } from "@/lib/utils";
import { DayEntrySheet } from "@/components/calendar/day-entry-sheet";
import { BrutCta, BrutSubHeader, BrutTopStrip, useIsBrutal } from "@/components/structure/brutal";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { SubCategoryForm } from "@/components/structure/subcategory-form";
import { ModifierSection } from "@/components/structure/modifier-section";
import { SubCategoryTree } from "@/components/structure/subcategory-tree";
import { DeleteSubCategoryDialog } from "@/components/structure/delete-subcategory-dialog";
import { RecentEntriesSection } from "@/components/structure/recent-entries-section";
import { routes } from "@/lib/routes";

export function SubCategoryDetailPage({
  params,
}: {
  params: { categoryId: string; subcategoryId: string };
}) {
  const t = useT();
  const { categoryId, subcategoryId } = params;
  const router = useRouter();

  const category = useLiveQuery(() => getCategory(categoryId), [categoryId]);
  const subcategory = useLiveQuery(
    () => getSubCategory(subcategoryId),
    [subcategoryId]
  );
  // Silme diyaloğu "sadece bunu sil" seçeneğinde içindekilerin taşınacağı üst
  const parentSub = useLiveQuery(
    () => (subcategory?.parentId ? getSubCategory(subcategory.parentId) : undefined),
    [subcategory?.parentId]
  );

  const [subFormOpen, setSubFormOpen] = useState(false);
  // Formun hedefi: kendisi (düzenleme) ya da ağaçtan seçilen ebeveyne yeni çocuk
  const [editingSelf, setEditingSelf] = useState(false);
  const [newParentId, setNewParentId] = useState<string>(subcategoryId);
  const [deleteOpen, setDeleteOpen] = useState(false);

  // Brütal tema: büyük başlık, üç renkli kutu, altta "Girdi ekle"
  const brutal = useIsBrutal();
  const summary = useLiveQuery(
    () => (brutal ? structureSummary(categoryId, subcategoryId) : undefined),
    [brutal, categoryId, subcategoryId]
  );
  const [today] = useState(() => toLocalDateValue());
  const [entryOpen, setEntryOpen] = useState(false);

  const backPath = subcategory?.parentId
    ? routes.structureSub(categoryId, subcategory.parentId)
    : routes.structureCategory(categoryId);

  const deleteParentName = subcategory?.parentId
    ? parentSub?.name ?? category?.name ?? "parent category"
    : category?.name ?? "kategori";

  return (
    <>
      {brutal ? (
        <>
          <BrutTopStrip
            back={backPath}
            analyticsHref={routes.analyticsSub(categoryId, subcategoryId)}
            onEdit={() => {
              setEditingSelf(true);
              setSubFormOpen(true);
            }}
            onDelete={() => setDeleteOpen(true)}
          />
          {subcategory && (
            <BrutSubHeader
              parentName={parentSub?.name ?? category?.name}
              title={subcategory.name}
              summary={summary}
            />
          )}
        </>
      ) : (
      <PageHeader
        title={subcategory?.name ?? "..."}
        description={category?.name}
        back={backPath}
        action={
          subcategory && (
            <div className="flex items-center gap-0.5">
              {/* Analiz sayfa düzeyinde — "son girdilerin analizi" sanılmasın */}
              <Link
                href={routes.analyticsSub(categoryId, subcategoryId)}
                aria-label={`${subcategory.name} analizi`}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <BarChart3 className="h-4 w-4" />
              </Link>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-muted-foreground"
                onClick={() => {
                  setEditingSelf(true);
                  setSubFormOpen(true);
                }}
                aria-label={t("tree.editSubcategory")}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                onClick={() => setDeleteOpen(true)}
                aria-label={t("tree.deleteSubcategory")}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          )
        }
      />
      )}

      {/* Özellik atomları */}
      {subcategory && (
        <ModifierSection
          targetType="subcategory"
          targetId={subcategoryId}
          targetName={subcategory.name}
        />
      )}

      {/* Çocuk alt kategori ağacı */}
      {category && (
        <section className="mb-6">
          <h2 className="px-1 mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("structure.subcategories")}
          </h2>
          <SubCategoryTree
            categoryId={categoryId}
            categoryName={category.name}
            color={category.color}
            parentId={subcategoryId}
            parentName={subcategory?.name}
            onAddChild={(parentSubId) => {
              setEditingSelf(false);
              setNewParentId(parentSubId ?? subcategoryId);
              setSubFormOpen(true);
            }}
          />
        </section>
      )}

      {/* Son girdiler + analize kısayol */}
      <RecentEntriesSection
        scope="subcategory"
        categoryId={categoryId}
        subcategoryId={subcategoryId}
        selfName={subcategory?.name}
        color={category?.color}
      />

      {brutal && subcategory && <BrutCta label={t("home.addEntry")} onClick={() => setEntryOpen(true)} />}
      {brutal && (
        <DayEntrySheet
          date={today}
          open={entryOpen && !!subcategory}
          onClose={() => setEntryOpen(false)}
          presetSub={subcategory ?? null}
        />
      )}

      <SubCategoryForm
        open={subFormOpen}
        onOpenChange={(o) => {
          setSubFormOpen(o);
          if (!o) {
            setEditingSelf(false);
            setNewParentId(subcategoryId);
          }
        }}
        categoryId={categoryId}
        parentSubcategoryId={editingSelf ? undefined : newParentId}
        categoryName={category?.name}
        subcategory={editingSelf ? subcategory : undefined}
      />

      <DeleteSubCategoryDialog
        sub={deleteOpen ? subcategory ?? null : null}
        parentName={deleteParentName}
        onOpenChange={setDeleteOpen}
        onDeleted={() => router.push(backPath)}
      />
    </>
  );
}
