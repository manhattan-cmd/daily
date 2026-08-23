"use client";

import { useState } from "react";
import { Link2, Pencil } from "lucide-react";
import type { EntryWithContext } from "@/types";
import { Button } from "@/components/ui/button";
import { EditEntryModal } from "@/components/forms/edit-entry-modal";
import { EntryIcon } from "@/components/dashboard/entry-icon";
import { ValueChip } from "@/components/dashboard/value-chip";
import { cn } from "@/lib/utils";
import { useLongPress } from "@/lib/use-long-press";
import {
  SelectionLayer,
  selectedCardClass,
  type EntrySelection,
} from "@/components/calendar/entry-selection";

/** `selection` verilirse basılı tutma toplu seçimi başlatır — paralel
 *  perspektiflerin tamamı tek kart olarak seçilir. */
export function LinkedEntryCard({
  entries,
  selection,
}: {
  entries: EntryWithContext[];
  selection?: EntrySelection;
}) {
  const [editingEntry, setEditingEntry] = useState<EntryWithContext | null>(null);
  const longPress = useLongPress({ onLongPress: () => selection?.onStart() });
  const shared = entries[0];
  const time = new Date(shared.occurredAt).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });

  // Partition values into shared (same entryTypeId in ≥2 entries) vs. perspective-specific
  const typeIdCount = new Map<string, number>();
  const firstValueByTypeId = new Map<string, EntryWithContext["values"][number]>();
  for (const entry of entries) {
    const seenInEntry = new Set<string>();
    for (const v of entry.values) {
      if (!v.entryType) continue;
      // Anahtar özelliğin kendisi; entryTypeId yalnız v18 öncesi kayıtlarda var
      const key = v.modId ?? v.entryTypeId;
      if (!key) continue;
      if (!seenInEntry.has(key)) {
        typeIdCount.set(key, (typeIdCount.get(key) ?? 0) + 1);
        seenInEntry.add(key);
        if (!firstValueByTypeId.has(key)) firstValueByTypeId.set(key, v);
      }
    }
  }
  const sharedTypeIds = new Set(
    [...typeIdCount.entries()].filter(([, n]) => n >= 2).map(([tid]) => tid)
  );
  const sharedValues = [...sharedTypeIds]
    .map((tid) => firstValueByTypeId.get(tid)!)
    .filter(Boolean);

  return (
    <>
      {/* Karta dokunmak ana perspektifi düzenler (EntryCard ile aynı davranış);
          iç kontroller (kalem, sil) kabarcıklanmayı durdurur */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setEditingEntry(shared)}
        onKeyDown={(e) => {
          if (e.key === "Enter") setEditingEntry(shared);
        }}
        {...(selection && !selection.active ? longPress : {})}
        aria-label={`${shared.subcategory.name} girdisini düzenle`}
        className={cn(
          "group relative cursor-pointer select-none touch-manipulation rounded-2xl border border-violet-500/25 bg-card overflow-hidden transition-transform active:scale-[0.99]",
          selection?.selected && selectedCardClass
        )}
      >
        {/* Header */}
        <div className="flex items-center gap-2.5 px-3 pt-2.5 pb-2">
          <EntryIcon
            category={shared.category}
            subcategory={shared.subcategory}
            size="sm"
          />
          <span className="font-semibold text-sm flex-1 truncate">{shared.subcategory.name}</span>
          <Link2 className="h-3.5 w-3.5 text-violet-400/60 shrink-0" />
          <span className="text-xs tabular-nums text-muted-foreground/60 shrink-0">
            {time}
          </span>
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
        <div className="px-3 py-2.5 flex flex-col gap-2.5">
          {entries.map((entry) => {
            const ownValues = entry.values.filter(
              (v) => v.entryType && !sharedTypeIds.has(v.modId ?? v.entryTypeId ?? "")
            );
            return (
              <div key={entry.id} className="group/row flex items-center gap-2.5">
                <EntryIcon category={entry.category} size="sm" />
                <div className="flex-1 min-w-0">
                  <span className="block truncate text-xs text-muted-foreground">
                    {entry.category.name}
                  </span>
                  {ownValues.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {ownValues.map((v) => (
                        <ValueChip
                          key={v.id}
                          value={v.value}
                          label={v.mod?.name ?? v.entryType!.name}
                          entryType={v.entryType!}
                          color={entry.category.color}
                        />
                      ))}
                    </div>
                  )}
                  {entry.notes && (
                    <p className="mt-1 line-clamp-2 text-xs leading-snug text-muted-foreground/70">
                      {entry.notes}
                    </p>
                  )}
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 text-muted-foreground hover:text-foreground opacity-0 group-hover/row:opacity-100 transition-opacity shrink-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingEntry(entry);
                  }}
                  aria-label={`${entry.category.name} perspektifini düzenle`}
                >
                  <Pencil className="h-3 w-3" />
                </Button>
              </div>
            );
          })}
        </div>

        {selection?.active && (
          <SelectionLayer
            selected={selection.selected}
            onToggle={selection.onToggle}
            label={`${shared.subcategory.name} paralel girdisini seç`}
          />
        )}
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
