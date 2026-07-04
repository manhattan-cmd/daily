"use client";

import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import type { EntryWithContext, EntryType } from "@/types";
import { Button } from "@/components/ui/button";
import { deleteEntry } from "@/lib/db/queries";
import { formatDateTime } from "@/lib/utils";
import { EditEntryModal } from "@/components/forms/edit-entry-modal";
import { EntryIcon } from "@/components/dashboard/entry-icon";
import { QuickModAdd } from "@/components/forms/quick-mod-add";
import { calcDTRDuration, parseDTR } from "@/components/forms/datetime-range-input";

export function EntryCard({ entry }: { entry: EntryWithContext }) {
  const [editOpen, setEditOpen] = useState(false);

  async function onDelete() {
    if (!confirm("Bu girdiyi silmek istediğinden emin misin?")) return;
    await deleteEntry(entry.id);
  }

  const typedValues = entry.values.filter((v) => v.entryTypeId && v.entryType);

  return (
    <>
      <div className="group rounded-2xl border border-border bg-card p-4 transition-colors">
        <div className="flex items-start gap-3">
          <EntryIcon
            category={entry.category}
            subcategory={entry.subcategory}
          />
          <div className="flex-1 min-w-0">
            {/* Başlık + aksiyonlar */}
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{entry.subcategory.name}</div>
                <div className="text-xs text-muted-foreground">
                  {entry.category.name}
                </div>
              </div>

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

            {/* Değer chipleri + hızlı mod ekle */}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {typedValues.map((v) => (
                <ValueChip key={v.id} value={v.value} entryType={v.entryType!} />
              ))}
              <QuickModAdd
                subcategoryId={entry.subcategoryId}
                subcategoryName={entry.subcategory.name}
                categoryId={entry.category.id}
              />
            </div>

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

  if (vt === "datetime-range") {
    const { start, end } = parseDTR(value);
    const startTime = start?.split("T")[1]?.slice(0, 5);
    const endTime = end?.split("T")[1]?.slice(0, 5);
    const duration = calcDTRDuration(start, end);
    const shortDuration = duration
      ? duration
          .replace(" saat", "s")
          .replace(" dakika", "dk")
          .replace("s dk", "s")
      : null;

    return (
      <div className="flex items-center gap-1.5 rounded-lg bg-muted px-2.5 py-1">
        {startTime && (
          <span className="text-sm font-semibold tabular-nums">{startTime}</span>
        )}
        {startTime && endTime && (
          <span className="text-xs text-muted-foreground">→</span>
        )}
        {endTime && (
          <span className="text-sm font-semibold tabular-nums">{endTime}</span>
        )}
        {shortDuration && (
          <span className="text-xs text-muted-foreground ml-0.5">
            · {shortDuration}
          </span>
        )}
        {!startTime && !endTime && (
          <span className="text-xs text-muted-foreground">{entryType.name}</span>
        )}
      </div>
    );
  }

  let display = value;
  if (vt === "boolean") display = value === "true" ? "Evet" : "Hayır";

  return (
    <div className="flex items-baseline gap-1 rounded-lg bg-muted px-2.5 py-1">
      <span className="text-sm font-semibold tabular-nums">{display}</span>
      {vt === "number" && entryType.unit && (
        <span className="text-xs text-muted-foreground">{entryType.unit}</span>
      )}
      <span className="ml-1 text-xs text-muted-foreground">{entryType.name}</span>
    </div>
  );
}
