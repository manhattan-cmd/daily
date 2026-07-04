"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, Plus, CalendarDays, Target } from "lucide-react";
import { listEntriesByDate, listGoalsByDate } from "@/lib/db/queries";
import { EntryCard } from "@/components/dashboard/entry-card";
import { LinkedEntryCard } from "@/components/dashboard/linked-entry-card";
import { GoalCard } from "@/components/goals/goal-card";
import { AddGoalSheet } from "@/components/goals/add-goal-sheet";
import { EmptyState } from "@/components/ui/empty-state";
import type { EntryWithContext } from "@/types";
import { Button } from "@/components/ui/button";
import { DayEntrySheet } from "@/components/calendar/day-entry-sheet";

type EntryItem =
  | { type: "single"; entry: EntryWithContext }
  | { type: "group"; entries: EntryWithContext[] };

function groupEntries(entries: EntryWithContext[]): EntryItem[] {
  const result: EntryItem[] = [];
  const groupMap = new Map<string, EntryWithContext[]>();
  const seen = new Set<string>();

  for (const e of entries) {
    if (e.linkedGroupId) {
      if (!groupMap.has(e.linkedGroupId)) groupMap.set(e.linkedGroupId, []);
      groupMap.get(e.linkedGroupId)!.push(e);
    }
  }

  for (const e of entries) {
    if (!e.linkedGroupId) {
      result.push({ type: "single", entry: e });
    } else if (!seen.has(e.linkedGroupId)) {
      result.push({ type: "group", entries: groupMap.get(e.linkedGroupId)! });
      seen.add(e.linkedGroupId);
    }
  }

  return result;
}

const MONTHS_TR = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];
const WEEKDAYS_TR = [
  "Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi",
];

export default function CalendarDayPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = use(params);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [goalSheetOpen, setGoalSheetOpen] = useState(false);

  const [yearN, monthN, dayN] = date.split("-").map(Number);
  const d = new Date(yearN, monthN - 1, dayN);

  const entries = useLiveQuery(() => listEntriesByDate(date), [date]);
  const goals = useLiveQuery(() => listGoalsByDate(date), [date]);

  const todayFlat = (() => {
    const t = new Date();
    return new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();
  })();
  const isToday = d.getTime() === todayFlat;

  return (
    <>
      {/* Header */}
      <div className="pt-10 pb-5">
        <Link
          href="/calendar"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground mb-5 -ml-0.5 hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Takvim</span>
        </Link>

        <div className="flex items-end justify-between gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-sm text-muted-foreground mb-0.5">
              {WEEKDAYS_TR[d.getDay()]}
            </p>
            <h1 className="text-3xl font-bold tracking-tight leading-none">
              {d.getDate()} {MONTHS_TR[d.getMonth()]}
            </h1>
            <div className="mt-1.5">
              {isToday ? (
                <span className="text-xs font-semibold text-primary">Bugün</span>
              ) : (
                <span className="text-xs text-muted-foreground">{d.getFullYear()}</span>
              )}
            </div>
          </div>

          <Button
            size="sm"
            className="shrink-0 rounded-xl"
            onClick={() => setSheetOpen(true)}
          >
            <Plus className="h-4 w-4" />
            Girdi ekle
          </Button>
        </div>
      </div>

      {/* Divider */}
      <div className="h-px bg-border mb-5" />

      {/* Goals section */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5">
            <Target className="h-3.5 w-3.5 text-muted-foreground" />
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Hedefler
            </h2>
            {goals && goals.length > 0 && (
              <span className="text-xs text-muted-foreground/60">
                · {goals.filter((g) => g.completedEntryId).length}/{goals.length}
              </span>
            )}
          </div>
          <button
            onClick={() => setGoalSheetOpen(true)}
            className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Hedef ekle
          </button>
        </div>

        {goals === undefined ? null : goals.length === 0 ? (
          <button
            onClick={() => setGoalSheetOpen(true)}
            className="w-full rounded-2xl border border-dashed border-border/50 py-4 text-sm text-muted-foreground hover:text-foreground hover:border-border transition-colors flex items-center justify-center gap-2"
          >
            <Target className="h-4 w-4" />
            Bugüne hedef ekle
          </button>
        ) : (
          <div className="flex flex-col gap-2">
            {goals.map((goal) => (
              <GoalCard key={goal.id} goal={goal} />
            ))}
          </div>
        )}
      </div>

      <div className="h-px bg-border/50 mb-5" />

      {/* Entries */}
      {entries === undefined ? null : entries.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="Bu gün boş"
          description={
            isToday
              ? "Bugüne ait henüz bir girdi yok."
              : "Bu güne ait girdi bulunmuyor."
          }
          action={
            <Button onClick={() => setSheetOpen(true)}>
              <Plus className="h-4 w-4" />
              Girdi ekle
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-2">
          {(() => {
            const items = groupEntries(entries);
            return (
              <>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                  {items.length} girdi
                </p>
                {items.map((item) =>
                  item.type === "single" ? (
                    <EntryCard key={item.entry.id} entry={item.entry} />
                  ) : (
                    <LinkedEntryCard
                      key={item.entries[0].linkedGroupId}
                      entries={item.entries}
                    />
                  )
                )}
              </>
            );
          })()}
        </div>
      )}

      <DayEntrySheet
        date={date}
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
      />

      <AddGoalSheet
        date={date}
        open={goalSheetOpen}
        onClose={() => setGoalSheetOpen(false)}
      />
    </>
  );
}
