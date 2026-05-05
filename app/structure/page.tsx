"use client";

import { useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { Plus, Layers, ChevronRight, Pencil, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { listCategories, deleteCategory } from "@/lib/db/queries";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { CategoryForm } from "@/components/structure/category-form";
import type { Category } from "@/types";

export default function StructurePage() {
  const categories = useLiveQuery(() => listCategories(), []);
  const subCounts = useLiveQuery(async () => {
    const cats = await listCategories();
    const counts = new Map<string, number>();
    for (const cat of cats) {
      const c = await db.subcategories.where("categoryId").equals(cat.id).count();
      counts.set(cat.id, c);
    }
    return counts;
  }, []);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Category | undefined>();

  function openNew() {
    setEditing(undefined);
    setFormOpen(true);
  }

  function openEdit(cat: Category) {
    setEditing(cat);
    setFormOpen(true);
  }

  async function onDelete(cat: Category) {
    if (
      !confirm(
        `"${cat.name}" kategorisini silmek istediğinden emin misin? Tüm alt kategoriler ve girdiler silinecek.`
      )
    )
      return;
    await deleteCategory(cat.id);
  }

  return (
    <>
      <PageHeader
        title="Yapı"
        description="Kategori, alt kategori ve alanları yönet"
        action={
          <Button size="icon" onClick={openNew} aria-label="Yeni kategori">
            <Plus className="h-5 w-5" />
          </Button>
        }
      />

      {categories === undefined ? null : categories.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="Henüz kategori yok"
          description="Takip etmek istediğin alanları ekleyerek başla. Örn. Alkol, Uyku, Spor."
          action={
            <Button onClick={openNew}>
              <Plus className="h-4 w-4" />
              İlk kategoriyi oluştur
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-2">
          {categories.map((cat) => (
            <div
              key={cat.id}
              className="group flex items-center gap-3 rounded-2xl border border-border bg-card p-3 transition-colors hover:bg-card/80"
            >
              <Link
                href={`/structure/${cat.id}`}
                className="flex flex-1 items-center gap-3 min-w-0"
              >
                <div
                  className="h-10 w-10 shrink-0 rounded-lg"
                  style={{ backgroundColor: cat.color }}
                />
                <div className="flex-1 min-w-0">
                  <div className="truncate font-medium">{cat.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {subCounts?.get(cat.id) ?? 0} alt kategori
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
              </Link>
              <div className="flex items-center gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-9 w-9"
                  onClick={() => openEdit(cat)}
                  aria-label="Düzenle"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-9 w-9 text-muted-foreground hover:text-destructive"
                  onClick={() => onDelete(cat)}
                  aria-label="Sil"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <CategoryForm
        open={formOpen}
        onOpenChange={setFormOpen}
        category={editing}
      />
    </>
  );
}
