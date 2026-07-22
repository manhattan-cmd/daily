"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { ChevronRight, Plus, Search, Waypoints, X } from "lucide-react";
import { createNote, listAllNotes } from "@/lib/db/queries";
import { PageHeader } from "@/components/layout/page-header";
import { StructureTabs } from "@/components/structure/structure-tabs";
import { NoteCard } from "@/components/notes/note-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Note } from "@/types";

const MONTHS_TR = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];
function dateLabel(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return `${d} ${MONTHS_TR[m - 1]} ${y}`;
}
function todayStr(): string {
  const t = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`;
}
const norm = (s: string) => s.trim().toLocaleLowerCase("tr-TR");
const noteText = (n: Note) =>
  [n.title ?? "", ...(n.aliases ?? []), ...n.blocks.map((b) => b.text)].join(" ");

export default function StructureNotesPage() {
  const router = useRouter();
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

  async function handleNewNote() {
    const note = await createNote(todayStr());
    router.push(`/notes/${note.id}`);
  }

  return (
    <>
      <PageHeader
        title="Yapı"
        description="Notlar — günce, bağlar ve harita"
        action={
          <Button size="sm" onClick={handleNewNote} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            Yeni Not
          </Button>
        }
      />

      <StructureTabs className="-mt-2 mb-5" />

      {/* Hayat Haritası hub kartı */}
      <Link
        href="/structure/notes/map"
        className="mb-6 flex items-center gap-3 rounded-2xl border border-border bg-card p-4 transition-colors hover:bg-card/70"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10">
          <Waypoints className="h-5 w-5 text-primary" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium">Hayat Haritası</span>
          <span className="block text-xs text-muted-foreground">
            Notlar ve girdiler arasında kurduğun bağları gör
          </span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </Link>

      {/* Notlar — arama + güne göre liste */}
      <section className="mb-6">
        <div className="relative mb-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Notlarda ara…"
            className="h-9 pl-9 pr-8"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground/60 transition-colors hover:text-foreground"
              aria-label="Aramayı temizle"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        <div className="mb-2.5 flex items-center gap-2 px-1">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {query.trim() ? "Sonuçlar" : "Notlar"}
          </h2>
          <span className="text-muted-foreground/50 text-xs">
            · {filtered.length}
          </span>
        </div>

        {notes === undefined ? null : notes.length === 0 ? (
          <p className="px-1 text-xs text-muted-foreground/70">
            Henüz not yok — “Yeni Not” ile bugüne bir not ekle.
          </p>
        ) : filtered.length === 0 ? (
          <p className="px-1 text-xs text-muted-foreground/70">
            Eşleşen not yok.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {groups.map((g) => (
              <div key={g.date}>
                <div className="mb-1.5 px-1 text-[11px] font-medium text-muted-foreground/70">
                  {dateLabel(g.date)}
                </div>
                <div className="flex flex-col gap-1.5">
                  {g.notes.map((note) => (
                    <NoteCard key={note.id} note={note} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
