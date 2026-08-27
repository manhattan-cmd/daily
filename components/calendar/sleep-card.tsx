"use client";

import { useState } from "react";
import { Clock, MoonStar } from "lucide-react";
import type { EntryWithContext } from "@/types";
import {
  parseDTR,
  calcDTRDuration,
} from "@/components/forms/datetime-range-input";
import { EditEntryModal } from "@/components/forms/edit-entry-modal";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { useLongPress } from "@/lib/use-long-press";
import {
  SelectionLayer,
  selectedCardClass,
  type EntrySelection,
} from "@/components/calendar/entry-selection";

/**
 * Yerleşik uyku kartı — süre aralığı + kalite.
 *
 * Girdi kartıyla aynı iskelet: üstte künye (sembol + başlık + tarih), altında
 * saç teli çizgiyle ayrılmış bölümde ölçü kapsülü. Başlık eskiden saatlerin
 * üstünde sıkışıyor, kart iki satırlık tek bir blok gibi duruyordu.
 *
 * `dateLabel` yalnız günleri karışık listelerde (ana sayfa) verilir: gün
 * sayfasında hangi güne ait olduğu zaten belli, orada boş bırakılır.
 * `selection` verilirse basılı tutmak toplu seçimi başlatır; kartın kendisi
 * `<button>` olduğundan seçim katmanı dıştaki sarmalayıcıya konur.
 */
export function SleepCard({
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
          "group relative w-full cursor-pointer select-none touch-manipulation overflow-hidden rounded-2xl border border-violet-500/45 px-2.5 py-2 text-left",
          "bg-card bg-gradient-to-br from-violet-500/16 via-violet-500/5 to-transparent",
          "transition-colors hover:border-violet-500/60 active:scale-[0.99]",
          selection?.selected && selectedCardClass
        )}
        aria-label={t("sleep.edit")}
      >
        {/* Künye — sembol, başlık, sağda tarih */}
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-violet-500/20">
            <MoonStar
              className="h-[17px] w-[17px] text-violet-300"
              strokeWidth={1.75}
            />
          </span>
          <span className="min-w-0 flex-1 truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-300/80">
            {t("sleep.title")}
          </span>
          {dateLabel && (
            <span className="shrink-0 whitespace-nowrap text-[10px] leading-none tabular-nums text-muted-foreground/70">
              {dateLabel}
            </span>
          )}
        </div>

        {/* Alt bölüm — aralık kapsülü, sağda kalite */}
        <div className="mt-2 flex items-center gap-2 border-t border-white/[0.07] pt-2">
          <span
            className="inline-flex min-w-0 items-center gap-1.5 rounded-full py-0.5 pl-0.5 pr-2.5"
            style={{
              background: "rgba(139,92,246,0.12)",
              boxShadow: "inset 0 0 0 1px rgba(139,92,246,0.28)",
            }}
          >
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet-500/25">
              <Clock className="h-3 w-3 text-violet-300" strokeWidth={1.9} />
            </span>
            {startTime || endTime ? (
              <span className="text-[13px] font-semibold leading-none tabular-nums text-violet-100">
                {startTime ?? "?"}
                <span className="mx-1 font-normal text-violet-300/70">→</span>
                {endTime ?? "?"}
              </span>
            ) : (
              <span className="truncate text-[11px] leading-none text-muted-foreground">
                {t("sleep.logged")}
              </span>
            )}
            {duration && (
              <span className="shrink-0 text-[10px] leading-none text-muted-foreground/70">
                {duration}
              </span>
            )}
          </span>

          {qualityNum !== null && !Number.isNaN(qualityNum) && (
            <div className="ml-auto flex shrink-0 items-center gap-1.5">
              <span className="text-[11px] font-semibold tabular-nums text-violet-200">
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
        </div>

        {selection?.active && (
          <SelectionLayer
            selected={selection.selected}
            onToggle={selection.onToggle}
            label={t("sleep.select")}
          />
        )}
      </div>

      <EditEntryModal entry={entry} open={editOpen} onOpenChange={setEditOpen} />
    </>
  );
}
