"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Bell, CalendarDays, Repeat, Target } from "lucide-react";
import { listAllGoals, goalTitle } from "@/lib/db/queries";
import { goalTimes, occursOn, weekOf } from "@/lib/goals";
import { intlTag, useLocale, useT } from "@/lib/i18n";
import { useSkin } from "@/lib/skin";
import { matchesSearch, normalizeSearch } from "@/lib/search";
import { cn, toLocalDateValue } from "@/lib/utils";
import type { GoalWithContext } from "@/types";
import { EmptyState } from "@/components/ui/empty-state";
import { SummaryBlock, SummaryEmpty } from "@/components/ui/summary-block";
import { DayEntrySheet } from "@/components/calendar/day-entry-sheet";
import { useRepeatLabel } from "@/components/goals/goal-plan";

export type Row = { goal: GoalWithContext; doneDays: Set<string> };

/** Bölümlerin rengi — planlı girdilerin pembesi (gün özetindeki PLANLI) */
const PLANNED = "#ff9ecd";

/**
 * Planlı girdilerin hepsi tek yerde (Yapı › Girdiler › Planlı girdiler):
 * tekrar edenler (bu haftanın durumuyla), yaklaşan tek günlükler, geçmiş ve
 * bitenler. Planın kendisi günlerde yaşıyor (gün sayfası, ana sayfa); burası
 * onları bulma, düzenleme ve saatlerini görme yeri. Arama adda, kategoride
 * ve notta (bkz. StructureSearch). Eskiden ayrı /goals sayfasıydı.
 */
export function PlannedList({ query, onPlan }: { query: string; onPlan: () => void }) {
  const t = useT();
  const brutal = useSkin() === "brutal";
  const today = toLocalDateValue();
  const rows = useLiveQuery(() => listAllGoals(), []);
  const [editing, setEditing] = useState<GoalWithContext | null>(null);

  const q = normalizeSearch(query.trim());
  const matches = (g: GoalWithContext) =>
    !q || matchesSearch(`${goalTitle(g)} ${g.category.name} ${g.note ?? ""}`, q);

  const repeating: Row[] = [];
  const upcoming: Row[] = [];
  const past: Row[] = [];
  for (const r of rows ?? []) {
    const g = r.goal;
    if (!matches(g)) continue;
    if (g.repeat) (g.until && g.until < today ? past : repeating).push(r);
    else (g.date >= today && !r.doneDays.size ? upcoming : past).push(r);
  }
  upcoming.sort((a, b) => a.goal.date.localeCompare(b.goal.date));
  past.sort((a, b) => (b.goal.until ?? b.goal.date).localeCompare(a.goal.until ?? a.goal.date));

  const sections = [
    { key: "repeating", title: t("goal.section.repeating"), rows: repeating, dim: false },
    { key: "upcoming", title: t("goal.section.upcoming"), rows: upcoming, dim: false },
    { key: "past", title: t("goal.section.past"), rows: past.slice(0, 30), dim: true },
  ].filter((s) => s.rows.length > 0);
  const list = (rs: Row[]) =>
    rs.map((r) => <GoalRow key={r.goal.id} row={r} today={today} onOpen={() => setEditing(r.goal)} />);

  let body: React.ReactNode = null;
  if (rows === undefined) body = null;
  else if (rows.length === 0)
    body = brutal ? (
      <SummaryBlock
        compact
        lead={{ kind: "count", color: PLANNED, glyph: Target, overline: t("goal.pageTitle"), value: "0", unit: "" }}
        stats={[]}
      >
        <SummaryEmpty text={t("goal.emptyTitle")} action={{ label: t("goal.create"), onClick: onPlan }} />
      </SummaryBlock>
    ) : (
      <EmptyState icon={Target} title={t("goal.emptyTitle")} description={t("goal.emptyHint")} />
    );
  else if (sections.length === 0)
    body = <p className="px-1 text-[13px] font-medium text-muted-foreground">{t("goal.noMatch")}</p>;
  else
    body = sections.map((s) =>
      brutal ? (
        <SummaryBlock
          key={s.key}
          className="mb-4"
          compact
          dense
          lead={{ kind: "count", color: PLANNED, overline: s.title, value: String(s.rows.length), unit: "" }}
          stats={[]}
        >
          <div className={cn("flex flex-col gap-2 bg-white p-3", s.dim && "opacity-75")}>{list(s.rows)}</div>
        </SummaryBlock>
      ) : (
        <section key={s.key} className="mb-6">
          <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{s.title}</h2>
          <div className={cn("flex flex-col gap-2", s.dim && "opacity-75")}>{list(s.rows)}</div>
        </section>
      )
    );

  return (
    <div data-goals-page="" className="pb-8">
      {body}
      {editing && (
        <DayEntrySheet date={editing.date} open onClose={() => setEditing(null)} editGoal={editing} />
      )}
    </div>
  );
}

/** Planlı girdinin satırı — Ara da kullanıyor (bkz. SearchPlanned) */
export function GoalRow({ row, today, onOpen }: { row: Row; today: string; onOpen: () => void }) {
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
  const times = goalTimes(goal);

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
        <span className="block break-words text-[15px] font-semibold">{goalTitle(goal)}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2.5 text-[12px] text-muted-foreground">
          <span>{goal.repeat ? repeatLabel(goal.repeat) : dateLabel(goal.date)}</span>
          {times.length > 0 && (
            <span className="inline-flex items-center gap-1">
              <Bell className="h-3 w-3" />
              {times.join(" · ")}
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
