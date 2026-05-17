"use client";

import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import type { EntryWithContext, EntryType } from "@/types";
import { Button } from "@/components/ui/button";
import { deleteEntry } from "@/lib/db/queries";
import { formatDateTime } from "@/lib/utils";
import { EditEntryModal } from "@/components/forms/edit-entry-modal";
import { formatTypedValue } from "@/components/forms/entry-form-fields";

export function EntryCard({ entry }: { entry: EntryWithContext }) {
  const [editOpen, setEditOpen] = useState(false);

  async function onDelete() {
    if (!confirm("Bu girdiyi silmek istediğinden emin misin?")) return;
    await deleteEntry(entry.id);
  }

  const typedValues = entry.values.filter((v) => v.entryTypeId && v.entryType);
  const legacyValues = entry.values.filter((v) => v.fieldId && !v.entryTypeId);

  return (
    <>
      <div className="group rounded-2xl border border-border bg-card p-4 transition-colors">
        <div className="flex items-start gap-3">
          <div
            className="mt-1 h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: entry.category.color }}
          />
          <div className="flex-1 min-w-0">
            {/* Başlık satırı */}
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">
                  {entry.title || entry.subcategory.name}
                </div>
                <div className="text-xs text-muted-foreground">
                  {entry.title ? (
                    <>
                      {entry.subcategory.name}
                      <span className="mx-1">·</span>
                      {entry.category.name}
                    </>
                  ) : (
                    entry.category.name
                  )}
                </div>
              </div>

              {/* Aksiyon butonları (hover'da görünür) */}
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  onClick={() => setEditOpen(true)}
                  aria-label="Düzenle"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={onDelete}
                  aria-label="Sil"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {/* Yeni sistem: entryType değerleri */}
            {typedValues.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {typedValues.map((v) => (
                  <ValueChip
                    key={v.id}
                    value={v.value}
                    entryType={v.entryType!}
                  />
                ))}
              </div>
            )}

            {/* Eski sistem: field değerleri (geriye dönük uyumluluk) */}
            {legacyValues.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm">
                {legacyValues.map((v) => {
                  const field = entry.fields.find((f) => f.id === v.fieldId);
                  if (!field) return null;
                  return (
                    <span key={v.id} className="text-muted-foreground">
                      <span className="text-foreground">
                        {formatLegacyValue(
                          field.type,
                          v.value,
                          field.options?.unit,
                          field.options?.currency
                        )}
                      </span>{" "}
                      {field.name}
                    </span>
                  );
                })}
              </div>
            )}

            {entry.notes && (
              <p className="mt-2 text-sm text-muted-foreground">{entry.notes}</p>
            )}

            <div className="mt-2 text-xs text-muted-foreground">
              {formatDateTime(entry.occurredAt)}
            </div>
          </div>
        </div>
      </div>

      <EditEntryModal
        entry={entry}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
    </>
  );
}

function ValueChip({
  value,
  entryType,
}: {
  value: string;
  entryType: EntryType;
}) {
  const vt = entryType.valueType ?? "number";
  const displayValue = formatTypedValue(value, entryType);

  return (
    <div className="flex items-baseline gap-1 rounded-lg bg-muted px-2.5 py-1">
      <span className="text-sm font-semibold tabular-nums">{displayValue}</span>
      {vt === "number" && (
        <span className="text-xs text-muted-foreground">{entryType.unit}</span>
      )}
      <span className="ml-1 text-xs text-muted-foreground">{entryType.name}</span>
    </div>
  );
}

function formatLegacyValue(
  type: string,
  raw: string,
  unit?: string,
  currency?: string
): string {
  if (raw === "") return "—";
  switch (type) {
    case "money":
      return `${raw} ${currency ?? "TL"}`;
    case "duration":
      return `${raw} dk`;
    case "boolean":
      return raw === "true" ? "Evet" : "Hayır";
    case "rating":
      return `${raw}/10`;
    case "number":
      return unit ? `${raw} ${unit}` : raw;
    default:
      return raw;
  }
}
