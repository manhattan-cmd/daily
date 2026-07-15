"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { listModifiersForTarget, removeModifier } from "@/lib/db/queries";
import { ModPickDialog } from "@/components/structure/mod-pick-dialog";
import { ENTRY_VALUE_TYPE_LABELS } from "@/types";

interface ModifierSectionProps {
  targetType: "category" | "subcategory";
  targetId: string;
  targetName: string;
  /** Başlığın altında görünen bağlama özel tek satır açıklama */
  description?: string;
  /** Boş durumda gösterilen, mod kavramını anlatan metin */
  emptyText?: string;
}

export function ModifierSection({
  targetType,
  targetId,
  targetName,
  description,
  emptyText,
}: ModifierSectionProps) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const mods = useLiveQuery(
    () => listModifiersForTarget(targetType, targetId),
    [targetType, targetId]
  );

  async function handleDetach(attachmentId: string) {
    await removeModifier(attachmentId);
  }

  return (
    <section className="flex flex-col gap-3 mb-6">
      <div className="px-1">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Modlar
          </h2>
          <button
            onClick={() => setPickerOpen(true)}
            className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Mod ekle
          </button>
        </div>
        {description && (
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground/70">
            {description}
          </p>
        )}
      </div>

      {!mods || mods.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/40 px-4 py-4">
          <p className="text-xs leading-relaxed text-muted-foreground">
            {emptyText ??
              "Mod, girdi eklerken sorulan ölçü — Para (₺), Süre (dk), Miktar (adet) gibi. Havuzdan seç ya da kendi modunu yarat."}
          </p>
          <button
            onClick={() => setPickerOpen(true)}
            className="mt-2 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
          >
            Mod ekle →
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {mods.map((mod) => (
            <div
              key={mod.id}
              className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5"
            >
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">
                  {mod.name ?? mod.entryType.name}
                </div>
                <div className="text-xs text-muted-foreground">
                  {mod.entryType.name !== (mod.name ?? "") &&
                    `${mod.entryType.name} · `}
                  {ENTRY_VALUE_TYPE_LABELS[mod.entryType.valueType ?? "number"]}
                  {mod.entryType.unit
                    ? ` · ${mod.entryType.unit}`
                    : mod.entryType.choices?.length
                    ? ` · ${mod.entryType.choices.join(", ")}`
                    : null}
                </div>
              </div>
              <button
                onClick={() => handleDetach(mod.id)}
                className="shrink-0 rounded-lg p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                aria-label={`${mod.name ?? mod.entryType.name} modunu buradan çıkar`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

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
