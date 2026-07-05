"use client";

import { useState } from "react";
import { Link2, Trash2, Pencil } from "lucide-react";
import type { EntryWithContext, EntryType } from "@/types";
import { deleteEntry } from "@/lib/db/queries";
import { Button } from "@/components/ui/button";
import { EditEntryModal } from "@/components/forms/edit-entry-modal";
import { EntryIcon } from "@/components/dashboard/entry-icon";

export function LinkedEntryCard({ entries }: { entries: EntryWithContext[] }) {
  const [deleting, setDeleting] = useState(false);
  const [editingEntry, setEditingEntry] = useState<EntryWithContext | null>(null);
  const shared = entries[0];
  const time = new Date(shared.occurredAt).toLocaleTimeString("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  // Partition values into shared (same entryTypeId in ≥2 entries) vs. perspective-specific
  const typeIdCount = new Map<string, number>();
  const firstValueByTypeId = new Map<string, EntryWithContext["values"][number]>();
  for (const entry of entries) {
    const seenInEntry = new Set<string>();
    for (const v of entry.values) {
      if (!v.entryTypeId || !v.entryType) continue;
      if (!seenInEntry.has(v.entryTypeId)) {
        typeIdCount.set(v.entryTypeId, (typeIdCount.get(v.entryTypeId) ?? 0) + 1);
        seenInEntry.add(v.entryTypeId);
        if (!firstValueByTypeId.has(v.entryTypeId)) firstValueByTypeId.set(v.entryTypeId, v);
      }
    }
  }
  const sharedTypeIds = new Set(
    [...typeIdCount.entries()].filter(([, n]) => n >= 2).map(([tid]) => tid)
  );
  const sharedValues = [...sharedTypeIds]
    .map((tid) => firstValueByTypeId.get(tid)!)
    .filter(Boolean);

  async function onDeleteAll() {
    if (!confirm("Bu paralel girdiyi tüm perspektiflerle silmek istediğinden emin misin?")) return;
    setDeleting(true);
    try {
      await Promise.all(entries.map((e) => deleteEntry(e.id)));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <div className="group rounded-2xl border border-violet-500/25 bg-card overflow-hidden transition-colors">
        {/* Header */}
        <div className="flex items-center gap-2.5 px-4 pt-3.5 pb-2.5">
          <EntryIcon
            category={shared.category}
            subcategory={shared.subcategory}
            size="sm"
          />
          <span className="font-semibold text-sm flex-1 truncate">{shared.subcategory.name}</span>
          <Link2 className="h-3.5 w-3.5 text-violet-400/60 shrink-0" />
          <span className="text-xs text-muted-foreground/60 shrink-0">{time}</span>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 ml-1 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
            onClick={onDeleteAll}
            disabled={deleting}
            aria-label="Tüm perspektiflerle sil"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Shared values — shown once, between header and perspectives */}
        {sharedValues.length > 0 && (
          <>
            <div className="h-px bg-border/40 mx-4" />
            <div className="px-4 py-2.5 flex flex-wrap gap-1.5">
              {sharedValues.map((v) => (
                <ValueChip
                  key={v.id}
                  value={v.value}
                  label={v.mod?.name ?? v.entryType!.name}
                  entryType={v.entryType!}
                />
              ))}
            </div>
          </>
        )}

        {/* Divider before perspectives */}
        <div className="h-px bg-border/40 mx-4" />

        {/* Per-perspective rows — only perspective-specific values */}
        <div className="px-4 py-3 flex flex-col gap-3">
          {entries.map((entry) => {
            const ownValues = entry.values.filter(
              (v) => v.entryTypeId && v.entryType && !sharedTypeIds.has(v.entryTypeId)
            );
            return (
              <div key={entry.id} className="group/row flex items-start gap-2.5">
                <EntryIcon category={entry.category} size="sm" />
                <div className="flex-1 min-w-0">
                  <span className="text-xs text-muted-foreground leading-7">{entry.category.name}</span>
                  {ownValues.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {ownValues.map((v) => (
                        <ValueChip
                          key={v.id}
                          value={v.value}
                          label={v.mod?.name ?? v.entryType!.name}
                          entryType={v.entryType!}
                        />
                      ))}
                    </div>
                  )}
                  {entry.notes && (
                    <p className="mt-1 text-xs text-muted-foreground/70">{entry.notes}</p>
                  )}
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 text-muted-foreground hover:text-foreground opacity-0 group-hover/row:opacity-100 transition-opacity shrink-0 mt-0.5"
                  onClick={() => setEditingEntry(entry)}
                  aria-label={`${entry.category.name} perspektifini düzenle`}
                >
                  <Pencil className="h-3 w-3" />
                </Button>
              </div>
            );
          })}
        </div>
      </div>

      {editingEntry && (
        <EditEntryModal
          entry={editingEntry}
          open
          onOpenChange={(open) => { if (!open) setEditingEntry(null); }}
        />
      )}
    </>
  );
}

function ValueChip({
  value,
  label,
  entryType,
}: {
  value: string;
  label: string;
  entryType: EntryType;
}) {
  const vt = entryType.valueType ?? "number";
  let display = value;
  if (vt === "boolean") display = value === "true" ? "Evet" : "Hayır";

  return (
    <div className="flex items-baseline gap-1 rounded-lg bg-muted px-2.5 py-1">
      <span className="text-sm font-semibold tabular-nums">{display}</span>
      {vt === "number" && entryType.unit && (
        <span className="text-xs text-muted-foreground">{entryType.unit}</span>
      )}
      <span className="ml-1 text-xs text-muted-foreground">{label}</span>
    </div>
  );
}
