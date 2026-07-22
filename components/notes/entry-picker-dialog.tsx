"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Plus, Search, X } from "lucide-react";
import {
  createEntry,
  listEntriesForPicker,
  listSubcategoriesForPicker,
  type EntryPick,
} from "@/lib/db/queries";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const MONTHS_TR = [
  "Oca", "Şub", "Mar", "Nis", "May", "Haz",
  "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara",
];
function shortDate(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  return `${d} ${MONTHS_TR[m - 1]}`;
}
const norm = (s: string) => s.toLocaleLowerCase("tr-TR");

function dateNoon(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0).getTime();
}

/**
 * "Girdi iliştir" — nottaki bir kelimeye VAR OLAN bir girdiyi bağla ya da
 * kelime adıyla YENİ bir girdi oluşturup bağla (alt kategori seçilerek).
 */
export function EntryPickerDialog({
  open,
  onOpenChange,
  anchor,
  defaultDate,
  onPick,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  anchor: string;
  /** Yeni girdi bu güne oluşturulur */
  defaultDate: string;
  onPick: (entry: EntryPick) => void;
}) {
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [query, setQuery] = useState("");
  const entries = useLiveQuery(() => listEntriesForPicker(), []);
  const subs = useLiveQuery(() => listSubcategoriesForPicker(), []);

  const filteredEntries = useMemo(() => {
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

  const filteredSubs = useMemo(() => {
    const list = subs ?? [];
    if (!query.trim()) return list;
    const q = norm(query);
    return list.filter(
      (s) => norm(s.name).includes(q) || norm(s.catName).includes(q)
    );
  }, [subs, query]);

  async function createAndPick(sub: {
    id: string;
    name: string;
    catName: string;
    color: string;
  }) {
    const occurredAt = dateNoon(defaultDate);
    const entry = await createEntry({
      subcategoryId: sub.id,
      title: anchor,
      occurredAt,
    });
    onPick({
      id: entry.id,
      title: anchor,
      subName: sub.name,
      catName: sub.catName,
      color: sub.color,
      date: defaultDate,
      occurredAt,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[380px] gap-3 max-h-[80dvh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-base">Girdi iliştir</DialogTitle>
          <DialogDescription>
            &bdquo;{anchor}&rdquo; kelimesine bir girdi bağla
          </DialogDescription>
        </DialogHeader>

        {/* Mod: var olan / yeni */}
        <div className="flex gap-1 rounded-xl bg-muted/40 p-1">
          {(["existing", "new"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn(
                "flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                mode === m
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {m === "existing" ? "Var olan" : "Yeni girdi"}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={mode === "existing" ? "Girdi ara…" : "Alt kategori ara…"}
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
          {mode === "existing" ? (
            entries === undefined ? null : filteredEntries.length === 0 ? (
              <p className="px-1 py-4 text-xs text-muted-foreground/70">
                {(entries?.length ?? 0) === 0
                  ? "Henüz girdi yok — “Yeni girdi” ile oluştur."
                  : "Eşleşen girdi yok."}
              </p>
            ) : (
              <ul className="flex flex-col gap-1">
                {filteredEntries.map((e) => (
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
            )
          ) : subs === undefined ? null : filteredSubs.length === 0 ? (
            <p className="px-1 py-4 text-xs text-muted-foreground/70">
              {(subs?.length ?? 0) === 0
                ? "Önce Yapı’dan bir alt kategori oluştur."
                : "Eşleşen alt kategori yok."}
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {filteredSubs.map((s) => (
                <li key={s.id}>
                  <button
                    onClick={() => createAndPick(s)}
                    className="flex w-full items-center gap-2.5 rounded-xl border border-border bg-card px-3 py-2 text-left transition-colors hover:bg-card/70"
                  >
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: s.color }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {s.name}
                      </span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {s.catName}
                      </span>
                    </span>
                    <Plus className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {mode === "new" && (
          <p className="px-1 text-[11px] text-muted-foreground/70">
            &bdquo;{anchor}&rdquo; başlıklı yeni girdi bu güne eklenir; değerlerini
            sonra gün sayfasından girebilirsin.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
