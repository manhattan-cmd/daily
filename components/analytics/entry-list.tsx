"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { getEntryWithContext } from "@/lib/db/queries";
import { EditEntryModal } from "@/components/forms/edit-entry-modal";
import { fmtEntryDateTime } from "@/lib/analytics";
import { cn } from "@/lib/utils";

export type EntryListRow = {
  id: string;
  occurredAt: number;
  title?: string;
  /** Girdinin ait olduğu alt kategori adı — birden çok alt kategoriyi kapsayan
   * listede (örn. kategori seviyesi) hangi kaleme ait olduğunu gösterir */
  subLabel?: string;
  notes?: string;
  /** Seçili metriğe göre biçimlenmiş değer, örn. "250 ₺" — metrik "girdi" ise yok */
  valueLabel?: string;
};

const PAGE_SIZE = 20;

/**
 * Kalem kalem girdi listesi — tarih, (varsa) alt kategori, başlık/not, değer.
 * Sayfalı. Satıra dokununca girdinin düzenleme modalı açılır; kayıt canlı
 * okunduğu için düzenleme anında listeye yansır.
 */
export function EntryList({
  rows,
  emptyText = "Bu aralıkta girdi yok",
  accent,
}: {
  rows: EntryListRow[];
  emptyText?: string;
  /** Değer etiketini boyayan vurgu rengi (yapı sayfasında kategori rengi) */
  accent?: string;
}) {
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [openId, setOpenId] = useState<string | null>(null);
  // Analiz satırları yalnız görünen alanları taşır; modal tam kaydı ister
  const openEntry = useLiveQuery(
    () => (openId ? getEntryWithContext(openId) : undefined),
    [openId]
  );

  if (!rows.length) {
    return (
      <p className="py-4 text-center text-xs text-muted-foreground/60">
        {emptyText}
      </p>
    );
  }

  const shown = rows.slice(0, visible);
  const remaining = rows.length - shown.length;

  return (
    <div className="flex flex-col">
      {shown.map((r, i) => (
        <button
          key={r.id}
          type="button"
          onClick={() => setOpenId(r.id)}
          aria-label={`${r.subLabel ?? r.title ?? "Girdi"} — düzenle`}
          className={cn(
            "-mx-2 flex items-start gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-white/5 active:bg-white/[0.07]",
            i > 0 && "border-t border-border/60"
          )}
        >
          <div className="shrink-0 whitespace-nowrap pt-0.5 text-[10px] leading-tight text-muted-foreground tabular-nums">
            {fmtEntryDateTime(r.occurredAt)}
          </div>
          <div className="min-w-0 flex-1">
            {(r.subLabel || r.title) && (
              <div className="truncate text-xs font-medium">
                {r.subLabel ?? r.title}
              </div>
            )}
            {r.subLabel && r.title && (
              <div className="truncate text-[11px] text-muted-foreground">
                {r.title}
              </div>
            )}
            {r.notes && (
              <div className="truncate text-[11px] text-muted-foreground/70">
                {r.notes}
              </div>
            )}
          </div>
          {r.valueLabel && (
            <div
              className="shrink-0 pt-0.5 text-xs font-semibold tabular-nums"
              style={accent ? { color: accent } : undefined}
            >
              {r.valueLabel}
            </div>
          )}
        </button>
      ))}

      {remaining > 0 && (
        <button
          type="button"
          onClick={() => setVisible((v) => v + PAGE_SIZE)}
          className="mt-2 rounded-lg py-2 text-center text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          Daha fazla göster ({remaining})
        </button>
      )}

      {openEntry && (
        <EditEntryModal
          entry={openEntry}
          open
          onOpenChange={(o) => {
            if (!o) setOpenId(null);
          }}
        />
      )}
    </div>
  );
}
