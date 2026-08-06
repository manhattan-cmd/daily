"use client";

import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { ShieldAlert, ArrowRight, X } from "lucide-react";
import { db } from "@/lib/db";
import {
  agoLabel,
  snoozeBackupReminder,
  useBackupReminder,
  useLastBackupAt,
} from "@/lib/storage-health";

/**
 * Yedek hatırlatıcısı — ana sayfada, yalnızca kaybedilecek bir şey varken.
 * Veri sadece cihazda durduğu için "yedek almayı unutmak" en gerçek veri
 * kaybı sebebi; kullanıcının bunu kendiliğinden hatırlaması beklenmemeli.
 */
export function BackupReminder() {
  const lastBackupAt = useLastBackupAt();
  const state = useBackupReminder();
  // Kaybedilecek bir şey yoksa hatırlatma anlamsız
  const entryCount = useLiveQuery(() => db.entries.count(), []);
  const noteCount = useLiveQuery(() => db.notes.count(), []);

  const worthProtecting = (entryCount ?? 0) + (noteCount ?? 0) >= 5;
  if (state === "hidden" || !worthProtecting) return null;

  return (
    <div className="animate-in mb-4 flex items-start gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/[0.07] p-3.5">
      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">
          {state === "never" || lastBackupAt === null
            ? "Verinin yedeği yok"
            : `Son yedeğin ${agoLabel(lastBackupAt)}`}
        </p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
          Her şey yalnızca bu cihazda. Telefon değişirse ya da tarayıcı verisi
          silinirse geri dönüşü yok.
        </p>
        <Link
          href="/structure/backup"
          className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-amber-400 transition-opacity hover:opacity-80"
        >
          Yedek al
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <button
        type="button"
        aria-label="Şimdilik kapat"
        onClick={snoozeBackupReminder}
        className="shrink-0 rounded-lg p-1 text-muted-foreground transition-colors hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
