"use client";

import { Fragment, useState } from "react";
import { intlTag, useLocale, useT } from "@/lib/i18n";
import { useLiveQuery } from "dexie-react-hooks";
import { Search, StickyNote, X } from "lucide-react";
import { createNote, listAllNotes } from "@/lib/db/queries";
import {
  StructureAddButton,
  StructureHeader,
} from "@/components/structure/structure-header";
import { NoteCard } from "@/components/notes/note-card";
import { NoteWindow } from "@/components/notes/note-window";
import { Input } from "@/components/ui/input";
import type { Note } from "@/types";
import { PageSheet } from "@/components/ui/layer";
import { SummaryBlock, SummaryEmpty, SummaryTile } from "@/components/ui/summary-block";
import { useIsBrutal } from "@/components/structure/brutal";

/** Notların rengi — not kartının gül rengi (NOTE_COLOR), blokta açık tonu */
const NOTES = "#fda4af";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
function dateLabel(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}
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
  // Brütal: arama Ara karosuyla açılır (Son girdiler bloğu gibi)
  const [searchOpen, setSearchOpen] = useState(false);
  const notes = useLiveQuery(() => listAllNotes(), []);
  const [query, setQuery] = useState("");

  const filtered = (notes ?? []).filter(
    (n) => !query.trim() || norm(noteText(n)).includes(norm(query))
  );

  const groups: { date: string; notes: Note[] }[] = [];
  for (const n of filtered) {
    const last = groups[groups.length - 1];
    if (last && last.date === n.date) last.notes.push(n);
    else groups.push({ date: n.date, notes: [n] });
  }

  // Yeni not pencerede açılır — kartlardaki notlar gibi
  const [newNoteId, setNewNoteId] = useState<string | null>(null);
  async function handleNewNote() {
    const note = await createNote(todayStr());
    setNewNoteId(note.id);
  }

  const closeSearch = () => {
    setSearchOpen(false);
    setQuery("");
  };
  const dayLabel = (date: string) => {
    const [y, m, d] = date.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(tag, { day: "numeric", month: "long", year: "numeric" });
  };

  return (
    <PageSheet
      top={
        <StructureHeader
          action={
            <StructureAddButton
              labelKey="structure.addNote"
              onClick={handleNewNote}
            />
          }
        />
      }
    >

      {/* Brütal: ana sayfanın blok dili (bkz. SummaryBlock) — gül renginde
          "NOTLAR · 12 not", yanında listeyi yerinde süzen mavi Ara karosu
          (açıkken kaçta kaç ve Kapat), altında günler krem ara satırda,
          notlar beyaz hücrede. Hiç not yoksa boş pencere: ince başta
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
            action={
              <SummaryTile
                color="#8ea6ff"
                icon={searchOpen ? X : Search}
                label={searchOpen ? t("action.close") : t("search.title")}
                onClick={() => (searchOpen ? closeSearch() : setSearchOpen(true))}
              />
            }
            stats={[]}
          >
            {searchOpen && (
              <div className="relative bg-white p-2">
                <Search className="pointer-events-none absolute left-5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#111]/50" strokeWidth={2.5} />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("note.searchNotes")}
                  aria-label={t("note.searchNotes")}
                  autoFocus
                  className="h-10 w-full rounded-[10px] border-2 border-[#111] bg-white pl-9 pr-9 text-[14px] font-bold text-[#111] placeholder:font-semibold placeholder:text-[#111]/40 focus:outline-none"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    aria-label={t("features.clearSearch")}
                    className="absolute right-4 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg active:bg-[#111]/10"
                  >
                    <X className="h-4 w-4" strokeWidth={2.75} />
                  </button>
                )}
              </div>
            )}
            {filtered.length === 0 && <SummaryEmpty text={t("notes.noMatch")} />}
            {groups.map((g) => (
              <Fragment key={g.date}>
                <div className="bg-[#f5f1e8] px-3.5 py-1.5 text-[10.5px] font-black uppercase tracking-[0.08em] text-[#111]">
                  {dayLabel(g.date)}
                </div>
                <div data-note-list="" className="flex flex-col gap-2 bg-white p-2">
                  {g.notes.map((note) => (
                    <NoteCard key={note.id} note={note} />
                  ))}
                </div>
              </Fragment>
            ))}
          </SummaryBlock>
        )
      ) : (
      <section className="mb-6">
        <div className="relative mb-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("note.searchNotes")}
            className="h-9 pl-9 pr-8"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground/60 transition-colors hover:text-foreground"
              aria-label={t("features.clearSearch")}
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

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
              <div key={g.date}>
                <div className="mb-1.5 px-1 text-[11px] font-medium text-muted-foreground/70">
                  {dateLabel(g.date)}
                </div>
                <div className="flex flex-col gap-2">
                  {g.notes.map((note) => (
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
