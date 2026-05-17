"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Folder,
  FolderOpen,
  Layers,
  MoreHorizontal,
  Pencil,
  PenLine,
  Plus,
  Trash2,
} from "lucide-react";
import {
  getSubCategory,
  getCategory,
  listSubCategoriesByParent,
  listEntriesBySubCategory,
  deleteSubCategory,
} from "@/lib/db/queries";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { SubCategoryForm } from "@/components/structure/subcategory-form";
import { AddTypeModal } from "@/components/structure/add-type-modal";
import { EntryCard } from "@/components/dashboard/entry-card";
import { cn } from "@/lib/utils";
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
  const entries = useLiveQuery(
    () => listEntriesBySubCategory(subcategoryId),
    [subcategoryId]
  );

  const [choiceOpen, setChoiceOpen] = useState(false);
  const [subFormOpen, setSubFormOpen] = useState(false);
  const [editingSub, setEditingSub] = useState<SubCategory | undefined>();
  const [openSubMenuId, setOpenSubMenuId] = useState<string | null>(null);

  const backPath = subcategory?.parentId
    ? `/structure/${categoryId}/${subcategory.parentId}`
    : `/structure/${categoryId}`;

  function openEditSub(sub: SubCategory) {
    setEditingSub(sub);
    setSubFormOpen(true);
    setOpenSubMenuId(null);
  }

  async function onDeleteSub(sub: SubCategory) {
    setOpenSubMenuId(null);
    if (
      !confirm(
        `"${sub.name}" alt kategorisini silmek istediğinden emin misin? Tüm içerik silinecek.`
      )
    )
      return;
    await deleteSubCategory(sub.id);
  }

  const hasSubChildren = (subId: string) =>
    allSubs?.some((s) => s.parentId === subId) ?? false;

  const addOptions = [
    {
      label: "Alt Kategori",
      description: "Yeni bir gruplama ya da bölüm oluştur",
      icon: (
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10">
          <Layers className="h-6 w-6 text-primary" />
        </div>
      ),
      onClick: () => {
        setEditingSub(undefined);
        setSubFormOpen(true);
      },
    },
    {
      label: "Girdi",
      description: "Bu kategoriye ait bir değer kaydet",
      icon: (
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10">
          <PenLine className="h-6 w-6 text-emerald-500" />
        </div>
      ),
      onClick: () => router.push(`/entry/${subcategoryId}`),
    },
  ];

  return (
    <>
      <PageHeader
        title={subcategory?.name ?? "..."}
        description={category?.name}
        back={backPath}
      />

      {openSubMenuId && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setOpenSubMenuId(null)}
        />
      )}

      {/* Alt kategoriler */}
      {children && children.length > 0 && (
        <section className="flex flex-col gap-2 mb-6">
          <h2 className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Alt Kategoriler
          </h2>
          {children.map((child) => {
            const hasChildren = hasSubChildren(child.id);
            const Icon = hasChildren ? FolderOpen : Folder;
            return (
              <div
                key={child.id}
                className="flex items-center gap-2 rounded-2xl border border-border bg-card transition-colors hover:bg-card/80"
              >
                <Link
                  href={`/structure/${categoryId}/${child.id}`}
                  className="flex flex-1 items-center gap-3 min-w-0 p-3"
                >
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
                    style={{
                      backgroundColor: `${category?.color ?? "#6366f1"}22`,
                    }}
                  >
                    <Icon
                      className="h-5 w-5"
                      style={{ color: category?.color ?? "#6366f1" }}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="truncate font-medium">{child.name}</div>
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
                    openSubMenuId === child.id && "z-50"
                  )}
                >
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-muted-foreground"
                    onClick={() =>
                      setOpenSubMenuId(
                        openSubMenuId === child.id ? null : child.id
                      )
                    }
                    aria-label="Seçenekler"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>

                  {openSubMenuId === child.id && (
                    <div className="absolute right-0 top-full z-50 mt-1 w-36 overflow-hidden rounded-xl border border-border bg-card shadow-xl">
                      <button
                        onClick={() => openEditSub(child)}
                        className="flex w-full items-center gap-2 px-3 py-2.5 text-sm hover:bg-muted transition-colors"
                      >
                        <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                        Düzenle
                      </button>
                      <button
                        onClick={() => onDeleteSub(child)}
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

      {/* Girdiler */}
      {entries && entries.length > 0 && (
        <section className="flex flex-col gap-2 mb-6">
          <h2 className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Girdiler
          </h2>
          {entries.map((e) => (
            <EntryCard key={e.id} entry={e} />
          ))}
        </section>
      )}

      <div className="flex justify-center mt-2">
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
        options={addOptions}
      />

      <SubCategoryForm
        open={subFormOpen}
        onOpenChange={setSubFormOpen}
        categoryId={categoryId}
        parentSubcategoryId={editingSub ? undefined : subcategoryId}
        categoryName={category?.name}
        subcategory={editingSub}
        onSaved={() => setEditingSub(undefined)}
      />
    </>
  );
}
