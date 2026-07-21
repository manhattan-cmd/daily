"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import {
  ArrowLeft,
  ChevronRight,
  NotebookPen,
  Pencil,
  Plus,
  Trash2,
  Waypoints,
} from "lucide-react";
import {
  createNote,
  createNoteTag,
  deleteNoteTag,
  listAllNotes,
  listNoteTags,
  noteTagUsage,
  renameNoteTag,
} from "@/lib/db/queries";
import { PageHeader } from "@/components/layout/page-header";
import { StructureTabs } from "@/components/structure/structure-tabs";
import { NoteCard } from "@/components/notes/note-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import type { NoteTag } from "@/types";
import { cn } from "@/lib/utils";

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

export default function StructureNotesPage() {
  const router = useRouter();
  const notes = useLiveQuery(() => listAllNotes(), []);
  const tags = useLiveQuery(() => listNoteTags(), []);
  const usage = useLiveQuery(() => noteTagUsage(), []);

  const [createOpen, setCreateOpen] = useState(false);
  const [newTag, setNewTag] = useState("");
  const [createErr, setCreateErr] = useState(false);
  // Etikete dokununca açılan detay; yeniden adlandırma aynı dialogda
  const [selected, setSelected] = useState<NoteTag | null>(null);
  const [view, setView] = useState<"info" | "rename">("info");
  const [renameVal, setRenameVal] = useState("");
  const [renameErr, setRenameErr] = useState(false);

  const tagById = new Map((tags ?? []).map((t) => [t.id, t]));

  // Notları güne göre grupla (liste zaten en yeni gün önce)
  const groups: { date: string; notes: NonNullable<typeof notes> }[] = [];
  for (const n of notes ?? []) {
    const last = groups[groups.length - 1];
    if (last && last.date === n.date) last.notes.push(n);
    else groups.push({ date: n.date, notes: [n] });
  }

  async function handleNewNote() {
    const note = await createNote(todayStr());
    router.push(`/notes/${note.id}`);
  }

  async function handleCreateTag() {
    const created = await createNoteTag(newTag);
    if (!created) {
      setCreateErr(true);
      return;
    }
    setNewTag("");
    setCreateOpen(false);
  }

  async function handleRename() {
    if (!selected) return;
    const ok = await renameNoteTag(selected.id, renameVal);
    if (!ok) {
      setRenameErr(true);
      return;
    }
    setSelected(null);
  }

  async function handleDeleteTag(tag: NoteTag) {
    const u = usage?.get(tag.id);
    const detail = u?.notes
      ? ` ${u.notes} nottaki ${u.blocks} paragraftan kaldırılacak; yazılar kalır.`
      : "";
    if (!confirm(`"${tag.name}" etiketi silinsin mi?${detail}`)) return;
    await deleteNoteTag(tag.id);
    setSelected(null);
  }

  const selUsage = selected ? usage?.get(selected.id) : undefined;

  return (
    <>
      <PageHeader
        title="Yapı"
        description="Notlar — günce, etiketler ve harita"
        action={
          <Button size="sm" onClick={handleNewNote} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            Yeni Not
          </Button>
        }
      />

      <StructureTabs className="-mt-2 mb-5" />

      {/* Harita hub kartı */}
      <Link
        href="/structure/notes/map"
        className="mb-6 flex items-center gap-3 rounded-2xl border border-border bg-card p-4 transition-colors hover:bg-card/70"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10">
          <Waypoints className="h-5 w-5 text-primary" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium">Not Haritası</span>
          <span className="block text-xs text-muted-foreground">
            Notlar arasındaki ortak örüntüleri bağ olarak gör
          </span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </Link>

      {/* Etiketler havuzu */}
      <section className="mb-6">
        <h2 className="mb-2.5 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Etiketler
        </h2>
        <div className="flex flex-wrap gap-1.5">
          {(tags ?? []).map((tag) => {
            const count = usage?.get(tag.id)?.notes ?? 0;
            return (
              <button
                key={tag.id}
                onClick={() => {
                  setSelected(tag);
                  setView("info");
                  setRenameErr(false);
                }}
                className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors"
                style={{
                  borderColor: `${tag.color}55`,
                  backgroundColor: `${tag.color}14`,
                  color: tag.color,
                }}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: tag.color }}
                />
                {tag.name}
                {count > 0 && (
                  <span className="text-[10px] opacity-70">{count}</span>
                )}
              </button>
            );
          })}
          <button
            onClick={() => {
              setNewTag("");
              setCreateErr(false);
              setCreateOpen(true);
            }}
            className="flex items-center gap-1 rounded-full border border-dashed border-primary/35 px-3 py-1.5 text-xs font-medium text-primary/70 transition-colors hover:border-primary/60 hover:text-primary"
          >
            <Plus className="h-3 w-3" />
            Etiket
          </button>
        </div>
      </section>

      {/* Notlar — güne göre */}
      <section className="mb-6">
        <h2 className="mb-2.5 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Notlar
          {notes && notes.length > 0 && (
            <span className="ml-1.5 text-muted-foreground/50">
              · {notes.length}
            </span>
          )}
        </h2>
        {notes === undefined ? null : notes.length === 0 ? (
          <p className="px-1 text-xs text-muted-foreground/70">
            Henüz not yok — “Yeni Not” ile bugüne bir not ekle.
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
                    <NoteCard key={note.id} note={note} tagById={tagById} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Etiket detayı — bilgi + yeniden adlandır/sil */}
      <Dialog
        open={selected !== null}
        onOpenChange={(o) => {
          if (!o) setSelected(null);
        }}
      >
        <DialogContent className="max-w-[340px] gap-4">
          {selected && view === "info" && (
            <>
              <DialogHeader className="items-center text-center">
                <span
                  className="flex h-14 w-14 items-center justify-center rounded-full border-2"
                  style={{
                    borderColor: selected.color,
                    backgroundColor: `${selected.color}22`,
                  }}
                >
                  <NotebookPen
                    className="h-6 w-6"
                    style={{ color: selected.color }}
                  />
                </span>
                <DialogTitle className="pt-1 text-base">
                  {selected.name}
                </DialogTitle>
                <DialogDescription>
                  {selUsage?.notes
                    ? `${selUsage.notes} not · ${selUsage.blocks} paragraf`
                    : "henüz kullanılmadı"}
                  {selected.isBuiltIn && " · yerleşik"}
                </DialogDescription>
              </DialogHeader>
              {!selected.isBuiltIn && (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1 gap-1.5"
                    onClick={() => {
                      setRenameVal(selected.name);
                      setRenameErr(false);
                      setView("rename");
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Yeniden adlandır
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1 gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => handleDeleteTag(selected)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Sil
                  </Button>
                </div>
              )}
            </>
          )}
          {selected && view === "rename" && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-base">
                  <button
                    onClick={() => setView("info")}
                    className="-ml-1 flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
                    aria-label="Detaya dön"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                  </button>
                  Etiketi yeniden adlandır
                </DialogTitle>
                <DialogDescription>
                  Ad her notta değişir — etiket tektir
                </DialogDescription>
              </DialogHeader>
              <Input
                value={renameVal}
                onChange={(e) => {
                  setRenameVal(e.target.value);
                  setRenameErr(false);
                }}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleRename();
                }}
              />
              {renameErr && (
                <p className="text-xs text-amber-300/90">
                  Bu adda başka bir etiket var — etiket adları tekildir.
                </p>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setView("info")}>
                  İptal
                </Button>
                <Button onClick={handleRename} disabled={!renameVal.trim()}>
                  Kaydet
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Yeni etiket */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-[340px] gap-4">
          <DialogHeader>
            <DialogTitle className="text-base">Yeni etiket</DialogTitle>
            <DialogDescription>
              Havuza eklenir; not paragraflarına atanır
            </DialogDescription>
          </DialogHeader>
          <Input
            value={newTag}
            onChange={(e) => {
              setNewTag(e.target.value);
              setCreateErr(false);
            }}
            placeholder="örn. Rüya, Fikir, İş"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreateTag();
            }}
          />
          {createErr && (
            <p className="text-xs text-amber-300/90">
              Bu adda bir etiket zaten var — etiket adları tekildir.
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              İptal
            </Button>
            <Button onClick={handleCreateTag} disabled={!newTag.trim()}>
              Yarat
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
