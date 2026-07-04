"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Pencil, Plus, Trash2 } from "lucide-react";
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
  DialogFooter,
} from "@/components/ui/dialog";
import {
  ENTRY_VALUE_TYPE_LABELS,
  type EntryType,
  type EntryValueType,
} from "@/types";
import { cn } from "@/lib/utils";

const VALUE_TYPES: EntryValueType[] = ["number", "select", "boolean", "text", "datetime-range"];

const VALUE_TYPE_META: Record<
  EntryValueType,
  { icon: string; hint: string }
> = {
  number: { icon: "123", hint: "Sayısal değer ve birim" },
  select: { icon: "☰", hint: "Önceden tanımlı seçenekler" },
  boolean: { icon: "✓/✗", hint: "Evet ya da Hayır" },
  text: { icon: "Aa", hint: "Serbest metin" },
  "datetime-range": { icon: "⏱", hint: "Başlangıç ve bitiş tarih-saati" },
};

interface FormState {
  name: string;
  valueType: EntryValueType;
  unit: string;
  choices: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  valueType: "number",
  unit: "",
  choices: "",
};

export default function ModsPage() {
  const types = useLiveQuery(() => listEntryTypes(), []);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  function openEdit(t: EntryType) {
    setEditingId(t.id);
    setForm({
      name: t.name,
      valueType: t.valueType ?? "number",
      unit: t.unit ?? "",
      choices: t.choices?.join(", ") ?? "",
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const choices =
        form.valueType === "select"
          ? form.choices
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          : undefined;

      if (editingId) {
        await updateEntryType(editingId, {
          name: form.name.trim(),
          unit: form.valueType === "number" ? form.unit.trim() : "",
          ...(choices ? { choices } : {}),
        });
      } else {
        await createEntryType({
          name: form.name.trim(),
          unit: form.valueType === "number" ? form.unit.trim() : "",
          valueType: form.valueType,
          choices,
        });
      }
      setDialogOpen(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(t: EntryType) {
    if (
      !confirm(
        `"${t.name}" modunu silmek istediğinden emin misin? Bu modu kullanan atamalar etkilenmez.`
      )
    )
      return;
    await deleteEntryType(t.id);
  }

  const isValid =
    form.name.trim() &&
    (form.valueType !== "number" || form.unit.trim()) &&
    (form.valueType !== "select" || form.choices.trim());

  const builtIns = types?.filter((t) => t.isBuiltIn) ?? [];
  const customs = types?.filter((t) => !t.isBuiltIn) ?? [];

  return (
    <>
      <PageHeader
        title="Modlar"
        description="Mod türlerini yönet"
        back="/structure"
        action={
          <Button size="sm" onClick={openCreate} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            Yeni Mod
          </Button>
        }
      />

      {/* Özel modlar */}
      <section className="mb-6">
        <div className="flex items-center justify-between px-1 mb-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Özel Modlar
          </h2>
        </div>

        {customs.length === 0 ? (
          <button
            onClick={openCreate}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-card/40 px-4 py-5 text-sm text-muted-foreground hover:bg-card/70 transition-colors"
          >
            <Plus className="h-4 w-4" />
            İlk özel modunu oluştur
          </button>
        ) : (
          <div className="flex flex-col gap-2">
            {customs.map((t) => (
              <ModRow
                key={t.id}
                type={t}
                onEdit={() => openEdit(t)}
                onDelete={() => handleDelete(t)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Yerleşik modlar */}
      <section className="mb-6">
        <div className="px-1 mb-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Yerleşik Modlar
          </h2>
        </div>
        <div className="flex flex-col gap-2">
          {builtIns.map((t) => (
            <ModRow key={t.id} type={t} />
          ))}
        </div>
      </section>

      {/* Dialog: oluştur / düzenle */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="gap-5 max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Modu düzenle" : "Yeni mod"}
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-5">
            {/* Ad */}
            <div className="flex flex-col gap-2">
              <Label htmlFor="mod-name">Ad</Label>
              <Input
                id="mod-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="örn. Kalori"
                autoFocus
              />
            </div>

            {/* Tür — düzenlemede değiştirilemez */}
            <div className="flex flex-col gap-2">
              <Label>Değer türü</Label>
              {editingId ? (
                <div className="rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground">
                  {ENTRY_VALUE_TYPE_LABELS[form.valueType]}
                  <span className="ml-2 text-xs opacity-60">(düzenlenemez)</span>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {VALUE_TYPES.map((vt) => (
                    <button
                      key={vt}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, valueType: vt }))}
                      className={cn(
                        "flex flex-col items-start rounded-xl border p-3 text-left transition-colors",
                        form.valueType === vt
                          ? "border-primary bg-primary/10"
                          : "border-border bg-card hover:bg-muted"
                      )}
                    >
                      <span
                        className={cn(
                          "mb-1 font-mono text-xs font-bold",
                          form.valueType === vt
                            ? "text-primary"
                            : "text-muted-foreground"
                        )}
                      >
                        {VALUE_TYPE_META[vt].icon}
                      </span>
                      <span
                        className={cn(
                          "text-sm font-medium",
                          form.valueType === vt
                            ? "text-primary"
                            : "text-foreground"
                        )}
                      >
                        {ENTRY_VALUE_TYPE_LABELS[vt]}
                      </span>
                      <span className="mt-0.5 text-[11px] text-muted-foreground">
                        {VALUE_TYPE_META[vt].hint}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Birim (sadece sayı) */}
            {form.valueType === "number" && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="mod-unit">Birim</Label>
                <Input
                  id="mod-unit"
                  value={form.unit}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, unit: e.target.value }))
                  }
                  placeholder="örn. km, dk, kcal, adet"
                />
              </div>
            )}

            {/* Seçenekler (sadece select) */}
            {form.valueType === "select" && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="mod-choices">
                  Seçenekler
                  <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                    virgülle ayır
                  </span>
                </Label>
                <Input
                  id="mod-choices"
                  value={form.choices}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, choices: e.target.value }))
                  }
                  placeholder="İyi, Orta, Kötü"
                />
                {form.choices.trim() && (
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {form.choices
                      .split(",")
                      .map((c) => c.trim())
                      .filter(Boolean)
                      .map((c) => (
                        <span
                          key={c}
                          className="rounded-full border border-border bg-card px-2.5 py-0.5 text-xs"
                        >
                          {c}
                        </span>
                      ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
            >
              İptal
            </Button>
            <Button onClick={handleSave} disabled={saving || !isValid}>
              {editingId ? "Kaydet" : "Oluştur"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ModRow({
  type,
  onEdit,
  onDelete,
}: {
  type: EntryType;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const vt = type.valueType ?? "number";
  let detail = ENTRY_VALUE_TYPE_LABELS[vt];
  if (vt === "number" && type.unit) detail += ` · ${type.unit}`;
  if (vt === "select" && type.choices?.length)
    detail += ` · ${type.choices.join(", ")}`;

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-3 py-3">
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm">{type.name}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{detail}</div>
      </div>

      {type.isBuiltIn ? (
        <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-[10px] font-medium text-muted-foreground">
          Yerleşik
        </span>
      ) : (
        <div className="flex items-center gap-0.5 shrink-0">
          {onEdit && (
            <button
              onClick={onEdit}
              className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              aria-label="Düzenle"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
          {onDelete && (
            <button
              onClick={onDelete}
              className="rounded-lg p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              aria-label="Sil"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
