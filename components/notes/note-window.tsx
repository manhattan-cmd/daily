"use client";

import { useEffect, useRef } from "react";
import { useT } from "@/lib/i18n";
import { Dialog, DialogContent, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ENTRY_WINDOW, ENTRY_WINDOW_FOOTER } from "@/components/ui/entry-window";
import { useNoteDraft } from "@/components/notes/use-note-draft";
import { NOTE_COLOR } from "@/components/notes/note-card";
import { cn } from "@/lib/utils";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS_LONG = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];
function dateLabel(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return `${dt.getDate()} ${MONTHS[dt.getMonth()]} ${WEEKDAYS_LONG[dt.getDay()]}`;
}

/**
 * Not penceresi — girdi penceresiyle aynı ölçü ve düzen (bkz. entry-window).
 *
 * Not eskiden tam sayfaya açılıyordu; diğer kartlar pencere açarken not
 * bambaşka bir yere gidiyordu. Artık aynı pencere: üstte "Not" ve tarih,
 * başlık, pencereyi dolduran yazı alanı, altta eylemler.
 *
 * Yazdıkça kaydedilir; kapatmak (Kaydet, karartma, Esc, geri tuşu) son hali
 * yazar, boş kalan notu atar (bkz. useNoteDraft).
 */
export function NoteWindow({
  noteId,
  open,
  onClose,
}: {
  noteId: string;
  open: boolean;
  onClose: () => void;
}) {
  // Yalnız açıkken kurulur — kapalı notun taslağı tutulmasın
  return open ? <NoteWindowBody noteId={noteId} onClose={onClose} /> : null;
}

function NoteWindowBody({ noteId, onClose }: { noteId: string; onClose: () => void }) {
  const t = useT();
  const d = useNoteDraft(noteId);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const c = NOTE_COLOR;

  // Yeni (boş) not doğrudan yazmaya açılır
  const isEmpty = !!d.loaded && !d.title && !d.body;
  useEffect(() => {
    if (isEmpty) bodyRef.current?.focus();
    // yalnız yüklendiği an
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.loaded]);

  const close = async () => {
    await d.finish();
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && void close()}>
      <DialogContent
        className={cn(ENTRY_WINDOW, "gap-4")}
        aria-describedby={undefined}
        // İlk odak yazı alanında olsun (boşsa); Radix ilk düğmeye veriyordu
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {d.loaded === null ? (
          <>
            <DialogTitle className="text-base">{t("entry.note")}</DialogTitle>
            <p className="text-sm text-muted-foreground">Not bulunamadı.</p>
          </>
        ) : (
          <>
            {/* Künye — girdi penceresindeki kategori + ad düzeni */}
            <div className="pr-8">
              <div
                className="text-[10px] font-semibold uppercase tracking-[0.14em]"
                style={{ color: `${c}cc` }}
              >
                {t("entry.note")}
                {d.loaded && ` · ${dateLabel(d.loaded.date)}`}
              </div>
              <DialogTitle asChild>
                <input
                  value={d.title}
                  onChange={(e) => d.setTitle(e.target.value)}
                  placeholder={t("note.title")}
                  aria-label={t("note.title")}
                  className="mt-1 w-full bg-transparent text-xl font-semibold tracking-tight outline-none placeholder:text-muted-foreground/35"
                  onKeyDown={(e) => {
                    // Başlıkta Enter yazıya geçer
                    if (e.key === "Enter") {
                      e.preventDefault();
                      bodyRef.current?.focus();
                    }
                  }}
                />
              </DialogTitle>
            </div>

            <textarea
              ref={bodyRef}
              value={d.body}
              onChange={(e) => d.setBody(e.target.value)}
              placeholder={t("note.placeholder")}
              className="min-h-[180px] w-full flex-1 resize-none rounded-xl border px-3.5 py-3 text-[15px] leading-relaxed text-foreground/90 outline-none placeholder:text-muted-foreground/40 focus:ring-1 focus:ring-ring"
              style={{ borderColor: `${c}40`, background: `${c}0d` }}
            />

            <DialogFooter className={ENTRY_WINDOW_FOOTER}>
              {/* Sıra girdi penceresindeki gibi: ana eylem üstte (alt bölüm
                  telefonda sütun-ters dizer) */}
              <Button
                variant="outline"
                className="text-destructive hover:text-destructive"
                onClick={async () => {
                  if (await d.remove()) onClose();
                }}
              >
                {t("note.delete")}
              </Button>
              <Button onClick={() => void close()}>{t("action.save")}</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
