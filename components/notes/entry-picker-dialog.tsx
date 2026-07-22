"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Search, X } from "lucide-react";
import { listEntriesForPicker, type EntryPick } from "@/lib/db/queries";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

const MONTHS_TR = [
  "Oca", "Şub", "Mar", "Nis", "May", "Haz",
  "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara",
];
function shortDate(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  return `${d} ${MONTHS_TR[m - 1]}`;
}
const norm = (s: string) => s.toLocaleLowerCase("tr-TR");

/**
 * "Girdi iliştir" — nottaki bir kelimeye var olan bir girdiyi bağlamak için
 * son girdileri arayıp seçtiren diyalog.
 */
export function EntryPickerDialog({
  open,
  onOpenChange,
  anchor,
  onPick,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  anchor: string;
  onPick: (entry: EntryPick) => void;
}) {
  const [query, setQuery] = useState("");
  const entries = useLiveQuery(() => listEntriesForPicker(), []);

  const filtered = useMemo(() => {
    const list = entries ?? [];
    if (!query.trim()) return list;
    const q = norm(query);
    return list.filter(
      (e) =>
        norm(e.title).includes(q) ||
        norm(e.subName).includes(q) ||
        norm(e.catName).includes(q)
    );
  }, [entries, query]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[380px] gap-3 max-h-[80dvh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-base">Girdi iliştir</DialogTitle>
          <DialogDescription>
            &bdquo;{anchor}&rdquo; kelimesine bir girdi bağla
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Girdi ara…"
            autoFocus
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
          {entries === undefined ? null : filtered.length === 0 ? (
            <p className="px-1 py-4 text-xs text-muted-foreground/70">
              {(entries?.length ?? 0) === 0
                ? "Henüz girdi yok — önce bir gün sayfasına girdi ekle."
                : "Eşleşen girdi yok."}
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {filtered.map((e) => (
                <li key={e.id}>
                  <button
                    onClick={() => onPick(e)}
                    className="flex w-full items-center gap-2.5 rounded-xl border border-border bg-card px-3 py-2 text-left transition-colors hover:bg-card/70"
                  >
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: e.color }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {e.title}
                      </span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {e.catName}
                        {e.subName && e.subName !== e.title ? ` · ${e.subName}` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 text-[11px] text-muted-foreground/60">
                      {shortDate(e.date)}
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
