"use client";

import { useEffect, useRef } from "react";
import { intlTag, useLocale, useT } from "@/lib/i18n";
import { DialogFooter } from "@/components/ui/dialog";
import { SheetFrame, SheetTitle } from "@/components/ui/sheet-frame";
import { Button } from "@/components/ui/button";
import { ENTRY_WINDOW, ENTRY_WINDOW_FOOTER } from "@/components/ui/entry-window";
import { useNoteDraft } from "@/components/notes/use-note-draft";
import { NOTE_COLOR } from "@/components/notes/note-card";
import { cn } from "@/lib/utils";

/** Notun günü, arayüzün dilinde: "31 Ekim Cumartesi" (eskiden ay ve gün adları elle İngilizceydi) */
function dateLabel(date: string, tag: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(tag, { day: "numeric", month: "long", weekday: "long" });
}

/**
 * Not penceresi — girdi penceresiyle aynı ölçü ve düzen (bkz. entry-window).
 *
 * Not eskiden tam sayfaya açılıyordu; diğer kartlar pencere açarken not
 * bambaşka bir yere gidiyordu. Artık aynı pencere: üstte "Not" ve tarih,
 * başlık, pencereyi dolduran yazı alanı, altta eylemler.
 *
 * Yazdıkça kaydedilir; kapatmak (Kaydet, karartma, Esc, geri tuşu) son hali
 * yazar, boş kalan notu atar (bkz. useNoteDraft). Ekle ekranının sekmesinde
 * (embedded) sekmeden ya da ekrandan çıkmak da aynısını yapar.
 */
export function NoteWindow({
  noteId,
  open,
  onClose,
  embedded,
}: {
  noteId: string;
  open: boolean;
  onClose: () => void;
  /** Ekle ekranının sekmesinde (bkz. AddScreen, SheetFrame) */
  embedded?: boolean;
}) {
  // Yalnız açıkken kurulur — kapalı notun taslağı tutulmasın
  return open ? <NoteWindowBody noteId={noteId} onClose={onClose} embedded={embedded} /> : null;
}

function NoteWindowBody({
  noteId,
  onClose,
  embedded,
}: {
  noteId: string;
  onClose: () => void;
  embedded?: boolean;
}) {
  const t = useT();
  const tag = intlTag(useLocale());
  const d = useNoteDraft(noteId);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const c = NOTE_COLOR;

  // Gömülüyken Kaydet'e basılmadan da çıkılabilir (ekranı kapatmak, başka
  // sekme): çıkarken son hali yaz, boşsa at. Bir kez — Kaydet de çağırıyor.
  const finishRef = useRef(d.finish);
  const finishedRef = useRef(false);
  useEffect(() => {
    finishRef.current = d.finish;
  });
  useEffect(() => {
    if (!embedded) return;
    return () => {
      if (!finishedRef.current) void finishRef.current();
    };
  }, [embedded]);

  // Yeni (boş) not doğrudan yazmaya açılır
  const isEmpty = !!d.loaded && !d.title && !d.body;
  useEffect(() => {
    if (isEmpty) bodyRef.current?.focus();
    // yalnız yüklendiği an
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.loaded]);

  const close = async () => {
    finishedRef.current = true;
    await d.finish();
    onClose();
  };

  return (
    <SheetFrame
      embedded={embedded}
      open
      onClose={() => void close()}
      className={cn(ENTRY_WINDOW, "gap-4")}
      embeddedClassName="gap-4 overflow-y-auto overscroll-contain px-6 pt-5"
      hideClose={false}
      // İlk odak yazı alanında olsun (boşsa); Radix ilk düğmeye veriyordu
      onOpenAutoFocus={(e) => e.preventDefault()}
    >
        {d.loaded === null ? (
          <>
            <SheetTitle className="text-base">{t("entry.note")}</SheetTitle>
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
                {d.loaded && ` · ${dateLabel(d.loaded.date, tag)}`}
              </div>
              <SheetTitle asChild>
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
              </SheetTitle>
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
                  if (await d.remove()) {
                    finishedRef.current = true;
                    onClose();
                  }
                }}
              >
                {t("note.delete")}
              </Button>
              <Button onClick={() => void close()}>{t("action.save")}</Button>
            </DialogFooter>
          </>
        )}
    </SheetFrame>
  );
}
