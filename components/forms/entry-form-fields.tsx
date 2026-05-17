"use client";

import { useState } from "react";
import { Plus, X, Calendar, Settings2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { createEntryType, deleteEntryType } from "@/lib/db/queries";
import {
  ENTRY_VALUE_TYPE_LABELS,
  type EntryType,
  type EntryValueType,
} from "@/types";

export type TypeValueRow = { entryTypeId: string; value: string };

interface EntryFormFieldsProps {
  types: EntryType[];
  onTypesChange: (types: EntryType[]) => void;
  title: string;
  onTitleChange: (v: string) => void;
  rows: TypeValueRow[];
  onRowsChange: (rows: TypeValueRow[]) => void;
  occurredAt: string;
  onOccurredAtChange: (v: string) => void;
  showDate: boolean;
  onShowDateChange: (v: boolean) => void;
  notes: string;
  onNotesChange: (v: string) => void;
  showNotes: boolean;
  onShowNotesChange: (v: boolean) => void;
}

export function EntryFormFields({
  types,
  onTypesChange,
  title,
  onTitleChange,
  rows,
  onRowsChange,
  occurredAt,
  onOccurredAtChange,
  showDate,
  onShowDateChange,
  notes,
  onNotesChange,
  showNotes,
  onShowNotesChange,
}: EntryFormFieldsProps) {
  const [addTypeOpen, setAddTypeOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [pendingRowIndex, setPendingRowIndex] = useState<number | null>(null);
  const [newTypeName, setNewTypeName] = useState("");
  const [newTypeUnit, setNewTypeUnit] = useState("");
  const [newTypeValueType, setNewTypeValueType] =
    useState<EntryValueType>("number");
  const [newTypeChoices, setNewTypeChoices] = useState("");
  const [creatingType, setCreatingType] = useState(false);

  function handleTypeSelect(rowIndex: number, typeId: string) {
    if (typeId === "__new__") {
      setPendingRowIndex(rowIndex);
      setAddTypeOpen(true);
      return;
    }
    const selectedType = types.find((t) => t.id === typeId);
    const vt = selectedType?.valueType ?? "number";
    const defaultValue = vt === "boolean" ? "false" : "";
    const next = [...rows];
    next[rowIndex] = { entryTypeId: typeId, value: defaultValue };
    onRowsChange(next);
  }

  function handleValueChange(rowIndex: number, val: string) {
    const next = [...rows];
    next[rowIndex] = { ...next[rowIndex], value: val };
    onRowsChange(next);
  }

  function addRow() {
    onRowsChange([...rows, { entryTypeId: "", value: "" }]);
  }

  function removeRow(i: number) {
    onRowsChange(rows.filter((_, idx) => idx !== i));
  }

  // Sadece sayı tipi için birim zorunlu; metin, evet/hayır, seçenek için değil
  function isCreateValid() {
    if (!newTypeName.trim()) return false;
    if (newTypeValueType === "number" && !newTypeUnit.trim()) return false;
    if (newTypeValueType === "select" && !newTypeChoices.trim()) return false;
    return true;
  }

  async function handleCreateType() {
    if (!isCreateValid()) return;
    setCreatingType(true);
    try {
      const choices =
        newTypeValueType === "select"
          ? newTypeChoices
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          : undefined;
      const created = await createEntryType({
        name: newTypeName.trim(),
        unit: newTypeValueType === "number" ? newTypeUnit.trim() : "",
        valueType: newTypeValueType,
        choices,
      });
      const updated = [...types, created];
      onTypesChange(updated);
      if (pendingRowIndex !== null) {
        const vt = created.valueType ?? "number";
        const next = [...rows];
        next[pendingRowIndex] = {
          entryTypeId: created.id,
          value: vt === "boolean" ? "false" : "",
        };
        onRowsChange(next);
      }
      setAddTypeOpen(false);
      setNewTypeName("");
      setNewTypeUnit("");
      setNewTypeValueType("number");
      setNewTypeChoices("");
      setPendingRowIndex(null);
    } finally {
      setCreatingType(false);
    }
  }

  async function handleDeleteType(typeId: string) {
    await deleteEntryType(typeId);
    const updated = types.filter((t) => t.id !== typeId);
    onTypesChange(updated);
    // Silinmiş türü kullanan satırları temizle
    onRowsChange(
      rows.map((r) =>
        r.entryTypeId === typeId ? { entryTypeId: "", value: "" } : r
      )
    );
  }

  return (
    <>
      {/* Başlık */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="ef-title">Başlık</Label>
        <Input
          id="ef-title"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="örn. Kasım Elektrik Faturası"
        />
      </div>

      {/* Değerler */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label>Değerler</Label>
          <button
            type="button"
            onClick={() => setManageOpen(true)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Settings2 className="h-3 w-3" />
            Türleri yönet
          </button>
        </div>

        <div className="flex flex-col gap-2">
          {rows.map((row, i) => {
            const selectedType = types.find((t) => t.id === row.entryTypeId);
            return (
              <div key={i} className="flex items-center gap-2">
                {/* Tür seç */}
                <Select
                  value={row.entryTypeId}
                  onValueChange={(v) => handleTypeSelect(i, v)}
                >
                  <SelectTrigger className="w-[130px] shrink-0">
                    <SelectValue placeholder="Tür seç" />
                  </SelectTrigger>
                  <SelectContent>
                    {types.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                    <SelectItem value="__new__">
                      <span className="flex items-center gap-1.5 text-primary">
                        <Plus className="h-3.5 w-3.5" />
                        Yeni tür
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>

                {/* Değer giriş alanı */}
                <div className="flex-1 min-w-0">
                  <ValueInput
                    entryType={selectedType}
                    value={row.value}
                    onChange={(v) => handleValueChange(i, v)}
                  />
                </div>

                {/* Birim etiketi (sadece sayı tipi) */}
                <div
                  className={cn(
                    "shrink-0 w-10 text-center text-sm text-muted-foreground",
                    (!selectedType ||
                      (selectedType.valueType ?? "number") !== "number") &&
                      "invisible"
                  )}
                >
                  {selectedType?.unit ?? ""}
                </div>

                {/* Sil butonu */}
                {rows.length > 1 ? (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => removeRow(i)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                ) : (
                  <div className="w-9 shrink-0" />
                )}
              </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={addRow}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
        >
          <Plus className="h-3.5 w-3.5" />
          Değer ekle
        </button>
      </div>

      {/* Tarih (opsiyonel) */}
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => onShowDateChange(!showDate)}
          className={cn(
            "flex items-center gap-1.5 text-sm transition-colors w-fit",
            showDate
              ? "text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Calendar className="h-3.5 w-3.5" />
          {showDate ? "Tarih seçildi" : "Tarih seç (varsayılan: şimdi)"}
        </button>
        {showDate && (
          <Input
            type="datetime-local"
            value={occurredAt}
            onChange={(e) => onOccurredAtChange(e.target.value)}
          />
        )}
      </div>

      {/* Not (opsiyonel) */}
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => onShowNotesChange(!showNotes)}
          className={cn(
            "flex items-center gap-1.5 text-sm transition-colors w-fit",
            showNotes
              ? "text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Plus
            className={cn(
              "h-3.5 w-3.5 transition-transform",
              showNotes && "rotate-45"
            )}
          />
          Not ekle
        </button>
        {showNotes && (
          <Textarea
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
            placeholder="Bu girdiyle ilgili bir not..."
            rows={3}
          />
        )}
      </div>

      {/* Türleri yönet dialogu */}
      <Dialog open={manageOpen} onOpenChange={setManageOpen}>
        <DialogContent className="max-h-[80dvh] overflow-y-auto gap-4">
          <DialogHeader>
            <DialogTitle>Girdi türleri</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-2">
            {types.map((t) => (
              <div
                key={t.id}
                className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">{t.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {ENTRY_VALUE_TYPE_LABELS[t.valueType ?? "number"]}
                    {t.unit && t.valueType !== "boolean" && t.valueType !== "text" && (
                      <span className="ml-1">· {t.unit}</span>
                    )}
                    {t.choices?.length ? (
                      <span className="ml-1">· {t.choices.join(", ")}</span>
                    ) : null}
                  </div>
                </div>
                {t.isBuiltIn ? (
                  <span className="text-xs text-muted-foreground shrink-0">
                    Yerleşik
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleDeleteType(t.id)}
                    className="shrink-0 rounded-lg p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    aria-label={`${t.name} türünü sil`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => {
              setManageOpen(false);
              setAddTypeOpen(true);
            }}
            className="flex items-center gap-2 rounded-xl border border-dashed border-border p-3 text-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors w-full justify-center"
          >
            <Plus className="h-4 w-4" />
            Yeni tür ekle
          </button>
        </DialogContent>
      </Dialog>

      {/* Yeni tür dialogu */}
      <Dialog open={addTypeOpen} onOpenChange={setAddTypeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Yeni girdi türü</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            {/* İsim */}
            <div className="flex flex-col gap-2">
              <Label htmlFor="nt-name">İsim</Label>
              <Input
                id="nt-name"
                value={newTypeName}
                onChange={(e) => setNewTypeName(e.target.value)}
                placeholder="örn. Kalori"
                autoFocus
              />
            </div>

            {/* Değer tipi */}
            <div className="flex flex-col gap-2">
              <Label>Değer tipi</Label>
              <div className="grid grid-cols-2 gap-2">
                {(
                  Object.entries(ENTRY_VALUE_TYPE_LABELS) as [
                    EntryValueType,
                    string,
                  ][]
                ).map(([vt, label]) => (
                  <button
                    key={vt}
                    type="button"
                    onClick={() => setNewTypeValueType(vt)}
                    className={cn(
                      "rounded-xl border p-2.5 text-sm text-left transition-colors",
                      newTypeValueType === vt
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-input text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Birim (sadece sayı tipi) */}
            {newTypeValueType === "number" && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="nt-unit">Birim</Label>
                <Input
                  id="nt-unit"
                  value={newTypeUnit}
                  onChange={(e) => setNewTypeUnit(e.target.value)}
                  placeholder="örn. kcal"
                />
              </div>
            )}

            {/* Seçenekler (seçenek tipi) */}
            {newTypeValueType === "select" && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="nt-choices">
                  Seçenekler{" "}
                  <span className="text-muted-foreground">(virgülle ayır)</span>
                </Label>
                <Input
                  id="nt-choices"
                  value={newTypeChoices}
                  onChange={(e) => setNewTypeChoices(e.target.value)}
                  placeholder="İyi, Orta, Kötü"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAddTypeOpen(false)}
              disabled={creatingType}
            >
              İptal
            </Button>
            <Button
              onClick={handleCreateType}
              disabled={creatingType || !isCreateValid()}
            >
              Ekle
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ValueInput({
  entryType,
  value,
  onChange,
}: {
  entryType: EntryType | undefined;
  value: string;
  onChange: (v: string) => void;
}) {
  if (!entryType) {
    return (
      <Input
        type="text"
        value=""
        placeholder="Önce tür seç"
        disabled
        readOnly
      />
    );
  }

  const vt = entryType.valueType ?? "number";

  switch (vt) {
    case "number":
      return (
        <Input
          type="number"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="0"
          step="any"
        />
      );
    case "text":
      return (
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Metin gir..."
        />
      );
    case "boolean":
      return (
        <button
          type="button"
          onClick={() => onChange(value === "true" ? "false" : "true")}
          className={cn(
            "flex h-9 w-full items-center justify-center rounded-lg border text-sm font-medium transition-colors",
            value === "true"
              ? "border-primary bg-primary/10 text-primary"
              : "border-border bg-input text-muted-foreground"
          )}
        >
          {value === "true" ? "Evet" : "Hayır"}
        </button>
      );
    case "select": {
      const choices = entryType.choices ?? [];
      return (
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger>
            <SelectValue placeholder="Seçenek seç" />
          </SelectTrigger>
          <SelectContent>
            {choices.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
  }
}

export function isRowValid(
  row: TypeValueRow,
  entryType: EntryType | undefined
): boolean {
  if (!row.entryTypeId || !entryType) return false;
  const vt = entryType.valueType ?? "number";
  if (vt === "boolean") return true;
  if (vt === "number") return row.value !== "" && !isNaN(Number(row.value));
  return row.value.trim() !== "";
}

export function formatTypedValue(value: string, entryType: EntryType): string {
  const vt = entryType.valueType ?? "number";
  if (vt === "boolean") return value === "true" ? "Evet" : "Hayır";
  return value;
}
