"use client";

import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { RotateCcw, Trash2 } from "lucide-react";
import {
  latestUndoableBatch,
  undoBatch,
  UNDO_WINDOW_MS,
} from "@/lib/db/deletions";

/**
 * Silme sonrası "Geri al" şeridi. Uygulama kabuğunda duruyor: silme nerede
 * olursa olsun (gün sayfası toplu silme, girdi menüsü, hedef kartı, yapı
 * ağacı) şerit çıkar. Kaynağı silme günlüğü — geri alma kaydı payload'ından
 * aynen yerine koyar.
 */
export function UndoBar() {
  const batch = useLiveQuery(() => latestUndoableBatch(), []);
  /** Süresi dolan ya da kullanıcının kapattığı grup */
  const [hidden, setHidden] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Canlı sorgu zamanla tetiklenmez; pencerenin bitişini burada sayıyoruz
  useEffect(() => {
    if (!batch) return;
    const left = batch.deletedAt + UNDO_WINDOW_MS - Date.now();
    const t = setTimeout(() => setHidden(batch.batchId), Math.max(left, 0));
    return () => clearTimeout(t);
  }, [batch]);

  if (!batch || hidden === batch.batchId) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-[4.75rem]">
      <div className="animate-in pointer-events-auto flex w-full items-center gap-2 rounded-2xl border border-white/10 bg-[#17171c] px-3 py-2.5 shadow-[0_8px_30px_rgba(0,0,0,0.7)]">
        <Trash2 className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-sm">
          <span className="font-medium">{batch.label}</span>
          <span className="text-muted-foreground"> deleted</span>
        </span>
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await undoBatch(batch.batchId);
            } finally {
              setBusy(false);
            }
          }}
          className="flex shrink-0 items-center gap-1.5 rounded-xl bg-primary/15 px-3 py-1.5 text-sm font-semibold text-primary transition-colors hover:bg-primary/25 disabled:opacity-50"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          {busy ? "Undoing…" : "Geri al"}
        </button>
        <button
          type="button"
          onClick={() => setHidden(batch.batchId)}
          aria-label="Close"
          className="shrink-0 rounded-lg px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          Tamam
        </button>
      </div>
    </div>
  );
}
