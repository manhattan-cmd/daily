"use client";

import { Layers, PenLine } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface AddTypeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categoryLabel: string;
  categoryDescription: string;
  objectLabel: string;
  objectDescription: string;
  onSelectCategory: () => void;
  onSelectObject: () => void;
}

export function AddTypeModal({
  open,
  onOpenChange,
  categoryLabel,
  categoryDescription,
  objectLabel,
  objectDescription,
  onSelectCategory,
  onSelectObject,
}: AddTypeModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-6">
        <DialogHeader>
          <DialogTitle>Ne eklemek istiyorsun?</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {/* Kategori seçeneği */}
          <button
            onClick={() => { onOpenChange(false); onSelectCategory(); }}
            className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:bg-muted active:scale-[0.99]"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <Layers className="h-6 w-6 text-primary" />
            </div>
            <div>
              <div className="font-semibold">{categoryLabel}</div>
              <div className="mt-0.5 text-sm text-muted-foreground">
                {categoryDescription}
              </div>
            </div>
          </button>

          {/* İkinci seçenek */}
          <button
            onClick={() => { onOpenChange(false); onSelectObject(); }}
            className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:bg-muted active:scale-[0.99]"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10">
              <PenLine className="h-6 w-6 text-emerald-500" />
            </div>
            <div>
              <div className="font-semibold">{objectLabel}</div>
              <div className="mt-0.5 text-sm text-muted-foreground">
                {objectDescription}
              </div>
            </div>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
