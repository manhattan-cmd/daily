"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { Pencil, Trash2 } from "lucide-react";
import {
  getSubCategory,
  getCategory,
  deleteSubCategory,
} from "@/lib/db/queries";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { SubCategoryForm } from "@/components/structure/subcategory-form";
import { ModifierSection } from "@/components/structure/modifier-section";
import { SubCategoryTree } from "@/components/structure/subcategory-tree";

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

  const [subFormOpen, setSubFormOpen] = useState(false);
  // Formun hedefi: kendisi (düzenleme) ya da ağaçtan seçilen ebeveyne yeni çocuk
  const [editingSelf, setEditingSelf] = useState(false);
  const [newParentId, setNewParentId] = useState<string>(subcategoryId);

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

      {/* Çocuk alt kategori ağacı */}
      {category && (
        <section className="mb-6">
          <h2 className="px-1 mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Alt Kategoriler
          </h2>
          <SubCategoryTree
            categoryId={categoryId}
            color={category.color}
            parentId={subcategoryId}
            onAddChild={(parentSubId) => {
              setEditingSelf(false);
              setNewParentId(parentSubId ?? subcategoryId);
              setSubFormOpen(true);
            }}
          />
        </section>
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
    </>
  );
}
