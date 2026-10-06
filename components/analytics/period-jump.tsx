"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { CalendarRange, ChevronLeft, ChevronRight } from "lucide-react";
import { db } from "@/lib/db";
import { cn } from "@/lib/utils";
import { intlTag, useLocale, useT } from "@/lib/i18n";
import { chipClass } from "@/components/ui/section-nav";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { ENTRY_WINDOW, ENTRY_WINDOW_FOOTER } from "@/components/ui/entry-window";
import { dayKey } from "@/lib/analytics";
import {
  customPeriod,
  dayPeriod,
  monthPeriod,
  parsePeriodKey,
  weekPeriod,
} from "@/lib/period";
import { routes } from "@/lib/routes";

const DAY = 86400000;

/** Yerel gün başı — saat dilimi/yaz saati kaymasına karşı tarih üzerinden */
function startOfDay(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
function addDays(t: number, n: number): number {
  const d = new Date(t);
  d.setDate(d.getDate() + n);
  return d.getTime();
}

/**
 * Özel dönem seçici — takvimden iki gün seç, ikisi ve arası analiz edilir.
 *
 * Eskiden çip satırının içinde açılan küçük bir kutuydu: satır yana kaydığı
 * için taşan içeriği kesiyordu ve kutu ya hiç görünmüyor ya da yarım
 * kalıyordu; içinde de tarayıcının kaba tarih alanları vardı. Artık kendi
 * penceresi var:
 *  - ay takvimi: ilk dokunuş başlangıç, ikincisi bitiş (önceki bir güne
 *    dokunulursa yer değiştirir); aradaki günler tek bir bantla boyanır;
 *  - girdisi olan günlerin altında küçük bir nokta — boş bir aralığı seçip
 *    boş bir analize bakmamak için;
 *  - hızlı aralıklar (dün, son 7/30 gün, geçen hafta/ay) takvimi doldurur,
 *    analiz düğmesi seçimi onaylar. Gelecek günler seçilemez.
 */
export function PeriodJump({
  activeKey,
  segment = false,
}: {
  activeKey?: string;
  /** Zaman seçicinin bölmesi olarak — yalnız takvim simgesi */
  segment?: boolean;
}) {
  // Özel bir dönemdeyken çip vurgulu, pencere o aralıkla açılır
  const current = activeKey?.startsWith("c-") ? parsePeriodKey(activeKey) : null;
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // Açılış anı — "bugün" ve hızlı aralıklar ona göre (render saf kalsın)
  const [today, setToday] = useState(() => startOfDay(Date.now()));
  const [start, setStart] = useState<number | null>(null);
  const [end, setEnd] = useState<number | null>(null);
  // Gösterilen ayın ilk günü
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  });

  function openPicker() {
    const now = startOfDay(Date.now());
    setToday(now);
    // Bakılan özel aralık ya da son 7 gün hazır seçili gelir
    const a = current ? current.start : addDays(now, -6);
    const b = current ? addDays(current.end, -1) : now;
    setStart(a);
    setEnd(b);
    const d = new Date(b);
    setMonth(new Date(d.getFullYear(), d.getMonth(), 1).getTime());
    setOpen(true);
  }

  function pick(day: number) {
    if (day > today) return;
    // Aralık tamamsa ya da hiç yoksa yeni başlangıç; yarımsa bitiş
    if (start === null || end !== null) {
      setStart(day);
      setEnd(null);
    } else if (day < start) {
      setEnd(start);
      setStart(day);
    } else {
      setEnd(day);
    }
  }

  function setRange(a: number, b: number) {
    setStart(a);
    setEnd(b);
    const d = new Date(b);
    setMonth(new Date(d.getFullYear(), d.getMonth(), 1).getTime());
  }

  function analyse() {
    if (start === null) return;
    const e = end ?? start;
    const key =
      dayKey(start) === dayKey(e)
        ? dayPeriod(start).key
        : customPeriod(start, e).key;
    setOpen(false);
    router.push(routes.period(key));
  }

  // Takvim ızgarası: ayın ilk haftasının pazartesisinden 6 hafta
  const m = new Date(month);
  const gridStart = addDays(month, -((m.getDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const lastRowNeeded = new Date(days[35]).getMonth() === m.getMonth();
  const shown = lastRowNeeded ? days : days.slice(0, 35);

  // Görünen aralıkta girdisi olan günler
  const entryDays = useLiveQuery(async () => {
    if (!open) return new Set<string>();
    const from = shown[0];
    const to = addDays(shown[shown.length - 1], 1);
    const list = await db.entries
      .where("occurredAt")
      .between(from, to, true, false)
      .toArray();
    return new Set(list.map((e) => dayKey(e.occurredAt)));
  }, [open, month]);

  const tag = intlTag(locale);
  const weekdays = useMemo(() => {
    const f = new Intl.DateTimeFormat(tag, { weekday: "narrow" });
    // 2024-01-01 pazartesi
    return Array.from({ length: 7 }, (_, i) => f.format(new Date(2024, 0, 1 + i)));
  }, [tag]);
  const monthLabel = new Intl.DateTimeFormat(tag, {
    month: "long",
    year: "numeric",
  }).format(month);
  const short = (x: number) =>
    new Intl.DateTimeFormat(tag, { day: "numeric", month: "short" }).format(x);

  const lo = start;
  const hi = end ?? start;
  const count =
    lo !== null && hi !== null ? Math.round((startOfDay(hi) - startOfDay(lo)) / DAY) + 1 : 0;
  const nextMonthStart = new Date(m.getFullYear(), m.getMonth() + 1, 1).getTime();

  const d = new Date(today);
  const quick: { label: string; range: [number, number] }[] = [
    { label: t("period.yesterday"), range: [addDays(today, -1), addDays(today, -1)] },
    { label: t("period.last7"), range: [addDays(today, -6), today] },
    { label: t("period.last30"), range: [addDays(today, -29), today] },
    (() => {
      const w = weekPeriod(addDays(today, -7));
      return { label: t("period.lastWeek"), range: [w.start, addDays(w.end, -1)] as [number, number] };
    })(),
    (() => {
      const mp = monthPeriod(new Date(d.getFullYear(), d.getMonth() - 1, 1).getTime());
      return { label: t("period.lastMonth"), range: [mp.start, addDays(mp.end, -1)] as [number, number] };
    })(),
  ];

  return (
    <>
      <button
        type="button"
        onClick={openPicker}
        className={
          segment
            ? cn(
                "flex h-7 w-9 shrink-0 items-center justify-center rounded-[9px] transition-colors",
                current
                  ? "bg-foreground text-background shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )
            : cn(chipClass(!!current), "flex shrink-0 items-center gap-1.5")
        }
        aria-current={current ? "page" : undefined}
        aria-label={segment ? t("period.custom") : undefined}
        title={segment ? t("period.custom") : undefined}
      >
        <CalendarRange className="h-3.5 w-3.5" />
        {!segment && t("period.custom")}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          aria-describedby={undefined}
          className={cn(ENTRY_WINDOW, "h-auto gap-0")}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          {/* Başlık — seçili aralık canlı */}
          <div className="pb-4 pr-6">
            <DialogTitle className="text-lg font-semibold tracking-tight">
              {t("period.customTitle")}
            </DialogTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {lo === null
                ? t("period.pickStart")
                : end === null
                  ? `${short(lo)} – … · ${t("period.pickEnd")}`
                  : `${short(lo)} – ${short(hi!)} · ${t("period.dayCount", { n: count })}`}
            </p>
          </div>

          {/* Hızlı aralıklar — takvimi doldurur */}
          <div className="no-scrollbar -mx-6 mb-4 flex gap-1.5 overflow-x-auto px-6">
            {quick.map((q) => {
              const on = lo === q.range[0] && hi === q.range[1] && end !== null;
              return (
                <button
                  key={q.label}
                  type="button"
                  onClick={() => setRange(q.range[0], q.range[1])}
                  className={cn(
                    "shrink-0 rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors",
                    on
                      ? "bg-primary/20 text-primary ring-1 ring-inset ring-primary/50"
                      : "bg-[var(--sf-2)] text-muted-foreground hover:text-foreground"
                  )}
                >
                  {q.label}
                </button>
              );
            })}
          </div>

          {/* Takvim */}
          <div className="rounded-2xl bg-[var(--sf-1)] p-3 ring-1 ring-inset ring-[var(--ln-1)]">
            <div className="mb-2 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setMonth(new Date(m.getFullYear(), m.getMonth() - 1, 1).getTime())}
                aria-label={t("period.prevMonth")}
                className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-[var(--sf-2)] hover:text-foreground"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-sm font-semibold capitalize">{monthLabel}</span>
              <button
                type="button"
                onClick={() => setMonth(nextMonthStart)}
                disabled={nextMonthStart > today}
                aria-label={t("period.nextMonth")}
                className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-[var(--sf-2)] hover:text-foreground disabled:opacity-25"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-7">
              {weekdays.map((w, i) => (
                <span
                  key={i}
                  className="pb-1.5 text-center text-[10px] font-semibold uppercase text-muted-foreground/50"
                >
                  {w}
                </span>
              ))}
              {shown.map((day) => {
                const inMonth = new Date(day).getMonth() === m.getMonth();
                const future = day > today;
                const isStart = lo !== null && day === lo;
                const isEnd = hi !== null && end !== null && day === hi;
                const inRange = lo !== null && hi !== null && day >= lo && day <= hi;
                const single = isStart && (end === null || lo === hi);
                const hasEntries = entryDays?.has(dayKey(day));
                const dow = (new Date(day).getDay() + 6) % 7;
                return (
                  <div
                    key={day}
                    className="relative flex h-10 items-center justify-center"
                  >
                    {/* Aralık bandı — uçlarda yarım, satır başı/sonunda yuvarlak */}
                    {inRange && !single && (
                      <span
                        className={cn(
                          "absolute inset-y-1 bg-primary/15",
                          isStart ? "left-1/2 right-0" : isEnd ? "left-0 right-1/2" : "inset-x-0",
                          !isStart && dow === 0 && "rounded-l-full",
                          !isEnd && dow === 6 && "rounded-r-full"
                        )}
                      />
                    )}
                    <button
                      type="button"
                      disabled={future}
                      onClick={() => pick(day)}
                      aria-pressed={isStart || isEnd}
                      aria-label={dayKey(day)}
                      className={cn(
                        "relative flex h-9 w-9 flex-col items-center justify-center rounded-full text-[13px] tabular-nums transition-colors",
                        isStart || isEnd
                          ? "bg-primary font-semibold text-primary-foreground"
                          : inRange
                            ? "font-medium text-foreground"
                            : inMonth
                              ? "text-foreground/85 hover:bg-[var(--sf-2)]"
                              : "text-muted-foreground/35 hover:bg-[var(--sf-2)]",
                        future && "pointer-events-none opacity-25",
                        day === today && !(isStart || isEnd) && "ring-1 ring-inset ring-primary/50"
                      )}
                    >
                      {new Date(day).getDate()}
                      {hasEntries && (
                        <span
                          className={cn(
                            "absolute bottom-1 h-1 w-1 rounded-full",
                            isStart || isEnd ? "bg-primary-foreground/80" : "bg-primary/70"
                          )}
                        />
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <DialogFooter className={cn(ENTRY_WINDOW_FOOTER, "mt-4")}>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {t("action.cancel")}
            </Button>
            <Button type="button" onClick={analyse} disabled={start === null}>
              {t("period.analyse")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
