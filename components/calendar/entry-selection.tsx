"use client";

import { useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, CalendarDays, Check, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { intlTag, useLocale, useT } from "@/lib/i18n";
import { useSkin } from "@/lib/skin";

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
 *
 * Daire kartın sağ üst köşesinde, künyenin hizasında. Künyenin sağında tarih
 * etiketi duruyor; daire onun üstüne biniyordu. Kartların künyesi
 * `data-sel-head` taşır ve katman varken sağında daireye yer açılır
 * (globals.css, "Secim modu") — tarih dairenin soluna kayar.
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
      data-selection-layer=""
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
        data-sel-dot=""
        data-on={selected ? "" : undefined}
        className={cn(
          "flex h-6 w-6 items-center justify-center rounded-full border-2 transition-colors",
          selected
            ? "border-primary bg-primary text-primary-foreground"
            : "border-[var(--ln-3)] bg-background/70"
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

function prettyDate(
  dateStr: string,
  locale: Parameters<typeof intlTag>[0],
  opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "long", weekday: "short" }
): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(intlTag(locale), opts);
}

type View = "actions" | "move" | "delete";

type BarProps = {
  /** Görüntülenen gün — hızlı seçenekler buna göre hesaplanır */
  date: string;
  count: number;
  allSelected: boolean;
  onSelectAll: () => void;
  onCancel: () => void;
  onMove: (target: string) => Promise<void>;
  onDelete: () => Promise<void>;
};

/**
 * Toplu seçim çubuğu — gün sayfasının altına oturur. Çok adımlı akış tek
 * yüzeyde görünüm değiştirerek ilerler (üst üste dialog açmadan): eylemler →
 * taşı / sil onayı. Brütal temada fiş dilinde çizilir (bkz. BrutalBar).
 */
export function EntrySelectionBar(props: BarProps) {
  const { date } = props;
  const t = useT();
  const brutal = useSkin() === "brutal";
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

  const state: BarState = {
    view,
    setView,
    target,
    setTarget,
    busy,
    quick,
    openMove: () => {
      setTarget(date);
      setView("move");
    },
    move: () => run(() => props.onMove(target)),
    remove: () => run(props.onDelete),
  };

  return (
    <>
      {/* Alt akışlarda arka planı kilitle — karta yanlışlıkla dokunulmasın */}
      {view !== "actions" && (
        <div
          className="fixed inset-0 z-40 bg-black/50"
          onClick={() => setView("actions")}
        />
      )}
      {brutal ? <BrutalBar {...props} {...state} /> : <ClassicBar {...props} {...state} />}
    </>
  );
}

type BarState = {
  view: View;
  setView: (v: View) => void;
  target: string;
  setTarget: (v: string) => void;
  busy: boolean;
  quick: { label: string; value: string }[];
  openMove: () => void;
  move: () => void;
  remove: () => void;
};

// ─── Brütal ─────────────────────────────────────────────────────────────────

/** Bandın rengi görünüme göre: seçim Gün'ün yeşili, taşı mavi, sil kırmızı */
const BAND: Record<View, string> = {
  actions: "#7ae582",
  move: "#8ea6ff",
  delete: "#ff8a8a",
};

/** Fiş düğmesi — kalın çerçeve, sert gölge, basınca gölgesine oturur */
const BRUT_BTN =
  "flex h-12 items-center justify-center gap-2 rounded-[14px] border-2 border-[#111] text-[14px] font-extrabold text-[#111] shadow-[3px_3px_0_#111] transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0_#111] disabled:opacity-50";

/** Bandın sol ucundaki kare düğme (kapat / geri) */
function BandSquare({
  onClick,
  label,
  children,
}: {
  onClick: () => void;
  label: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] border-2 border-[#111] bg-white text-[#111] shadow-[2px_2px_0_#111] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
    >
      {children}
    </button>
  );
}

/**
 * Brütal seçim çubuğu — girdi penceresinin fiş dili (EntryShell, BrutalFormFrame):
 * tepede renkli bant ve kalın alt çizgi, solda beyaz kare kapat/geri, kalın
 * başlık; altında krem zeminde çerçeveli, sert gölgeli düğmeler. Ana eylem
 * sarı. Eskiden diğer temaların yumuşak krem çekmecesiydi: çerçevesiz,
 * gölgesi bulanık, düğmeleri soluk — sayfanın bloklarının yanında başka bir
 * uygulamadan gelmiş gibi duruyordu.
 */
function BrutalBar({
  date,
  count,
  allSelected,
  onSelectAll,
  onCancel,
  view,
  setView,
  target,
  setTarget,
  busy,
  quick,
  openMove,
  move,
  remove,
}: BarProps & BarState) {
  const t = useT();
  const locale = useLocale();

  const title =
    view === "actions"
      ? t("selection.count", { n: count })
      : view === "move"
        ? t("selection.moveTitle")
        : t("selection.deleteTitle", { n: count });
  const eyebrow =
    view === "move"
      ? t("selection.moveHint", { n: count })
      : view === "delete"
        ? t("selection.deleteBody")
        : null;

  return (
    <div
      data-sel-bar=""
      className="sel-bar-up fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-[390px] overflow-hidden rounded-t-[20px] border-2 border-b-0 border-[#111] bg-[var(--background)] text-[#111]"
    >
      {/* Bant */}
      <div
        className="flex min-h-[54px] items-center gap-2.5 border-b-2 border-[#111] px-3 py-2"
        style={{ background: BAND[view] }}
      >
        {view === "actions" ? (
          <BandSquare onClick={onCancel} label={t("selection.clear")}>
            <X className="h-4 w-4" strokeWidth={2.75} />
          </BandSquare>
        ) : (
          <BandSquare onClick={() => setView("actions")} label={t("action.back")}>
            <ArrowLeft className="h-4 w-4" strokeWidth={2.75} />
          </BandSquare>
        )}
        <div className="min-w-0 flex-1 leading-tight">
          {eyebrow && (
            <div className="truncate text-[9.5px] font-extrabold uppercase tracking-[0.09em] opacity-70">
              {eyebrow}
            </div>
          )}
          <div className="truncate text-[17px] font-black tracking-[-0.02em]">{title}</div>
        </div>
        {view === "actions" && (
          <button
            type="button"
            onClick={onSelectAll}
            className="shrink-0 rounded-[9px] border-2 border-[#111] bg-white px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.04em] text-[#111] shadow-[2px_2px_0_#111] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
          >
            {allSelected ? t("selection.clear") : t("selection.selectAll")}
          </button>
        )}
      </div>

      {/* Gövde */}
      <div
        className="px-4 pt-3.5"
        style={{ paddingBottom: "max(1.25rem, calc(env(safe-area-inset-bottom, 0px) + 0.75rem))" }}
      >
        {view === "actions" && (
          <div className="flex gap-2.5">
            <button type="button" onClick={openMove} className={cn(BRUT_BTN, "min-w-0 flex-1 bg-white")}>
              <CalendarDays className="h-[18px] w-[18px] shrink-0" strokeWidth={2.5} />
              <span className="truncate">{t("selection.move")}</span>
            </button>
            <button
              type="button"
              onClick={() => setView("delete")}
              className={cn(BRUT_BTN, "shrink-0 px-4")}
              style={{ background: "#ff8a8a" }}
            >
              <Trash2 className="h-[18px] w-[18px] shrink-0" strokeWidth={2.5} />
              {t("selection.delete")}
            </button>
          </div>
        )}

        {view === "move" && (
          <div className="flex flex-col gap-3">
            {/* Hızlı günler — seçilen siyah dolu */}
            {quick.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {quick.map((q) => {
                  const on = target === q.value;
                  return (
                    <button
                      key={q.value}
                      type="button"
                      onClick={() => setTarget(q.value)}
                      aria-pressed={on}
                      className={cn(
                        "rounded-[10px] border-2 border-[#111] px-3 py-1.5 text-[12.5px] font-extrabold transition-transform",
                        on
                          ? "translate-x-[1.5px] translate-y-[1.5px] bg-[#111] text-[#fff4dc]"
                          : "bg-white text-[#111] shadow-[1.5px_1.5px_0_#111]"
                      )}
                    >
                      {q.label}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Gün kutusu — dokununca telefonun takvimi (görünmez tarih girişi) */}
            <label className="relative flex h-14 cursor-pointer items-center gap-3 rounded-[14px] border-2 border-[#111] bg-white px-3.5 shadow-[3px_3px_0_#111]">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] border-2 border-[#111]" style={{ background: BAND.move }}>
                <CalendarDays className="h-4 w-4" strokeWidth={2.5} />
              </span>
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block text-[9.5px] font-extrabold uppercase tracking-[0.09em] opacity-60">
                  {t("selection.targetDate")}
                </span>
                <span className="block truncate text-[16px] font-black tracking-[-0.01em]">
                  {target
                    ? prettyDate(target, locale, { day: "numeric", month: "long", weekday: "long" })
                    : "—"}
                </span>
              </span>
              <input
                type="date"
                value={target}
                onChange={(e) => e.target.value && setTarget(e.target.value)}
                aria-label={t("selection.targetDate")}
                className="absolute inset-0 cursor-pointer opacity-0"
              />
            </label>

            <button
              type="button"
              onClick={move}
              disabled={busy || !target || target === date}
              className={cn(BRUT_BTN, "w-full uppercase tracking-[0.04em]")}
              style={{ background: "#ffd23f" }}
            >
              <span className="truncate">
                {busy
                  ? t("selection.moving")
                  : target === date
                    ? t("selection.pickAnotherDay")
                    : t("selection.moveTo", { date: prettyDate(target, locale) })}
              </span>
              {!busy && target !== date && <ArrowRight className="h-[18px] w-[18px] shrink-0" strokeWidth={2.75} />}
            </button>
          </div>
        )}

        {view === "delete" && (
          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={() => setView("actions")}
              disabled={busy}
              className={cn(BRUT_BTN, "flex-1 bg-white")}
            >
              {t("action.cancel")}
            </button>
            <button
              type="button"
              onClick={remove}
              disabled={busy}
              className={cn(BRUT_BTN, "flex-1 uppercase tracking-[0.04em]")}
              style={{ background: "#ff5d5d" }}
            >
              <Trash2 className="h-[18px] w-[18px] shrink-0" strokeWidth={2.5} />
              {busy ? t("selection.deleting") : t("action.delete")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Diğer temalar ──────────────────────────────────────────────────────────

function ClassicBar({
  date,
  count,
  allSelected,
  onSelectAll,
  onCancel,
  view,
  setView,
  target,
  setTarget,
  busy,
  quick,
  openMove,
  move,
  remove,
}: BarProps & BarState) {
  const t = useT();
  const locale = useLocale();
  return (
    <div className="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-[390px] rounded-t-3xl border-t border-[var(--ln-2)] bg-background shadow-[0_-8px_40px_rgba(0,0,0,0.6)]">
      {view === "actions" && (
        <>
          <div className="flex items-center gap-2 px-4 pt-3 pb-2">
            <button
              onClick={onCancel}
              aria-label={t("selection.clear")}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--sf-3)] text-muted-foreground transition-colors hover:bg-[var(--sf-4)] hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
            <span className="flex-1 text-sm font-semibold">
              {t("selection.count", { n: count })}
            </span>
            <button
              onClick={onSelectAll}
              className="shrink-0 rounded-full bg-[var(--sf-3)] px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-[var(--sf-4)] hover:text-foreground"
            >
              {allSelected ? t("selection.clear") : t("selection.selectAll")}
            </button>
          </div>
          <div className="flex gap-2 px-4 pb-7 pt-1">
            <button
              onClick={openMove}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-[var(--sf-2)] py-3 text-sm font-medium transition-colors hover:bg-[var(--sf-3)]"
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
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--sf-3)] text-muted-foreground transition-colors hover:bg-[var(--sf-4)] hover:text-foreground"
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
                    : "border-border bg-[var(--sf-2)] text-muted-foreground hover:text-foreground"
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
            aria-label={t("selection.targetDate")}
            className="mb-3 h-11 w-full rounded-xl border border-border bg-input px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />

          <button
            onClick={move}
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
              aria-label={t("action.back")}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--sf-3)] text-muted-foreground transition-colors hover:bg-[var(--sf-4)] hover:text-foreground"
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
              className="h-11 flex-1 rounded-xl border border-border bg-[var(--sf-2)] text-sm font-medium transition-colors hover:bg-[var(--sf-3)]"
            >
              {t("action.cancel")}
            </button>
            <button
              onClick={remove}
              disabled={busy}
              className="h-11 flex-1 rounded-xl bg-destructive text-sm font-semibold text-destructive-foreground transition-opacity disabled:opacity-40"
            >
              {busy ? t("selection.deleting") : t("action.delete")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
