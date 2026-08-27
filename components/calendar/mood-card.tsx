"use client";

import { useState } from "react";
import { Smile } from "lucide-react";
import type { EntryWithContext } from "@/types";
import { EditEntryModal } from "@/components/forms/edit-entry-modal";
import { cn } from "@/lib/utils";
import { splitChoiceLevel } from "@/lib/choice-level";
import { EmotionFace, ScaleFace, emotionLook } from "@/lib/icons/emotions";
import { useT } from "@/lib/i18n";
import { useLongPress } from "@/lib/use-long-press";
import {
  SelectionLayer,
  selectedCardClass,
  type EntrySelection,
} from "@/components/calendar/entry-selection";

/**
 * Yerleşik ruh hali kartı — mutluluk skalası + duygular. `dateLabel` yalnız
 * günleri karışık listelerde (ana sayfa) verilir.
 *
 * Duygular aynı özellikten gelen BİRDEN ÇOK değer, o yüzden `find` değil
 * `filter` ile toplanıyor: girdi kartının geri kalanı tek değer varsayar,
 * burada varsayım geçmiyor.
 */
export function MoodCard({
  entry,
  selection,
  dateLabel,
}: {
  entry: EntryWithContext;
  selection?: EntrySelection;
  dateLabel?: string;
}) {
  const t = useT();
  const [editOpen, setEditOpen] = useState(false);
  const longPress = useLongPress({ onLongPress: () => selection?.onStart() });

  const selects = entry.values.filter(
    (v) => (v.entryType?.valueType ?? "") === "select"
  );
  // Skala = seçenekleri sayı olan özellik; kalanı duygu
  const levelValue = selects.find((v) =>
    (v.entryType?.choices ?? []).every((c) => /^\d+$/.test(c))
  );
  const emotions = selects
    .filter((v) => v.modId !== levelValue?.modId)
    .map((v) => splitChoiceLevel(v.value))
    // Güçlü duygu önce: kartta yalnız birkaçı sığıyor, en çok hissedilen görünsün
    .sort((a, b) => (b.level ?? 0) - (a.level ?? 0));

  const levelMax = levelValue?.entryType?.choices?.length ?? 5;
  const level = levelValue ? Number(levelValue.value) : null;
  const hasLevel = level !== null && !Number.isNaN(level);


  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setEditOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter") setEditOpen(true);
        }}
        {...(selection && !selection.active ? longPress : {})}
        className={cn(
          "group relative w-full cursor-pointer select-none touch-manipulation overflow-hidden rounded-2xl border border-pink-500/45 px-3 py-2.5 text-left",
          "bg-card bg-gradient-to-br from-pink-500/16 via-pink-500/5 to-transparent",
          "transition-colors hover:border-pink-500/60 active:scale-[0.99]",
          selection?.selected && selectedCardClass
        )}
        aria-label={t("mood.edit")}
      >
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-pink-500/20">
            {hasLevel ? (
              <ScaleFace
                index={level - 1}
                total={levelMax}
                size={19}
                className="text-pink-300"
              />
            ) : (
              <Smile className="h-[18px] w-[18px] text-pink-300" strokeWidth={1.75} />
            )}
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-pink-300/70">
              <span>{t("mood.title")}</span>
              {dateLabel && (
                <span className="truncate font-medium tracking-normal text-muted-foreground/70">
                  {dateLabel}
                </span>
              )}
            </div>
            <div className="mt-0.5 min-w-0">
              {emotions.length > 0 ? (
                <span className="flex items-center gap-1.5 overflow-hidden">
                  {emotions.slice(0, 4).map((e) => (
                    <span
                      key={e.label}
                      className="flex shrink-0 items-center gap-1 text-[12px] font-medium leading-5"
                      style={{ color: emotionLook(e.label).color }}
                      title={e.level === null ? e.label : `${e.label} %${e.level}`}
                    >
                      <EmotionFace name={e.label} size={15} />
                      {e.level !== null && (
                        <span className="tabular-nums opacity-80">{e.level}</span>
                      )}
                    </span>
                  ))}
                  {emotions.length > 4 && (
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      +{emotions.length - 4}
                    </span>
                  )}
                </span>
              ) : (
                <span className="text-sm text-muted-foreground">
                  {t("mood.logged")}
                </span>
              )}
            </div>
          </div>

          {hasLevel && (
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <span className="text-xs font-semibold tabular-nums text-pink-200">
                {level}/{levelMax}
              </span>
              <div className="flex gap-1">
                {Array.from({ length: levelMax }).map((_, i) => (
                  <span
                    key={i}
                    className={cn(
                      "h-1.5 w-1.5 rounded-full transition-colors",
                      i < level ? "bg-pink-400" : "bg-pink-400/20"
                    )}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {selection?.active && (
          <SelectionLayer
            selected={selection.selected}
            onToggle={selection.onToggle}
            label={t("mood.select")}
          />
        )}
      </div>

      <EditEntryModal entry={entry} open={editOpen} onOpenChange={setEditOpen} />
    </>
  );
}
