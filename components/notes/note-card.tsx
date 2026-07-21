"use client";

import Link from "next/link";
import type { Note, NoteTag } from "@/types";

/**
 * Gün sayfasındaki not satırı — sade ve derli toplu. İçerik önizlemesi
 * göstermez, başlığı öne çıkarmaz; kimliğini etiketlerden alır: solda
 * editördeki paragraf şeridini yansıtan renk çubuğu ve baskın etiketten
 * çok hafif bir zemin tonu. Dokununca tam sayfa editör açılır.
 */
export function NoteCard({
  note,
  tagById,
}: {
  note: Note;
  tagById: Map<string, NoteTag>;
}) {
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

  const tint = noteTags[0]?.color;
  const title = (note.title ?? "").trim();
  const label =
    title || (noteTags.length ? noteTags.map((t) => t.name).join(" · ") : "Not");

  return (
    <Link
      href={`/notes/${note.id}`}
      className="flex items-stretch gap-2.5 overflow-hidden rounded-xl border border-border bg-card px-3 py-2.5 transition-all hover:brightness-110 active:scale-[0.99]"
      style={
        tint
          ? {
              borderColor: `${tint}24`,
              background: `linear-gradient(135deg, ${tint}14, ${tint}05 55%, transparent)`,
            }
          : undefined
      }
    >
      {/* Etiket şeridi — editördeki paragraf imzasını yansıtır */}
      {noteTags.length > 0 && (
        <span className="flex w-[3px] shrink-0 flex-col overflow-hidden rounded-full">
          {noteTags.map((t) => (
            <span
              key={t.id}
              className="flex-1"
              style={{ backgroundColor: `${t.color}cc` }}
            />
          ))}
        </span>
      )}
      <span className="min-w-0 flex-1 self-center truncate text-[13px] text-foreground/75">
        {label}
      </span>
    </Link>
  );
}
