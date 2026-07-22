"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { FileText, Plus, Search, X } from "lucide-react";
import { listAllNotes } from "@/lib/db/queries";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { Note } from "@/types";

const norm = (s: string) => s.toLocaleLowerCase("tr-TR");
function noteTitle(n: Note): string {
  return (
    (n.title ?? "").trim() ||
    n.blocks.map((b) => b.text.trim()).find(Boolean) ||
    "Not"
  );
}

/**
 * "Not bağla" — seçili öbeği YENİ bir nota (başlığı öbek) ya da VAR OLAN bir
 * nota bağlamak için. Üstte yeni-not seçeneği, altında aranabilir not listesi.
 */
export function NotePickerDialog({
  open,
  onOpenChange,
  anchor,
  excludeId,
  onCreate,
  onPick,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  anchor: string;
  excludeId: string;
  onCreate: () => void;
  onPick: (note: Note) => void;
}) {
  const [query, setQuery] = useState("");
  const notes = useLiveQuery(() => listAllNotes(), []);

  const filtered = useMemo(() => {
    const list = (notes ?? []).filter((n) => n.id !== excludeId);
    if (!query.trim()) return list;
    const q = norm(query);
    return list.filter(
      (n) =>
        norm(noteTitle(n)).includes(q) ||
        n.blocks.some((b) => norm(b.text).includes(q))
    );
  }, [notes, query, excludeId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[380px] gap-3 max-h-[80dvh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-base">Not bağla</DialogTitle>
          <DialogDescription>
            &bdquo;{anchor}&rdquo; öbeğini bir nota bağla
          </DialogDescription>
        </DialogHeader>

        {/* Yeni not aç */}
        <button
          onClick={onCreate}
          className="flex items-center gap-2.5 rounded-xl border border-primary/40 bg-primary/10 px-3 py-2.5 text-left text-primary transition-colors hover:bg-primary/20"
        >
          <Plus className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">Yeni not aç</span>
            <span className="block truncate text-[11px] opacity-80">
              &bdquo;{anchor}&rdquo; başlığıyla
            </span>
          </span>
        </button>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Var olan notlarda ara…"
            className="h-9 pl-9 pr-8"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground/60 hover:text-foreground"
              aria-label="Temizle"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        <div className="-mx-2 flex-1 overflow-y-auto px-2">
          {notes === undefined ? null : filtered.length === 0 ? (
            <p className="px-1 py-4 text-xs text-muted-foreground/70">
              {(notes?.length ?? 0) <= 1
                ? "Bağlanacak başka not yok."
                : "Eşleşen not yok."}
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {filtered.map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => onPick(n)}
                    className="flex w-full items-center gap-2.5 rounded-xl border border-border bg-card px-3 py-2 text-left transition-colors hover:bg-card/70"
                  >
                    <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {noteTitle(n)}
                    </span>
                    <span className="shrink-0 text-[11px] text-muted-foreground/60">
                      {n.date.slice(5)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
