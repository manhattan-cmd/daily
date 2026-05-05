"use client";

import { use, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Plus, Pencil, Trash2, Sparkles, Tag } from "lucide-react";
import {
  getSubCategory,
  listFieldsBySubCategory,
  deleteField,
} from "@/lib/db/queries";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { FieldForm } from "@/components/structure/field-form";
import { FIELD_TYPE_LABELS, type Field } from "@/types";

export default function SubCategoryDetailPage({
  params,
}: {
  params: Promise<{ categoryId: string; subcategoryId: string }>;
}) {
  const { categoryId, subcategoryId } = use(params);

  const subcategory = useLiveQuery(
    () => getSubCategory(subcategoryId),
    [subcategoryId]
  );
  const fields = useLiveQuery(
    () => listFieldsBySubCategory(subcategoryId),
    [subcategoryId]
  );

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Field | undefined>();

  function openNew() {
    setEditing(undefined);
    setFormOpen(true);
  }

  function openEdit(f: Field) {
    setEditing(f);
    setFormOpen(true);
  }

  async function onDelete(f: Field) {
    if (
      !confirm(
        `"${f.name}" alanını silmek istediğinden emin misin? Bu alana bağlı tüm değerler silinecek.`
      )
    )
      return;
    await deleteField(f.id);
  }

  return (
    <>
      <PageHeader
        title={subcategory?.name ?? "..."}
        description="Alanlar"
        back={`/structure/${categoryId}`}
        action={
          <Button size="icon" onClick={openNew} aria-label="Yeni alan">
            <Plus className="h-5 w-5" />
          </Button>
        }
      />

      {fields === undefined ? null : fields.length === 0 ? (
        <EmptyState
          icon={Tag}
          title="Alan yok"
          description="Hangi verileri kaydetmek istediğini tanımla. Örn. miktar, fiyat, puan."
          action={
            <Button onClick={openNew}>
              <Plus className="h-4 w-4" />
              Alan ekle
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-2">
          {fields.map((f) => (
            <div
              key={f.id}
              className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">{f.name}</span>
                  {f.required ? (
                    <span className="text-xs text-destructive">*</span>
                  ) : null}
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{FIELD_TYPE_LABELS[f.type]}</span>
                  {f.options?.unit ? <span>· {f.options.unit}</span> : null}
                  {f.options?.currency ? (
                    <span>· {f.options.currency}</span>
                  ) : null}
                  {f.globalDimension ? (
                    <span className="inline-flex items-center gap-1 text-primary">
                      <Sparkles className="h-3 w-3" />
                      Global
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-9 w-9"
                  onClick={() => openEdit(f)}
                  aria-label="Düzenle"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-9 w-9 text-muted-foreground hover:text-destructive"
                  onClick={() => onDelete(f)}
                  aria-label="Sil"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <FieldForm
        open={formOpen}
        onOpenChange={setFormOpen}
        subcategoryId={subcategoryId}
        field={editing}
      />
    </>
  );
}
