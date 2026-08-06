"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, ArrowRight, Boxes, CalendarDays, MoonStar, NotebookPen, Target, PenLine } from "lucide-react";
import { db } from "@/lib/db";
import {
  createNote,
  deleteDayItems,
  listEntriesByDate,
  listGoalsByDate,
  listNotesByDate,
  moveEntriesToDate,
  moveGoalsToDate,
  moveNotesToDate,
  noteIsEmpty,
} from "@/lib/db/queries";
import { NoteCard } from "@/components/notes/note-card";
import { EntryCard } from "@/components/dashboard/entry-card";
import { LinkedEntryCard } from "@/components/dashboard/linked-entry-card";
import { GoalCard } from "@/components/goals/goal-card";
import { AddGoalSheet } from "@/components/goals/add-goal-sheet";
import { EmptyState } from "@/components/ui/empty-state";
import { CardListSkeleton } from "@/components/ui/skeleton";
import type { EntryWithContext } from "@/types";
import { DayEntrySheet } from "@/components/calendar/day-entry-sheet";
import { AddMenu, type AddMenuItem } from "@/components/calendar/add-menu";
import { SleepSheet } from "@/components/calendar/sleep-sheet";
import { SleepCard } from "@/components/calendar/sleep-card";
import { ActivityCard } from "@/components/calendar/activity-card";
import {
  EntrySelectionBar,
  type EntrySelection,
} from "@/components/calendar/entry-selection";
import { useT } from "@/lib/i18n";

type EntryItem =
  | { type: "single"; entry: EntryWithContext }
  | { type: "group"; entries: EntryWithContext[] }
  | { type: "activity"; activityId: string; entries: EntryWithContext[] };

/** Önce aktiviteye, sonra paralel gruba (linkedGroupId) göre katlar */
function groupEntries(entries: EntryWithContext[]): EntryItem[] {
  const result: EntryItem[] = [];
  const activityMap = new Map<string, EntryWithContext[]>();
  const groupMap = new Map<string, EntryWithContext[]>();
  const seenActivity = new Set<string>();
  const seen = new Set<string>();

  for (const e of entries) {
    if (e.activityId) {
      if (!activityMap.has(e.activityId)) activityMap.set(e.activityId, []);
      activityMap.get(e.activityId)!.push(e);
    } else if (e.linkedGroupId) {
      if (!groupMap.has(e.linkedGroupId)) groupMap.set(e.linkedGroupId, []);
      groupMap.get(e.linkedGroupId)!.push(e);
    }
  }

  for (const e of entries) {
    if (e.activityId) {
      if (!seenActivity.has(e.activityId)) {
        result.push({
          type: "activity",
          activityId: e.activityId,
          entries: activityMap.get(e.activityId)!,
        });
        seenActivity.add(e.activityId);
      }
    } else if (!e.linkedGroupId) {
      result.push({ type: "single", entry: e });
    } else if (!seen.has(e.linkedGroupId)) {
      result.push({ type: "group", entries: groupMap.get(e.linkedGroupId)! });
      seen.add(e.linkedGroupId);
    }
  }

  return result;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS_LONG = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];

export default function CalendarDayPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = use(params);
  const t = useT();
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetActivityMode, setSheetActivityMode] = useState(false);
  // Var olan aktiviteye girdi eklerken sheet isim adımını atlayıp bu aktiviteyle açılır
  const [presetActivity, setPresetActivity] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [goalSheetOpen, setGoalSheetOpen] = useState(false);
  const [sleepSheetOpen, setSleepSheetOpen] = useState(false);
  // Toplu seçim — null: mod kapalı. Kart bazlı seçilir, girdi id'si tutulur.
  const [selected, setSelected] = useState<Set<string> | null>(null);

  const [yearN, monthN, dayN] = date.split("-").map(Number);
  const d = new Date(yearN, monthN - 1, dayN);

  const entries = useLiveQuery(() => listEntriesByDate(date), [date]);
  const goals = useLiveQuery(() => listGoalsByDate(date), [date]);
  // Boş bırakılıp geri dönülen notlar listede görünmez
  const notes = useLiveQuery(
    async () => (await listNotesByDate(date)).filter((n) => !noteIsEmpty(n)),
    [date]
  );
  // Aktivite adları — tablo küçük, id → kayıt haritası kart başlıkları için
  const activities = useLiveQuery(() => db.activities.toArray(), []);
  const activityById = new Map((activities ?? []).map((a) => [a.id, a]));
  const hasSleepCategory = useLiveQuery(
    async () => !!(await db.categories.filter((c) => !!c.isBuiltIn).first()),
    []
  );

  // Yerleşik Uyku girdileri kendi zarif yuvasında gösterilir
  const sleepEntries = (entries ?? []).filter((e) => e.category.isBuiltIn);
  const otherEntries = (entries ?? []).filter((e) => !e.category.isBuiltIn);

  // Kart → seçim durumu. Günün her öğesi (girdi, uyku, hedef, not) seçilebilir;
  // tür önekli anahtarla tutulur çünkü ayrı tablolarda yaşıyorlar. Bir kart
  // birden çok girdi taşıyorsa (paralel grup, aktivite) hepsi birlikte seçilir.
  const selectionActive = selected !== null;
  const allKeys = [
    ...sleepEntries.map((e) => `entry:${e.id}`),
    ...otherEntries.map((e) => `entry:${e.id}`),
    ...(goals ?? []).map((g) => `goal:${g.id}`),
    ...(notes ?? []).map((n) => `note:${n.id}`),
  ];
  const allSelected =
    allKeys.length > 0 && !!selected && allKeys.every((k) => selected.has(k));
  const selectionFor = (keys: string[]): EntrySelection => ({
    active: selectionActive,
    selected: !!selected && keys.every((k) => selected.has(k)),
    // Seçim modu açıkken basılı tutma mevcut seçimi bozmasın
    onStart: () => setSelected((prev) => prev ?? new Set(keys)),
    onToggle: () =>
      setSelected((prev) => {
        const next = new Set(prev ?? []);
        if (keys.every((k) => next.has(k))) keys.forEach((k) => next.delete(k));
        else keys.forEach((k) => next.add(k));
        // Son seçim de bırakılınca moddan çık
        return next.size ? next : null;
      }),
  });
  /** Seçimden bir türün id'lerini ayıkla */
  const idsOf = (kind: "entry" | "goal" | "note") =>
    [...(selected ?? [])]
      .filter((k) => k.startsWith(`${kind}:`))
      .map((k) => k.slice(kind.length + 1));

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
          <span>{t("nav.calendar")}</span>
        </Link>

        <div className="flex items-end justify-between gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-sm text-muted-foreground mb-0.5">
              {WEEKDAYS_LONG[d.getDay()]}
            </p>
            <h1 className="text-3xl font-bold tracking-tight leading-none">
              {d.getDate()} {MONTHS[d.getMonth()]}
            </h1>
            <div className="mt-1.5 flex items-center gap-2">
              {isToday ? (
                <span className="text-xs font-semibold text-primary">Today</span>
              ) : (
                <span className="text-xs text-muted-foreground">{d.getFullYear()}</span>
              )}
              <span className="text-muted-foreground/30">·</span>
              {/* Bu günün dönem analizi (d-YYYY-MM-DD) */}
              <Link
                href={`/analytics/period/d-${date}`}
                className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {t("day.insights")}
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>

          <AddMenu
            items={[
              {
                key: "entry",
                label: t("add.entry"),
                icon: PenLine,
                iconClass: "text-primary",
                onSelect: () => {
                  setSheetActivityMode(false);
                  setPresetActivity(null);
                  setSheetOpen(true);
                },
              },
              {
                key: "activity",
                label: t("add.activity"),
                icon: Boxes,
                iconClass: "text-cyan-400",
                onSelect: () => {
                  setSheetActivityMode(true);
                  setPresetActivity(null);
                  setSheetOpen(true);
                },
              },
              {
                key: "goal",
                label: t("add.goal"),
                icon: Target,
                iconClass: "text-amber-400",
                onSelect: () => setGoalSheetOpen(true),
              },
              {
                key: "note",
                label: t("add.note"),
                icon: NotebookPen,
                iconClass: "text-rose-400",
                onSelect: async () => {
                  const note = await createNote(date);
                  router.push(`/notes/${note.id}`);
                },
              },
              ...(hasSleepCategory
                ? ([
                    {
                      key: "sleep",
                      label: t("add.sleep"),
                      icon: MoonStar,
                      iconClass: "text-violet-400",
                      onSelect: () => setSleepSheetOpen(true),
                    },
                  ] satisfies AddMenuItem[])
                : []),
            ]}
          />
        </div>
      </div>

      {/* Divider */}
      <div className="h-px bg-border mb-5" />

      {/* Uyku yuvası — yalnızca kayıt varsa */}
      {sleepEntries.length > 0 && (
        <div className="mb-5 flex flex-col gap-2">
          {sleepEntries.map((e) => (
            <SleepCard
              key={e.id}
              entry={e}
              selection={selectionFor([`entry:${e.id}`])}
            />
          ))}
        </div>
      )}

      {/* Hedef yuvası — yalnızca hedef varsa */}
      {goals && goals.length > 0 && (
        <div className="mb-5">
          <div className="flex items-center gap-1.5 mb-2.5 px-1">
            <Target className="h-3.5 w-3.5 text-amber-400/80" />
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Hedefler
            </h2>
            <span className="text-xs text-muted-foreground/60">
              · {goals.filter((g) => g.completedEntryId).length}/{goals.length}
            </span>
          </div>
          <div className="flex flex-col gap-2">
            {goals.map((goal) => (
              <GoalCard
                key={goal.id}
                goal={goal}
                selection={selectionFor([`goal:${goal.id}`])}
              />
            ))}
          </div>
        </div>
      )}

      {/* Not yuvası — derli toplu satırlar, dokununca tam sayfa editör */}
      {notes && notes.length > 0 && (
        <div className="mb-5">
          <div className="flex items-center gap-1.5 mb-2.5 px-1">
            <NotebookPen className="h-3.5 w-3.5 text-rose-400/80" />
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Notlar
            </h2>
            <span className="text-xs text-muted-foreground/60">
              · {notes.length}
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            {notes.map((note) => (
              <NoteCard
                key={note.id}
                note={note}
                selection={selectionFor([`note:${note.id}`])}
              />
            ))}
          </div>
        </div>
      )}

      {/* Girdiler */}
      {entries === undefined ? (
        <CardListSkeleton rows={3} />
      ) : otherEntries.length === 0 ? (
        sleepEntries.length === 0 &&
        (!goals || goals.length === 0) &&
        (!notes || notes.length === 0) ? (
          <EmptyState
            icon={CalendarDays}
            title={t("day.empty.title")}
            description={
              isToday
                ? "No entries yet — tap Add in the top right to start."
                : "No entries for this day — use Add to create one."
            }
          />
        ) : null
      ) : (
        <div className="flex flex-col gap-2">
          {(() => {
            const items = groupEntries(otherEntries);
            // Renk özeti: günün girdilerinin benzersiz kategorileri (görülme sırasıyla)
            const dayCats = [
              ...new Map(
                otherEntries.map((e) => [e.category.id, e.category])
              ).values(),
            ];
            return (
              <>
                <div className="mb-1 flex items-center gap-2 px-1">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {items.length} girdi
                  </p>
                  <span className="flex items-center gap-1">
                    {dayCats.map((c) => (
                      <span
                        key={c.id}
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: c.color }}
                        title={c.name}
                      />
                    ))}
                  </span>
                  {!selectionActive && (
                    <span className="ml-auto text-[10px] text-muted-foreground/50">
                      {t("day.holdToSelect")}
                    </span>
                  )}
                </div>
                {items.map((item) =>
                  item.type === "single" ? (
                    <EntryCard
                      key={item.entry.id}
                      entry={item.entry}
                      selection={selectionFor([`entry:${item.entry.id}`])}
                    />
                  ) : item.type === "activity" ? (
                    <ActivityCard
                      key={item.activityId}
                      activity={activityById.get(item.activityId)}
                      entries={item.entries}
                      onAddEntries={(a) => {
                        setPresetActivity({ id: a.id, name: a.name });
                        setSheetActivityMode(false);
                        setSheetOpen(true);
                      }}
                      selection={selectionFor(
                        item.entries.map((e) => `entry:${e.id}`)
                      )}
                    />
                  ) : (
                    <LinkedEntryCard
                      key={item.entries[0].linkedGroupId}
                      entries={item.entries}
                      selection={selectionFor(
                        item.entries.map((e) => `entry:${e.id}`)
                      )}
                    />
                  )
                )}
              </>
            );
          })()}
        </div>
      )}

      {/* Seçim çubuğu altta duruyor — son kart altında kalmasın */}
      {selectionActive && <div className="h-28" />}

      {selected && selected.size > 0 && (
        <EntrySelectionBar
          date={date}
          count={selected.size}
          allSelected={allSelected}
          onSelectAll={() =>
            setSelected(allSelected ? null : new Set(allKeys))
          }
          onCancel={() => setSelected(null)}
          onMove={async (target) => {
            await moveEntriesToDate(idsOf("entry"), target);
            await moveGoalsToDate(idsOf("goal"), target);
            await moveNotesToDate(idsOf("note"), target);
            setSelected(null);
            // Nereye gittiklerini görsün diye hedef güne geç
            router.push(`/calendar/${target}`);
          }}
          onDelete={async () => {
            // Tek grupta silinir ki "Geri al" üçünü birden döndürsün
            await deleteDayItems({
              entryIds: idsOf("entry"),
              goalIds: idsOf("goal"),
              noteIds: idsOf("note"),
            });
            setSelected(null);
          }}
        />
      )}

      <DayEntrySheet
        date={date}
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        activityMode={sheetActivityMode}
        presetActivity={presetActivity}
      />

      <AddGoalSheet
        date={date}
        open={goalSheetOpen}
        onClose={() => setGoalSheetOpen(false)}
      />

      <SleepSheet
        date={date}
        open={sleepSheetOpen}
        onClose={() => setSleepSheetOpen(false)}
      />
    </>
  );
}
