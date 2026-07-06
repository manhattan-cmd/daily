"use client";

import { useState } from "react";
import { Check, Pencil, Trash2 } from "lucide-react";
import type { GoalWithContext, GoalTargetWithContext } from "@/types";
import { completeGoal, uncompleteGoal, deleteGoal } from "@/lib/db/queries";
import { EditGoalSheet } from "./edit-goal-sheet";
import {
  formatDTRDisplay,
  calcDTRDuration,
  parseDTR,
} from "@/components/forms/datetime-range-input";
import { cn } from "@/lib/utils";

function TargetChip({ target, completed }: { target: GoalTargetWithContext; completed: boolean }) {
  const vt = target.entryType.valueType ?? "number";

  if (vt === "datetime-range") {
    const { start, end } = parseDTR(target.targetValue);
    const duration = calcDTRDuration(start, end);
    return (
      <div className="flex items-baseline gap-1">
        <span
          className={cn(
            "text-sm font-semibold tabular-nums",
            completed ? "text-emerald-400" : "text-foreground"
          )}
        >
          {formatDTRDisplay(target.targetValue)}
        </span>
        <span className="text-xs text-muted-foreground">
          {duration ? `· ${duration} · ` : ""}
          {target.mod?.name ?? target.entryType.name}
        </span>
      </div>
    );
  }

  let display = target.targetValue;
  if (vt === "boolean") display = target.targetValue === "true" ? "Evet" : "Hayır";

  return (
    <div className="flex items-baseline gap-1">
      <span
        className={cn(
          "text-sm font-semibold tabular-nums",
          completed ? "text-emerald-400" : "text-foreground"
        )}
      >
        {display}
      </span>
      {vt === "number" && target.entryType.unit && (
        <span className="text-xs text-muted-foreground">{target.entryType.unit}</span>
      )}
      <span className="text-xs text-muted-foreground">
        {target.mod?.name ?? target.entryType.name}
      </span>
    </div>
  );
}

export function GoalCard({ goal }: { goal: GoalWithContext }) {
  const [loading, setLoading] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const isCompleted = !!goal.completedEntryId;

  async function toggleComplete() {
    setLoading(true);
    try {
      if (isCompleted) {
        await uncompleteGoal(goal.id);
      } else {
        await completeGoal(goal.id);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Bu hedefi silmek istediğinden emin misin?")) return;
    await deleteGoal(goal.id);
  }

  return (
    <>
      <div
        className={cn(
          "flex items-center gap-3 rounded-2xl border px-4 py-3 transition-colors",
          isCompleted
            ? "border-emerald-500/30 bg-emerald-500/5"
            : "border-border bg-card"
        )}
      >
        {/* Complete toggle */}
        <button
          onClick={toggleComplete}
          disabled={loading}
          className={cn(
            "shrink-0 h-6 w-6 rounded-full border-2 flex items-center justify-center transition-all",
            isCompleted
              ? "border-emerald-500 bg-emerald-500"
              : "border-border hover:border-primary active:scale-90"
          )}
          aria-label={isCompleted ? "Tamamlandı — geri al" : "Tamamlandı olarak işaretle"}
        >
          {isCompleted && <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />}
        </button>

        <div className="flex-1 min-w-0">
          {!goal.subcategory.isCategoryRoot && (
            <div className="flex items-center gap-1.5">
              <div
                className="h-1.5 w-1.5 rounded-full shrink-0"
                style={{ backgroundColor: goal.category.color }}
              />
              <span
                className={cn(
                  "text-xs text-muted-foreground",
                  isCompleted && "opacity-50"
                )}
              >
                {goal.category.name}
              </span>
            </div>
          )}
          <div
            className={cn(
              "font-medium text-sm mt-0.5",
              isCompleted && "line-through opacity-50"
            )}
          >
            {goal.subcategory.name}
          </div>

          {/* Targets — one per line or wrap */}
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
            {goal.targets.map((target) => (
              <TargetChip
                key={target.entryTypeId}
                target={target}
                completed={isCompleted}
              />
            ))}
          </div>
        </div>

        {!isCompleted && (
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              onClick={() => setEditOpen(true)}
              className="h-7 w-7 flex items-center justify-center rounded-full text-muted-foreground/40 hover:text-foreground hover:bg-muted transition-colors"
              aria-label="Hedefi düzenle"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={handleDelete}
              className="h-7 w-7 flex items-center justify-center rounded-full text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors"
              aria-label="Hedefi sil"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      <EditGoalSheet
        goal={goal}
        open={editOpen}
        onClose={() => setEditOpen(false)}
      />
    </>
  );
}
