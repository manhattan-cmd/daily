"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { Info, X } from "lucide-react";
import { db } from "@/lib/db";
import { useLocalFlag } from "@/lib/local-flag";
import { useT } from "@/lib/i18n";

const HINT_DISMISSED = "routine:exampleHintDismissed";

/**
 * Yapı sayfasındaki tek satırlık not: gelen kategoriler örnek, dokunulabilir.
 * Kullanıcı bunu bilmezse hazır yapıyı "sistemin parçası" sanıp kendi
 * hayatına göre değiştirmeye cesaret edemiyor. İlk girdiden sonra kaybolur.
 */
export function ExampleHint() {
  const t = useT();
  const [dismissed, dismiss] = useLocalFlag(HINT_DISMISSED);
  const entryCount = useLiveQuery(() => db.entries.count(), []);

  if (dismissed || entryCount === undefined || entryCount > 0) return null;

  return (
    <div className="animate-in mb-3 flex items-start gap-2.5 rounded-xl border border-border bg-white/[0.03] px-3 py-2.5">
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/80" />
      <p className="min-w-0 flex-1 text-[11px] leading-relaxed text-muted-foreground">
        {t("structure.sampleHint")}
      </p>
      <button
        type="button"
        onClick={dismiss}
        aria-label={t("structure.sampleHintDismiss")}
        className="shrink-0 rounded-lg p-0.5 text-muted-foreground transition-colors hover:text-foreground"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
