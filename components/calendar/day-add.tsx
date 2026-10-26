"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Boxes, MoonStar, NotebookPen, PenLine, Smile, Target } from "lucide-react";
import { db } from "@/lib/db";
import { createNote } from "@/lib/db/queries";
import { useT } from "@/lib/i18n";
import type { SubCategory } from "@/types";
import type { AddMenuItem } from "@/components/calendar/add-menu";
import { DayEntrySheet } from "@/components/calendar/day-entry-sheet";
import { SleepSheet } from "@/components/calendar/sleep-sheet";
import { MoodSheet } from "@/components/calendar/mood-sheet";
import { AddGoalSheet } from "@/components/goals/add-goal-sheet";
import { ThingEntrySheet } from "@/components/forms/thing-entry-sheet";
import { NoteWindow } from "@/components/notes/note-window";

type EntryOpts = {
  /** Aktivite adımıyla açılır */
  activityMode?: boolean;
  /** Var olan aktiviteye girdi: ad adımı atlanır */
  presetActivity?: { id: string; name: string } | null;
  /** Kalem seçili açılır (ana sayfanın hızlı ekle satırı) */
  presetSub?: SubCategory | null;
};

/**
 * Bir günün "Ekle" menüsü ve açtığı pencereler — gün sayfası ile ana sayfa
 * aynı menüyü kullanır. Ana sayfada eskiden yalnız "Girdi ekle" vardı: uyku,
 * ruh hali, hedef, not için önce güne gitmek gerekiyordu.
 *
 * `items` menünün satırları (yerleşik uyku/ruh hali/nesne akışları varsa),
 * `sheets` sayfanın sonuna konacak pencereler, `openEntry`/`openGoal` menü
 * dışından açmak için (aktivite kartı, hızlı ekle, başlarken adımları).
 */
export function useDayAdd(date: string) {
  const t = useT();
  const [entryOpen, setEntryOpen] = useState(false);
  const [entryOpts, setEntryOpts] = useState<EntryOpts>({});
  const [goalOpen, setGoalOpen] = useState(false);
  const [sleepOpen, setSleepOpen] = useState(false);
  const [moodOpen, setMoodOpen] = useState(false);
  // Ekle → Nesne: bir nesnenin durumu (Duster · km), eylemden bağımsız
  const [thingOpen, setThingOpen] = useState(false);
  // Ekle → Not ile açılan yeni notun penceresi
  const [newNoteId, setNewNoteId] = useState<string | null>(null);

  // Yerleşik akışların varlığı — Ekle menüsünde çıkıp çıkmayacaklarını belirler
  const builtInKeys = useLiveQuery(async () => {
    const cats = await db.categories.filter((c) => !!c.isBuiltIn).toArray();
    // Anahtarı henüz doldurulmamış tek yerleşik = eski kurulumdaki Uyku
    return new Set(cats.map((c) => c.builtInKey ?? "sleep"));
  }, []);

  const openEntry = (opts: EntryOpts = {}) => {
    setEntryOpts(opts);
    setEntryOpen(true);
  };

  const items: AddMenuItem[] = [
    {
      key: "entry",
      label: t("add.entry"),
      icon: PenLine,
      iconClass: "text-primary",
      onSelect: () => openEntry(),
    },
    {
      key: "activity",
      label: t("add.activity"),
      icon: Boxes,
      iconClass: "text-cyan-400",
      onSelect: () => openEntry({ activityMode: true }),
    },
    {
      key: "goal",
      label: t("add.goal"),
      icon: Target,
      iconClass: "text-amber-400",
      onSelect: () => setGoalOpen(true),
    },
    {
      key: "note",
      label: t("add.note"),
      icon: NotebookPen,
      iconClass: "text-rose-400",
      // Yeni not da diğer kayıtlar gibi pencerede açılır
      onSelect: async () => {
        const note = await createNote(date);
        setNewNoteId(note.id);
      },
    },
    ...(builtInKeys?.has("sleep")
      ? ([
          {
            key: "sleep",
            label: t("add.sleep"),
            icon: MoonStar,
            iconClass: "text-violet-400",
            onSelect: () => setSleepOpen(true),
          },
        ] satisfies AddMenuItem[])
      : []),
    ...(builtInKeys?.has("mood")
      ? ([
          {
            key: "mood",
            label: t("add.mood"),
            icon: Smile,
            iconClass: "text-pink-400",
            onSelect: () => setMoodOpen(true),
          },
        ] satisfies AddMenuItem[])
      : []),
    ...(builtInKeys?.has("objects")
      ? ([
          {
            key: "thing",
            label: t("add.thing"),
            icon: Boxes,
            iconClass: "text-teal-400",
            onSelect: () => setThingOpen(true),
          },
        ] satisfies AddMenuItem[])
      : []),
  ];

  const sheets = (
    <>
      <DayEntrySheet
        date={date}
        open={entryOpen}
        onClose={() => setEntryOpen(false)}
        activityMode={entryOpts.activityMode ?? false}
        presetActivity={entryOpts.presetActivity ?? null}
        presetSub={entryOpts.presetSub ?? null}
      />
      <AddGoalSheet date={date} open={goalOpen} onClose={() => setGoalOpen(false)} />
      <SleepSheet date={date} open={sleepOpen} onClose={() => setSleepOpen(false)} />
      {newNoteId && <NoteWindow noteId={newNoteId} open onClose={() => setNewNoteId(null)} />}
      <MoodSheet date={date} open={moodOpen} onClose={() => setMoodOpen(false)} />
      <ThingEntrySheet date={date} open={thingOpen} onClose={() => setThingOpen(false)} />
    </>
  );

  return { items, sheets, openEntry, openGoal: () => setGoalOpen(true) };
}
