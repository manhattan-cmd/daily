"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { Folder, FolderOpen, Pencil, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import {
  getCategory,
  listSubCategoriesByCategory,
  deleteCategory,
} from "@/lib/db/queries";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { SubCategoryForm } from "@/components/structure/subcategory-form";
import { CategoryForm } from "@/components/structure/category-form";
import { ModifierSection } from "@/components/structure/modifier-section";
import {
  CategoryTile,
  CategoryTileAdd,
} from "@/components/structure/category-tile";

export default function CategoryDetailPage({
  params,
}: {
  params: Promise<{ categoryId: string }>;
}) {
  const { categoryId } = use(params);
  const router = useRouter();

  const category = useLiveQuery(() => getCategory(categoryId), [categoryId]);
  const subcategories = useLiveQuery(
    () => listSubCategoriesByCategory(categoryId),
    [categoryId]
  );
  const allSubs = useLiveQuery(
    () => db.subcategories.where("categoryId").equals(categoryId).toArray(),
    [categoryId]
  );

  const [subFormOpen, setSubFormOpen] = useState(false);
  const [catFormOpen, setCatFormOpen] = useState(false);

  async function onDeleteCategory() {
    if (!category) return;
    if (
      !confirm(
        `"${category.name}" kategorisini silmek istediğinden emin misin? Tüm alt kategoriler ve girdiler silinecek.`
      )
    )
      return;
    await deleteCategory(categoryId);
    router.push("/structure");
  }

  const hasSubChildren = (subId: string) =>
    allSubs?.some((s) => s.parentId === subId) ?? false;

  return (
    <>
      <PageHeader
        title={category?.name ?? "..."}
        description="Alt kategoriler ve özellikler"
        back="/structure"
        action={
          category && (
            <div className="flex items-center gap-0.5">
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-muted-foreground"
                onClick={() => setCatFormOpen(true)}
                aria-label="Kategoriyi düzenle"
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                onClick={onDeleteCategory}
                aria-label="Kategoriyi sil"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          )
        }
      />

      {/* Özellik atomları */}
      {category && (
        <ModifierSection
          targetType="category"
          targetId={categoryId}
          targetName={category.name}
        />
      )}

      {/* Alt kategori rafları — kategori renginde kare karolar */}
      {category && subcategories && (
        <section className="mb-6">
          <h2 className="px-1 mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Alt Kategoriler
          </h2>
          <div className="grid grid-cols-4 gap-x-1.5 gap-y-1">
            {subcategories.map((sub) => (
              <CategoryTile
                key={sub.id}
                href={`/structure/${categoryId}/${sub.id}`}
                color={category.color}
                icon={sub.icon}
                fallback={hasSubChildren(sub.id) ? FolderOpen : Folder}
                name={sub.name}
              />
            ))}
            <CategoryTileAdd
              label="Alt kategori"
              onClick={() => setSubFormOpen(true)}
            />
          </div>
        </section>
      )}

      <SubCategoryForm
        open={subFormOpen}
        onOpenChange={setSubFormOpen}
        categoryId={categoryId}
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
