"use client";

import Link from "next/link";
import { FileText, Link2 } from "lucide-react";
import type { Note } from "@/types";
import { cn } from "@/lib/utils";
import { useLongPress } from "@/lib/use-long-press";
import {
  SelectionLayer,
  selectedCardClass,
  type EntrySelection,
} from "@/components/calendar/entry-selection";

/**
 * Gün sayfasındaki not satırı — sade ve derli toplu. Başlık (yoksa ilk satır)
 * ve varsa bağ sayısı; içerik önizlemesi yok. Dokununca tam sayfa editör açılır.
 * `selection` verilirse basılı tutmak toplu seçimi başlatır; satırın kendisi
 * bağlantı olduğu için seçim katmanı dıştaki sarmalayıcıya konur.
 */
export function NoteCard({
  note,
  selection,
}: {
  note: Note;
  selection?: EntrySelection;
}) {
  const longPress = useLongPress({ onLongPress: () => selection?.onStart() });
  const title =
    (note.title ?? "").trim() ||
    note.blocks.map((b) => b.text.trim()).find(Boolean) ||
    "Not";
  const linkCount = note.blocks.reduce(
    (sum, b) => sum + (b.links?.length ?? 0),
    0
  );

  return (
    <div
      className={cn(
        "relative select-none touch-manipulation rounded-xl",
        selection?.selected && selectedCardClass
      )}
      {...(selection && !selection.active ? longPress : {})}
    >
      <Link
        href={`/notes/${note.id}`}
        className="flex items-center gap-2.5 rounded-xl border border-border bg-card px-3 py-2.5 transition-all hover:bg-card/80 active:scale-[0.99]"
      >
        <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
        <span className="min-w-0 flex-1 truncate text-[13px] text-foreground/80">
          {title}
        </span>
        {linkCount > 0 && (
          <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground/60">
            <Link2 className="h-3 w-3" />
            {linkCount}
          </span>
        )}
      </Link>

      {selection?.active && (
        <SelectionLayer
          selected={selection.selected}
          onToggle={selection.onToggle}
          label={`${title} notunu seç`}
        />
      )}
    </div>
  );
}
