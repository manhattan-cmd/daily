"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { Folder, FolderOpen, Pencil, Trash2 } from "lucide-react";
import {
  getSubCategory,
  getCategory,
  listSubCategoriesByParent,
  deleteSubCategory,
} from "@/lib/db/queries";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { SubCategoryForm } from "@/components/structure/subcategory-form";
import { ModifierSection } from "@/components/structure/modifier-section";
import {
  CategoryTile,
  CategoryTileAdd,
} from "@/components/structure/category-tile";
import type { SubCategory } from "@/types";

export default function SubCategoryDetailPage({
  params,
}: {
  params: Promise<{ categoryId: string; subcategoryId: string }>;
}) {
  const { categoryId, subcategoryId } = use(params);
  const router = useRouter();

  const category = useLiveQuery(() => getCategory(categoryId), [categoryId]);
  const subcategory = useLiveQuery(
    () => getSubCategory(subcategoryId),
    [subcategoryId]
  );
  const children = useLiveQuery(
    () => listSubCategoriesByParent(subcategoryId),
    [subcategoryId]
  );
  const allSubs = useLiveQuery(
    () => db.subcategories.where("categoryId").equals(categoryId).toArray(),
    [categoryId]
  );

  const [subFormOpen, setSubFormOpen] = useState(false);
  // Formun hedefi: kendisi (düzenleme) ya da undefined (yeni çocuk)
  const [editingSelf, setEditingSelf] = useState(false);

  const backPath = subcategory?.parentId
    ? `/structure/${categoryId}/${subcategory.parentId}`
    : `/structure/${categoryId}`;

  async function onDeleteSelf() {
    if (!subcategory) return;
    if (
      !confirm(
        `"${subcategory.name}" alt kategorisini silmek istediğinden emin misin? Tüm içerik silinecek.`
      )
    )
      return;
    await deleteSubCategory(subcategoryId);
    router.push(backPath);
  }

  const hasSubChildren = (subId: string) =>
    allSubs?.some((s) => s.parentId === subId) ?? false;

  return (
    <>
      <PageHeader
        title={subcategory?.name ?? "..."}
        description={category?.name}
        back={backPath}
        action={
          subcategory && (
            <div className="flex items-center gap-0.5">
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-muted-foreground"
                onClick={() => {
                  setEditingSelf(true);
                  setSubFormOpen(true);
                }}
                aria-label="Alt kategoriyi düzenle"
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                onClick={onDeleteSelf}
                aria-label="Alt kategoriyi sil"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          )
        }
      />

      {/* Özellik atomları */}
      {subcategory && (
        <ModifierSection
          targetType="subcategory"
          targetId={subcategoryId}
          targetName={subcategory.name}
        />
      )}

      {/* Çocuk alt kategori rafları */}
      {category && children && (
        <section className="mb-6">
          <h2 className="px-1 mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Alt Kategoriler
          </h2>
          <div className="grid grid-cols-4 gap-x-1.5 gap-y-1">
            {children.map((child: SubCategory) => (
              <CategoryTile
                key={child.id}
                href={`/structure/${categoryId}/${child.id}`}
                color={category.color}
                icon={child.icon}
                fallback={hasSubChildren(child.id) ? FolderOpen : Folder}
                name={child.name}
              />
            ))}
            <CategoryTileAdd
              label="Alt kategori"
              onClick={() => {
                setEditingSelf(false);
                setSubFormOpen(true);
              }}
            />
          </div>
        </section>
      )}

      <SubCategoryForm
        open={subFormOpen}
        onOpenChange={(o) => {
          setSubFormOpen(o);
          if (!o) setEditingSelf(false);
        }}
        categoryId={categoryId}
        parentSubcategoryId={editingSelf ? undefined : subcategoryId}
        categoryName={category?.name}
        subcategory={editingSelf ? subcategory : undefined}
      />
    </>
  );
}
