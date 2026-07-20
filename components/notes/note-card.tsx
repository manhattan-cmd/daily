"use client";

import Link from "next/link";
import type { Note, NoteTag } from "@/types";

/**
 * Gün sayfasındaki derli toplu not satırı — başlık (yoksa ilk satır),
 * tek satır önizleme ve sağda paragraf etiketlerinin renk noktaları.
 * Dokununca tam sayfa editör açılır.
 */
export function NoteCard({
  note,
  tagById,
}: {
  note: Note;
  tagById: Map<string, NoteTag>;
}) {
  const lines = note.blocks.map((b) => b.text.trim()).filter(Boolean);
  const title = (note.title ?? "").trim() || lines[0] || "Not";
  const preview =
    (note.title ?? "").trim() ? lines[0] : lines[1];

  // Notta kullanılan benzersiz etiketler (görülme sırasıyla)
  const noteTags = [
    ...new Map(
      note.blocks
        .flatMap((b) => b.tagIds)
        .map((tid) => tagById.get(tid))
        .filter((t): t is NoteTag => !!t)
        .map((t) => [t.id, t] as const)
    ).values(),
  ];

  return (
    <Link
      href={`/notes/${note.id}`}
      className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5 transition-all hover:bg-card/80 active:scale-[0.99]"
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{title}</div>
        {preview && (
          <div className="truncate text-xs text-muted-foreground">
            {preview}
          </div>
        )}
      </div>
      {noteTags.length > 0 && (
        <span className="flex shrink-0 items-center gap-1">
          {noteTags.slice(0, 4).map((t) => (
            <span
              key={t.id}
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: t.color }}
              title={t.name}
            />
          ))}
        </span>
      )}
    </Link>
  );
}
