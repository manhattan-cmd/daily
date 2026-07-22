"use client";

import { use, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { nanoid } from "nanoid";
import {
  ArrowLeft,
  CornerDownRight,
  FileText,
  Link2,
  Trash2,
  X,
} from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  createNoteWithTitle,
  deleteNote,
  getEntryBriefs,
  getNote,
  listLinkTargets,
  listNoteBacklinks,
  noteIsEmpty,
  updateNote,
  type EntryPick,
  type LinkTarget,
} from "@/lib/db/queries";
import { EntryPickerDialog } from "@/components/notes/entry-picker-dialog";
import { NotePickerDialog } from "@/components/notes/note-picker-dialog";
import { AliasEditor } from "@/components/notes/alias-editor";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { Note, NoteBlock, NoteLink } from "@/types";

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

type Selection = { blockId: string; start: number; end: number; text: string };

/**
 * Not editörü — tam sayfa serbest yazım + kullanıcı-örgülü bağlar.
 * Bir kelime/öbek seçilince araç çubuğu çıkar: "Not aç" (öbek → yeni not,
 * wiki gibi) ya da "Girdi iliştir" (kelime → var olan girdi). Bağlar
 * paragrafın altında çip olur; dokununca hedefe gidilir. Değişiklikler
 * kendiliğinden kaydedilir; bomboş bırakılan not çıkışta silinir. [[app-vision]]
 */
export default function NoteEditorPage({
  params,
}: {
  params: Promise<{ noteId: string }>;
}) {
  const { noteId } = use(params);
  const router = useRouter();

  const [loaded, setLoaded] = useState<Note | null | undefined>(undefined);
  const [title, setTitle] = useState("");
  const [blocks, setBlocks] = useState<NoteBlock[]>([]);
  const [aliases, setAliases] = useState<string[]>([]);
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  // Girdi iliştirmenin hedefi (blok + kelime), picker açıkken
  const [entryTarget, setEntryTarget] = useState<{
    blockId: string;
    anchor: string;
  } | null>(null);
  // Not bağlamanın hedefi (blok + öbek), not seçici açıkken
  const [noteTarget, setNoteTarget] = useState<{
    blockId: string;
    anchor: string;
  } | null>(null);
  // Otomatik bağ önerisi seçimi (birden çok aday varsa)
  const [suggestPick, setSuggestPick] = useState<{
    blockId: string;
    text: string;
    candidates: LinkTarget[];
  } | null>(null);

  const backlinks = useLiveQuery(() => listNoteBacklinks(noteId), [noteId]);
  const targets = useLiveQuery(() => listLinkTargets(noteId), [noteId]);

  const entryLinkIds = useMemo(() => {
    const ids = new Set<string>();
    for (const b of blocks)
      for (const l of b.links ?? []) if (l.type === "entry") ids.add(l.targetId);
    return [...ids];
  }, [blocks]);
  const entryBriefs = useLiveQuery(
    () => getEntryBriefs(entryLinkIds),
    [entryLinkIds.join(",")]
  );

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
      setAliases(n.aliases ?? []);
      const initBlocks = n.blocks.length ? n.blocks : [{ id: nid(), text: "" }];
      setBlocks(initBlocks);
      // Boş not → ilk blok hemen düzenlenebilir olsun (yazmaya başla)
      const empty =
        !(n.title ?? "").trim() && initBlocks.every((b) => !b.text.trim());
      if (empty) {
        setActiveBlockId(initBlocks[0].id);
        pendingFocus.current = { id: initBlocks[0].id, pos: 0 };
      }
    });
  }, [noteId]);

  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => {
      updateNote(noteId, { title, blocks, aliases });
    }, 400);
    return () => clearTimeout(t);
  }, [noteId, loaded, title, blocks, aliases]);

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

  useEffect(() => {
    for (const el of taRefs.current.values()) autoResize(el);
  }, [blocks]);

  function autoResize(el: HTMLTextAreaElement) {
    el.style.height = "0px";
    el.style.height = `${el.scrollHeight}px`;
  }

  function captureSelection(blockId: string, el: HTMLTextAreaElement) {
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    const text = el.value.slice(start, end);
    if (end > start && text.trim()) setSelection({ blockId, start, end, text });
    else setSelection(null);
  }

  async function handleBack() {
    if (loaded) {
      const current: Note = { ...loaded, title, blocks };
      if (noteIsEmpty(current)) await deleteNote(noteId);
      else await updateNote(noteId, { title, blocks, aliases });
      router.back();
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

  function addLink(blockId: string, link: NoteLink): NoteBlock[] {
    const next = blocks.map((b) =>
      b.id === blockId ? { ...b, links: [...(b.links ?? []), link] } : b
    );
    setBlocks(next);
    return next;
  }

  function removeLink(blockId: string, linkId: string) {
    setBlocks((prev) =>
      prev.map((b) =>
        b.id === blockId
          ? { ...b, links: (b.links ?? []).filter((l) => l.id !== linkId) }
          : b
      )
    );
  }

  // Öbek → not bağla: seçiciyi açar (yeni not ya da var olan not).
  function handleNoteLink() {
    if (!selection) return;
    setNoteTarget({ blockId: selection.blockId, anchor: selection.text.trim() });
  }

  // Yeni not aç (wiki): bağı ekler, kaydeder, yeni nota gider.
  async function onCreateNoteLink() {
    if (!noteTarget || !loaded) return;
    const phrase = noteTarget.anchor;
    const note = await createNoteWithTitle(loaded.date, phrase);
    const next = addLink(noteTarget.blockId, {
      id: nid(),
      anchor: phrase,
      type: "note",
      targetId: note.id,
    });
    await updateNote(noteId, { title, blocks: next });
    setNoteTarget(null);
    setSelection(null);
    router.push(`/notes/${note.id}`);
  }

  // Otomatik bağ önerisine dokununca: tek aday varsa doğrudan bağla, çoksa seçtir.
  function handleSuggest(blockId: string, text: string, candidates: LinkTarget[]) {
    if (candidates.length === 1) {
      void linkSuggestion(blockId, text, candidates[0]);
    } else {
      setSuggestPick({ blockId, text, candidates });
    }
  }

  async function linkSuggestion(blockId: string, text: string, t: LinkTarget) {
    const next = addLink(blockId, {
      id: nid(),
      anchor: text,
      type: t.type,
      targetId: t.id,
    });
    await updateNote(noteId, { title, blocks: next });
    setSuggestPick(null);
  }

  // Var olan nota bağla: bağı ekler, kaydeder, notta kalır.
  async function onPickNoteLink(note: Note) {
    if (!noteTarget) return;
    const next = addLink(noteTarget.blockId, {
      id: nid(),
      anchor: noteTarget.anchor,
      type: "note",
      targetId: note.id,
    });
    await updateNote(noteId, { title, blocks: next });
    setNoteTarget(null);
    setSelection(null);
  }

  // Kelime → var olan girdi. Picker açar.
  function handleAttachEntry() {
    if (!selection) return;
    setEntryTarget({ blockId: selection.blockId, anchor: selection.text.trim() });
  }

  async function onPickEntry(entry: EntryPick) {
    if (!entryTarget) return;
    const next = addLink(entryTarget.blockId, {
      id: nid(),
      anchor: entryTarget.anchor,
      type: "entry",
      targetId: entry.id,
    });
    await updateNote(noteId, { title, blocks: next });
    setEntryTarget(null);
    setSelection(null);
  }

  function onBlockKeyDown(
    e: React.KeyboardEvent<HTMLTextAreaElement>,
    index: number
  ) {
    const el = e.currentTarget;
    const block = blocks[index];

    if (e.key === "Enter") {
      e.preventDefault();
      const pos = el.selectionStart ?? block.text.length;
      const before = block.text.slice(0, pos);
      const after = block.text.slice(pos);
      const fresh: NoteBlock = { id: nid(), text: after };
      setBlocks((prev) => {
        const next = [...prev];
        next[index] = { ...block, text: before };
        next.splice(index + 1, 0, fresh);
        return next;
      });
      pendingFocus.current = { id: fresh.id, pos: 0 };
      setActiveBlockId(fresh.id);
      setSelection(null);
      return;
    }

    if (
      e.key === "Backspace" &&
      el.selectionStart === 0 &&
      el.selectionEnd === 0 &&
      index > 0
    ) {
      e.preventDefault();
      const prevBlock = blocks[index - 1];
      const junction = prevBlock.text.length;
      setBlocks((prev) => {
        const next = [...prev];
        next[index - 1] = {
          ...prevBlock,
          text: prevBlock.text + block.text,
          links: [...(prevBlock.links ?? []), ...(block.links ?? [])],
        };
        next.splice(index, 1);
        return next;
      });
      pendingFocus.current = { id: prevBlock.id, pos: junction };
      setActiveBlockId(prevBlock.id);
      setSelection(null);
    }
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

  const bodyEmpty = blocks.every((b) => !b.text);
  const briefs = entryBriefs ?? new Map<string, EntryPick>();

  return (
    <>
      {/* Başlık çubuğu */}
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
        className="w-full bg-transparent text-2xl font-bold tracking-tight outline-none placeholder:text-muted-foreground/30 mb-1.5"
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

      {/* Takma adlar — otomatik bağ önerisi bunlarla da eşleşir */}
      <AliasEditor aliases={aliases} onChange={setAliases} className="mb-3" />

      {/* Paragraflar */}
      <div className="flex flex-col pb-28">
        {blocks.map((block, i) => {
          const active = activeBlockId === block.id;
          const links = block.links ?? [];
          const hasSel = selection?.blockId === block.id && !!selection.text.trim();
          return (
            <div key={block.id}>
              <div className="flex">
                {active ? (
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
                      setSelection(null);
                    }}
                    onKeyDown={(e) => onBlockKeyDown(e, i)}
                    onBlur={() => setSelection(null)}
                    onSelect={(e) => captureSelection(block.id, e.currentTarget)}
                    onMouseUp={(e) => captureSelection(block.id, e.currentTarget)}
                    onKeyUp={(e) => captureSelection(block.id, e.currentTarget)}
                    className="w-full resize-none bg-transparent py-0.5 text-sm leading-relaxed outline-none placeholder:text-muted-foreground/35"
                  />
                ) : (
                  // Düzenlenmiyorken metin-üstü vurgulamayla göster; dokununca düzenle
                  <div
                    onClick={() => {
                      pendingFocus.current = { id: block.id, pos: block.text.length };
                      setActiveBlockId(block.id);
                    }}
                    className="w-full cursor-text whitespace-pre-wrap break-words py-0.5 text-sm leading-relaxed"
                  >
                    {block.text ? (
                      <InlineText
                        text={block.text}
                        marks={buildMarks(block.text, links, targets ?? [])}
                        briefs={briefs}
                        onSuggest={(t, c) => handleSuggest(block.id, t, c)}
                      />
                    ) : (
                      <span className="text-muted-foreground/35">
                        {i === 0 && bodyEmpty ? "Bugüne dair yaz..." : " "}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Bağ çipleri — düzenlerken yönetim/kaldırma (gösterimde bağlar metin içinde vurgulu) */}
              {active && links.length > 0 && (
                <div className="mb-1 flex flex-wrap gap-1.5">
                  {links.map((l) => {
                    if (l.type === "note") {
                      return (
                        <span key={l.id} className="inline-flex items-center">
                          <Link
                            href={`/notes/${l.targetId}`}
                            className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 py-0.5 pl-2 pr-2.5 text-[11px] font-medium text-primary transition-colors hover:bg-primary/20"
                          >
                            <FileText className="h-3 w-3" />
                            {l.anchor}
                          </Link>
                          {active && (
                            <button
                              onClick={() => removeLink(block.id, l.id)}
                              className="ml-0.5 rounded-full p-0.5 text-muted-foreground/50 hover:text-destructive"
                              aria-label="Bağı kaldır"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          )}
                        </span>
                      );
                    }
                    const brief = briefs.get(l.targetId);
                    const color = brief?.color ?? "#64748b";
                    const chip = (
                      <span
                        className="inline-flex items-center gap-1 rounded-full border py-0.5 pl-2 pr-2.5 text-[11px] font-medium"
                        style={{
                          borderColor: `${color}44`,
                          backgroundColor: `${color}14`,
                          color: brief ? color : undefined,
                        }}
                      >
                        <Link2 className="h-3 w-3" />
                        {l.anchor}
                        {brief && (
                          <span className="opacity-60">· {brief.title}</span>
                        )}
                        {!brief && (
                          <span className="text-muted-foreground/60">
                            · silinmiş
                          </span>
                        )}
                      </span>
                    );
                    return (
                      <span key={l.id} className="inline-flex items-center">
                        {brief ? (
                          <Link href={`/calendar/${brief.date}`}>{chip}</Link>
                        ) : (
                          chip
                        )}
                        {active && (
                          <button
                            onClick={() => removeLink(block.id, l.id)}
                            className="ml-0.5 rounded-full p-0.5 text-muted-foreground/50 hover:text-destructive"
                            aria-label="Bağı kaldır"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </span>
                    );
                  })}
                </div>
              )}

              {/* Seçim araç çubuğu — bir kelime/öbek seçiliyken */}
              {hasSel && (
                <div className="mb-2 flex items-center gap-1.5">
                  <span className="shrink-0 max-w-[40%] truncate text-[11px] text-muted-foreground">
                    &bdquo;{selection!.text.trim()}&rdquo;
                  </span>
                  <CornerDownRight className="h-3 w-3 shrink-0 text-muted-foreground/50" />
                  <button
                    type="button"
                    onPointerDown={(e) => e.preventDefault()}
                    onClick={handleNoteLink}
                    className="flex shrink-0 items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary transition-colors hover:bg-primary/20"
                  >
                    <FileText className="h-3 w-3" />
                    Not bağla
                  </button>
                  <button
                    type="button"
                    onPointerDown={(e) => e.preventDefault()}
                    onClick={handleAttachEntry}
                    className="flex shrink-0 items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <Link2 className="h-3 w-3" />
                    Girdi iliştir
                  </button>
                </div>
              )}

            </div>
          );
        })}

        {/* Geri bağlantılar — bu nota bağlanan notlar */}
        {backlinks && backlinks.length > 0 && (
          <div className="mt-8 border-t border-border/60 pt-4">
            <h2 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Bu nota bağlananlar
            </h2>
            <div className="flex flex-col gap-1.5">
              {backlinks.map((n) => {
                const label =
                  (n.title ?? "").trim() ||
                  n.blocks.map((b) => b.text.trim()).find(Boolean) ||
                  "Not";
                return (
                  <Link
                    key={n.id}
                    href={`/notes/${n.id}`}
                    className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm transition-colors hover:bg-card/70"
                  >
                    <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{label}</span>
                    <span className="shrink-0 text-[11px] text-muted-foreground/60">
                      {n.date.slice(5)}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Girdi seçici */}
      <EntryPickerDialog
        open={entryTarget !== null}
        onOpenChange={(o) => {
          if (!o) setEntryTarget(null);
        }}
        anchor={entryTarget?.anchor ?? ""}
        defaultDate={loaded.date}
        onPick={onPickEntry}
      />

      {/* Not seçici — yeni not aç ya da var olana bağla */}
      <NotePickerDialog
        open={noteTarget !== null}
        onOpenChange={(o) => {
          if (!o) setNoteTarget(null);
        }}
        anchor={noteTarget?.anchor ?? ""}
        excludeId={noteId}
        onCreate={onCreateNoteLink}
        onPick={onPickNoteLink}
      />

      {/* Öneri seçimi — aynı ada birden çok hedef */}
      <Dialog
        open={suggestPick !== null}
        onOpenChange={(o) => {
          if (!o) setSuggestPick(null);
        }}
      >
        <DialogContent className="max-w-[340px] gap-3">
          <DialogHeader>
            <DialogTitle className="text-base">Neye bağlansın?</DialogTitle>
            <DialogDescription>
              &bdquo;{suggestPick?.text}&rdquo; için birden çok hedef var
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            {suggestPick?.candidates.map((c) => (
              <button
                key={`${c.type}:${c.id}`}
                onClick={() =>
                  linkSuggestion(suggestPick.blockId, suggestPick.text, c)
                }
                className="flex items-center gap-2.5 rounded-xl border border-border bg-card px-3 py-2 text-left transition-colors hover:bg-card/70"
              >
                {c.type === "note" ? (
                  <FileText className="h-3.5 w-3.5 shrink-0 text-primary" />
                ) : (
                  <Link2
                    className="h-3.5 w-3.5 shrink-0"
                    style={{ color: c.color ?? "#64748b" }}
                  />
                )}
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {c.name}
                </span>
                <span className="shrink-0 text-[11px] text-muted-foreground/60">
                  {c.type === "note" ? "not" : "girdi"}
                </span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

    </>
  );
}

// ─── Metin-üstü vurgulama + otomatik bağ önerisi ─────────────────────────────

type Mark =
  | { kind: "link"; start: number; end: number; link: NoteLink }
  | { kind: "suggest"; start: number; end: number; text: string; candidates: LinkTarget[] };

const isWordChar = (c: string) => c !== "" && /[\p{L}\p{N}]/u.test(c);

/**
 * Paragraf metnini işaretlere böl: kesin bağlar (vurgulu) + otomatik bağ
 * önerileri (var olan not/girdi adının geçtiği ama henüz bağlanmamış yerler).
 */
function buildMarks(
  text: string,
  links: NoteLink[],
  targets: LinkTarget[]
): Mark[] {
  const placed: Mark[] = [];

  // 1) Kesin bağlar — anchor'ın örtüşmeyen ilk konumu
  for (const l of links) {
    if (!l.anchor) continue;
    let from = 0;
    while (from <= text.length) {
      const i = text.indexOf(l.anchor, from);
      if (i < 0) break;
      const j = i + l.anchor.length;
      if (!placed.some((p) => i < p.end && j > p.start)) {
        placed.push({ kind: "link", start: i, end: j, link: l });
        break;
      }
      from = i + 1;
    }
  }

  // 2) Öneriler — bu blokta zaten bağlı olmayan hedeflerin ad eşleşmeleri
  const linkedIds = new Set(links.map((l) => l.targetId));
  const lower = text.toLocaleLowerCase("tr-TR");
  const bySpan = new Map<
    string,
    { start: number; end: number; text: string; candidates: LinkTarget[] }
  >();
  for (const t of targets) {
    if (linkedIds.has(t.id)) continue;
    const name = t.name.toLocaleLowerCase("tr-TR");
    if (name.length < 3) continue;
    let from = 0;
    while (from <= lower.length) {
      const i = lower.indexOf(name, from);
      if (i < 0) break;
      const j = i + name.length;
      from = i + 1;
      const before = i > 0 ? lower[i - 1] : "";
      const after = j < lower.length ? lower[j] : "";
      if (isWordChar(before) || isWordChar(after)) continue; // tam kelime
      if (placed.some((p) => i < p.end && j > p.start)) continue; // kesin bağla çakışma
      const key = `${i}-${j}`;
      const ex = bySpan.get(key);
      if (ex) ex.candidates.push(t);
      else bySpan.set(key, { start: i, end: j, text: text.slice(i, j), candidates: [t] });
      break; // hedef başına ilk eşleşme
    }
  }
  for (const s of [...bySpan.values()].sort((a, b) => a.start - b.start)) {
    if (placed.some((p) => s.start < p.end && s.end > p.start)) continue;
    placed.push({ kind: "suggest", ...s });
  }

  placed.sort((a, b) => a.start - b.start);
  return placed;
}

function InlineText({
  text,
  marks,
  briefs,
  onSuggest,
}: {
  text: string;
  marks: Mark[];
  briefs: Map<string, EntryPick>;
  onSuggest: (text: string, candidates: LinkTarget[]) => void;
}) {
  const out: React.ReactNode[] = [];
  let cur = 0;
  marks.forEach((m, idx) => {
    if (m.start > cur) out.push(<span key={`t${idx}`}>{text.slice(cur, m.start)}</span>);
    if (m.kind === "link") {
      out.push(
        <InlineLink
          key={`l${idx}`}
          link={m.link}
          label={text.slice(m.start, m.end)}
          briefs={briefs}
        />
      );
    } else {
      out.push(
        <SuggestSpan
          key={`s${idx}`}
          label={m.text}
          onClick={() => onSuggest(m.text, m.candidates)}
        />
      );
    }
    cur = m.end;
  });
  if (cur < text.length) out.push(<span key="end">{text.slice(cur)}</span>);
  return <>{out}</>;
}

/** Otomatik bağ önerisi — noktalı altı çizili, dokununca bağlanır. */
function SuggestSpan({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <span
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="cursor-pointer rounded px-0.5 text-muted-foreground underline decoration-dotted decoration-muted-foreground/50 underline-offset-2 transition-colors hover:text-foreground"
      title="Bağla?"
    >
      {label}
    </span>
  );
}

function InlineLink({
  link,
  label,
  briefs,
}: {
  link: NoteLink;
  label: string;
  briefs: Map<string, EntryPick>;
}) {
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  if (link.type === "note") {
    return (
      <Link
        href={`/notes/${link.targetId}`}
        onClick={stop}
        className="rounded px-0.5 font-medium text-primary underline decoration-primary/40 underline-offset-2 bg-primary/10"
      >
        {label}
      </Link>
    );
  }
  const brief = briefs.get(link.targetId);
  if (!brief) {
    return (
      <span className="rounded bg-muted px-0.5 text-muted-foreground underline decoration-dotted underline-offset-2">
        {label}
      </span>
    );
  }
  return (
    <Link
      href={`/calendar/${brief.date}`}
      onClick={stop}
      className="rounded px-0.5 font-medium underline underline-offset-2"
      style={{
        backgroundColor: `${brief.color}22`,
        color: brief.color,
        textDecorationColor: `${brief.color}66`,
      }}
    >
      {label}
    </Link>
  );
}
