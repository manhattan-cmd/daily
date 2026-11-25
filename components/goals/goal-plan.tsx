"use client";

import { useState } from "react";
import { Bell, CalendarDays, Plus, Repeat, X } from "lucide-react";
import type { Goal, GoalRepeat } from "@/types";
import { intlTag, useLocale, useT } from "@/lib/i18n";
import { builtInName } from "@/lib/i18n/built-in-names";
import { useSkin, isBlockSkin } from "@/lib/skin";
import { cn, toLocalDateValue } from "@/lib/utils";
import {
  WEEKDAYS,
  WEEKEND,
  WEEK_ORDER,
  addDays,
  repeatDays,
  repeatFromDays,
  repeatShape,
  goalTimes,
} from "@/lib/goals";
import { TimeWheel } from "@/components/ui/time-wheel";
import { isNative } from "@/lib/native";
import { blockFill } from "@/lib/fill";

/**
 * Hedefin zamanı: bir gün mü, tekrar mı; hatırlatma var mı.
 * Girdi formunun hedef halinde özelliklerin altında durur (bkz.
 * DayEntrySheet goalMode). Özellikler "ne", burası "ne zaman".
 */
export interface GoalPlanState {
  mode: "once" | "repeat";
  /** Bir günde o gün; tekrarda ilk gün */
  date: string;
  /** Tekrarın günleri (getDay sırası) */
  days: number[];
  /**
   * Gün içindeki saatler ("HH:mm", sıralı); boş = saatsiz, bildirim yok.
   * Her saat ayrı bir an: sabah ilacı ve akşam ilacı ayrı işaretlenir.
   */
  times: string[];
}

export const DEFAULT_REMIND_AT = "10:00";

export function planFromGoal(goal: Goal | undefined, base: string): GoalPlanState {
  if (!goal) return { mode: "once", date: base, days: [0, 1, 2, 3, 4, 5, 6], times: [] };
  return {
    mode: goal.repeat ? "repeat" : "once",
    date: goal.date,
    days: goal.repeat ? repeatDays(goal.repeat) : [0, 1, 2, 3, 4, 5, 6],
    times: goalTimes(goal),
  };
}

/** Kayda gidecek alanlar; undefined = alan silinsin (eski tek saat remindAt da silinir) */
export function planToGoal(plan: GoalPlanState): {
  date: string;
  repeat: GoalRepeat | undefined;
  times: string[] | undefined;
  remindAt: undefined;
} {
  const times = [...new Set(plan.times)].sort();
  return {
    date: plan.date,
    repeat: plan.mode === "repeat" ? repeatFromDays(plan.days) : undefined,
    times: times.length ? times : undefined,
    remindAt: undefined,
  };
}

/** Yeni saat: sonuncudan altı saat sonra (gece yarısını geçmez), alınmışsa bir saat ileri */
function nextTime(times: string[]): string {
  if (!times.length) return DEFAULT_REMIND_AT;
  const last = [...times].sort().at(-1)!;
  let h = Math.min(Number(last.slice(0, 2)) + 6, 22);
  let out = `${String(h).padStart(2, "0")}:00`;
  while (times.includes(out) && h < 23) {
    h += 1;
    out = `${String(h).padStart(2, "0")}:00`;
  }
  return out;
}

export const planValid = (p: GoalPlanState) => p.mode === "once" || p.days.length > 0;

/** Rengin üstünde okunur yazı: açık zeminde koyu, koyuda beyaz */
export function inkOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#fff";
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.42 ? "#111" : "#fff";
}

/** Tekrarın kısa adı: Her gün / Hafta içi / Hafta sonu / Pzt, Çar, Cum */
/** Özelliğin ekrandaki adı — yerleşikler kullanıcının dilinde (bkz. builtInName) */
export function useModLabel(): (name: string) => string {
  const t = useT();
  return (name) => builtInName(name, t);
}

export function useRepeatLabel(): (repeat: GoalRepeat) => string {
  const t = useT();
  const tag = intlTag(useLocale());
  return (repeat) => {
    const shape = repeatShape(repeat);
    if (shape === "daily") return t("goal.repeat.daily");
    if (shape === "weekdays") return t("goal.repeat.weekdays");
    if (shape === "weekend") return t("goal.repeat.weekend");
    const days = repeatDays(repeat);
    return WEEK_ORDER.filter((d) => days.includes(d))
      .map((d) => weekdayShort(d, tag))
      .join(", ");
  };
}

/** 2026-11-16 pazartesi: getDay sırasındaki günün kısa adı */
function weekdayShort(day: number, tag: string): string {
  const offset = (day + 6) % 7;
  return new Date(2026, 10, 16 + offset).toLocaleDateString(tag, { weekday: "short" });
}

export function GoalPlanFields({
  plan,
  onChange,
  accent,
  today = toLocalDateValue(),
}: {
  plan: GoalPlanState;
  onChange: (next: GoalPlanState) => void;
  accent: string;
  today?: string;
}) {
  const t = useT();
  const tag = intlTag(useLocale());
  const brutal = isBlockSkin(useSkin());
  // Çarkta düzenlenen saatin sırası; null = çark kapalı
  const [wheelAt, setWheelAt] = useState<number | null>(null);
  const times = plan.times;
  const on = times.length > 0;
  const setTimes = (next: string[]) => set({ times: next });
  const set = (patch: Partial<GoalPlanState>) => onChange({ ...plan, ...patch });
  // Brütalde renkli zeminde yazı hep siyah (kategori bantlarıyla aynı)
  const ink = brutal ? "var(--ink)" : inkOn(accent);

  const dayLabel = (key: string) => {
    if (key === today) return t("datetime.today");
    if (key === addDays(today, 1)) return t("goal.plan.tomorrow");
    const [y, m, d] = key.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(tag, {
      day: "numeric",
      month: "short",
      weekday: "short",
    });
  };

  // Seçili/seçisiz çiplerin iki temadaki görünüşü
  const chip = (on: boolean) =>
    cn(
      "flex h-10 items-center justify-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold transition-[background-color,transform] active:scale-[0.97]",
      brutal
        ? cn("border-2", on ? "shadow-[2px_2px_0_var(--shade)]" : "bg-paper text-ink")
        : on
          ? ""
          : "bg-[var(--sf-2)] text-foreground/80 hover:bg-[var(--sf-3)]"
    );
  const chipStyle = (on: boolean) =>
    on ? { background: accent, color: ink, borderColor: "var(--line)" } : brutal ? { borderColor: "var(--line)" } : undefined;

  const shape = plan.mode === "repeat" && plan.days.length ? repeatShape(repeatFromDays(plan.days)!) : null;
  const custom = plan.date !== today && plan.date !== addDays(today, 1);

  return (
    <div data-goal-plan="" className="mt-4 flex flex-col gap-3">
      {/* Ne zaman — bir gün ya da tekrar */}
      <div className="flex flex-col gap-2">
        <div className="px-1 text-[12px] font-semibold text-muted-foreground">{t("goal.plan.when")}</div>
        <div
          role="tablist"
          className={cn(
            "grid grid-cols-2 gap-1 p-1",
            brutal ? "rounded-[14px] border-2 border-line bg-paper" : "rounded-2xl bg-[var(--sf-1)] ring-1 ring-inset ring-[var(--ln-1)]"
          )}
        >
          {(["once", "repeat"] as const).map((m) => {
            const on = plan.mode === m;
            const Icon = m === "once" ? CalendarDays : Repeat;
            return (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={on}
                data-plan-mode={m}
                onClick={() =>
                  set({
                    mode: m,
                    // Tekrar geçmiş bir günden başlamaz — geçmiş günler "yapılmadı" görünürdü
                    ...(m === "repeat" && plan.date < today ? { date: today } : {}),
                  })
                }
                className={cn(
                  "flex h-10 items-center justify-center gap-1.5 text-[14px] font-semibold transition-colors",
                  brutal ? "rounded-[10px]" : "rounded-xl",
                  on ? (brutal ? "border-2" : "shadow-sm") : "text-muted-foreground"
                )}
                style={on ? { background: blockFill(accent), color: ink, borderColor: "var(--line)" } : undefined}
              >
                <Icon className="h-4 w-4" strokeWidth={2.4} />
                {t(m === "once" ? "goal.plan.once" : "goal.plan.repeat")}
              </button>
            );
          })}
        </div>

        {plan.mode === "once" ? (
          <div className="flex flex-wrap gap-2">
            {[today, addDays(today, 1)].map((key) => (
              <button
                key={key}
                type="button"
                data-plan-day={key}
                onClick={() => set({ date: key })}
                className={chip(plan.date === key)}
                style={chipStyle(plan.date === key)}
              >
                {dayLabel(key)}
              </button>
            ))}
            {/* Başka gün: telefonun takvimi (çip görünür, giriş üstünde saydam) */}
            <label className={cn(chip(custom), "relative cursor-pointer")} style={chipStyle(custom)}>
              <CalendarDays className="h-4 w-4" />
              {custom ? dayLabel(plan.date) : t("goal.plan.otherDay")}
              <input
                type="date"
                data-plan-date=""
                value={plan.date}
                min={today}
                onChange={(e) => e.target.value && set({ date: e.target.value })}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                aria-label={t("goal.plan.otherDay")}
              />
            </label>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["daily", [0, 1, 2, 3, 4, 5, 6]],
                  ["weekdays", [...WEEKDAYS]],
                  ["weekend", [...WEEKEND]],
                ] as const
              ).map(([key, days]) => (
                <button
                  key={key}
                  type="button"
                  data-plan-preset={key}
                  onClick={() => set({ days: [...days] })}
                  className={chip(shape === key)}
                  style={chipStyle(shape === key)}
                >
                  {t(`goal.repeat.${key}`)}
                </button>
              ))}
            </div>
            {/* Haftanın günleri — tek tek açılıp kapanır */}
            <div className="grid grid-cols-7 gap-1.5">
              {WEEK_ORDER.map((d) => {
                const on = plan.days.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    data-plan-weekday={d}
                    aria-pressed={on}
                    onClick={() =>
                      set({ days: on ? plan.days.filter((x) => x !== d) : [...plan.days, d] })
                    }
                    className={cn(
                      "flex aspect-square items-center justify-center rounded-full text-[12px] font-bold transition-[background-color,transform] active:scale-95",
                      brutal ? "border-2" : on ? "" : "bg-[var(--sf-2)] text-muted-foreground"
                    )}
                    style={
                      on
                        ? { background: blockFill(accent), color: ink, borderColor: "var(--line)" }
                        : brutal
                          ? { borderColor: "var(--line)", background: "var(--paper)", color: "var(--ink)" }
                          : undefined
                    }
                  >
                    {weekdayShort(d, tag)}
                  </button>
                );
              })}
            </div>
            <p className="px-1 text-[12px] leading-4 text-muted-foreground">
              {plan.days.length === 0
                ? t("goal.plan.pickDays")
                : plan.date <= today
                  ? t("goal.plan.startsToday")
                  : t("goal.plan.startsOn", { day: dayLabel(plan.date) })}
            </p>
          </div>
        )}
      </div>

      {/* Hatırlatma */}
      <div
        className={cn(
          "flex flex-col overflow-hidden",
          brutal ? "rounded-[14px] border-2 border-line bg-paper" : "rounded-2xl bg-[var(--sf-1)] ring-1 ring-inset ring-[var(--ln-1)]"
        )}
      >
        <div className="flex min-h-[60px] items-center gap-3 px-3.5">
          <span
            className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full", brutal && "border-2 border-line")}
            style={{ background: on ? blockFill(accent) : brutal ? "var(--paper)" : "var(--sf-3)", color: on ? ink : undefined }}
          >
            <Bell className="h-4 w-4" strokeWidth={2.4} />
          </span>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="text-[15px] font-semibold">{t("goal.plan.remind")}</div>
            <div className="text-[12px] text-muted-foreground">
              {!on
                ? t("goal.plan.remindOff")
                : times.length > 1
                  ? t("goal.plan.timesEach", { n: times.length })
                  : t(plan.mode === "repeat" ? "goal.plan.remindEach" : "goal.plan.remindAt")}
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={on}
            aria-label={t("goal.plan.remind")}
            data-remind-switch=""
            onClick={() => {
              setTimes(on ? [] : [DEFAULT_REMIND_AT]);
              setWheelAt(null);
            }}
            className={cn(
              "relative h-7 w-12 shrink-0 rounded-full transition-colors",
              brutal ? "border-2 border-line" : "",
              !on && (brutal ? "bg-paper" : "bg-muted-foreground/30")
            )}
            style={on ? { background: blockFill(accent) } : undefined}
          >
            <span
              className={cn(
                "absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-paper shadow transition-all",
                brutal && "border-2 border-line",
                on ? "right-1" : "left-1"
              )}
            />
          </button>
        </div>
        {/* Saatler — her biri ayrı an; dokununca çark, çarpı siler, + yeni saat */}
        {on && (
          <div data-remind-times="" className="flex flex-wrap items-center gap-1.5 px-3.5 pb-3">
            {times.map((time, i) => (
              <span
                key={`${time}-${i}`}
                className={cn(
                  "flex h-9 shrink-0 items-center overflow-hidden rounded-full",
                  brutal ? "border-2 border-line bg-paper text-ink" : "bg-[var(--sf-3)]",
                  wheelAt === i && (brutal ? "shadow-[2px_2px_0_var(--shade)]" : "ring-2 ring-inset")
                )}
                style={wheelAt === i && !brutal ? ({ "--tw-ring-color": accent } as React.CSSProperties) : undefined}
              >
                <button
                  type="button"
                  data-remind-time={time}
                  onClick={() => setWheelAt((cur) => (cur === i ? null : i))}
                  aria-expanded={wheelAt === i}
                  className={cn("h-full font-mono text-[15px] font-bold tabular-nums", times.length > 1 ? "pl-3 pr-1.5" : "px-3")}
                >
                  {time}
                </button>
                {times.length > 1 && (
                  <button
                    type="button"
                    data-remind-remove={time}
                    onClick={() => {
                      setTimes(times.filter((_, j) => j !== i));
                      setWheelAt(null);
                    }}
                    aria-label={t("goal.plan.removeTime", { time })}
                    className="flex h-full items-center pl-0.5 pr-2.5 text-muted-foreground"
                  >
                    <X className="h-3.5 w-3.5" strokeWidth={2.5} />
                  </button>
                )}
              </span>
            ))}
            {times.length < 6 && (
              <button
                type="button"
                data-remind-add=""
                onClick={() => {
                  const next = [...times, nextTime(times)];
                  setTimes(next);
                  setWheelAt(next.length - 1);
                }}
                className={cn(
                  "flex h-9 shrink-0 items-center gap-1 rounded-full px-3 text-[13px] font-semibold",
                  brutal ? "border-2 border-dashed border-line bg-paper text-ink" : "border border-dashed border-[var(--ln-3)] text-muted-foreground"
                )}
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={2.75} />
                {t("goal.plan.addTime")}
              </button>
            )}
          </div>
        )}
        {on && wheelAt !== null && times[wheelAt] && (
          <div className={cn("px-3 pb-3 pt-1", brutal ? "border-t-2 border-line" : "border-t border-[var(--ln-1)]")}>
            <TimeWheel
              value={times[wheelAt]}
              onChange={(v) => setTimes(times.map((x, j) => (j === wheelAt ? v : x)))}
              accent={accent}
            />
            <button
              type="button"
              onClick={() => {
                // Kapanınca sıraya dizilir (aynı saat iki kez olmaz)
                setTimes([...new Set(times)].sort());
                setWheelAt(null);
              }}
              className={cn(
                "mt-2 h-10 w-full rounded-xl text-[14px] font-semibold",
                brutal && "border-2 border-line"
              )}
              style={{ background: blockFill(accent), color: ink }}
            >
              {t("action.done")}
            </button>
          </div>
        )}
        {on && !isNative() && (
          <p className="px-3.5 pb-3 text-[11.5px] leading-4 text-muted-foreground">{t("goal.plan.webHint")}</p>
        )}
      </div>
    </div>
  );
}
