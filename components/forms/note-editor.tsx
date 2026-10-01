"use client";

import { useEffect, useRef } from "react";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

/**
 * Kayıt penceresindeki not alanı — yazılan yer değil, dokunulan yer.
 *
 * Eskiden burada doğrudan bir textarea vardı. Pencerenin altında durduğu için
 * dokununca klavye açılıp pencerenin üstünü kapatıyordu; kullanıcı yazarken
 * pencereyi kaydırmak zorunda kalıyordu. Artık dokununca aynı pencerenin
 * içinde yalnız nota ayrılmış bir görünüm açılıyor (NoteEditorView) —
 * yazma alanı en üstte, klavye ne kadar yer kaplarsa kaplasın görünür.
 */
export function NotePreview({
  id,
  value,
  onOpen,
  className,
  style,
}: {
  id?: string;
  value: string;
  onOpen: () => void;
  className?: string;
  style?: React.CSSProperties;
}) {
  const t = useT();
  return (
    <button
      id={id}
      type="button"
      onClick={onOpen}
      className={cn(
        "flex min-h-[64px] w-full flex-1 items-start rounded-xl border px-3 py-2.5 text-left text-sm leading-5 transition-opacity active:opacity-80",
        className
      )}
      style={style}
    >
      {value.trim() ? (
        <span className="line-clamp-4 whitespace-pre-wrap break-words">
          {value}
        </span>
      ) : (
        <span className="text-muted-foreground/50">
          {t("entry.notePlaceholder")}
        </span>
      )}
    </button>
  );
}

/**
 * Not yazma görünümü — kayıt penceresinin İÇİNDE, formun yerine açılır
 * (üst üste ikinci bir pencere değil: o düzen kırılgan). Yazılan doğrudan
 * formun notuna gider; "Tamam" ya da geri forma döner, kaydetme formda.
 *
 * Geri tuşu / Escape yalnız bu görünümü kapatır: pencere Escape'i belgede
 * yakalıyor, burası pencerenin (window) yakalama aşamasında ondan önce
 * davranıp olayı durduruyor.
 */
export function NoteEditorView({
  value,
  onChange,
  onDone,
  subtitle,
  accent,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  onDone: () => void;
  /** Notun ait olduğu kayıt — başlığın üstünde küçük */
  subtitle?: string;
  accent?: string;
  className?: string;
}) {
  const t = useT();
  const ref = useRef<HTMLTextAreaElement>(null);
  const doneRef = useRef(onDone);
  useEffect(() => {
    doneRef.current = onDone;
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      doneRef.current();
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, []);

  useEffect(() => {
    // İmleç metnin sonunda — var olan nota devam edilir
    const el = ref.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col gap-4", className)}>
      <div className="flex shrink-0 items-center gap-3">
        <button
          type="button"
          onClick={onDone}
          aria-label={t("action.back")}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--sf-3)] text-muted-foreground transition-colors hover:bg-[var(--sf-4)]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
        </button>
        <div className="min-w-0 flex-1">
          {subtitle && (
            <span
              className="block truncate text-[10px] font-semibold uppercase tracking-[0.14em]"
              style={{ color: accent ? `${accent}cc` : undefined }}
            >
              {subtitle}
            </span>
          )}
          <h2 className="text-base font-semibold tracking-tight">
            {t("entry.note")}
          </h2>
        </div>
      </div>

      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t("entry.notePlaceholder")}
        className="min-h-[96px] w-full flex-1 resize-none rounded-xl border border-[var(--ln-2)] bg-[var(--sf-1)] px-3 py-2.5 text-sm leading-5 placeholder:text-muted-foreground/50 focus:outline-none"
        style={
          accent
            ? { borderColor: `${accent}55`, background: `${accent}10` }
            : undefined
        }
      />

      <button
        type="button"
        onClick={onDone}
        className={cn(
          "flex h-12 w-full shrink-0 items-center justify-center rounded-2xl text-sm font-semibold transition-opacity active:opacity-85",
          accent ? "text-white" : "bg-primary text-primary-foreground"
        )}
        style={accent ? { background: accent } : undefined}
      >
        {t("action.gotIt")}
      </button>
    </div>
  );
}
