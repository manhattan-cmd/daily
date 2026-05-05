"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { Plus, ChevronRight, Pencil, Trash2, Folder } from "lucide-react";
import { db } from "@/lib/db";
import {
  getCategory,
  listSubCategoriesByCategory,
  deleteSubCategory,
} from "@/lib/db/queries";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { SubCategoryForm } from "@/components/structure/subcategory-form";
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

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SubCategory | undefined>();

  function openNew() {
    setEditing(undefined);
    setFormOpen(true);
  }

  function openEdit(sub: SubCategory) {
    setEditing(sub);
    setFormOpen(true);
  }

  async function onDelete(sub: SubCategory) {
    if (
      !confirm(
        `"${sub.name}" alt kategorisini silmek istediğinden emin misin? Tüm girdiler silinecek.`
      )
    )
      return;
    await deleteSubCategory(sub.id);
  }

  return (
    <>
      <PageHeader
        title={category?.name ?? "..."}
        description="Alt kategoriler"
        back="/structure"
        action={
          <Button size="icon" onClick={openNew} aria-label="Yeni alt kategori">
            <Plus className="h-5 w-5" />
          </Button>
        }
      />

      {subcategories === undefined ? null : subcategories.length === 0 ? (
        <EmptyState
          icon={Folder}
          title="Alt kategori yok"
          description="Bu kategori altında neyi izlemek istiyorsun? Örn. Bira, Şarap."
          action={
            <Button onClick={openNew}>
              <Plus className="h-4 w-4" />
              Alt kategori ekle
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-2">
          {subcategories.map((sub) => (
            <div
              key={sub.id}
              className="group flex items-center gap-2 rounded-2xl border border-border bg-card p-3 transition-colors hover:bg-card/80"
            >
              <Link
                href={`/structure/${categoryId}/${sub.id}`}
                className="flex flex-1 items-center gap-3 min-w-0"
              >
                <div
                  className="h-10 w-10 shrink-0 rounded-lg flex items-center justify-center"
                  style={{
                    backgroundColor: `${category?.color ?? "#6366f1"}22`,
                  }}
                >
                  <Folder
                    className="h-5 w-5"
                    style={{ color: category?.color ?? "#6366f1" }}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="truncate font-medium">{sub.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {fieldCounts?.get(sub.id) ?? 0} alan
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
              </Link>
              <div className="flex items-center gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-9 w-9"
                  onClick={() => openEdit(sub)}
                  aria-label="Düzenle"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-9 w-9 text-muted-foreground hover:text-destructive"
                  onClick={() => onDelete(sub)}
                  aria-label="Sil"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <SubCategoryForm
        open={formOpen}
        onOpenChange={setFormOpen}
        categoryId={categoryId}
        subcategory={editing}
      />
    </>
  );
}
