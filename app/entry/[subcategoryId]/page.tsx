"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { Tag } from "lucide-react";
import {
  getSubCategory,
  listFieldsBySubCategory,
  createEntry,
} from "@/lib/db/queries";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { DynamicField } from "@/components/forms/dynamic-field";
import type { Field, Category } from "@/types";

export default function EntryFormPage({
  params,
}: {
  params: Promise<{ subcategoryId: string }>;
}) {
  const { subcategoryId } = use(params);
  const router = useRouter();

  const subcategory = useLiveQuery(
    () => getSubCategory(subcategoryId),
    [subcategoryId]
  );
  const fields = useLiveQuery(
    () => listFieldsBySubCategory(subcategoryId),
    [subcategoryId]
  );
  const [category, setCategory] = useState<Category | undefined>();

  useEffect(() => {
    if (subcategory) {
      db.categories.get(subcategory.categoryId).then(setCategory);
    }
  }, [subcategory]);

  const [values, setValues] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Set defaults for boolean fields
  useEffect(() => {
    if (!fields) return;
    setValues((prev) => {
      const next = { ...prev };
      for (const f of fields) {
        if (f.type === "boolean" && next[f.id] === undefined) {
          next[f.id] = "false";
        }
      }
      return next;
    });
  }, [fields]);

  function setField(id: string, v: string) {
    setValues((s) => ({ ...s, [id]: v }));
  }

  function isValid(fields: Field[]): boolean {
    for (const f of fields) {
      if (f.required && !values[f.id]?.toString().trim()) return false;
    }
    return true;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fields || !isValid(fields)) return;
    setSaving(true);
    try {
      const entryValues = fields
        .map((f) => ({ fieldId: f.id, value: values[f.id] ?? "" }))
        .filter((v) => v.value !== "");
      await createEntry({
        subcategoryId,
        notes: notes.trim() || undefined,
        values: entryValues,
      });
      router.push("/");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        title={subcategory?.name ?? "..."}
        description={category?.name}
        back="/entry"
      />

      {fields === undefined ? null : fields.length === 0 ? (
        <EmptyState
          icon={Tag}
          title="Bu alt kategoride alan yok"
          description="Önce bu alt kategori için alanlar tanımlamalısın."
          action={
            <Button
              onClick={() =>
                router.push(
                  `/structure/${subcategory?.categoryId}/${subcategoryId}`
                )
              }
            >
              Alan ekle
            </Button>
          }
        />
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-5 pb-4">
          {fields.map((f) => (
            <DynamicField
              key={f.id}
              field={f}
              value={values[f.id] ?? ""}
              onChange={(v) => setField(f.id, v)}
            />
          ))}

          <div className="flex flex-col gap-2">
            <Label htmlFor="entry-notes">Not (opsiyonel)</Label>
            <Textarea
              id="entry-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Bu girdiyle ilgili bir not..."
              rows={3}
            />
          </div>

          <Button
            type="submit"
            size="lg"
            disabled={saving || !isValid(fields)}
            className="mt-2"
          >
            Kaydet
          </Button>
        </form>
      )}
    </>
  );
}
