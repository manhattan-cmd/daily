"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocale, useT, type MessageKey } from "@/lib/i18n";
import {
  allPeriod,
  dayPeriod,
  monthPeriod,
  periodLabel,
  shiftPeriod,
  weekPeriod,
  yearPeriod,
  type Period,
  type PeriodKind,
} from "@/lib/period";
import { routes } from "@/lib/routes";
import { PeriodJump } from "./period-jump";

/** Şu an — bileşen dışında: çizim saf kalsın, okuma tıklamada/çizimde taze */
const nowMs = () => Date.now();

const KINDS: { kind: Exclude<PeriodKind, "custom">; label: MessageKey }[] = [
  { kind: "day", label: "range.day" },
  { kind: "week", label: "range.week" },
  { kind: "month", label: "range.month" },
  { kind: "year", label: "range.year" },
  { kind: "all", label: "insights.all" },
];

/** Sekme — kutusuz; seçili olanın altında ince çizgi */
// Etiket genişliğinde, satıra uçtan uca yayılır (justify-between): ilk
// sekmenin yazısı tam sol kenardan başlar — altındaki yolla aynı hizada
export const TAB =
  "relative flex h-8 shrink-0 items-center text-[12.5px] font-semibold transition-colors";
export const tabState = (on: boolean) =>
  on
    ? "text-foreground after:absolute after:-inset-x-1 after:-bottom-px after:h-[2px] after:rounded-full after:bg-foreground"
    : "text-muted-foreground hover:text-foreground";

/**
 * Dönem türü sekmeleri — analiz başlığında: Gün | Hafta | Ay | Yıl | Tümü | 📅.
 *
 * Kutusuz, alt çizgili düz sekmeler: bant sade dursun, zaman bir AYAR olduğu
 * için renksiz ve sessiz. (Bir ara ters renkli dolu bölmeydi; bandın en
 * parlak öğesi olup yer bilgisiyle yarışıyordu.)
 *
 * Akıllı geçiş: tür değiştirmek BAKILAN tarihe göre — Eylül'ün bir
 * haftasındayken "Ay" Eylül'ü açar ("bu ay"ı değil); bakılan dönem şimdiyi
 * kapsıyorsa bugüne göre. Zaten seçili sekmeye yeniden dokunmak o türün
 * şimdiki dönemine döner (bu hafta, bu ay…).
 */
export function PeriodTabs({
  period,
  onPick,
}: {
  period: Period;
  /** Verilirse dönem URL'ye gitmek yerine buraya bildirilir (sayfa içi
   *  seçici); özel aralık takvimi o zaman gösterilmez */
  onPick?: (p: Period) => void;
}) {
  const t = useT();
  const router = useRouter();

  function pickKind(kind: Exclude<PeriodKind, "custom">) {
    const now = nowMs();
    const inside = now >= period.start && now < period.end;
    const anchor =
      kind === period.kind || period.kind === "all" || inside ? now : period.start;
    const next =
      kind === "day"
        ? dayPeriod(anchor)
        : kind === "week"
          ? weekPeriod(anchor)
          : kind === "month"
            ? monthPeriod(anchor)
            : kind === "year"
              ? yearPeriod(anchor)
              : allPeriod();
    if (next.key === period.key) return;
    if (onPick) onPick(next);
    else router.push(routes.period(next.key));
  }

  return (
    <div
      role="tablist"
      aria-label={t("insights.period")}
      data-period-tabs=""
      data-no-jump={onPick ? "" : undefined}
      className="flex items-center justify-between border-b border-[var(--ln-1)]"
    >
      {KINDS.map(({ kind, label }) => {
        const on = period.kind === kind;
        return (
          <button
            key={kind}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => pickKind(kind)}
            className={cn(TAB, tabState(on))}
          >
            {t(label)}
          </button>
        );
      })}
      {/* Özel aralık — takvim; özel dönemdeyken seçili */}
      {!onPick && <PeriodJump activeKey={period.key} segment />}
    </div>
  );
}

/**
 * Tarih kumandası — ortada dönemin adı yumuşak bir kapsülde, iki yanında ‹ ›.
 * Bant ortadan okunur: hangi dönemde olduğun tek bakışta, bir önceki/sonraki
 * döneme geçiş hemen yanında. Aynı türde bir önceki ya da sonraki döneme;
 * tamamen gelecekte kalan döneme gidilmez.
 */
export function PeriodNav({
  period,
  label,
  note,
  onPick,
}: {
  period: Period;
  /** Kapsüldeki ad — verilmezse dönemin kendi etiketi */
  label?: string;
  /** Adın yanında sönük ek ("3/30. gün") */
  note?: string;
  /** Verilirse URL'ye gitmek yerine buraya bildirilir (sayfa içi seçici) */
  onPick?: (p: Period) => void;
}) {
  const t = useT();
  // Etiket bu dille — period.label sunucuyla tutmuyordu (bkz. periodLabel)
  const locale = useLocale();
  const router = useRouter();
  const prev = shiftPeriod(period, -1);
  const nextP = shiftPeriod(period, 1);
  const nextDisabled = !nextP || nextP.start > nowMs();
  const btn =
    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-[var(--sf-2)] hover:text-foreground disabled:opacity-25";
  return (
    <div className="flex items-center justify-center gap-1.5">
      <button
        type="button"
        disabled={!prev}
        onClick={() => prev && (onPick ? onPick(prev) : router.push(routes.period(prev.key)))}
        aria-label={t("insights.previousPeriod")}
        className={btn}
      >
        <ChevronLeft className="h-[18px] w-[18px]" />
      </button>
      <h1 data-period-pill="" className="flex h-8 min-w-0 max-w-[240px] items-center gap-1.5 rounded-full bg-[var(--sf-2)] px-4 ring-1 ring-inset ring-[var(--ln-1)]">
        <span className="truncate text-[14px] font-semibold tracking-tight">
          {label ?? periodLabel(period, locale)}
        </span>
        {note && (
          <span className="shrink-0 text-[11.5px] text-muted-foreground">{note}</span>
        )}
      </h1>
      <button
        type="button"
        disabled={nextDisabled}
        onClick={() => nextP && (onPick ? onPick(nextP) : router.push(routes.period(nextP.key)))}
        aria-label={t("insights.nextPeriod")}
        className={btn}
      >
        <ChevronRight className="h-[18px] w-[18px]" />
      </button>
    </div>
  );
}
