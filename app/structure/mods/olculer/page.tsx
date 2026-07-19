"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, Pencil, Plus, Trash2, X } from "lucide-react";
import { db } from "@/lib/db";
import {
  listEntryTypes,
  createEntryType,
  updateEntryType,
  deleteEntryType,
} from "@/lib/db/queries";
import { PageHeader } from "@/components/layout/page-header";
import {
  MeasureParticle,
  MeasureParticleAdd,
  MeasureParticleCore,
} from "@/components/structure/measure-particle";
import { StructureTabs } from "@/components/structure/structure-tabs";
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

type MeasureUsage = { modCount: number; modNames: string[]; valueCount: number };

export default function OlculerPage() {
  const types = useLiveQuery(() => listEntryTypes(), []);
  const [dialog, setDialog] = useState<DialogState>({ mode: "closed" });
  // Parçacığa dokununca açılan detay — düzenleme ve silme buradan
  const [selected, setSelected] = useState<EntryType | null>(null);

  // Türe göre grupla — ölçü, ilkel türün yapılandırılmış hali
  const groups = useMemo(() => {
    if (!types) return undefined;
    return MEASURE_KINDS.map((kind) => ({
      kind,
      items: types.filter((t) => (t.valueType ?? "number") === kind),
    })).filter((g) => g.items.length > 0);
  }, [types]);

  // Ölçünün kullanımı: kaç özellik bu ölçüyle ölçülüyor, kaç kayıt değeri var
  const usage = useLiveQuery(async () => {
    const [mods, values] = await Promise.all([
      db.mods.toArray(),
      db.entryValues.toArray(),
    ]);
    const map = new Map<string, MeasureUsage>();
    for (const m of mods) {
      const u =
        map.get(m.entryTypeId) ?? { modCount: 0, modNames: [], valueCount: 0 };
      u.modCount++;
      if (u.modNames.length < 4) u.modNames.push(m.name);
      map.set(m.entryTypeId, u);
    }
    for (const v of values) {
      if (!v.entryTypeId) continue;
      const u =
        map.get(v.entryTypeId) ?? { modCount: 0, modNames: [], valueCount: 0 };
      u.valueCount++;
      map.set(v.entryTypeId, u);
    }
    return map;
  }, []);

  async function handleDelete(t: EntryType) {
    if (
      !confirm(
        `"${t.name}" ölçüsünü silmek istediğinden emin misin? Bu ölçüyü kullanan özellikler etkilenmez.`
      )
    )
      return;
    await deleteEntryType(t.id);
    setSelected(null);
  }

  const selectedUsage = selected ? usage?.get(selected.id) : undefined;

  return (
    <>
      <PageHeader
        title="Yapı"
        description="Ölçüler — özelliklerin ölçüm araçları"
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

      <StructureTabs className="-mt-2 mb-5" />

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
                {/* Parçacık ızgarası — atomlarla aynı 4 sütunlu ritim */}
                <div className="grid grid-cols-4 gap-x-1.5 gap-y-1">
                  {items.map((t) => (
                    <MeasureParticle
                      key={t.id}
                      icon={KindIcon}
                      name={t.name}
                      onClick={() => setSelected(t)}
                    />
                  ))}
                  <MeasureParticleAdd
                    onClick={() => setDialog({ mode: "config", kind })}
                  />
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* Parçacık detayı — bilgi + düzenle/sil tek dialogda */}
      <Dialog
        open={selected !== null}
        onOpenChange={(o) => { if (!o) setSelected(null); }}
      >
        <DialogContent className="max-w-[340px] gap-4">
          {selected && (
            <>
              <DialogHeader className="items-center text-center">
                <MeasureParticleCore
                  icon={MEASURE_KIND_META[selected.valueType ?? "number"].icon}
                  size="lg"
                />
                <DialogTitle className="text-base pt-1">
                  {selected.name}
                </DialogTitle>
                <DialogDescription>
                  {MEASURE_KIND_META[selected.valueType ?? "number"].label}
                  {" · "}
                  {measureSummary(selected)}
                  {selected.isBuiltIn && " · yerleşik"}
                </DialogDescription>
              </DialogHeader>
              <div className="rounded-xl border border-border bg-card px-3 py-2.5 text-xs text-muted-foreground text-center">
                {selectedUsage &&
                (selectedUsage.modCount > 0 || selectedUsage.valueCount > 0) ? (
                  <>
                    {selectedUsage.modNames.length > 0 && (
                      <>
                        {selectedUsage.modNames.join(", ")}
                        {selectedUsage.modCount > selectedUsage.modNames.length &&
                          ` +${selectedUsage.modCount - selectedUsage.modNames.length}`}
                        {" · "}
                      </>
                    )}
                    {selectedUsage.valueCount} kayıt
                  </>
                ) : (
                  "henüz kullanılmadı"
                )}
              </div>
              {!selected.isBuiltIn && (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1 gap-1.5"
                    onClick={() => {
                      setDialog({
                        mode: "config",
                        kind: selected.valueType ?? "number",
                        editing: selected,
                      });
                      setSelected(null);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Düzenle
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1 gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => handleDelete(selected)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Sil
                  </Button>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

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
