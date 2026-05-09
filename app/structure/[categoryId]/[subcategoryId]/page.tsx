"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { Folder, MoreHorizontal, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import {
  getSubCategory,
  getCategory,
  listSubCategoriesByParent,
  listFieldsBySubCategory,
  deleteSubCategory,
  deleteField,
} from "@/lib/db/queries";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { FieldForm } from "@/components/structure/field-form";
import { SubCategoryForm } from "@/components/structure/subcategory-form";
import { AddTypeModal } from "@/components/structure/add-type-modal";
import { cn } from "@/lib/utils";
import { FIELD_TYPE_LABELS, type Field, type SubCategory } from "@/types";

export default function SubCategoryDetailPage({
  params,
}: {
  params: Promise<{ categoryId: string; subcategoryId: string }>;
}) {
  const { categoryId, subcategoryId } = use(params);

  const category = useLiveQuery(() => getCategory(categoryId), [categoryId]);
  const subcategory = useLiveQuery(() => getSubCategory(subcategoryId), [subcategoryId]);
  const children = useLiveQuery(() => listSubCategoriesByParent(subcategoryId), [subcategoryId]);
  const fields = useLiveQuery(() => listFieldsBySubCategory(subcategoryId), [subcategoryId]);

  const [choiceOpen, setChoiceOpen] = useState(false);
  const [fieldFormOpen, setFieldFormOpen] = useState(false);
  const [editingField, setEditingField] = useState<Field | undefined>();
  const [subFormOpen, setSubFormOpen] = useState(false);
  const [editingSub, setEditingSub] = useState<SubCategory | undefined>();
  const [openFieldMenuId, setOpenFieldMenuId] = useState<string | null>(null);
  const [openSubMenuId, setOpenSubMenuId] = useState<string | null>(null);

  const backPath = subcategory?.parentId
    ? `/structure/${categoryId}/${subcategory.parentId}`
    : `/structure/${categoryId}`;

  function openNewField() {
    setEditingField(undefined);
    setFieldFormOpen(true);
  }

  function openEditField(f: Field) {
    setEditingField(f);
    setFieldFormOpen(true);
    setOpenFieldMenuId(null);
  }

  function openEditSub(sub: SubCategory) {
    setEditingSub(sub);
    setSubFormOpen(true);
    setOpenSubMenuId(null);
  }

  async function onDeleteField(f: Field) {
    setOpenFieldMenuId(null);
    if (!confirm(`"${f.name}" alanını silmek istediğinden emin misin?`)) return;
    await deleteField(f.id);
  }

  async function onDeleteSub(sub: SubCategory) {
    setOpenSubMenuId(null);
    if (!confirm(`"${sub.name}" alt kategorisini silmek istediğinden emin misin? Tüm içerik silinecek.`)) return;
    await deleteSubCategory(sub.id);
  }

  const anyMenuOpen = openFieldMenuId !== null || openSubMenuId !== null;

  return (
    <>
      <PageHeader
        title={subcategory?.name ?? "..."}
        description={subcategory?.parentId ? "Alt kategoriler" : "Alt kategoriler & Alanlar"}
        back={backPath}
      />

      {anyMenuOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => { setOpenFieldMenuId(null); setOpenSubMenuId(null); }}
        />
      )}

      {/* Child subcategories */}
      {children && children.length > 0 && (
        <div className="flex flex-col gap-2">
          {children.map((child) => (
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
                  style={{ backgroundColor: `${category?.color ?? "#6366f1"}22` }}
                >
                  <Folder className="h-5 w-5" style={{ color: category?.color ?? "#6366f1" }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="truncate font-medium">{child.name}</div>
                </div>
              </Link>

              <div className={cn("relative shrink-0 pr-2", openSubMenuId === child.id && "z-50")}>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-muted-foreground"
                  onClick={() => setOpenSubMenuId(openSubMenuId === child.id ? null : child.id)}
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
          ))}
        </div>
      )}

      {/* Fields */}
      {fields && fields.length > 0 && (
        <div className="flex flex-col gap-2">
          {fields.map((f) => (
            <div
              key={f.id}
              className="flex items-center gap-2 rounded-2xl border border-border bg-card p-3"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">{f.name}</span>
                  {f.required ? <span className="text-xs text-destructive">*</span> : null}
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{FIELD_TYPE_LABELS[f.type]}</span>
                  {f.options?.unit ? <span>· {f.options.unit}</span> : null}
                  {f.options?.currency ? <span>· {f.options.currency}</span> : null}
                  {f.globalDimension ? (
                    <span className="inline-flex items-center gap-1 text-primary">
                      <Sparkles className="h-3 w-3" />
                      Global
                    </span>
                  ) : null}
                </div>
              </div>

              <div className={cn("relative shrink-0", openFieldMenuId === f.id && "z-50")}>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-muted-foreground"
                  onClick={() => setOpenFieldMenuId(openFieldMenuId === f.id ? null : f.id)}
                  aria-label="Seçenekler"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>

                {openFieldMenuId === f.id && (
                  <div className="absolute right-0 top-full z-50 mt-1 w-36 overflow-hidden rounded-xl border border-border bg-card shadow-xl">
                    <button
                      onClick={() => openEditField(f)}
                      className="flex w-full items-center gap-2 px-3 py-2.5 text-sm hover:bg-muted transition-colors"
                    >
                      <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                      Düzenle
                    </button>
                    <button
                      onClick={() => onDeleteField(f)}
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
        onSelectCategory={() => { setEditingSub(undefined); setSubFormOpen(true); }}
        onSelectObject={openNewField}
      />

      <SubCategoryForm
        open={subFormOpen}
        onOpenChange={setSubFormOpen}
        categoryId={categoryId}
        parentSubcategoryId={editingSub ? undefined : subcategoryId}
        categoryName={category?.name}
        subcategory={editingSub}
        onSaved={() => {
          setEditingSub(undefined);
        }}
      />

      <FieldForm
        open={fieldFormOpen}
        onOpenChange={setFieldFormOpen}
        subcategoryId={subcategoryId}
        field={editingField}
      />
    </>
  );
}
