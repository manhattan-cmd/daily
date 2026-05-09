"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { Folder, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import {
  getCategory,
  listSubCategoriesByCategory,
  deleteSubCategory,
} from "@/lib/db/queries";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { SubCategoryForm } from "@/components/structure/subcategory-form";
import { FieldForm } from "@/components/structure/field-form";
import { AddTypeModal } from "@/components/structure/add-type-modal";
import { cn } from "@/lib/utils";
import type { SubCategory } from "@/types";

export default function CategoryDetailPage({
  params,
}: {
  params: Promise<{ categoryId: string }>;
}) {
  const { categoryId } = use(params);

  const category = useLiveQuery(() => getCategory(categoryId), [categoryId]);
  const subcategories = useLiveQuery(
    () => listSubCategoriesByCategory(categoryId),
    [categoryId]
  );
  const fieldCounts = useLiveQuery(async () => {
    const subs = await listSubCategoriesByCategory(categoryId);
    const counts = new Map<string, number>();
    for (const s of subs) {
      const c = await db.fields.where("subcategoryId").equals(s.id).count();
      counts.set(s.id, c);
    }
    return counts;
  }, [categoryId]);

  const [choiceOpen, setChoiceOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [fieldFormOpen, setFieldFormOpen] = useState(false);
  const [editing, setEditing] = useState<SubCategory | undefined>();
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  function openNew() {
    setEditing(undefined);
    setFormOpen(true);
  }

  function openEdit(sub: SubCategory) {
    setEditing(sub);
    setFormOpen(true);
    setOpenMenuId(null);
  }

  async function onDelete(sub: SubCategory) {
    setOpenMenuId(null);
    if (!confirm(`"${sub.name}" alt kategorisini silmek istediğinden emin misin? Tüm girdiler silinecek.`)) return;
    await deleteSubCategory(sub.id);
  }

  return (
    <>
      <PageHeader
        title={category?.name ?? "..."}
        description="Alt kategoriler"
        back="/structure"
      />

      {openMenuId && (
        <div className="fixed inset-0 z-40" onClick={() => setOpenMenuId(null)} />
      )}

      {subcategories === undefined ? null : subcategories.length === 0 ? null : (
        <div className="flex flex-col gap-2">
          {subcategories.map((sub) => (
            <div
              key={sub.id}
              className="flex items-center gap-2 rounded-2xl border border-border bg-card transition-colors hover:bg-card/80"
            >
              <Link
                href={`/structure/${categoryId}/${sub.id}`}
                className="flex flex-1 items-center gap-3 min-w-0 p-3"
              >
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
                  style={{ backgroundColor: `${category?.color ?? "#6366f1"}22` }}
                >
                  <Folder className="h-5 w-5" style={{ color: category?.color ?? "#6366f1" }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="truncate font-medium">{sub.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {fieldCounts?.get(sub.id) ?? 0} alan
                  </div>
                </div>
              </Link>

              <div className={cn("relative shrink-0 pr-2", openMenuId === sub.id && "z-50")}>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-muted-foreground"
                  onClick={() => setOpenMenuId(openMenuId === sub.id ? null : sub.id)}
                  aria-label="Seçenekler"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>

                {openMenuId === sub.id && (
                  <div className="absolute right-0 top-full z-50 mt-1 w-36 overflow-hidden rounded-xl border border-border bg-card shadow-xl">
                    <button
                      onClick={() => openEdit(sub)}
                      className="flex w-full items-center gap-2 px-3 py-2.5 text-sm hover:bg-muted transition-colors"
                    >
                      <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                      Düzenle
                    </button>
                    <button
                      onClick={() => onDelete(sub)}
                      className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-destructive hover:bg-muted transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Sil
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-center mt-4">
        <Button
          size="icon"
          onClick={() => setChoiceOpen(true)}
          aria-label="Ekle"
          className="bg-blue-500 hover:bg-blue-400 text-white shadow-lg shadow-blue-500/30 transition-all"
        >
          <Plus className="h-5 w-5" />
        </Button>
      </div>

      <AddTypeModal
        open={choiceOpen}
        onOpenChange={setChoiceOpen}
        categoryLabel="Alt Kategori"
        categoryDescription="Yeni bir gruplama ya da bölüm oluştur"
        objectLabel="Alan"
        objectDescription="Bu kategoriye yeni bir alan ekle"
        onSelectCategory={openNew}
        onSelectObject={() => setFieldFormOpen(true)}
      />

      <SubCategoryForm
        open={formOpen}
        onOpenChange={setFormOpen}
        categoryId={categoryId}
        categoryName={category?.name}
        subcategory={editing}
      />

      <FieldForm
        open={fieldFormOpen}
        onOpenChange={setFieldFormOpen}
        categoryId={categoryId}
      />
    </>
  );
}
