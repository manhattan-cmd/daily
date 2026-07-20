"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { nanoid } from "nanoid";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  createNoteTag,
  deleteNote,
  getNote,
  listNoteTags,
  noteIsEmpty,
  updateNote,
} from "@/lib/db/queries";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Note, NoteBlock } from "@/types";
import { cn } from "@/lib/utils";

const nid = () => nanoid(12);

const MONTHS_TR = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];
const WEEKDAYS_TR = [
  "Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi",
];

function dateLabel(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return `${dt.getDate()} ${MONTHS_TR[dt.getMonth()]} ${WEEKDAYS_TR[dt.getDay()]}`;
}

/**
 * Not editörü — Samsung Notes hissiyatında tam sayfa serbest yazım.
 * Not = başlık + paragraf blokları; her paragrafa etiket atanabilir
 * (Düşünce, His, Aktivite...). Etiketli paragrafın solunda renk şeridi durur.
 * Değişiklikler kendiliğinden kaydedilir; bomboş bırakılan not çıkışta silinir.
 */
export default function NoteEditorPage({
  params,
}: {
  params: Promise<{ noteId: string }>;
}) {
  const { noteId } = use(params);
  const router = useRouter();

  // DB'den bir kez yüklenir, sonrası yerel state + debounce'lu kayıt
  // (liveQuery ile sürekli senkron, yazarken imleci bozar)
  const [loaded, setLoaded] = useState<Note | null | undefined>(undefined);
  const [title, setTitle] = useState("");
  const [blocks, setBlocks] = useState<NoteBlock[]>([]);
  // Etiket satırı bu bloğun altında görünür — son odaklanan blok
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [tagDialogOpen, setTagDialogOpen] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [tagError, setTagError] = useState(false);

  const tags = useLiveQuery(() => listNoteTags(), []);
  const taRefs = useRef(new Map<string, HTMLTextAreaElement>());
  const pendingFocus = useRef<{ id: string; pos: number } | null>(null);

  useEffect(() => {
    getNote(noteId).then((n) => {
      if (!n) {
        setLoaded(null);
        return;
      }
      setLoaded(n);
      setTitle(n.title ?? "");
      setBlocks(n.blocks.length ? n.blocks : [{ id: nid(), text: "", tagIds: [] }]);
    });
  }, [noteId]);

  // Otomatik kayıt — yazım durunca
  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => {
      updateNote(noteId, { title, blocks });
    }, 400);
    return () => clearTimeout(t);
  }, [noteId, loaded, title, blocks]);

  // Split/merge sonrası imleci doğru bloğa taşı
  useEffect(() => {
    if (!pendingFocus.current) return;
    const { id, pos } = pendingFocus.current;
    const el = taRefs.current.get(id);
    if (el) {
      el.focus();
      el.setSelectionRange(pos, pos);
    }
    pendingFocus.current = null;
  }, [blocks]);

  // Metin dışarıdan değişince (split/merge) yükseklikleri tazele
  useEffect(() => {
    for (const el of taRefs.current.values()) autoResize(el);
  }, [blocks]);

  function autoResize(el: HTMLTextAreaElement) {
    el.style.height = "0px";
    el.style.height = `${el.scrollHeight}px`;
  }

  async function handleBack() {
    if (loaded) {
      const current: Note = { ...loaded, title, blocks };
      if (noteIsEmpty(current)) await deleteNote(noteId);
      else await updateNote(noteId, { title, blocks });
      router.push(`/calendar/${loaded.date}`);
    } else {
      router.push("/calendar");
    }
  }

  async function handleDelete() {
    if (!loaded) return;
    if (!confirm("Bu not silinsin mi?")) return;
    await deleteNote(noteId);
    router.push(`/calendar/${loaded.date}`);
  }

  function setBlockText(blockId: string, text: string) {
    setBlocks((prev) =>
      prev.map((b) => (b.id === blockId ? { ...b, text } : b))
    );
  }

  function toggleTag(blockId: string, tagId: string) {
    setBlocks((prev) =>
      prev.map((b) =>
        b.id === blockId
          ? {
              ...b,
              tagIds: b.tagIds.includes(tagId)
                ? b.tagIds.filter((t) => t !== tagId)
                : [...b.tagIds, tagId],
            }
          : b
      )
    );
  }

  function onBlockKeyDown(
    e: React.KeyboardEvent<HTMLTextAreaElement>,
    index: number
  ) {
    const el = e.currentTarget;
    const block = blocks[index];

    if (e.key === "Enter") {
      // Enter yeni paragraf açar — bölünen kuyruk etiketlerini taşır
      e.preventDefault();
      const pos = el.selectionStart ?? block.text.length;
      const before = block.text.slice(0, pos);
      const after = block.text.slice(pos);
      const fresh: NoteBlock = {
        id: nid(),
        text: after,
        tagIds: after.trim() ? [...block.tagIds] : [],
      };
      setBlocks((prev) => {
        const next = [...prev];
        next[index] = { ...block, text: before };
        next.splice(index + 1, 0, fresh);
        return next;
      });
      pendingFocus.current = { id: fresh.id, pos: 0 };
      setActiveBlockId(fresh.id);
      return;
    }

    if (
      e.key === "Backspace" &&
      el.selectionStart === 0 &&
      el.selectionEnd === 0 &&
      index > 0
    ) {
      // Paragraf başında silme öncekiyle birleştirir
      e.preventDefault();
      const prevBlock = blocks[index - 1];
      const junction = prevBlock.text.length;
      setBlocks((prev) => {
        const next = [...prev];
        next[index - 1] = {
          ...prevBlock,
          text: prevBlock.text + block.text,
          tagIds: block.text.trim()
            ? [...new Set([...prevBlock.tagIds, ...block.tagIds])]
            : prevBlock.tagIds,
        };
        next.splice(index, 1);
        return next;
      });
      pendingFocus.current = { id: prevBlock.id, pos: junction };
      setActiveBlockId(prevBlock.id);
    }
  }

  async function handleCreateTag() {
    const created = await createNoteTag(newTagName);
    if (!created) {
      setTagError(true);
      return;
    }
    if (activeBlockId) toggleTag(activeBlockId, created.id);
    setNewTagName("");
    setTagDialogOpen(false);
  }

  if (loaded === undefined) return null;
  if (loaded === null) {
    return (
      <div className="pt-10">
        <p className="text-sm text-muted-foreground">
          Not bulunamadı.{" "}
          <Link href="/calendar" className="text-primary">
            Takvime dön
          </Link>
        </p>
      </div>
    );
  }

  const tagById = new Map((tags ?? []).map((t) => [t.id, t]));
  const bodyEmpty = blocks.every((b) => !b.text);

  return (
    <>
      {/* Başlık çubuğu — geri (kaydeder), tarih, sil */}
      <div className="flex items-center justify-between pt-10 pb-4">
        <button
          onClick={handleBack}
          className="inline-flex items-center gap-1.5 -ml-0.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Geri — not kaydedilir"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>{dateLabel(loaded.date)}</span>
        </button>
        <button
          onClick={handleDelete}
          className="rounded-lg p-1.5 text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 transition-colors"
          aria-label="Notu sil"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {/* Başlık */}
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Başlık"
        className="w-full bg-transparent text-2xl font-bold tracking-tight outline-none placeholder:text-muted-foreground/30 mb-3"
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            const first = blocks[0];
            if (first) {
              pendingFocus.current = { id: first.id, pos: 0 };
              setBlocks((p) => [...p]);
            }
          }
        }}
      />

      {/* Paragraflar */}
      <div className="flex flex-col pb-28">
        {blocks.map((block, i) => {
          const blockTags = block.tagIds
            .map((tid) => tagById.get(tid))
            .filter((t): t is NonNullable<typeof t> => !!t);
          const active = activeBlockId === block.id;
          return (
            <div key={block.id}>
              <div className="flex gap-2.5">
                {/* Etiket şeridi — paragrafın renk imzası */}
                <div
                  className="flex w-[3px] shrink-0 flex-col overflow-hidden rounded-full self-stretch my-0.5"
                  aria-hidden
                >
                  {blockTags.map((t) => (
                    <span
                      key={t.id}
                      className="flex-1"
                      style={{ backgroundColor: `${t.color}cc` }}
                    />
                  ))}
                </div>
                <textarea
                  ref={(el) => {
                    if (el) {
                      taRefs.current.set(block.id, el);
                      autoResize(el);
                    } else {
                      taRefs.current.delete(block.id);
                    }
                  }}
                  rows={1}
                  value={block.text}
                  placeholder={i === 0 && bodyEmpty ? "Bugüne dair yaz..." : ""}
                  onChange={(e) => {
                    setBlockText(block.id, e.target.value);
                    autoResize(e.target);
                  }}
                  onKeyDown={(e) => onBlockKeyDown(e, i)}
                  onFocus={() => setActiveBlockId(block.id)}
                  className="w-full resize-none bg-transparent py-0.5 text-sm leading-relaxed outline-none placeholder:text-muted-foreground/35"
                />
              </div>

              {/* Etiket satırı — imlecin olduğu paragrafın altında */}
              {active && (
                <div className="no-scrollbar mt-1 mb-2 flex gap-1.5 overflow-x-auto pl-[13.5px] pr-1">
                  {(tags ?? []).map((tag) => {
                    const on = block.tagIds.includes(tag.id);
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        onPointerDown={(e) => e.preventDefault()}
                        onClick={() => toggleTag(block.id, tag.id)}
                        className={cn(
                          "shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                          !on && "border-border text-muted-foreground hover:text-foreground"
                        )}
                        style={
                          on
                            ? {
                                borderColor: `${tag.color}80`,
                                backgroundColor: `${tag.color}1f`,
                                color: tag.color,
                              }
                            : undefined
                        }
                        aria-pressed={on}
                      >
                        {tag.name}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onPointerDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setTagError(false);
                      setNewTagName("");
                      setTagDialogOpen(true);
                    }}
                    className="flex shrink-0 items-center gap-1 rounded-full border border-dashed border-primary/35 px-2.5 py-1 text-[11px] font-medium text-primary/70 hover:border-primary/60 hover:text-primary transition-colors"
                  >
                    <Plus className="h-3 w-3" />
                    Etiket
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Yeni etiket */}
      <Dialog open={tagDialogOpen} onOpenChange={setTagDialogOpen}>
        <DialogContent className="max-w-[340px] gap-4">
          <DialogHeader>
            <DialogTitle className="text-base">Yeni etiket</DialogTitle>
            <DialogDescription>
              Havuza eklenir; her paragrafa atanabilir
            </DialogDescription>
          </DialogHeader>
          <Input
            value={newTagName}
            onChange={(e) => {
              setNewTagName(e.target.value);
              setTagError(false);
            }}
            placeholder="örn. Rüya, Fikir, İş"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreateTag();
            }}
          />
          {tagError && (
            <p className="text-xs text-amber-300/90">
              Bu adda bir etiket zaten var — etiket adları tekildir.
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setTagDialogOpen(false)}>
              İptal
            </Button>
            <Button onClick={handleCreateTag} disabled={!newTagName.trim()}>
              Yarat
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
