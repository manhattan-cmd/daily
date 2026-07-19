"use client";

import { useState } from "react";
import { Unlink } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  countDescendantModAttachments,
  listModifiersForTarget,
  removeModifier,
  removeModifierCascade,
  type CategoryModifierWithType,
} from "@/lib/db/queries";
import { ModPickDialog } from "@/components/structure/mod-pick-dialog";
import {
  ModAtom,
  ModAtomAdd,
  ModAtomCore,
  modAtomIcon,
} from "@/components/structure/mod-atom";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { measureSummary } from "@/lib/measure-kinds";

interface ModifierSectionProps {
  targetType: "category" | "subcategory";
  targetId: string;
  targetName: string;
}

export function ModifierSection({
  targetType,
  targetId,
  targetName,
}: ModifierSectionProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  // Atoma dokununca açılan detay — çıkarma da buradan
  const [selected, setSelected] = useState<CategoryModifierWithType | null>(
    null
  );
  // null: detay görünümü; sayı: "altlardan da kaldırılsın mı?" görünümü
  const [cascadeCount, setCascadeCount] = useState<number | null>(null);

  const mods = useLiveQuery(
    () => listModifiersForTarget(targetType, targetId),
    [targetType, targetId]
  );

  function closeDetail() {
    setSelected(null);
    setCascadeCount(null);
  }

  async function handleDetach() {
    if (!selected) return;
    const count = selected.modId
      ? await countDescendantModAttachments(targetType, targetId, selected.modId)
      : 0;
    if (count === 0) {
      await removeModifier(selected.id);
      closeDetail();
      return;
    }
    // Altlarda da ekli — aynı dialog içinde soruya geç
    setCascadeCount(count);
  }

  async function handleDetachOnlyHere() {
    if (!selected) return;
    await removeModifier(selected.id);
    closeDetail();
  }

  async function handleDetachCascade() {
    if (!selected) return;
    await removeModifierCascade(selected.id);
    closeDetail();
  }

  return (
    <section className="mb-6">
      <h2 className="px-1 mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Özellikler
      </h2>
      <div className="grid grid-cols-4 gap-x-1.5 gap-y-1">
        {(mods ?? []).map((mod) => (
          <ModAtom
            key={mod.id}
            icon={modAtomIcon(mod)}
            name={mod.name ?? mod.entryType.name}
            onClick={() => setSelected(mod)}
          />
        ))}
        <ModAtomAdd label="Özellik ekle" onClick={() => setPickerOpen(true)} />
      </div>

      {/* Atom detayı — ölçüsü + buradan çıkarma */}
      <Dialog
        open={selected !== null}
        onOpenChange={(o) => { if (!o) closeDetail(); }}
      >
        <DialogContent className="max-w-[340px] gap-4">
          {selected && cascadeCount === null && (
            <>
              <DialogHeader className="items-center text-center">
                <ModAtomCore icon={modAtomIcon(selected)} size="lg" />
                <DialogTitle className="text-base pt-1">
                  {selected.name ?? selected.entryType.name}
                </DialogTitle>
                <DialogDescription>
                  {measureSummary(selected.entryType)}
                </DialogDescription>
              </DialogHeader>
              <Button
                variant="outline"
                className="gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={handleDetach}
              >
                <Unlink className="h-3.5 w-3.5" />
                &bdquo;{targetName}&rdquo; içinden çıkar
              </Button>
              <p className="text-center text-[11px] text-muted-foreground/60 -mt-2">
                Özellik havuzda kalır, yalnızca buradan ayrılır
              </p>
            </>
          )}

          {/* Altlarda da ekliyse: aynı dialogda kapsam sorusu */}
          {selected && cascadeCount !== null && (
            <>
              <DialogHeader className="items-center text-center">
                <ModAtomCore icon={modAtomIcon(selected)} size="lg" />
                <DialogTitle className="text-base pt-1">
                  Alt kategorilerden de çıkarılsın mı?
                </DialogTitle>
                <DialogDescription>
                  &bdquo;{selected.name ?? selected.entryType.name}&rdquo;{" "}
                  bunun altındaki {cascadeCount} alt kategoriye de ekli.
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-2">
                <Button
                  variant="outline"
                  className="gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={handleDetachCascade}
                >
                  <Unlink className="h-3.5 w-3.5" />
                  Hepsinden çıkar ({cascadeCount + 1})
                </Button>
                <Button variant="outline" onClick={handleDetachOnlyHere}>
                  Yalnızca &bdquo;{targetName}&rdquo; içinden çıkar
                </Button>
                <Button
                  variant="ghost"
                  className="text-muted-foreground"
                  onClick={() => setCascadeCount(null)}
                >
                  Vazgeç
                </Button>
              </div>
              <p className="text-center text-[11px] text-muted-foreground/60 -mt-2">
                Bu özellikle girilmiş kayıtlara dokunulmaz
              </p>
            </>
          )}
        </DialogContent>
      </Dialog>

      <ModPickDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        targetType={targetType}
        targetId={targetId}
        targetName={targetName}
      />
    </section>
  );
}
