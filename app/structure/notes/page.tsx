"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import {
  ArrowLeft,
  ChevronRight,
  KeyRound,
  Loader2,
  NotebookPen,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Waypoints,
  X,
} from "lucide-react";
import {
  createNote,
  createNoteTag,
  deleteNoteTag,
  getSetting,
  listAllNotes,
  listNoteConnections,
  listNoteTags,
  noteTagUsage,
  renameNoteTag,
  setSetting,
} from "@/lib/db/queries";
import {
  AI_KEY_SETTING,
  AI_MODEL_SETTING,
  DEFAULT_AI_MODEL,
  testApiKey,
} from "@/lib/ai/anthropic";
import { analyzeNotes, type AnalyzeProgress } from "@/lib/ai/note-analysis";
import { noteText } from "@/lib/notes-graph";
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
import { AI_MODELS, type AiModelId, type Note, type NoteTag } from "@/types";
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
const norm = (s: string) => s.trim().toLocaleLowerCase("tr-TR");

export default function StructureNotesPage() {
  const router = useRouter();
  const notes = useLiveQuery(() => listAllNotes(), []);
  const tags = useLiveQuery(() => listNoteTags(), []);
  const usage = useLiveQuery(() => noteTagUsage(), []);
  const apiKey = useLiveQuery(() => getSetting(AI_KEY_SETTING), []);
  const connections = useLiveQuery(() => listNoteConnections(), []);

  // Etiket havuzu (yarat/düzenle)
  const [createOpen, setCreateOpen] = useState(false);
  const [newTag, setNewTag] = useState("");
  const [createErr, setCreateErr] = useState(false);
  const [selected, setSelected] = useState<NoteTag | null>(null);
  const [view, setView] = useState<"info" | "rename">("info");
  const [renameVal, setRenameVal] = useState("");
  const [renameErr, setRenameErr] = useState(false);
  const [manageTags, setManageTags] = useState(false);

  // Arama & filtre
  const [query, setQuery] = useState("");
  const [filterTags, setFilterTags] = useState<Set<string>>(new Set());

  // Yapay zekâ ayarları + çözüm
  const [aiOpen, setAiOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<AnalyzeProgress | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const tagById = new Map((tags ?? []).map((t) => [t.id, t]));

  // Notları ara + etikete göre süz
  const filtered = (notes ?? []).filter((n) => {
    if (filterTags.size > 0) {
      const nt = new Set(n.blocks.flatMap((b) => b.tagIds));
      if (![...filterTags].some((t) => nt.has(t))) return false;
    }
    if (query.trim()) {
      if (!norm(noteText(n)).includes(norm(query))) return false;
    }
    return true;
  });

  const groups: { date: string; notes: Note[] }[] = [];
  for (const n of filtered) {
    const last = groups[groups.length - 1];
    if (last && last.date === n.date) last.notes.push(n);
    else groups.push({ date: n.date, notes: [n] });
  }

  const hasKey = !!apiKey?.trim();
  const filtering = filterTags.size > 0 || query.trim().length > 0;

  async function handleNewNote() {
    const note = await createNote(todayStr());
    router.push(`/notes/${note.id}`);
  }

  function toggleFilter(id: string) {
    setFilterTags((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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

  async function handleAnalyze() {
    if (!hasKey) {
      setAiOpen(true);
      return;
    }
    setRunning(true);
    setResult(null);
    setProgress({ done: 0, total: 0 });
    try {
      const r = await analyzeNotes({ onProgress: setProgress });
      if (r.errors.length) {
        setResult(`Hata: ${r.errors[0]}`);
      } else if (r.analyzed === 0) {
        setResult("Çözülecek yeni not yok.");
      } else {
        setResult(
          `${r.analyzed} not çözüldü, ${r.connections} bağ bulundu.`
        );
      }
    } catch (e) {
      setResult(e instanceof Error ? e.message : "Bilinmeyen hata");
    } finally {
      setRunning(false);
      setProgress(null);
    }
  }

  const selUsage = selected ? usage?.get(selected.id) : undefined;
  const linkCount = connections?.length ?? 0;

  return (
    <>
      <PageHeader
        title="Yapı"
        description="Notlar — günce, arama ve harita"
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
        className="mb-3 flex items-center gap-3 rounded-2xl border border-border bg-card p-4 transition-colors hover:bg-card/70"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10">
          <Waypoints className="h-5 w-5 text-primary" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium">Not Haritası</span>
          <span className="block text-xs text-muted-foreground">
            {linkCount > 0
              ? `${linkCount} içgörülü bağ — notlar arasındaki örüntüler`
              : "Notlar arasındaki örüntüleri bağ olarak gör"}
          </span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </Link>

      {/* Yapay zekâ — bağlantıları çöz */}
      <div className="mb-6 rounded-2xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <Sparkles className="h-5 w-5 text-primary" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-medium">Bağlantıları çöz</span>
            <span className="block text-xs text-muted-foreground">
              {hasKey
                ? "Yapay zekâ notların arasındaki örüntüleri içgörüyle bulur"
                : "Önce kendi Anthropic API anahtarını gir"}
            </span>
          </span>
          <button
            onClick={() => setAiOpen(true)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
            aria-label="Yapay zekâ ayarları"
          >
            <KeyRound className="h-4 w-4" />
          </button>
        </div>
        <Button
          className="w-full gap-1.5"
          onClick={handleAnalyze}
          disabled={running}
        >
          {running ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {progress && progress.total > 0
                ? `Çözülüyor ${progress.done}/${progress.total}`
                : "Çözülüyor…"}
            </>
          ) : (
            <>
              <Sparkles className="h-3.5 w-3.5" />
              {hasKey ? "Bağlantıları çöz" : "Anahtarı gir ve başla"}
            </>
          )}
        </Button>
        {running && progress?.current && (
          <p className="mt-2 truncate text-center text-[11px] text-muted-foreground">
            {progress.current}
          </p>
        )}
        {result && !running && (
          <p className="mt-2 text-center text-xs text-muted-foreground">
            {result}
          </p>
        )}
      </div>

      {/* Etiketler — filtre (Düzenle ile yönetim) */}
      <section className="mb-4">
        <div className="mb-2.5 flex items-center justify-between px-1">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Etiketler
          </h2>
          {(tags?.length ?? 0) > 0 && (
            <button
              onClick={() => setManageTags((v) => !v)}
              className="text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {manageTags ? "Bitti" : "Düzenle"}
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(tags ?? []).map((tag) => {
            const count = usage?.get(tag.id)?.notes ?? 0;
            const active = !manageTags && filterTags.has(tag.id);
            return (
              <button
                key={tag.id}
                onClick={() => {
                  if (manageTags) {
                    setSelected(tag);
                    setView("info");
                    setRenameErr(false);
                  } else {
                    toggleFilter(tag.id);
                  }
                }}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all",
                  manageTags && "border-dashed"
                )}
                style={{
                  borderColor: `${tag.color}${active ? "" : "55"}`,
                  backgroundColor: `${tag.color}${active ? "33" : "14"}`,
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
                {manageTags && <Pencil className="h-2.5 w-2.5 opacity-60" />}
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

      {/* Notlar — arama + süzülmüş liste */}
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
            {filtering ? "Sonuçlar" : "Notlar"}
          </h2>
          <span className="text-muted-foreground/50 text-xs">
            · {filtered.length}
          </span>
          {filtering && (
            <button
              onClick={() => {
                setQuery("");
                setFilterTags(new Set());
              }}
              className="ml-auto text-[11px] font-medium text-muted-foreground hover:text-foreground"
            >
              Filtreyi temizle
            </button>
          )}
        </div>

        {notes === undefined ? null : (notes.length === 0) ? (
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
                    <NoteCard key={note.id} note={note} tagById={tagById} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Yapay zekâ ayarları */}
      <AiSettingsDialog open={aiOpen} onOpenChange={setAiOpen} />

      {/* Etiket detayı */}
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

// ─── Yapay zekâ ayarları diyaloğu ────────────────────────────────────────────

function AiSettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [key, setKey] = useState("");
  const [model, setModel] = useState<AiModelId>(DEFAULT_AI_MODEL);
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState<
    { ok: boolean; text: string } | null
  >(null);

  // Diyalog her açılışta kayıtlı değerleri taze yükler
  useEffect(() => {
    if (!open) return;
    setStatus(null);
    let alive = true;
    Promise.all([
      getSetting(AI_KEY_SETTING),
      getSetting(AI_MODEL_SETTING),
    ]).then(([k, m]) => {
      if (!alive) return;
      setKey(k ?? "");
      setModel(((m as AiModelId) || DEFAULT_AI_MODEL) as AiModelId);
    });
    return () => {
      alive = false;
    };
  }, [open]);

  async function save() {
    await setSetting(AI_KEY_SETTING, key.trim());
    await setSetting(AI_MODEL_SETTING, model);
    onOpenChange(false);
  }

  async function test() {
    setTesting(true);
    setStatus(null);
    await setSetting(AI_KEY_SETTING, key.trim());
    await setSetting(AI_MODEL_SETTING, model);
    const r = await testApiKey();
    setStatus(
      r.ok
        ? { ok: true, text: "Anahtar çalışıyor ✓" }
        : { ok: false, text: r.error ?? "Başarısız" }
    );
    setTesting(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[360px] gap-4 max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">Yapay Zekâ Ayarları</DialogTitle>
          <DialogDescription>
            Kendi Anthropic API anahtarınla çalışır. Anahtar yalnızca bu cihazda
            saklanır; ücret senin hesabından kullandıkça düşer.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium text-muted-foreground">
            API anahtarı
          </label>
          <Input
            type="password"
            value={key}
            onChange={(e) => {
              setKey(e.target.value);
              setStatus(null);
            }}
            placeholder="sk-ant-…"
            autoComplete="off"
          />
          <a
            href="https://console.anthropic.com/settings/keys"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-primary/80 hover:text-primary"
          >
            console.anthropic.com &rsaquo; anahtar al
          </a>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium text-muted-foreground">
            Model
          </label>
          <div className="flex flex-col gap-1.5">
            {AI_MODELS.map((m) => (
              <button
                key={m.id}
                onClick={() => setModel(m.id)}
                className={cn(
                  "flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition-colors",
                  model === m.id
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-card text-muted-foreground hover:text-foreground"
                )}
              >
                <span
                  className={cn(
                    "flex h-3.5 w-3.5 items-center justify-center rounded-full border",
                    model === m.id ? "border-primary" : "border-muted-foreground/40"
                  )}
                >
                  {model === m.id && (
                    <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  )}
                </span>
                <span className="flex-1">{m.label}</span>
                <span className="text-[10px] opacity-60">{m.hint}</span>
              </button>
            ))}
          </div>
        </div>

        {status && (
          <p
            className={cn(
              "text-xs",
              status.ok ? "text-emerald-400" : "text-amber-300/90"
            )}
          >
            {status.text}
          </p>
        )}

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={test}
            disabled={testing || !key.trim()}
            className="gap-1.5"
          >
            {testing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Test et
          </Button>
          <Button onClick={save}>Kaydet</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
