"use client";

import { useState } from "react";
import { ArrowLeft, CalendarDays, Check, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { intlTag, useLocale, useT } from "@/lib/i18n";

/**
 * Bir kartın toplu seçim durumu. Kart birden çok girdi taşıyorsa (paralel
 * grup, aktivite) hepsi birlikte seçilir — görünen kart neyse o seçilir.
 */
export type EntrySelection = {
  /** Seçim modu açık — karta dokunmak düzenlemek yerine seçer */
  active: boolean;
  selected: boolean;
  onToggle: () => void;
  /** Basılı tutma: seçim modunu bu kartla başlat */
  onStart: () => void;
};

/**
 * Seçim modunda kartın üstüne serilen dokunma katmanı. Kartın içindeki
 * düğmeler (sil, hızlı özellik, düzenle) bu katmanın altında kaldığı için
 * yanlışlıkla tetiklenmez; tek iş seçimi açıp kapatmaktır.
 */
export function SelectionLayer({
  selected,
  onToggle,
  label,
}: {
  selected: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          onToggle();
        }
      }}
      className="absolute inset-0 z-20 flex items-start justify-end p-2"
    >
      <span
        className={cn(
          "flex h-6 w-6 items-center justify-center rounded-full border-2 transition-colors",
          selected
            ? "border-primary bg-primary text-primary-foreground"
            : "border-white/35 bg-background/70"
        )}
      >
        {selected && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
      </span>
    </div>
  );
}

/** Seçili kartın dış çerçevesi — kategori renginden bağımsız, arayüz rengi */
export const selectedCardClass =
  "ring-2 ring-primary ring-offset-2 ring-offset-background";

// ─── Tarih yardımcıları ──────────────────────────────────────────────────────

function toDateStr(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function shiftDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return toDateStr(new Date(y, m - 1, d + days));
}

function prettyDate(dateStr: string, locale: Parameters<typeof intlTag>[0]): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(intlTag(locale), {
    day: "numeric",
    month: "long",
    weekday: "short",
  });
}

type View = "actions" | "move" | "delete";

/**
 * Toplu seçim çubuğu — gün sayfasının altına oturur. Çok adımlı akış tek
 * yüzeyde görünüm değiştirerek ilerler (üst üste dialog açmadan): eylemler →
 * taşı / sil onayı.
 */
export function EntrySelectionBar({
  date,
  count,
  allSelected,
  onSelectAll,
  onCancel,
  onMove,
  onDelete,
}: {
  /** Görüntülenen gün — hızlı seçenekler buna göre hesaplanır */
  date: string;
  count: number;
  allSelected: boolean;
  onSelectAll: () => void;
  onCancel: () => void;
  onMove: (target: string) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const t = useT();
  const locale = useLocale();
  const [view, setView] = useState<View>("actions");
  const [target, setTarget] = useState(date);
  const [busy, setBusy] = useState(false);

  const quick = [
    { label: t("selection.previousDay"), value: shiftDate(date, -1) },
    { label: t("selection.nextDay"), value: shiftDate(date, 1) },
    { label: t("nav.today"), value: toDateStr(new Date()) },
  ].filter((q) => q.value !== date);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {/* Alt akışlarda arka planı kilitle — karta yanlışlıkla dokunulmasın */}
      {view !== "actions" && (
        <div
          className="fixed inset-0 z-40 bg-black/50"
          onClick={() => setView("actions")}
        />
      )}

      <div className="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-[390px] rounded-t-3xl border-t border-white/10 bg-background shadow-[0_-8px_40px_rgba(0,0,0,0.6)]">
        {view === "actions" && (
          <>
            <div className="flex items-center gap-2 px-4 pt-3 pb-2">
              <button
                onClick={onCancel}
                aria-label={t("selection.clear")}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/8 text-muted-foreground transition-colors hover:bg-white/12 hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
              <span className="flex-1 text-sm font-semibold">
                {t("selection.count", { n: count })}
              </span>
              <button
                onClick={onSelectAll}
                className="shrink-0 rounded-full bg-white/8 px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-white/12 hover:text-foreground"
              >
                {allSelected ? t("selection.clear") : t("selection.selectAll")}
              </button>
            </div>
            <div className="flex gap-2 px-4 pb-7 pt-1">
              <button
                onClick={() => {
                  setTarget(date);
                  setView("move");
                }}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-white/[0.04] py-3 text-sm font-medium transition-colors hover:bg-white/[0.08]"
              >
                <CalendarDays className="h-4 w-4 text-primary" />
                {t("selection.move")}
              </button>
              <button
                onClick={() => setView("delete")}
                className="flex items-center justify-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-5 py-3 text-sm font-medium text-destructive transition-colors hover:bg-destructive/20"
              >
                <Trash2 className="h-4 w-4" />
                {t("selection.delete")}
              </button>
            </div>
          </>
        )}

        {view === "move" && (
          <div className="px-4 pt-3 pb-7">
            <div className="mb-3 flex items-center gap-2">
              <button
                onClick={() => setView("actions")}
                aria-label={t("action.back")}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/8 text-muted-foreground transition-colors hover:bg-white/12 hover:text-foreground"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
              </button>
              <div className="min-w-0">
                <p className="text-sm font-semibold leading-tight">
                  {t("selection.moveTitle")}
                </p>
                <p className="text-[10px] text-muted-foreground/70">
                  {t("selection.moveHint", { n: count })}
                </p>
              </div>
            </div>

            <div className="mb-3 flex flex-wrap gap-2">
              {quick.map((q) => (
                <button
                  key={q.value}
                  onClick={() => setTarget(q.value)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                    target === q.value
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-border bg-white/[0.04] text-muted-foreground hover:text-foreground"
                  )}
                >
                  {q.label}
                </button>
              ))}
            </div>

            <input
              type="date"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              aria-label="Target date"
              className="mb-3 h-11 w-full rounded-xl border border-border bg-input px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />

            <button
              onClick={() => run(() => onMove(target))}
              disabled={busy || !target || target === date}
              className="h-11 w-full rounded-xl bg-primary text-sm font-semibold text-primary-foreground transition-opacity disabled:opacity-40"
            >
              {busy
                ? t("selection.moving")
                : target === date
                  ? t("selection.pickAnotherDay")
                  : t("selection.moveTo", { date: prettyDate(target, locale) })}
            </button>
          </div>
        )}

        {view === "delete" && (
          <div className="px-4 pt-3 pb-7">
            <div className="mb-3 flex items-center gap-2">
              <button
                onClick={() => setView("actions")}
                aria-label="Back"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/8 text-muted-foreground transition-colors hover:bg-white/12 hover:text-foreground"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
              </button>
              <div className="min-w-0">
                <p className="text-sm font-semibold leading-tight">
                  {t("selection.deleteTitle", { n: count })}
                </p>
                <p className="text-[10px] text-muted-foreground/70">
                  {t("selection.deleteBody")}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setView("actions")}
                disabled={busy}
                className="h-11 flex-1 rounded-xl border border-border bg-white/[0.04] text-sm font-medium transition-colors hover:bg-white/[0.08]"
              >
                {t("action.cancel")}
              </button>
              <button
                onClick={() => run(onDelete)}
                disabled={busy}
                className="h-11 flex-1 rounded-xl bg-destructive text-sm font-semibold text-destructive-foreground transition-opacity disabled:opacity-40"
              >
                {busy ? t("selection.deleting") : t("action.delete")}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
