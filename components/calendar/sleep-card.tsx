"use client";

import { useState } from "react";
import { MoonStar, Trash2 } from "lucide-react";
import type { EntryWithContext } from "@/types";
import { deleteEntry } from "@/lib/db/queries";
import {
  parseDTR,
  calcDTRDuration,
} from "@/components/forms/datetime-range-input";
import { EditEntryModal } from "@/components/forms/edit-entry-modal";
import { cn } from "@/lib/utils";

/** Gün sayfasındaki yerleşik uyku kartı — süre aralığı + kalite */
export function SleepCard({ entry }: { entry: EntryWithContext }) {
  const [editOpen, setEditOpen] = useState(false);

  const rangeValue = entry.values.find(
    (v) => (v.entryType?.valueType ?? "") === "datetime-range"
  );
  const qualityValue = entry.values.find(
    (v) => (v.entryType?.valueType ?? "") === "select"
  );

  const { start, end } = parseDTR(rangeValue?.value ?? "");
  const startTime = start?.split("T")[1]?.slice(0, 5);
  const endTime = end?.split("T")[1]?.slice(0, 5);
  const duration = calcDTRDuration(start, end);

  const qualityMax = qualityValue?.entryType?.choices?.length ?? 5;
  const qualityNum = qualityValue ? Number(qualityValue.value) : null;

  async function onDelete(e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm("Bu uyku kaydını silmek istediğinden emin misin?")) return;
    await deleteEntry(entry.id);
  }

  return (
    <>
      <button
        onClick={() => setEditOpen(true)}
        className={cn(
          "group relative w-full overflow-hidden rounded-2xl border border-violet-500/25 p-4 text-left",
          "bg-gradient-to-br from-violet-500/15 via-violet-500/5 to-transparent",
          "transition-colors hover:border-violet-500/40 active:scale-[0.99]"
        )}
      >
        <div className="flex items-center gap-3.5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-violet-500/20">
            <MoonStar className="h-5 w-5 text-violet-300" />
          </span>

          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-300/70">
              Uyku
            </div>
            <div className="mt-0.5 flex items-baseline gap-2">
              {startTime || endTime ? (
                <span className="text-lg font-semibold tabular-nums leading-none">
                  {startTime ?? "?"}
                  <span className="mx-1.5 text-sm font-normal text-muted-foreground">
                    →
                  </span>
                  {endTime ?? "?"}
                </span>
              ) : (
                <span className="text-sm text-muted-foreground">
                  Uyku kaydedildi
                </span>
              )}
              {duration && (
                <span className="text-xs text-muted-foreground">{duration}</span>
              )}
            </div>
          </div>

          {qualityNum !== null && !Number.isNaN(qualityNum) && (
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <span className="text-xs font-semibold tabular-nums text-violet-200">
                {qualityNum}/{qualityMax}
              </span>
              <div className="flex gap-1">
                {Array.from({ length: qualityMax }).map((_, i) => (
                  <span
                    key={i}
                    className={cn(
                      "h-1.5 w-1.5 rounded-full transition-colors",
                      i < qualityNum ? "bg-violet-400" : "bg-violet-400/20"
                    )}
                  />
                ))}
              </div>
            </div>
          )}

          <span
            role="button"
            tabIndex={0}
            onClick={onDelete}
            onKeyDown={(e) => {
              if (e.key === "Enter") onDelete(e as unknown as React.MouseEvent);
            }}
            className="absolute right-2 top-2 rounded-lg p-1.5 text-muted-foreground/0 transition-colors group-hover:text-muted-foreground/60 hover:!text-destructive hover:bg-destructive/10"
            aria-label="Uyku kaydını sil"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </span>
        </div>
      </button>

      <EditEntryModal entry={entry} open={editOpen} onOpenChange={setEditOpen} />
    </>
  );
}
