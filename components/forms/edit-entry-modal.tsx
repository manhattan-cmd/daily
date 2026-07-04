"use client";

import { useState, useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Plus, Link2, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  listModifiersForTarget,
  updateEntry,
  getLinkedSiblingTypeIds,
  listEntryTypes,
} from "@/lib/db/queries";
import { DateTimeRangeInput } from "@/components/forms/datetime-range-input";
import { cn } from "@/lib/utils";
import { ENTRY_VALUE_TYPE_LABELS } from "@/types";
import type { EntryWithContext, EntryType } from "@/types";

interface EditEntryModalProps {
  entry: EntryWithContext;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditEntryModal({
  entry,
  open,
  onOpenChange,
}: EditEntryModalProps) {
  const mods = useLiveQuery(
    () => listModifiersForTarget("subcategory", entry.subcategoryId),
    [entry.subcategoryId]
  );
  const siblingTypeIds =
    (useLiveQuery(() => getLinkedSiblingTypeIds(entry.id), [entry.id]) ??
      new Set<string>());
  const allEntryTypes = useLiveQuery(() => listEntryTypes(), []);

  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const v of entry.values) {
      if (v.entryTypeId) init[v.entryTypeId] = v.value;
    }
    return init;
  });

  // Types the user removed from this entry (not from the category)
  const [removedTypeIds, setRemovedTypeIds] = useState<Set<string>>(new Set());

  // Extra type IDs added just for this entry (pre-seeded with existing entry values)
  const [extraTypeIds, setExtraTypeIds] = useState<string[]>(() =>
    entry.values.filter((v) => v.entryTypeId && v.value).map((v) => v.entryTypeId!)
  );

  const [addModOpen, setAddModOpen] = useState(false);
  const [notes, setNotes] = useState(entry.notes ?? "");
  const [showNotes, setShowNotes] = useState(!!entry.notes);
  const [occurredAt, setOccurredAt] = useState(() => {
    const d = new Date(entry.occurredAt);
    d.setSeconds(0, 0);
    return d.toISOString().slice(0, 16);
  });
  const [saving, setSaving] = useState(false);

  const entryTypeMap = useMemo(() => {
    const map = new Map<string, EntryType>();
    for (const t of allEntryTypes ?? []) map.set(t.id, t);
    return map;
  }, [allEntryTypes]);

  // Deduplicated ordered list: subcategory mods first, then extra types
  const visibleTypeIds = useMemo(() => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const mod of mods ?? []) {
      if (!removedTypeIds.has(mod.entryTypeId) && !seen.has(mod.entryTypeId)) {
        result.push(mod.entryTypeId);
        seen.add(mod.entryTypeId);
      }
    }
    for (const typeId of extraTypeIds) {
      if (!removedTypeIds.has(typeId) && !seen.has(typeId)) {
        result.push(typeId);
        seen.add(typeId);
      }
    }
    return result;
  }, [mods, extraTypeIds, removedTypeIds]);

  // Types not yet shown — available to add to this entry only
  const availableToAdd = useMemo(() => {
    const visible = new Set(visibleTypeIds);
    return (allEntryTypes ?? []).filter((t) => !visible.has(t.id));
  }, [allEntryTypes, visibleTypeIds]);

  const entryDate = new Date(entry.occurredAt).toISOString().split("T")[0];

  function handleRemove(typeId: string) {
    setRemovedTypeIds((prev) => new Set([...prev, typeId]));
  }

  function handleAddType(typeId: string) {
    // Un-remove if it was previously removed
    setRemovedTypeIds((prev) => {
      const next = new Set(prev);
      next.delete(typeId);
      return next;
    });
    // Add to extras only if not already tracked
    setExtraTypeIds((prev) =>
      prev.includes(typeId) ? prev : [...prev, typeId]
    );
    setAddModOpen(false);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const visibleSet = new Set(visibleTypeIds);
      const typeValues = Object.entries(values)
        .filter(([id, v]) => v !== "" && visibleSet.has(id))
        .map(([entryTypeId, value]) => ({ entryTypeId, value }));
      await updateEntry(entry.id, {
        typeValues,
        occurredAt: new Date(occurredAt).getTime(),
        notes: notes.trim() || undefined,
      });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto gap-5">
          <DialogHeader>
            <DialogTitle>{entry.subcategory.name}</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            {/* Mod inputs */}
            {visibleTypeIds.map((typeId) => {
              const entryType = entryTypeMap.get(typeId);
              if (!entryType) return null;
              return (
                <ModInput
                  key={typeId}
                  entryType={entryType}
                  value={values[typeId] ?? ""}
                  onChange={(v) =>
                    setValues((prev) => ({ ...prev, [typeId]: v }))
                  }
                  onRemove={() => handleRemove(typeId)}
                  isShared={siblingTypeIds.has(typeId)}
                  entryDate={entryDate}
                />
              );
            })}

            {/* Add mod to this entry only */}
            {availableToAdd.length > 0 && (
              <button
                type="button"
                onClick={() => setAddModOpen(true)}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Bu girdiye mod ekle
              </button>
            )}

            {/* Date */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Tarih & Saat</label>
              <Input
                type="datetime-local"
                value={occurredAt}
                onChange={(e) => setOccurredAt(e.target.value)}
              />
            </div>

            {/* Notes */}
            <div>
              <button
                type="button"
                onClick={() => setShowNotes(!showNotes)}
                className={cn(
                  "flex items-center gap-1.5 text-sm transition-colors",
                  showNotes
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Plus
                  className={cn(
                    "h-3.5 w-3.5 transition-transform",
                    showNotes && "rotate-45"
                  )}
                />
                Not ekle
              </button>
              {showNotes && (
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Bu girdiyle ilgili bir not..."
                  rows={3}
                  className="mt-2 w-full resize-none rounded-xl border border-border bg-input px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              İptal
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              Kaydet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add-mod picker — sibling dialog to avoid nesting issues */}
      <Dialog open={addModOpen} onOpenChange={setAddModOpen}>
        <DialogContent className="gap-4 max-h-[80dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">
              Bu girdiye mod ekle
              <span className="block text-xs font-normal text-muted-foreground mt-0.5">
                Yalnızca bu girdi için geçerli olacak
              </span>
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            {availableToAdd.map((t) => (
              <button
                key={t.id}
                onClick={() => handleAddType(t.id)}
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
        </DialogContent>
      </Dialog>
    </>
  );
}

function ModInput({
  entryType,
  value,
  onChange,
  onRemove,
  isShared = false,
  entryDate,
}: {
  entryType: EntryType;
  value: string;
  onChange: (v: string) => void;
  onRemove?: () => void;
  isShared?: boolean;
  entryDate?: string;
}) {
  const vt = entryType.valueType ?? "number";
  const today = new Date().toISOString().split("T")[0];

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">
          {entryType.name}
          {entryType.unit && (
            <span className="ml-1.5 text-xs font-normal text-muted-foreground">
              ({entryType.unit})
            </span>
          )}
        </label>
        <div className="flex items-center gap-2">
          {isShared && (
            <span className="flex items-center gap-1 text-[10px] font-medium text-violet-400/70">
              <Link2 className="h-3 w-3" />
              tüm perspektifler
            </span>
          )}
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="rounded-md p-0.5 text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors"
              aria-label="Bu girdiden kaldır"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {vt === "number" && (
        <Input
          type="number"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="0"
          step="any"
        />
      )}

      {vt === "text" && (
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Metin gir..."
        />
      )}

      {vt === "boolean" && (
        <button
          type="button"
          onClick={() => onChange(value === "true" ? "false" : "true")}
          className={cn(
            "flex h-10 w-full items-center justify-center rounded-xl border text-sm font-medium transition-colors",
            value === "true"
              ? "border-primary bg-primary/10 text-primary"
              : "border-border bg-input text-muted-foreground"
          )}
        >
          {value === "true" ? "Evet" : "Hayır"}
        </button>
      )}

      {vt === "select" && (
        <div className="flex flex-wrap gap-2">
          {(entryType.choices ?? []).map((choice) => (
            <button
              key={choice}
              type="button"
              onClick={() => onChange(choice)}
              className={cn(
                "rounded-xl border px-4 py-2 text-sm font-medium transition-colors",
                value === choice
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-input text-muted-foreground hover:text-foreground"
              )}
            >
              {choice}
            </button>
          ))}
        </div>
      )}

      {vt === "datetime-range" && (
        <DateTimeRangeInput
          value={value}
          onChange={onChange}
          entryDate={entryDate ?? today}
        />
      )}
    </div>
  );
}
