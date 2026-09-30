"use client";

import { useState } from "react";
import { NotebookPen } from "lucide-react";
import type { Note } from "@/types";
import { cn, formatDateTime } from "@/lib/utils";
import { useLongPress } from "@/lib/use-long-press";
import { useT } from "@/lib/i18n";
import { noteMoment } from "@/lib/db/queries";
import {
  SelectionLayer,
  selectedCardClass,
  type EntrySelection,
} from "@/components/calendar/entry-selection";
import { NoteWindow } from "@/components/notes/note-window";

/** Notların rengi — gün sayfasındaki "Notlar" başlığının ve Ekle menüsünün tonu */
export const NOTE_COLOR = "#fb7185";

/**
 * Not kartı — gün sayfası, notlar listesi ve ana sayfadaki son girdiler.
 *
 * Girdi kartıyla aynı iskelet (degrade zemin, solda sembol, sağda zaman) ki
 * aynı listede yan yana durabilsin; ama bir ölçüm değil yazı olduğu belli
 * olsun: kendi rengi, kalem sembolü, başlığın altında "Not" ve saç teli
 * çizginin altında yazılanın ilk satırları. Başlık yoksa ilk satır başlık olur.
 *
 * Dokununca not penceresi açılır (girdi penceresiyle aynı ölçü — bkz.
 * NoteWindow); eskiden tam sayfaya gidiyordu. `selection` verilirse basılı tutmak toplu seçimi
 * başlatır; kart bağlantı olduğu için seçim katmanı dış sarmalayıcıda.
 */
export function NoteCard({
  note,
  selection,
}: {
  note: Note;
  selection?: EntrySelection;
}) {
  const t = useT();
  const longPress = useLongPress({ onLongPress: () => selection?.onStart() });
  const [open, setOpen] = useState(false);
  const lines = note.blocks
    .flatMap((b) => b.text.split("\n"))
    .map((l) => l.trim())
    .filter(Boolean);
  const ownTitle = (note.title ?? "").trim();
  const title = ownTitle || lines[0] || t("entry.note");
  const preview = (ownTitle ? lines : lines.slice(1)).join("\n");
  const c = NOTE_COLOR;

  return (
    <>
    <div
      className={cn(
        "relative select-none touch-manipulation rounded-2xl",
        selection?.selected && selectedCardClass
      )}
      {...(selection && !selection.active ? longPress : {})}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter") setOpen(true);
        }}
        aria-label={`${title} — ${t("action.edit")}`}
        className="block cursor-pointer rounded-2xl border px-2.5 py-2 text-left transition-transform active:scale-[0.99]"
        style={{
          borderColor: `${c}59`,
          background: `linear-gradient(135deg, ${c}24, ${c}0d 45%, transparent), var(--card)`,
        }}
      >
        <div className="flex items-center gap-2">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
            style={{
              background: `linear-gradient(135deg, ${c}30, ${c}12)`,
              boxShadow: `inset 0 0 0 1px ${c}2e`,
            }}
          >
            <NotebookPen className="h-[18px] w-[18px]" style={{ color: c }} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-semibold leading-snug">
              {title}
            </div>
            <div
              className="mt-0.5 text-[9px] font-semibold uppercase leading-none tracking-[0.12em]"
              style={{ color: `${c}cc` }}
            >
              {t("entry.note")}
            </div>
          </div>
          <span className="shrink-0 whitespace-nowrap text-[10px] leading-none tabular-nums text-muted-foreground/70">
            {formatDateTime(noteMoment(note))}
          </span>
        </div>

        {preview && (
          <p className="mt-2 line-clamp-3 whitespace-pre-line border-t border-[var(--ln-1)] pt-2 text-[12px] leading-relaxed text-foreground/75">
            {preview}
          </p>
        )}
      </div>

      {selection?.active && (
        <SelectionLayer
          selected={selection.selected}
          onToggle={selection.onToggle}
          label={`${title} notunu seç`}
        />
      )}
    </div>

    {/* Kartın DIŞINDA: pencere içindeki basılı tutma React ağacında karta
        kabarıp toplu seçimi başlatmasın */}
    <NoteWindow noteId={note.id} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
