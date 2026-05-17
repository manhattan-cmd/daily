"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { listEntryTypes, updateEntry } from "@/lib/db/queries";
import {
  EntryFormFields,
  isRowValid,
  type TypeValueRow,
} from "@/components/forms/entry-form-fields";
import type { EntryWithContext, EntryType } from "@/types";

interface EditEntryModalProps {
  entry: EntryWithContext;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditEntryModal({
  entry,
  open,
  onOpenChange,
}: EditEntryModalProps) {
  const queriedTypes = useLiveQuery(() => listEntryTypes(), []);

  const [types, setTypes] = useState<EntryType[]>([]);
  if (queriedTypes && queriedTypes.length !== types.length) {
    setTypes(queriedTypes);
  }

  const [title, setTitle] = useState(entry.title ?? "");
  const [rows, setRows] = useState<TypeValueRow[]>(() => {
    const typed = entry.values.filter((v) => v.entryTypeId);
    return typed.length > 0
      ? typed.map((v) => ({ entryTypeId: v.entryTypeId!, value: v.value }))
      : [{ entryTypeId: "", value: "" }];
  });
  const [occurredAt, setOccurredAt] = useState(() => {
    const d = new Date(entry.occurredAt);
    d.setSeconds(0, 0);
    return d.toISOString().slice(0, 16);
  });
  const [showDate, setShowDate] = useState(true);
  const [notes, setNotes] = useState(entry.notes ?? "");
  const [showNotes, setShowNotes] = useState(!!entry.notes);
  const [saving, setSaving] = useState(false);

  const validRows = rows.filter((r) => {
    const t = types.find((t) => t.id === r.entryTypeId);
    return isRowValid(r, t);
  });
  const isFormValid = title.trim() && validRows.length > 0;

  async function handleSave() {
    if (!isFormValid) return;
    setSaving(true);
    try {
      await updateEntry(entry.id, {
        title: title.trim(),
        typeValues: validRows.map((r) => ({
          entryTypeId: r.entryTypeId,
          value: r.value.trim(),
        })),
        occurredAt: new Date(occurredAt).getTime(),
        notes: notes.trim() || undefined,
      });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto gap-5">
        <DialogHeader>
          <DialogTitle>Girdiyi Düzenle</DialogTitle>
        </DialogHeader>

        <EntryFormFields
          types={types}
          onTypesChange={setTypes}
          title={title}
          onTitleChange={setTitle}
          rows={rows}
          onRowsChange={setRows}
          occurredAt={occurredAt}
          onOccurredAtChange={setOccurredAt}
          showDate={showDate}
          onShowDateChange={setShowDate}
          notes={notes}
          onNotesChange={setNotes}
          showNotes={showNotes}
          onShowNotesChange={setShowNotes}
        />

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            İptal
          </Button>
          <Button onClick={handleSave} disabled={saving || !isFormValid}>
            Kaydet
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
