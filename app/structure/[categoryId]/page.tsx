"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Folder,
  FolderOpen,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { db } from "@/lib/db";
import {
  getCategory,
  listSubCategoriesByCategory,
  deleteSubCategory,
} from "@/lib/db/queries";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { SubCategoryForm } from "@/components/structure/subcategory-form";
import { ModifierSection } from "@/components/structure/modifier-section";
import { GuideHint } from "@/components/structure/structure-guide";
import { CategoryIcon, CATEGORY_ICON_MAP } from "@/lib/category-icons";
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
  const allSubs = useLiveQuery(
    () => db.subcategories.where("categoryId").equals(categoryId).toArray(),
    [categoryId]
  );

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SubCategory | undefined>();
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  function openEdit(sub: SubCategory) {
    setEditing(sub);
    setFormOpen(true);
    setOpenMenuId(null);
  }

  async function onDelete(sub: SubCategory) {
    setOpenMenuId(null);
    if (
      !confirm(
        `"${sub.name}" alt kategorisini silmek istediğinden emin misin? Tüm girdiler silinecek.`
      )
    )
      return;
    await deleteSubCategory(sub.id);
  }

  const hasSubChildren = (subId: string) =>
    allSubs?.some((s) => s.parentId === subId) ?? false;

  return (
    <>
      <PageHeader
        title={category?.name ?? "..."}
        description="Alt kategoriler ve modlar"
        back="/structure"
      />

      {openMenuId && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setOpenMenuId(null)}
        />
      )}

      {/* Modlar — üstte ama mütevazı: boş durumda tek satırlık şerit */}
      {category && (
        <ModifierSection
          targetType="category"
          targetId={categoryId}
          targetName={category.name}
          description="Girdi eklerken sorulan ölçüler — buraya eklersen kategorinin tamamında geçerli olur."
          emptyText="Henüz mod yok — Para (₺), Süre (dk) gibi ölçüleri buradan eklersin. İstersen önce alt kategorilerini kur."
          compactEmpty
        />
      )}

      {/* Alt kategoriler — yeni kullanıcının ilk adımı */}
      {subcategories && (
        <section className="flex flex-col gap-2 mb-6">
          <h2 className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Alt Kategoriler
          </h2>
          {subcategories.length === 0 && (
            <GuideHint
              action={
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEditing(undefined);
                    setFormOpen(true);
                  }}
                >
                  <Plus className="h-3.5 w-3.5" />
                  İlk alt kategoriyi ekle
                </Button>
              }
            >
              <span className="font-medium text-foreground">
                &bdquo;{category?.name ?? "Kategori"}&rdquo;yi dallara ayırarak başla
              </span>{" "}
              — örneğin Harcamalar için Market, Fatura, Ulaşım. Girdiler bu
              dallara yazılır; analizler de dal dal kırılır.
            </GuideHint>
          )}
          {subcategories.map((sub) => {
            const hasChildren = hasSubChildren(sub.id);
            const Icon = hasChildren ? FolderOpen : Folder;
            const isLucideIcon = sub.icon && sub.icon in CATEGORY_ICON_MAP;
            return (
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
                    style={{
                      backgroundColor: `${category?.color ?? "#6366f1"}22`,
                    }}
                  >
                    {isLucideIcon ? (
                      <CategoryIcon
                        name={sub.icon}
                        className="h-5 w-5"
                        style={{ color: category?.color ?? "#6366f1" }}
                      />
                    ) : sub.icon ? (
                      <span className="text-xl leading-none select-none">
                        {sub.icon}
                      </span>
                    ) : (
                      <Icon
                        className="h-5 w-5"
                        style={{ color: category?.color ?? "#6366f1" }}
                      />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="truncate font-medium">{sub.name}</div>
                    {hasChildren && (
                      <div className="text-xs text-muted-foreground">
                        Alt kategoriler var
                      </div>
                    )}
                  </div>
                </Link>

                <div
                  className={cn(
                    "relative shrink-0 pr-2",
                    openMenuId === sub.id && "z-50"
                  )}
                >
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-muted-foreground"
                    onClick={() =>
                      setOpenMenuId(openMenuId === sub.id ? null : sub.id)
                    }
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
            );
          })}
        </section>
      )}

      <div className="flex justify-center mt-2">
        <Button
          size="icon"
          onClick={() => {
            setEditing(undefined);
            setFormOpen(true);
          }}
          aria-label="Alt kategori ekle"
          className="bg-blue-500 hover:bg-blue-400 text-white shadow-lg shadow-blue-500/30 transition-all"
        >
          <Plus className="h-5 w-5" />
        </Button>
      </div>

      <SubCategoryForm
        open={formOpen}
        onOpenChange={setFormOpen}
        categoryId={categoryId}
        categoryName={category?.name}
        subcategory={editing}
      />
    </>
  );
}
