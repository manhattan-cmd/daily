"use client";

import { useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { ChevronRight, Download, Layers, MoreHorizontal, Pencil, Sliders, Trash2, Waypoints } from "lucide-react";
import { db } from "@/lib/db";
import { listCategories, deleteCategory } from "@/lib/db/queries";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { CategoryForm } from "@/components/structure/category-form";
import { CategoryQuickAdd } from "@/components/structure/category-quick-add";
import { CategoryIcon } from "@/lib/category-icons";
import { cn } from "@/lib/utils";
import type { Category } from "@/types";

export default function StructurePage() {
  const categories = useLiveQuery(() => listCategories(), []);
  const subCounts = useLiveQuery(async () => {
    const cats = await listCategories();
    const counts = new Map<string, number>();
    for (const cat of cats) {
      const c = await db.subcategories
        .where("categoryId")
        .equals(cat.id)
        .filter((s) => !s.isCategoryRoot)
        .count();
      counts.set(cat.id, c);
    }
    return counts;
  }, []);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Category | undefined>();
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  function openEdit(cat: Category) {
    setEditing(cat);
    setFormOpen(true);
    setOpenMenuId(null);
  }

  async function onDelete(cat: Category) {
    setOpenMenuId(null);
    if (!confirm(`"${cat.name}" kategorisini silmek istediğinden emin misin? Tüm alt kategoriler ve girdiler silinecek.`)) return;
    await deleteCategory(cat.id);
  }

  const existingNames = new Set(categories?.map((c) => c.name) ?? []);

  return (
    <>
      <PageHeader
        title="Yapı"
        description="Kategori ve modları yönet"
        action={<CategoryQuickAdd existingNames={existingNames} />}
      />

      {/* Kısayollar */}
      <div className="flex flex-col gap-2 mb-5">
        <Link
          href="/structure/mods"
          className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3.5 transition-colors hover:bg-card/80 active:scale-[0.99]"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <Sliders className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium">Modlar</div>
            <div className="text-xs text-muted-foreground">
              Tüm modları gör, yönet — ölçüler de burada
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        </Link>

        <Link
          href="/structure/galaxy"
          className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3.5 transition-colors hover:bg-card/80 active:scale-[0.99]"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/10">
            <Waypoints className="h-5 w-5 text-violet-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium">Bağlantı Haritası</div>
            <div className="text-xs text-muted-foreground">
              Kategori, alt kategori ve mod bağlantılarını gör
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        </Link>

        <Link
          href="/structure/backup"
          className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3.5 transition-colors hover:bg-card/80 active:scale-[0.99]"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10">
            <Download className="h-5 w-5 text-emerald-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium">Yedekleme</div>
            <div className="text-xs text-muted-foreground">
              Verilerini dışa aktar veya geri yükle
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        </Link>
      </div>

      {/* Backdrop — closes open menu on outside click */}
      {openMenuId && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setOpenMenuId(null)}
        />
      )}

      <div className="px-1 mb-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Kategoriler
        </h2>
      </div>

      {categories === undefined ? null : categories.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="Henüz kategori yok"
          description="+ butonuna bas, listeden seç ya da kendin yaz."
        />
      ) : (
        <div className="flex flex-col gap-2">
          {categories.map((cat) => (
            <div
              key={cat.id}
              className="flex items-center gap-2 rounded-2xl border border-border bg-card transition-colors hover:bg-card/80"
            >
              <Link
                href={`/structure/${cat.id}`}
                className="flex flex-1 items-center gap-3 min-w-0 p-3"
              >
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
                  style={{ backgroundColor: cat.color }}
                >
                  <CategoryIcon name={cat.icon} className="h-5 w-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="truncate font-medium">{cat.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {subCounts?.get(cat.id) ?? 0} alt kategori
                  </div>
                </div>
              </Link>

              <div className={cn("relative shrink-0 pr-2", openMenuId === cat.id && "z-50")}>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-muted-foreground"
                  onClick={() => setOpenMenuId(openMenuId === cat.id ? null : cat.id)}
                  aria-label="Seçenekler"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>

                {openMenuId === cat.id && (
                  <div className="absolute right-0 top-full z-50 mt-1 w-36 overflow-hidden rounded-xl border border-border bg-card shadow-xl">
                    <button
                      onClick={() => openEdit(cat)}
                      className="flex w-full items-center gap-2 px-3 py-2.5 text-sm hover:bg-muted transition-colors"
                    >
                      <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                      Düzenle
                    </button>
                    <button
                      onClick={() => onDelete(cat)}
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

      <CategoryForm
        open={formOpen}
        onOpenChange={setFormOpen}
        category={editing}
      />
    </>
  );
}
