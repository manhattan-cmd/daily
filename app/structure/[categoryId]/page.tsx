"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { Pencil, Trash2 } from "lucide-react";
import { getCategory, deleteCategory } from "@/lib/db/queries";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { SubCategoryForm } from "@/components/structure/subcategory-form";
import { CategoryForm } from "@/components/structure/category-form";
import { ModifierSection } from "@/components/structure/modifier-section";
import { SubCategoryTree } from "@/components/structure/subcategory-tree";

export default function CategoryDetailPage({
  params,
}: {
  params: Promise<{ categoryId: string }>;
}) {
  const { categoryId } = use(params);
  const router = useRouter();

  const category = useLiveQuery(() => getCategory(categoryId), [categoryId]);

  const [subFormOpen, setSubFormOpen] = useState(false);
  // Ağaçtan gelen ekleme hedefi — undefined kök seviye demek
  const [newParentId, setNewParentId] = useState<string | undefined>();
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

      {/* Alt kategori ağacı — hiyerarşi iç içe açılır */}
      {category && (
        <section className="mb-6">
          <h2 className="px-1 mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Alt Kategoriler
          </h2>
          <SubCategoryTree
            categoryId={categoryId}
            color={category.color}
            onAddChild={(parentSubId) => {
              setNewParentId(parentSubId);
              setSubFormOpen(true);
            }}
          />
        </section>
      )}

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
