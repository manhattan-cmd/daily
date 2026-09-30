"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Check, Plus, X } from "lucide-react";
import {
  listModifiersForTarget,
  targetKeyOf,
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
import { useT } from "@/lib/i18n";
import { ENTRY_VALUE_TYPE_LABELS } from "@/types";
import type { GoalWithContext, EntryType } from "@/types";
import { useSheetPresence } from "@/lib/use-sheet-presence";
import { ENTRY_WINDOW } from "@/components/ui/entry-window";

interface EditGoalSheetProps {
  goal: GoalWithContext;
  open: boolean;
  onClose: () => void;
}

/**
 * Yalnız açıkken (ve kapanış animasyonu boyunca) DOM'da — kapalıyken
 * içerik ve canlı sorgular hiç kurulmaz (bkz. useSheetPresence).
 */
export function EditGoalSheet(props: EditGoalSheetProps) {
  const { mounted, visible } = useSheetPresence(props.open);
  return mounted ? <EditGoalSheetBody {...props} open={visible} /> : null;
}

function EditGoalSheetBody({ goal, open, onClose }: EditGoalSheetProps) {
  const tr = useT();
  const [selectedTypeIds, setSelectedTypeIds] = useState<string[]>(
    () => goal.targets.map((t) => t.modId ?? t.entryTypeId ?? "")
  );
  const [targetValues, setTargetValues] = useState<Record<string, string>>(
    () =>
      Object.fromEntries(
        goal.targets.map((t) => [t.modId ?? t.entryTypeId ?? "", t.targetValue])
      )
  );
  const [saving, setSaving] = useState(false);
  const [typePickerOpen, setTypePickerOpen] = useState(false);

  const mods =
    useLiveQuery(
      () => listModifiersForTarget("subcategory", goal.subcategoryId),
      [goal.subcategoryId]
    ) ?? [];

  // Anahtar artık özellik (modId): ölçü ayrı bir nesne değil, ölçüm
  // özelliğin üzerinde. Eski hedefler ölçü id'siyle yazılmıştı; v18 göçü
  // onlara modId doldurdu.
  const typeMap = new Map(mods.map((m) => [targetKeyOf(m), m.entryType]));

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
    const t = typeMap.get(typeId);
    const val = targetValues[typeId] ?? "";
    if (t?.valueType === "datetime-range") {
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
          return {
            modId: typeId,
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
  const availableInPicker = mods.filter((m) => !selectedSet.has(targetKeyOf(m)));

  return (
    <>
      {/* Kayıt pencerelerinin ortak ölçüsü (bkz. entry-window): eskiden
          alttan açılan bir yüzeydi, girdi penceresinden başka bir şey
          açılıyor gibi duruyordu. Kapatma çarpısı pencerenin kendisinde. */}
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={cn(ENTRY_WINDOW, "gap-0 overflow-hidden p-0")}>
        {/* Header */}
        <div className="flex shrink-0 items-center gap-3 px-6 pb-4 pr-12 pt-6">
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
            <DialogTitle className="text-base font-semibold tracking-tight">
              Hedefi düzenle
            </DialogTitle>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-6 pb-6">
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
                  const selected = selectedTypeIds.includes(targetKeyOf(mod));
                  return (
                    <button
                      key={mod.id}
                      type="button"
                      onClick={() => toggleType(targetKeyOf(mod))}
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
                  .filter((id) => !mods.some((m) => targetKeyOf(m) === id))
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
                          aria-label={tr("action.remove")}
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
                          placeholder={tr("goal.targetPlaceholder")}
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
                          {val === "true" ? "Yes" : "No"}
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
        <div className="shrink-0 border-t border-[var(--ln-1)] px-6 pb-6 pt-3">
          <Button
            className="w-full"
            size="lg"
            onClick={handleSave}
            disabled={saving || !canSave}
          >
            {saving ? "Kaydediliyor..." : tr("action.save")}
          </Button>
        </div>
      </DialogContent>
      </Dialog>

      {/* Type picker dialog */}
      <Dialog open={typePickerOpen} onOpenChange={setTypePickerOpen}>
        <DialogContent className="max-h-[70dvh] overflow-y-auto gap-4">
          <DialogHeader>
            <DialogTitle>{tr("form.pickFeature")}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            {availableInPicker.map((m) => (
              <button
                key={targetKeyOf(m)}
                onClick={() => addFromPicker(targetKeyOf(m))}
                className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-3 text-left transition-colors hover:bg-muted active:scale-[0.99]"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">{m.entryType.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {ENTRY_VALUE_TYPE_LABELS[m.entryType.valueType ?? "number"]}
                    {m.entryType.unit
                      ? ` · ${m.entryType.unit}`
                      : m.entryType.choices?.length
                      ? ` · ${m.entryType.choices.join(", ")}`
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
