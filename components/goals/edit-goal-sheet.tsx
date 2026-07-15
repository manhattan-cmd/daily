"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Check, Plus, X } from "lucide-react";
import {
  listModifiersForTarget,
  listEntryTypes,
  updateGoal,
} from "@/lib/db/queries";
import { DateTimeRangeInput } from "@/components/forms/datetime-range-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { ENTRY_VALUE_TYPE_LABELS } from "@/types";
import type { GoalWithContext, EntryType } from "@/types";

interface EditGoalSheetProps {
  goal: GoalWithContext;
  open: boolean;
  onClose: () => void;
}

export function EditGoalSheet({ goal, open, onClose }: EditGoalSheetProps) {
  const [selectedTypeIds, setSelectedTypeIds] = useState<string[]>(
    () => goal.targets.map((t) => t.entryTypeId)
  );
  const [targetValues, setTargetValues] = useState<Record<string, string>>(
    () =>
      Object.fromEntries(goal.targets.map((t) => [t.entryTypeId, t.targetValue]))
  );
  const [saving, setSaving] = useState(false);
  const [typePickerOpen, setTypePickerOpen] = useState(false);

  const mods =
    useLiveQuery(
      () => listModifiersForTarget("subcategory", goal.subcategoryId),
      [goal.subcategoryId]
    ) ?? [];

  const allTypes = useLiveQuery(() => listEntryTypes(), []);
  const typeMap = new Map(allTypes?.map((t) => [t.id, t]) ?? []);

  function toggleType(typeId: string) {
    if (selectedTypeIds.includes(typeId)) {
      setSelectedTypeIds((prev) => prev.filter((id) => id !== typeId));
      setTargetValues((prev) => {
        const next = { ...prev };
        delete next[typeId];
        return next;
      });
    } else {
      setSelectedTypeIds((prev) => [...prev, typeId]);
    }
  }

  function addFromPicker(typeId: string) {
    if (!selectedTypeIds.includes(typeId)) {
      setSelectedTypeIds((prev) => [...prev, typeId]);
    }
    setTypePickerOpen(false);
  }

  function isValueValid(typeId: string): boolean {
    const type = typeMap.get(typeId);
    const val = targetValues[typeId] ?? "";
    if (type?.valueType === "datetime-range") {
      try {
        const { start, end } = JSON.parse(val);
        return !!(start || end);
      } catch {
        return false;
      }
    }
    return val.trim().length > 0;
  }

  const canSave =
    selectedTypeIds.length > 0 && selectedTypeIds.every(isValueValid);

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    try {
      await updateGoal(goal.id, {
        targets: selectedTypeIds.map((typeId) => {
          const mod = mods.find((m) => m.entryTypeId === typeId);
          return {
            entryTypeId: typeId,
            ...(mod?.modId ? { modId: mod.modId } : {}),
            targetValue: targetValues[typeId] ?? "",
          };
        }),
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const selectedSet = new Set(selectedTypeIds);
  const availableInPicker = (allTypes ?? []).filter((t) => !selectedSet.has(t.id));

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px] transition-opacity duration-300",
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-[390px]",
          "flex flex-col rounded-t-3xl bg-background border-t border-white/8",
          "shadow-[0_-8px_40px_rgba(0,0,0,0.6)]",
          "transition-transform duration-300 ease-out",
          "max-h-[85vh]",
          open ? "translate-y-0" : "translate-y-full"
        )}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="h-[3px] w-10 rounded-full bg-white/15" />
        </div>

        {/* Header */}
        <div className="flex items-center gap-3 px-5 pt-2 pb-4 shrink-0">
          <button
            onClick={onClose}
            className="h-7 w-7 flex items-center justify-center rounded-full bg-white/8 text-muted-foreground hover:bg-white/12 transition-colors shrink-0"
            aria-label="Kapat"
          >
            <X className="h-3.5 w-3.5" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              <div
                className="h-1.5 w-1.5 rounded-full shrink-0"
                style={{ backgroundColor: goal.category.color }}
              />
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60 truncate">
                {goal.subcategory.isCategoryRoot
                  ? goal.category.name
                  : `${goal.category.name} · ${goal.subcategory.name}`}
              </span>
            </div>
            <h2 className="text-base font-semibold tracking-tight">
              Hedefi düzenle
            </h2>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-6">
          <div className="flex flex-col gap-6">
            {/* Mod chips */}
            <div className="flex flex-col gap-2.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Özellik seç
                {selectedTypeIds.length > 0 && (
                  <span className="ml-1.5 normal-case font-normal text-muted-foreground/50">
                    · {selectedTypeIds.length} seçili
                  </span>
                )}
              </p>
              <div className="flex flex-wrap gap-2">
                {mods.map((mod) => {
                  const selected = selectedTypeIds.includes(mod.entryTypeId);
                  return (
                    <button
                      key={mod.id}
                      type="button"
                      onClick={() => toggleType(mod.entryTypeId)}
                      className={cn(
                        "flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-medium transition-colors",
                        selected
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-card text-foreground hover:bg-muted"
                      )}
                    >
                      {selected && <Check className="h-3 w-3 shrink-0" />}
                      {mod.name ?? mod.entryType.name}
                      {mod.entryType.unit && (
                        <span
                          className={cn(
                            "text-xs",
                            selected ? "text-primary/70" : "text-muted-foreground"
                          )}
                        >
                          ({mod.entryType.unit})
                        </span>
                      )}
                    </button>
                  );
                })}

                {/* Extra selected types not in subcategory mods */}
                {selectedTypeIds
                  .filter((id) => !mods.some((m) => m.entryTypeId === id))
                  .map((typeId) => {
                    const t = typeMap.get(typeId);
                    if (!t) return null;
                    return (
                      <button
                        key={typeId}
                        type="button"
                        onClick={() => toggleType(typeId)}
                        className="flex items-center gap-1.5 rounded-xl border border-primary bg-primary/10 text-primary px-3 py-2 text-sm font-medium"
                      >
                        <Check className="h-3 w-3 shrink-0" />
                        {t.name}
                        {t.unit && (
                          <span className="text-xs text-primary/70">
                            ({t.unit})
                          </span>
                        )}
                      </button>
                    );
                  })}

                <button
                  type="button"
                  onClick={() => setTypePickerOpen(true)}
                  className="flex items-center gap-1.5 rounded-xl border border-dashed border-border/60 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:border-border transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Başka özellik
                </button>
              </div>
            </div>

            {/* Value inputs */}
            {selectedTypeIds.length > 0 && (
              <div className="flex flex-col gap-5">
                {selectedTypeIds.map((typeId) => {
                  const t = typeMap.get(typeId);
                  if (!t) return null;
                  const val = targetValues[typeId] ?? "";
                  const vt = t.valueType ?? "number";
                  return (
                    <div key={typeId} className="flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          {t.name}
                          {t.unit && (
                            <span className="ml-1.5 normal-case font-normal text-muted-foreground/60">
                              ({t.unit})
                            </span>
                          )}
                        </p>
                        <button
                          type="button"
                          onClick={() => toggleType(typeId)}
                          className="text-muted-foreground/40 hover:text-destructive transition-colors"
                          aria-label="Kaldır"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      {vt === "number" && (
                        <Input
                          type="number"
                          inputMode="decimal"
                          value={val}
                          onChange={(e) =>
                            setTargetValues((prev) => ({
                              ...prev,
                              [typeId]: e.target.value,
                            }))
                          }
                          placeholder="0"
                          step="any"
                          className="h-14 text-2xl font-semibold tabular-nums"
                        />
                      )}

                      {vt === "text" && (
                        <Input
                          value={val}
                          onChange={(e) =>
                            setTargetValues((prev) => ({
                              ...prev,
                              [typeId]: e.target.value,
                            }))
                          }
                          placeholder="Hedef değer gir..."
                        />
                      )}

                      {vt === "boolean" && (
                        <button
                          type="button"
                          onClick={() =>
                            setTargetValues((prev) => ({
                              ...prev,
                              [typeId]: val === "true" ? "false" : "true",
                            }))
                          }
                          className={cn(
                            "flex h-12 w-full items-center justify-center rounded-xl border text-sm font-medium transition-colors",
                            val === "true"
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border bg-input text-muted-foreground"
                          )}
                        >
                          {val === "true" ? "Evet" : "Hayır"}
                        </button>
                      )}

                      {vt === "select" && (
                        <div className="flex flex-wrap gap-2">
                          {(t.choices ?? []).map((choice) => (
                            <button
                              key={choice}
                              type="button"
                              onClick={() =>
                                setTargetValues((prev) => ({
                                  ...prev,
                                  [typeId]: choice,
                                }))
                              }
                              className={cn(
                                "rounded-xl border px-4 py-2 text-sm font-medium transition-colors",
                                val === choice
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
                          value={val}
                          onChange={(v) =>
                            setTargetValues((prev) => ({ ...prev, [typeId]: v }))
                          }
                          entryDate={goal.date}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 pb-8 pt-3 shrink-0 border-t border-white/8">
          <Button
            className="w-full"
            size="lg"
            onClick={handleSave}
            disabled={saving || !canSave}
          >
            {saving ? "Kaydediliyor..." : "Kaydet"}
          </Button>
        </div>
      </div>

      {/* Type picker dialog */}
      <Dialog open={typePickerOpen} onOpenChange={setTypePickerOpen}>
        <DialogContent className="max-h-[70dvh] overflow-y-auto gap-4">
          <DialogHeader>
            <DialogTitle>Özellik seç</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            {availableInPicker.map((t) => (
              <button
                key={t.id}
                onClick={() => addFromPicker(t.id)}
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
