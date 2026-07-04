"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  listModifiersForTarget,
  assignModifier,
  removeModifier,
  listEntryTypes,
} from "@/lib/db/queries";
import { ENTRY_VALUE_TYPE_LABELS, type EntryType } from "@/types";

interface ModifierSectionProps {
  targetType: "category" | "subcategory";
  targetId: string;
}

export function ModifierSection({ targetType, targetId }: ModifierSectionProps) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const mods = useLiveQuery(
    () => listModifiersForTarget(targetType, targetId),
    [targetType, targetId]
  );

  const allTypes = useLiveQuery(() => listEntryTypes(), []);

  const assignedTypeIds = new Set(mods?.map((m) => m.entryTypeId) ?? []);
  const availableTypes = allTypes?.filter((t) => !assignedTypeIds.has(t.id)) ?? [];

  async function handleAssign(entryType: EntryType) {
    await assignModifier(targetType, targetId, entryType.id);
    setPickerOpen(false);
  }

  async function handleRemove(modId: string) {
    await removeModifier(modId);
  }

  return (
    <section className="flex flex-col gap-3 mb-6">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Modlar
        </h2>
        <button
          onClick={() => setPickerOpen(true)}
          className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Mod ekle
        </button>
      </div>

      {!mods || mods.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/40 px-4 py-5 text-center">
          <p className="text-sm text-muted-foreground">Henüz mod yok.</p>
          <button
            onClick={() => setPickerOpen(true)}
            className="mt-1 text-xs text-primary hover:text-primary/80 transition-colors"
          >
            İlk modu ekle →
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {mods.map((mod) => (
            <div
              key={mod.id}
              className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5"
            >
              <div className="flex-1 min-w-0">
                <span className="font-medium text-sm">{mod.entryType.name}</span>
                <span className="ml-2 text-xs text-muted-foreground">
                  {ENTRY_VALUE_TYPE_LABELS[mod.entryType.valueType ?? "number"]}
                  {mod.entryType.unit
                    ? ` · ${mod.entryType.unit}`
                    : mod.entryType.choices?.length
                    ? ` · ${mod.entryType.choices.join(", ")}`
                    : null}
                </span>
              </div>
              <button
                onClick={() => handleRemove(mod.id)}
                className="shrink-0 rounded-lg p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                aria-label={`${mod.entryType.name} modunu kaldır`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-h-[80dvh] overflow-y-auto gap-4">
          <DialogHeader>
            <DialogTitle>Mod ekle</DialogTitle>
          </DialogHeader>

          {availableTypes.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Eklenebilecek mod kalmadı.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {availableTypes.map((t) => (
                <button
                  key={t.id}
                  onClick={() => handleAssign(t)}
                  className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-3 text-left transition-colors hover:bg-muted active:scale-[0.99]"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{t.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {ENTRY_VALUE_TYPE_LABELS[t.valueType ?? "number"]}
                      {t.unit
                        ? ` · ${t.unit}`
                        : t.choices?.length
                        ? ` · ${t.choices.join(", ")}`
                        : null}
                    </div>
                  </div>
                  <Plus className="h-4 w-4 text-muted-foreground shrink-0" />
                </button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
