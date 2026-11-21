"use client";

import { useState } from "react";
import { intlTag, useLocale, useT } from "@/lib/i18n";
import { useLiveQuery } from "dexie-react-hooks";
import { StickyNote } from "lucide-react";
import { createNote, listAllNotes } from "@/lib/db/queries";
import {
  StructureAddButton,
  StructureHeader,
  StructureHere,
} from "@/components/structure/structure-header";
import { NoteCard } from "@/components/notes/note-card";
import { NoteWindow } from "@/components/notes/note-window";
import type { Note } from "@/types";
import { PageSheet } from "@/components/ui/layer";
import { SummaryBlock, SummaryEmpty } from "@/components/ui/summary-block";
import { StructureSearch } from "@/components/structure/structure-search";
import { useIsBrutal } from "@/components/structure/brutal";
import { DayCell, groupByDay, useDayLabel } from "@/components/ui/day-cell";

/** Notların rengi — not kartının gül rengi (NOTE_COLOR), blokta açık tonu */
const NOTES = "#fda4af";

function todayStr(): string {
  const t = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`;
}
const norm = (s: string) => s.trim().toLocaleLowerCase("en-US");
const noteText = (n: Note) =>
  [n.title ?? "", ...n.blocks.map((b) => b.text)].join(" ");

export default function StructureNotesPage() {
  const t = useT();
  const tag = intlTag(useLocale());
  const brutal = useIsBrutal();
  const notes = useLiveQuery(() => listAllNotes(), []);
  const [query, setQuery] = useState("");

  const filtered = (notes ?? []).filter(
    (n) => !query.trim() || norm(noteText(n)).includes(norm(query))
  );

  // Gün gün — Ara ve Yapı › Girdiler ile aynı gün hücresi ve tarih yazılışı
  // (bkz. DayCell). Eskiden sade temada tarih İngilizce ay adıyla yazılıyordu
  const groups = groupByDay(filtered, (n) => n.date);
  const dayLabel = useDayLabel();
  const fmt = (n: number) => new Intl.NumberFormat(tag).format(n);

  // Yeni not pencerede açılır — kartlardaki notlar gibi
  const [newNoteId, setNewNoteId] = useState<string | null>(null);
  async function handleNewNote() {
    const note = await createNote(todayStr());
    setNewNoteId(note.id);
  }


  return (
    <PageSheet
      top={
        <StructureHeader
          below={
            brutal ? (
              <StructureHere text={notes && t("struct.notes.count", { n: notes.length })} />
            ) : undefined
          }
          action={
            <StructureAddButton
              labelKey="structure.addNote"
              onClick={handleNewNote}
            />
          }
        />
      }
    >

      {/* Arama çubuğu hep açık — Yapı sayfalarının ortak çubuğu (bkz.
          StructureSearch). Eskiden brütalde Ara karosuyla açılıyordu. */}
      {!!notes?.length && (
        <StructureSearch value={query} onChange={setQuery} placeholder={t("note.searchNotes")} />
      )}

      {/* Brütal: ana sayfanın blok dili (bkz. SummaryBlock) — gül renginde
          "NOTLAR · 12 not" (aramada kaçta kaç), altında her gün bir
          hücre (bkz. DayCell). Hiç not yoksa boş pencere: ince başta
          NOTLAR, altında "Henüz not yok" ve ufak Oluştur. */}
      {brutal ? (
        notes === undefined ? null : notes.length === 0 ? (
          <SummaryBlock
            className="mb-6"
            compact
            lead={{ kind: "count", color: NOTES, glyph: StickyNote, overline: t("structure.notes"), value: "0", unit: "" }}
            stats={[]}
          >
            <SummaryEmpty text={t("notes.none")} action={{ label: t("action.create"), onClick: handleNewNote }} />
          </SummaryBlock>
        ) : (
          <SummaryBlock
            className="mb-6"
            lead={{
              kind: "count",
              color: NOTES,
              overline: query.trim() ? t("notes.results") : t("structure.notes"),
              value: query.trim() ? `${filtered.length}/${notes.length}` : String(notes.length),
              unit: t("notes.unit"),
            }}
            stats={[]}
          >
            {filtered.length === 0 && <SummaryEmpty text={t("notes.noMatch")} />}
            {/* Her gün tek hücre: tarih etiketi tepesinde (dokununca gün
                sayfası), notları altında. Eskiden tarih krem ara satırdı */}
            {groups.map((g) => (
              <DayCell key={g.key} day={g.key} label={dayLabel(g.key)} count={fmt(g.items.length)}>
                {g.items.map((note) => (
                  <NoteCard key={note.id} note={note} />
                ))}
              </DayCell>
            ))}
          </SummaryBlock>
        )
      ) : (
      <section className="mb-6">
        <div className="mb-2.5 flex items-center gap-2 px-1">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {query.trim() ? t("notes.results") : t("structure.notes")}
          </h2>
          <span className="text-muted-foreground/50 text-xs">
            · {filtered.length}
          </span>
        </div>

        {notes === undefined ? null : notes.length === 0 ? (
          <p className="px-1 text-xs text-muted-foreground/70">
            {t("notes.empty", { action: t("structure.addNote") })}
          </p>
        ) : filtered.length === 0 ? (
          <p className="px-1 text-xs text-muted-foreground/70">
            {t("notes.noMatch")}
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {groups.map((g) => (
              <div key={g.key}>
                <div className="mb-1.5 px-1 text-[11px] font-medium text-muted-foreground/70">
                  {dayLabel(g.key)}
                </div>
                <div className="flex flex-col gap-2">
                  {g.items.map((note) => (
                    <NoteCard key={note.id} note={note} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
      )}
      {newNoteId && (
        <NoteWindow noteId={newNoteId} open onClose={() => setNewNoteId(null)} />
      )}
    </PageSheet>
  );
}
