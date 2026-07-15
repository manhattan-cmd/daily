"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, Pencil, Plus, Sparkles, Trash2, X } from "lucide-react";
import {
  listEntryTypes,
  createEntryType,
  updateEntryType,
  deleteEntryType,
} from "@/lib/db/queries";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  MEASURE_KINDS,
  MEASURE_KIND_META,
  measureSummary,
} from "@/lib/measure-kinds";
import type { EntryType, EntryValueType } from "@/types";
import { cn } from "@/lib/utils";

type DialogState =
  | { mode: "closed" }
  | { mode: "kind" }
  | { mode: "config"; kind: EntryValueType; editing?: EntryType };

export default function OlculerPage() {
  const types = useLiveQuery(() => listEntryTypes(), []);
  const [dialog, setDialog] = useState<DialogState>({ mode: "closed" });

  // Türe göre grupla — ölçü, ilkel türün yapılandırılmış hali
  const groups = useMemo(() => {
    if (!types) return undefined;
    return MEASURE_KINDS.map((kind) => ({
      kind,
      items: types.filter((t) => (t.valueType ?? "number") === kind),
    })).filter((g) => g.items.length > 0);
  }, [types]);

  async function handleDelete(t: EntryType) {
    if (
      !confirm(
        `"${t.name}" ölçüsünü silmek istediğinden emin misin? Bu ölçüyü kullanan özellikler etkilenmez.`
      )
    )
      return;
    await deleteEntryType(t.id);
  }

  return (
    <>
      <PageHeader
        title="Ölçüler"
        description="Özelliklerin ölçüm araçları — bir ilkel tür seç, yapılandır"
        back="/structure/mods"
        action={
          <Button
            size="sm"
            onClick={() => setDialog({ mode: "kind" })}
            className="gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            Yeni Ölçü
          </Button>
        }
      />

      {groups === undefined ? null : (
        <div className="flex flex-col gap-6 mb-6">
          {groups.map(({ kind, items }) => {
            const meta = MEASURE_KIND_META[kind];
            const KindIcon = meta.icon;
            return (
              <section key={kind}>
                <div className="flex items-center gap-2 px-1 mb-2.5">
                  <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary/10">
                    <KindIcon className="h-3.5 w-3.5 text-primary" />
                  </span>
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {meta.label}
                  </h2>
                  <span className="text-xs text-muted-foreground/50">
                    · {items.length}
                  </span>
                </div>
                <div className="flex flex-col gap-1.5">
                  {items.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm flex items-center gap-1.5 truncate">
                          {t.name}
                          {t.isBuiltIn && (
                            <Sparkles className="h-3 w-3 shrink-0 text-muted-foreground/50" />
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {measureSummary(t)}
                        </div>
                      </div>
                      {!t.isBuiltIn && (
                        <>
                          <button
                            onClick={() =>
                              setDialog({
                                mode: "config",
                                kind: t.valueType ?? "number",
                                editing: t,
                              })
                            }
                            className="shrink-0 rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                            aria-label={`${t.name} ölçüsünü düzenle`}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(t)}
                            className="shrink-0 rounded-lg p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                            aria-label={`${t.name} ölçüsünü sil`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <MeasureDialog dialog={dialog} onChange={setDialog} />
    </>
  );
}

// ─── Oluştur / düzenle ────────────────────────────────────────────────────────

function MeasureDialog({
  dialog,
  onChange,
}: {
  dialog: DialogState;
  onChange: (s: DialogState) => void;
}) {
  const open = dialog.mode !== "closed";

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onChange({ mode: "closed" }); }}>
      <DialogContent className="gap-4 max-h-[85dvh] overflow-y-auto">
        {dialog.mode === "kind" && (
          <>
            <DialogHeader>
              <DialogTitle className="text-base">Yeni ölçü</DialogTitle>
              <DialogDescription>Önce ilkel türünü seç</DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-2">
              {MEASURE_KINDS.map((kind) => {
                const meta = MEASURE_KIND_META[kind];
                const KindIcon = meta.icon;
                return (
                  <button
                    key={kind}
                    onClick={() => onChange({ mode: "config", kind })}
                    className="flex flex-col items-start gap-2 rounded-2xl border border-border bg-card p-3.5 text-left transition-all hover:border-primary/40 hover:bg-muted/40 active:scale-[0.98]"
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10">
                      <KindIcon className="h-4 w-4 text-primary" />
                    </span>
                    <span className="text-sm font-medium">{meta.label}</span>
                    <span className="text-[11px] leading-snug text-muted-foreground">
                      {meta.hint}
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {dialog.mode === "config" && (
          <MeasureConfig
            kind={dialog.kind}
            editing={dialog.editing}
            onBack={() => onChange(dialog.editing ? { mode: "closed" } : { mode: "kind" })}
            onDone={() => onChange({ mode: "closed" })}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function MeasureConfig({
  kind,
  editing,
  onBack,
  onDone,
}: {
  kind: EntryValueType;
  editing?: EntryType;
  onBack: () => void;
  onDone: () => void;
}) {
  const meta = MEASURE_KIND_META[kind];
  const KindIcon = meta.icon;
  const [name, setName] = useState(editing?.name ?? "");
  const [unit, setUnit] = useState(editing?.unit ?? "");
  const [options, setOptions] = useState<string[]>(editing?.choices ?? []);
  const [optionInput, setOptionInput] = useState("");
  const [saving, setSaving] = useState(false);

  function addOption() {
    const v = optionInput.trim();
    if (!v || options.includes(v)) return;
    setOptions((prev) => [...prev, v]);
    setOptionInput("");
  }

  const isValid =
    name.trim() &&
    (kind !== "number" || unit.trim()) &&
    (kind !== "select" || options.length >= 2);

  async function handleSave() {
    if (!isValid) return;
    setSaving(true);
    try {
      if (editing) {
        await updateEntryType(editing.id, {
          name: name.trim(),
          unit: kind === "number" ? unit.trim() : "",
          ...(kind === "select" ? { choices: options } : {}),
        });
      } else {
        await createEntryType({
          name: name.trim(),
          unit: kind === "number" ? unit.trim() : "",
          valueType: kind,
          choices: kind === "select" ? options : undefined,
        });
      }
      onDone();
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-base flex items-center gap-2">
          <button
            onClick={onBack}
            className="h-6 w-6 -ml-1 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Geri"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
          </button>
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary/10">
            <KindIcon className="h-3.5 w-3.5 text-primary" />
          </span>
          {editing ? "Ölçüyü düzenle" : meta.label}
        </DialogTitle>
        <DialogDescription>{meta.hint}</DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-2">
        <Label htmlFor="measure-name">Ölçü adı</Label>
        <Input
          id="measure-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={
            kind === "select"
              ? "örn. Evet/Hayır/Belki"
              : kind === "number"
              ? "örn. Bardak"
              : "örn. Ruh Hâli Notu"
          }
          autoFocus
        />
      </div>

      {kind === "number" && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="measure-unit">Birim</Label>
          <Input
            id="measure-unit"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder="örn. bardak, sayfa, km"
          />
        </div>
      )}

      {kind === "select" && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="measure-option">
            Seçenekler
            <span className="ml-1.5 text-xs font-normal text-muted-foreground">
              en az 2
            </span>
          </Label>
          <div className="flex gap-2">
            <Input
              id="measure-option"
              value={optionInput}
              onChange={(e) => setOptionInput(e.target.value)}
              placeholder="Seçenek yaz, Enter'a bas"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addOption();
                }
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={addOption}
              disabled={!optionInput.trim()}
              aria-label="Seçenek ekle"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          {options.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-1">
              {options.map((c) => (
                <span
                  key={c}
                  className="flex items-center gap-1 rounded-full border border-border bg-muted/40 pl-2.5 pr-1 py-0.5 text-xs"
                >
                  {c}
                  <button
                    onClick={() =>
                      setOptions((prev) => prev.filter((o) => o !== c))
                    }
                    className="rounded-full p-0.5 text-muted-foreground hover:text-destructive transition-colors"
                    aria-label={`${c} seçeneğini kaldır`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <DialogFooter>
        <Button variant="outline" onClick={onDone} disabled={saving}>
          İptal
        </Button>
        <Button onClick={handleSave} disabled={saving || !isValid}>
          {editing ? "Kaydet" : "Oluştur"}
        </Button>
      </DialogFooter>
    </>
  );
}
