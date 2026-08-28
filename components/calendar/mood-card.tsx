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

/** Kartta en fazla kaç duygu gösterilir; kalanı "+n" ile özetlenir */
const MAX_FACES = 5;

/**
 * Yerleşik ruh hali kartı — mutluluk skalası + duygular.
 *
 * Uyku kartıyla AYNI iskelet (bkz. sleep-card): üstte künye (sembol, başlık,
 * sağda tarih), saç teli çizgi, altta ölçü kapsülleri ve sağda skala. İki
 * yerleşik kart yan yana durduğu için farklı düzenlerde olmaları listeyi
 * dağıtıyordu. Ayrılan tek şey kapsülün içeriği: uykuda tek bir saat aralığı,
 * burada duygu başına bir yuvarlak yüz — veri öyle geliyor.
 *
 * `dateLabel` yalnız günleri karışık listelerde (ana sayfa) verilir.
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
    // Güçlü duygu önce: kartta yalnız birkaçı sığıyor, en çok hissedilen
    // görünsün (yoğunluk kaydı olmayanlar sıralamayı bozmadan sonda kalır)
    .sort((a, b) => (b.level ?? 0) - (a.level ?? 0));

  // Yerleşik akışın rengi kategoriden; boşsa ruh halinin pembesi
  const color = entry.category.color || "#f472b6";

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
          "group relative w-full cursor-pointer select-none touch-manipulation overflow-hidden rounded-2xl border px-2.5 py-2 text-left transition-transform active:scale-[0.99]",
          selection?.selected && selectedCardClass
        )}
        // Kenarlık ve zemin satır içi — sınıfla verilen kenarlık rengi
        // globals.css'teki katmansız `*` kuralı yüzünden uygulanmıyor
        // (bkz. sleep-card)
        style={{
          borderColor: `${color}73`,
          background: `linear-gradient(135deg, ${color}24, ${color}0d 45%, transparent), var(--card)`,
        }}
        aria-label={t("mood.edit")}
      >
        {/* Künye — sembol, başlık, sağda tarih */}
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-pink-500/20">
            {hasLevel ? (
              <ScaleFace
                index={level - 1}
                total={levelMax}
                size={17}
                className="text-pink-300"
              />
            ) : (
              <Smile
                className="h-[17px] w-[17px] text-pink-300"
                strokeWidth={1.75}
              />
            )}
          </span>
          <span className="min-w-0 flex-1 truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-pink-300/80">
            {t("mood.title")}
          </span>
          {dateLabel && (
            <span className="shrink-0 whitespace-nowrap text-[10px] leading-none tabular-nums text-muted-foreground/70">
              {dateLabel}
            </span>
          )}
        </div>

        {/* Alt bölüm — duygu kapsülleri, sağda mutluluk skalası */}
        <div className="mt-2 flex items-center gap-2 border-t border-white/[0.07] pt-2">
          {emotions.length > 0 ? (
            <span className="flex min-w-0 items-center gap-1 overflow-hidden">
              {emotions.slice(0, MAX_FACES).map((e) => {
                const look = emotionLook(e.label);
                return (
                  <span
                    key={e.label}
                    title={e.level === null ? e.label : `${e.label} %${e.level}`}
                    className={cn(
                      "inline-flex shrink-0 items-center gap-1 rounded-full py-0.5 pl-0.5",
                      e.level === null ? "pr-0.5" : "pr-2"
                    )}
                    style={{
                      background: `${look.color}1f`,
                      boxShadow: `inset 0 0 0 1px ${look.color}47`,
                    }}
                  >
                    <span
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                      style={{ background: `${look.color}40` }}
                    >
                      <EmotionFace
                        name={e.label}
                        size={14}
                        style={{ color: look.color }}
                      />
                    </span>
                    {e.level !== null && (
                      <span
                        className="text-[11px] font-semibold leading-none tabular-nums"
                        style={{ color: look.color }}
                      >
                        {e.level}
                      </span>
                    )}
                  </span>
                );
              })}
              {emotions.length > MAX_FACES && (
                <span className="shrink-0 text-[10px] leading-none text-muted-foreground/70">
                  +{emotions.length - MAX_FACES}
                </span>
              )}
            </span>
          ) : (
            <span className="truncate text-[11px] leading-none text-muted-foreground">
              {t("mood.logged")}
            </span>
          )}

          {hasLevel && (
            <div className="ml-auto flex shrink-0 items-center gap-1.5">
              <span className="text-[11px] font-semibold tabular-nums text-pink-200">
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
