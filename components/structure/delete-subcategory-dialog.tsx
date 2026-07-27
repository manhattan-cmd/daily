"use client";

import { useState } from "react";
import { FolderUp, Trash2 } from "lucide-react";
import { deleteSubCategory } from "@/lib/db/queries";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { SubCategory } from "@/types";

/**
 * Alt kategori silme — iki seçenek sunar:
 *  • Sadece bunu sil: girdiler ve alt kategoriler bir üst seviyeye taşınır.
 *  • Tamamen sil: girdileriyle birlikte kalıcı olarak silinir.
 * `sub` null olduğunda kapalıdır (tree'nin diğer diyaloglarıyla aynı desen).
 */
export function DeleteSubCategoryDialog({
  sub,
  parentName,
  onOpenChange,
  onDeleted,
}: {
  sub: SubCategory | null;
  /** Girdilerin/alt kategorilerin taşınacağı üstün adı (üst alt kategori ya da kategori) */
  parentName: string;
  onOpenChange: (open: boolean) => void;
  onDeleted?: (mode: "all" | "promote") => void;
}) {
  const [busy, setBusy] = useState<null | "all" | "promote">(null);

  async function run(mode: "all" | "promote") {
    if (!sub) return;
    setBusy(mode);
    try {
      await deleteSubCategory(sub.id, mode);
      onDeleted?.(mode);
      onOpenChange(false);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog
      open={sub !== null}
      onOpenChange={(o) => {
        if (!o && !busy) onOpenChange(false);
      }}
    >
      <DialogContent className="max-w-[340px] gap-4">
        <DialogHeader>
          <DialogTitle className="text-base">{`"${sub?.name ?? ""}" silinsin mi?`}</DialogTitle>
          <DialogDescription>Nasıl silineceğini seç.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          {/* Sadece bunu sil — içindekiler üste taşınır */}
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => run("promote")}
            className="flex items-start gap-3 rounded-xl border border-border bg-card px-3 py-2.5 text-left transition-colors hover:border-primary/40 hover:bg-muted/40 disabled:opacity-50"
          >
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <FolderUp className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium">Sadece bunu sil</span>
              <span className="block text-xs text-muted-foreground">
                Girdileri ve alt kategorileri &bdquo;{parentName}&rdquo; içine
                taşınır
              </span>
            </span>
          </button>

          {/* Tamamen sil */}
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => run("all")}
            className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-left transition-colors hover:border-destructive/50 hover:bg-destructive/10 disabled:opacity-50"
          >
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-destructive/15 text-destructive">
              <Trash2 className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium text-destructive">
                Tamamen sil
              </span>
              <span className="block text-xs text-muted-foreground">
                Girdileri ve alt kategorileriyle kalıcı olarak silinir
              </span>
            </span>
          </button>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy !== null}
          >
            İptal
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
