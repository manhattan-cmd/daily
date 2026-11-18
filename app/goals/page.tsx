"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Bell, CalendarDays, Plus, Repeat, Target } from "lucide-react";
import { listAllGoals, goalTitle } from "@/lib/db/queries";
import { occursOn, weekOf } from "@/lib/goals";
import { intlTag, useLocale, useT } from "@/lib/i18n";
import { useSkin } from "@/lib/skin";
import { cn, toLocalDateValue } from "@/lib/utils";
import type { GoalWithContext } from "@/types";
import { PageHeader } from "@/components/layout/page-header";
import { PageSheet } from "@/components/ui/layer";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { useDayAdd } from "@/components/calendar/day-add";
import { DayEntrySheet } from "@/components/calendar/day-entry-sheet";
import { useRepeatLabel } from "@/components/goals/goal-plan";

type Row = { goal: GoalWithContext; doneDays: Set<string> };

/**
 * HEDEFLER — kurulan bütün hedefler tek yerde: tekrar edenler (bu haftanın
 * durumuyla), yaklaşan tek günlükler, bitenler. Hedefin kendisi günlerde
 * yaşıyor (gün sayfası ve ana sayfa); burası onları düzenleme ve
 * hatırlatmaları görme yeri.
 */
export default function GoalsPage() {
  const t = useT();
  const today = toLocalDateValue();
  const add = useDayAdd(today);
  const rows = useLiveQuery(() => listAllGoals(), []);
  const [editing, setEditing] = useState<GoalWithContext | null>(null);

  const repeating: Row[] = [];
  const upcoming: Row[] = [];
  const past: Row[] = [];
  for (const r of rows ?? []) {
    const g = r.goal;
    if (g.repeat) (g.until && g.until < today ? past : repeating).push(r);
    else (g.date >= today && !r.doneDays.size ? upcoming : past).push(r);
  }
  upcoming.sort((a, b) => a.goal.date.localeCompare(b.goal.date));
  past.sort((a, b) => (b.goal.until ?? b.goal.date).localeCompare(a.goal.until ?? a.goal.date));
  const heading = "mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground";

  return (
    <PageSheet
      top={
        <PageHeader
          title={t("goal.pageTitle")}
          description={t("goal.pageLead")}
          icon={Target}
          back="/"
        />
      }
    >
      <div data-goals-page="" className="flex flex-col gap-6 pb-8">
        <Button onClick={add.openGoal} className="h-12 rounded-2xl" data-goals-add="">
          <Plus className="h-5 w-5" />
          {t("goal.add")}
        </Button>

        {rows && rows.length === 0 && (
          <EmptyState icon={Target} title={t("goal.emptyTitle")} description={t("goal.emptyHint")} />
        )}

        {repeating.length > 0 && (
          <section>
            <h2 className={heading}>{t("goal.section.repeating")}</h2>
            <div className="flex flex-col gap-2">
              {repeating.map((r) => (
                <GoalRow key={r.goal.id} row={r} today={today} onOpen={() => setEditing(r.goal)} />
              ))}
            </div>
          </section>
        )}
        {upcoming.length > 0 && (
          <section>
            <h2 className={heading}>{t("goal.section.upcoming")}</h2>
            <div className="flex flex-col gap-2">
              {upcoming.map((r) => (
                <GoalRow key={r.goal.id} row={r} today={today} onOpen={() => setEditing(r.goal)} />
              ))}
            </div>
          </section>
        )}
        {past.length > 0 && (
          <section>
            <h2 className={heading}>{t("goal.section.past")}</h2>
            <div className="flex flex-col gap-2 opacity-75">
              {past.slice(0, 30).map((r) => (
                <GoalRow key={r.goal.id} row={r} today={today} onOpen={() => setEditing(r.goal)} />
              ))}
            </div>
          </section>
        )}
      </div>

      {editing && (
        <DayEntrySheet
          date={editing.date}
          open
          onClose={() => setEditing(null)}
          editGoal={editing}
        />
      )}
      {add.sheets}
    </PageSheet>
  );
}

function GoalRow({ row, today, onOpen }: { row: Row; today: string; onOpen: () => void }) {
  const t = useT();
  const tag = intlTag(useLocale());
  const brutal = useSkin() === "brutal";
  const repeatLabel = useRepeatLabel();
  const { goal, doneDays } = row;
  const color =
    goal.category.isBuiltIn && (goal.category.builtInKey ?? "sleep") === "mood"
      ? "#f472b6"
      : goal.category.isBuiltIn
        ? "#8b5cf6"
        : goal.category.color || "#818cf8";
  const week = weekOf(today).filter((d) => occursOn(goal, d));
  const doneThisWeek = week.filter((d) => doneDays.has(d)).length;
  const dateLabel = (key: string) => {
    const [y, m, d] = key.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(tag, { day: "numeric", month: "short", weekday: "short" });
  };

  return (
    <button
      type="button"
      data-goal-row=""
      onClick={onOpen}
      className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card px-3 py-3 text-left transition-colors hover:bg-[var(--sf-1)]"
    >
      <span
        className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px]", brutal && "border-2 border-[#111]")}
        style={{ background: color }}
      >
        {goal.repeat ? (
          <Repeat className="h-5 w-5 text-white" strokeWidth={2.4} />
        ) : (
          <CalendarDays className="h-5 w-5 text-white" strokeWidth={2.4} />
        )}
      </span>
      <span className="min-w-0 flex-1 leading-tight">
        {!goal.subcategory.isCategoryRoot && !goal.category.isBuiltIn && (
          <span className="block truncate text-[11.5px] font-medium text-muted-foreground">{goal.category.name}</span>
        )}
        <span className="block truncate text-[15px] font-semibold">{goalTitle(goal)}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2.5 text-[12px] text-muted-foreground">
          <span>{goal.repeat ? repeatLabel(goal.repeat) : dateLabel(goal.date)}</span>
          {goal.remindAt && (
            <span className="inline-flex items-center gap-1">
              <Bell className="h-3 w-3" />
              {goal.remindAt}
            </span>
          )}
          {goal.repeat && goal.until && goal.until < today && (
            <span>{t("goal.endedOn", { day: dateLabel(goal.until) })}</span>
          )}
          {!goal.repeat && doneDays.size > 0 && <span className="font-semibold">{t("goal.doneLabel")}</span>}
        </span>
      </span>
      {goal.repeat && (!goal.until || goal.until >= today) && week.length > 0 && (
        <span className="shrink-0 text-right leading-tight">
          <span className="block text-[15px] font-bold tabular-nums">
            {doneThisWeek}/{week.length}
          </span>
          <span className="block text-[10.5px] text-muted-foreground">{t("goal.thisWeek")}</span>
        </span>
      )}
    </button>
  );
}
