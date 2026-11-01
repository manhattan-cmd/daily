"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Check, Heading, NotebookPen, PenLine, Trash2, X, type LucideIcon } from "lucide-react";
import { intlTag, useLocale, useT } from "@/lib/i18n";
import { useSkin } from "@/lib/skin";
import { SheetFrame, SheetTitle } from "@/components/ui/sheet-frame";
import { SmartText } from "@/components/ui/smart-text";
import { ENTRY_WINDOW_LARGE } from "@/components/ui/entry-window";
import { OptionsMenu } from "@/components/forms/form-options";
import { useNoteDraft } from "@/components/notes/use-note-draft";
import { NOTE_COLOR } from "@/components/notes/note-card";
import { cn } from "@/lib/utils";

/** Notun günü, arayüzün dilinde: "31 Ekim Cumartesi" (eskiden ay ve gün adları elle İngilizceydi) */
function dateLabel(date: string, tag: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(tag, { day: "numeric", month: "long", weekday: "long" });
}

/**
 * Not penceresi — girdi formlarının dilinde (bkz. EntryShell): tepede notun
 * renginde bant (beyaz karoda simge, üstte günü, adı "Not ekle" ya da "Not",
 * sağında ⋯ ve kapat), altında sayfa zemininde iki kutu — Başlık ve Yazı
 * (yazı zemini doldurur), en altta Ekle / Kaydet. Notu silmek ⋯'de.
 *
 * Eskiden düz bir pencereydi: renkli küçük üst yazı, çıplak başlık, büyük
 * çerçeveli yazı alanı, altta mavi Kaydet ve kırmızı Notu sil — öteki
 * formlara benzemiyordu.
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
  const brutal = useSkin() === "brutal";
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
  const remove = async () => {
    if (await d.remove()) {
      finishedRef.current = true;
      onClose();
    }
  };

  const hasText = !!(d.title.trim() || d.body.trim());
  // Ekle ekranında yeni not ("Not ekle"), kartından açılınca var olan not
  const heading = embedded ? t("note.add") : t("entry.note");

  return (
    <SheetFrame
      embedded={embedded}
      open
      onClose={() => void close()}
      className={cn(ENTRY_WINDOW_LARGE, "gap-0 overflow-hidden p-0")}
      // İlk odak yazı alanında olsun (boşsa); Radix ilk düğmeye veriyordu
      onOpenAutoFocus={(e) => e.preventDefault()}
    >
      {d.loaded === null ? (
        <div className="p-6">
          <SheetTitle className="text-base">{t("entry.note")}</SheetTitle>
          <p className="text-sm text-muted-foreground">Not bulunamadı.</p>
        </div>
      ) : (
        <div data-entry-root="" className="relative flex min-h-0 flex-1 flex-col">
          <SheetTitle className="sr-only">{heading}</SheetTitle>
          {/* Tepede rengin ışığı (sade temalarda) */}
          <div
            aria-hidden
            data-glow=""
            className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-64"
            style={{ background: `radial-gradient(120% 90% at 15% 0%, ${c}40 0%, ${c}14 45%, transparent 75%)` }}
          />

          {/* Bant — karo, gün, ad; sağda ⋯ (sil) ve kapat */}
          <div data-entry-hero="" className="shrink-0 pt-3" style={{ ["--hero-c" as string]: c }}>
            <div className="flex shrink-0 items-start gap-3 px-4 pb-3">
              <span
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[13px]"
                style={{
                  backgroundColor: c,
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.25), inset 0 0 0 1px rgba(0,0,0,0.14)",
                }}
              >
                <NotebookPen className="h-[22px] w-[22px] text-white" strokeWidth={2.2} />
              </span>
              <div className="min-w-0 flex-1 leading-tight">
                {d.loaded && (
                  <SmartText text={dateLabel(d.loaded.date, tag)} className="text-[12px] font-medium text-muted-foreground" />
                )}
                <SmartText text={heading} lines={2} className="text-[19px] font-bold leading-6 tracking-tight" />
              </div>
              <div data-hero-actions="" className="flex shrink-0 items-center gap-1.5 pt-0.5">
                {hasText && (
                  <OptionsMenu
                    items={[
                      { key: "delete", icon: Trash2, title: t("note.delete"), subtitle: "", tone: "destructive", onSelect: () => void remove() },
                    ]}
                  />
                )}
                {/* Kapat — Ekle ekranında yok: kapatma şeritte */}
                {!embedded && (
                  <button
                    type="button"
                    onClick={() => void close()}
                    aria-label={t("action.close")}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--sf-3)] text-foreground/80 transition-[background-color,transform] hover:bg-[var(--sf-4)] active:scale-95"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Gövde — Başlık ve Yazı kutuları; Brütal temada sayfa zemini */}
          <div data-entry-sheet="" className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain px-4 pb-4">
            <NoteBox brutal={brutal} color={c} icon={Heading} label={t("note.title")} vt="text">
              <label className="flex h-11 items-center rounded-xl bg-[var(--sf-1)] px-3">
                <input
                  value={d.title}
                  onChange={(e) => d.setTitle(e.target.value)}
                  placeholder={t("note.titlePlaceholder")}
                  aria-label={t("note.title")}
                  className="min-w-0 flex-1 bg-transparent text-[17px] font-bold tracking-tight text-foreground outline-none placeholder:font-semibold placeholder:text-muted-foreground/45"
                  onKeyDown={(e) => {
                    // Başlıkta Enter yazıya geçer
                    if (e.key === "Enter") {
                      e.preventDefault();
                      bodyRef.current?.focus();
                    }
                  }}
                />
              </label>
            </NoteBox>
            <NoteBox brutal={brutal} color={c} icon={PenLine} label={t("note.body")} vt="note" grow>
              <textarea
                ref={bodyRef}
                value={d.body}
                onChange={(e) => d.setBody(e.target.value)}
                placeholder={t("note.placeholder")}
                aria-label={t("note.body")}
                className="min-h-[200px] w-full flex-1 resize-none bg-transparent text-[15px] leading-relaxed text-foreground/90 outline-none placeholder:text-muted-foreground/45"
              />
            </NoteBox>
          </div>

          {/* Alt — Ekle (yeni not) / Kaydet (var olan) */}
          <div
            data-entry-foot=""
            className="shrink-0 border-t border-[var(--ln-1)] px-4 pt-3"
            style={{ paddingBottom: "max(1rem, calc(env(safe-area-inset-bottom, 0px) + 0.75rem))" }}
          >
            <button
              type="button"
              onClick={() => void close()}
              disabled={embedded && !hasText}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-[15px] font-semibold text-white transition-opacity active:opacity-85 disabled:opacity-50"
              style={{ background: c }}
            >
              <Check className="h-5 w-5" strokeWidth={2.75} />
              {embedded ? t("action.add") : t("action.save")}
            </button>
          </div>
        </div>
      )}
    </SheetFrame>
  );
}

/**
 * Notun kutusu — girdi formundaki özellik kutusunun (LedgerField) dili:
 * Brütalde adı kutunun üst kenarına oturan renkli sekmede, sadede kutunun
 * içinde küçük başlık. `grow`: kutu zeminin kalanını doldurur (Yazı).
 */
function NoteBox({
  brutal,
  color,
  icon: Icon,
  label,
  vt,
  grow = false,
  children,
}: {
  brutal: boolean;
  color: string;
  icon: LucideIcon;
  label: string;
  vt: string;
  grow?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      data-ledger-field=""
      data-vt={vt}
      className={cn(
        "relative flex flex-col gap-2 rounded-2xl p-3",
        brutal && "mt-3.5 pt-6",
        grow && "min-h-[240px] flex-1"
      )}
      style={{ background: `${color}0f`, boxShadow: `inset 0 0 0 1px ${color}2e` }}
    >
      {brutal ? (
        <div
          data-ledger-tab=""
          className="absolute -top-[13px] left-2.5 z-[1] flex max-w-[calc(100%-16px)] items-center gap-1 rounded-lg border-2 border-[#111] px-2 py-px text-[#111]"
          style={{ background: `color-mix(in srgb, ${color} 45%, #ffffff)` }}
        >
          <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={2.6} />
          <SmartText text={label} className="min-w-0 text-[11.5px] font-black uppercase tracking-wide" />
        </div>
      ) : (
        <div className="flex items-center gap-2 text-[12px] font-semibold text-muted-foreground">
          <span className="flex h-6 w-6 items-center justify-center rounded-full" style={{ background: `${color}33`, color }}>
            <Icon className="h-3.5 w-3.5" strokeWidth={2.2} />
          </span>
          {label}
        </div>
      )}
      {children}
    </div>
  );
}
