"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { SlidersHorizontal, Plus, ArrowUpRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  listModifiersForTarget,
  assignModifier,
  listEntryTypes,
} from "@/lib/db/queries";
import { ENTRY_VALUE_TYPE_LABELS, type EntryType } from "@/types";
import { cn } from "@/lib/utils";

interface QuickModAddProps {
  subcategoryId: string;
  subcategoryName: string;
  categoryId: string;
}

export function QuickModAdd({
  subcategoryId,
  subcategoryName,
  categoryId,
}: QuickModAddProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [assigning, setAssigning] = useState(false);

  const mods = useLiveQuery(
    () => listModifiersForTarget("subcategory", subcategoryId),
    [subcategoryId]
  );
  const allTypes = useLiveQuery(() => listEntryTypes(), []);

  const assignedIds = new Set(mods?.map((m) => m.entryTypeId) ?? []);
  const available = allTypes?.filter((t) => !assignedIds.has(t.id)) ?? [];

  async function handleAssign(t: EntryType) {
    setAssigning(true);
    try {
      await assignModifier("subcategory", subcategoryId, t.id);
      setOpen(false);
    } finally {
      setAssigning(false);
    }
  }

  function goToStructure() {
    setOpen(false);
    router.push(`/structure/${categoryId}/${subcategoryId}`);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={cn(
          "flex items-center gap-1 rounded-lg border border-dashed px-2 py-1 text-xs transition-all active:scale-95",
          "border-border/60 text-muted-foreground/60 hover:border-border hover:text-muted-foreground"
        )}
        aria-label="Mod ekle"
      >
        <SlidersHorizontal className="h-3 w-3" />
        <span>Mod ekle</span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="gap-5 max-h-[80dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">
              {subcategoryName}
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                için mod ekle
              </span>
            </DialogTitle>
          </DialogHeader>

          {available.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <p className="text-sm text-muted-foreground">
                Eklenebilecek hazır mod kalmadı.
              </p>
              <button
                onClick={goToStructure}
                className="flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 transition-colors"
              >
                Yapıda özel mod oluştur
                <ArrowUpRight className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-2">
                {available.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => handleAssign(t)}
                    disabled={assigning}
                    className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-3 text-left transition-colors hover:bg-muted active:scale-[0.99] disabled:opacity-50"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">{t.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {ENTRY_VALUE_TYPE_LABELS[t.valueType ?? "number"]}
                        {t.unit
                          ? ` · ${t.unit}`
                          : t.choices?.length
                          ? ` · ${t.choices.join(", ")}`
                          : null}
                      </div>
                    </div>
                    <Plus className="h-4 w-4 text-muted-foreground shrink-0" />
                  </button>
                ))}
              </div>

              <button
                onClick={goToStructure}
                className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors pt-1"
              >
                Yapıda tam ayarlar
                <ArrowUpRight className="h-3 w-3" />
              </button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
