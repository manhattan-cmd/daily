"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SlidersHorizontal } from "lucide-react";
import { ModPickDialog } from "@/components/structure/mod-pick-dialog";
import { ModInput } from "@/components/calendar/day-entry-sheet";
import {
  addEntryValue,
  type CategoryModifierWithType,
  type ModWithType,
} from "@/lib/db/queries";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface QuickModAddProps {
  subcategoryId: string;
  subcategoryName: string;
  categoryId: string;
  /** Değer sorma adımı için: özelliğin ekleneceği girdi */
  entryId: string;
  occurredAt: number;
}

/** ModInput'un beklediği atama biçimine sar — havuz modu + ölçüsü yeterli */
function toModifierLike(
  m: ModWithType,
  subcategoryId: string
): CategoryModifierWithType {
  return {
    id: m.id,
    modId: m.id,
    name: m.name,
    targetType: "subcategory",
    targetId: subcategoryId,
    entryTypeId: m.entryTypeId,
    order: 0,
    createdAt: m.createdAt,
    entryType: m.entryType,
    mod: m,
  };
}

export function QuickModAdd({
  subcategoryId,
  subcategoryName,
  entryId,
  occurredAt,
}: QuickModAddProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // Eklenen özellik için değer sorma adımı (isteğe bağlı — "Şimdi değil" geçer)
  const [valueFor, setValueFor] = useState<ModWithType | null>(null);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  const d = new Date(occurredAt);
  const entryDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const vt = valueFor?.entryType.valueType ?? "number";
  const canSave = (() => {
    if (!valueFor) return false;
    if (vt === "boolean") return true;
    if (vt === "datetime-range") {
      try {
        const { start, end } = JSON.parse(value);
        return !!(start || end);
      } catch {
        return false;
      }
    }
    return value.trim().length > 0;
  })();

  async function saveValue() {
    if (!valueFor || !canSave) return;
    setSaving(true);
    try {
      await addEntryValue(entryId, {
        entryTypeId: valueFor.entryTypeId,
        modId: valueFor.id,
        value: vt === "boolean" && !value ? "false" : value,
      });
      setValueFor(null);
      setValue("");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={cn(
          "flex items-center gap-1 rounded-lg border border-dashed px-2 py-1 text-xs transition-all active:scale-95",
          "border-border/60 text-muted-foreground/60 hover:border-border hover:text-muted-foreground"
        )}
        aria-label="Özellik ekle"
      >
        <SlidersHorizontal className="h-3 w-3" />
        <span>Özellik ekle</span>
      </button>

      <ModPickDialog
        open={open}
        onOpenChange={setOpen}
        targetType="subcategory"
        targetId={subcategoryId}
        targetName={subcategoryName}
        onGoToMeasures={() => {
          setOpen(false);
          router.push("/structure/mods/olculer");
        }}
        onAttached={(m) => {
          setValue(m.entryType.valueType === "boolean" ? "false" : "");
          setValueFor(m);
        }}
      />

      {/* Değer sorma — girdiden özellik ekleyen muhtemelen değer girmek istiyordur */}
      <Dialog
        open={!!valueFor}
        onOpenChange={(o) => {
          if (!o) setValueFor(null);
        }}
      >
        {valueFor && (
          <DialogContent className="gap-4">
            <DialogHeader>
              <DialogTitle className="text-base">Değerini hemen gir</DialogTitle>
              <DialogDescription>
                &bdquo;{valueFor.name}&rdquo; eklendi — istersen bu girdi için
                değerini de kaydet.
              </DialogDescription>
            </DialogHeader>
            <ModInput
              mod={toModifierLike(valueFor, subcategoryId)}
              value={value}
              onChange={setValue}
              entryDate={entryDate}
            />
            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => setValueFor(null)}
                disabled={saving}
              >
                Şimdi değil
              </Button>
              <Button onClick={saveValue} disabled={!canSave || saving}>
                {saving ? "Kaydediliyor..." : "Kaydet"}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}
