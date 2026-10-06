"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT, type MessageKey } from "@/lib/i18n";
import {
  allPeriod,
  dayPeriod,
  monthPeriod,
  shiftPeriod,
  weekPeriod,
  yearPeriod,
  type Period,
  type PeriodKind,
} from "@/lib/period";
import { routes } from "@/lib/routes";
import { PeriodJump } from "./period-jump";
import { RAIL, RAIL_ITEM } from "./header-rail";

/** Şu an — bileşen dışında: çizim saf kalsın, okuma tıklamada/çizimde taze */
const nowMs = () => Date.now();

const KINDS: { kind: Exclude<PeriodKind, "custom">; label: MessageKey }[] = [
  { kind: "day", label: "range.day" },
  { kind: "week", label: "range.week" },
  { kind: "month", label: "range.month" },
  { kind: "year", label: "range.year" },
  { kind: "all", label: "insights.all" },
];

/** Bölmeli düğmenin bir bölmesi — seçili olan ters renkte (menü gibi) */
const SEGMENT = `${RAIL_ITEM} min-w-0 flex-1`;
const segmentState = (on: boolean) =>
  on
    ? "bg-foreground text-background shadow-sm"
    : "text-muted-foreground hover:text-foreground";

/**
 * Zaman seçici — analiz başlığının yapışkan bandında: ‹ [Gün | Hafta | Ay |
 * Yıl | Tümü | 📅] ›.
 *
 * Renkli kapsüllerden bilerek AYRI bir dil: tek parça bölmeli düğme, seçili
 * bölme ters renkte. Konum çubuğu ve kartlar renkli "yer" gösteriyor; zaman
 * bir ayar, menü gibi durmalı.
 *
 * Akıllı geçiş: tür değiştirmek BAKILAN tarihe göre — Eylül'ün bir
 * haftasındayken "Ay" Eylül'ü açar ("bu ay"ı değil); bakılan dönem şimdiyi
 * kapsıyorsa bugüne göre. Zaten seçili bölmeye yeniden dokunmak o türün
 * şimdiki dönemine döner (bu hafta, bu ay…). Oklar aynı türde bir önceki /
 * sonraki döneme; tamamen gelecekte kalan döneme gidilmez.
 */
export function PeriodSwitcher({ period }: { period: Period }) {
  const t = useT();
  const router = useRouter();
  const go = (p: Period) => router.push(routes.period(p.key));

  function pickKind(kind: Exclude<PeriodKind, "custom">) {
    const now = nowMs();
    const inside = now >= period.start && now < period.end;
    // Seçili türe yeniden dokunmak: şimdiki dönem
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
    if (next.key !== period.key) go(next);
  }

  const prev = shiftPeriod(period, -1);
  const nextP = shiftPeriod(period, 1);
  const nextDisabled = !nextP || nextP.start > nowMs();
  const arrow =
    `${RAIL_ITEM} w-7 text-muted-foreground hover:bg-[var(--sf-3)] hover:text-foreground disabled:opacity-25`;

  return (
    <div role="tablist" aria-label={t("insights.period")} className={RAIL}>
      <button
        type="button"
        disabled={!prev}
        onClick={() => prev && go(prev)}
        aria-label={t("insights.previousPeriod")}
        className={arrow}
      >
        <ChevronLeft className="h-4 w-4" />
      </button>

        {KINDS.map(({ kind, label }) => {
          const on = period.kind === kind;
          return (
            <button
              key={kind}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => pickKind(kind)}
              className={cn(SEGMENT, segmentState(on))}
            >
              <span className="truncate px-0.5">{t(label)}</span>
            </button>
          );
        })}
        {/* Özel aralık — takvim; özel dönemdeyken seçili */}
        <PeriodJump activeKey={period.key} segment />

      <button
        type="button"
        disabled={nextDisabled}
        onClick={() => nextP && go(nextP)}
        aria-label={t("insights.nextPeriod")}
        className={arrow}
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
