"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, ArrowRight, Boxes, CalendarDays, ChevronLeft, ChevronRight, MoonStar, NotebookPen, Smile, Target, PenLine } from "lucide-react";
import { db } from "@/lib/db";
import { createNote } from "@/lib/db/queries";
import {
  prefetchDay,
  whenIdle,
  useDayEntries,
  useDayGoals,
  useDayNotes,
} from "@/lib/db/day-cache";
import {
  dayItemKey,
  deleteDayItems,
  moveDayItems,
} from "@/lib/db/day-items";
import { NoteCard } from "@/components/notes/note-card";
import { NoteWindow } from "@/components/notes/note-window";
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
import { MoodSheet } from "@/components/calendar/mood-sheet";
import { MoodCard } from "@/components/calendar/mood-card";
import { ActivityCard } from "@/components/calendar/activity-card";
import {
  EntrySelectionBar,
  type EntrySelection,
} from "@/components/calendar/entry-selection";
import { intlTag, useLocale, useT } from "@/lib/i18n";
import { toLocalDateValue } from "@/lib/utils";
import { useSkin } from "@/lib/skin";
import { routes } from "@/lib/routes";

type EntryItem =
  | { type: "single"; entry: EntryWithContext }
  | { type: "group"; entries: EntryWithContext[] }
  | { type: "activity"; activityId: string; entries: EntryWithContext[] };

/** Önce aktiviteye, sonra paralel gruba (linkedGroupId) göre katlar */
/** Öğenin zamanı — zaman akışındaki saat damgası için */
function itemTime(item: EntryItem): number {
  return item.type === "single" ? item.entry.occurredAt : item.entries[0].occurredAt;
}
/** "21:00" — saat başı damga */
function hourLabel(ts: number): string {
  return `${String(new Date(ts).getHours()).padStart(2, "0")}:00`;
}

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

/** Ay ve gün adları uygulamanın dilinde (eskiden sabit İngilizce diziydi) */
function monthName(i: number, tag: string): string {
  return new Date(2026, i, 1).toLocaleDateString(tag, { month: "long" });
}
function weekdayLong(d: Date, tag: string): string {
  return d.toLocaleDateString(tag, { weekday: "long" });
}

export function CalendarDayPage({
  params,
}: {
  params: { date: string };
}) {
  const { date } = params;
  const t = useT();
  const tag = intlTag(useLocale());
  // Brütal tema: tarih kartı, sayı kutuları, dağılım çubuğu, saat damgalı akış
  const brutal = useSkin() === "brutal";
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
  const [moodSheetOpen, setMoodSheetOpen] = useState(false);
  // Ekle → Not ile açılan yeni notun penceresi
  const [newNoteId, setNewNoteId] = useState<string | null>(null);
  // Toplu seçim — null: mod kapalı. Kart bazlı seçilir, girdi id'si tutulur.
  const [selected, setSelected] = useState<Set<string> | null>(null);

  const [yearN, monthN, dayN] = date.split("-").map(Number);
  const d = new Date(yearN, monthN - 1, dayN);

  // Önbellekli canlı sorgular: gün daha önce açıldıysa ya da komşusundan
  // önceden okunduysa kartlar iskeletsiz, anında çizilir (bkz. day-cache)
  const entries = useDayEntries(date);
  const goals = useDayGoals(date);
  const notes = useDayNotes(date);
  // Aktivite adları — tablo küçük, id → kayıt haritası kart başlıkları için
  const activities = useLiveQuery(() => db.activities.toArray(), []);
  const activityById = new Map((activities ?? []).map((a) => [a.id, a]));
  // Yerleşik akışların varlığı — Ekle menüsünde çıkıp çıkmayacaklarını belirler
  const builtInKeys = useLiveQuery(async () => {
    const cats = await db.categories.filter((c) => !!c.isBuiltIn).toArray();
    // Anahtarı henüz doldurulmamış tek yerleşik = eski kurulumdaki Uyku
    return new Set(cats.map((c) => c.builtInKey ?? "sleep"));
  }, []);
  const hasSleepCategory = builtInKeys?.has("sleep");
  const hasMoodCategory = builtInKeys?.has("mood");

  // Yerleşik akışların girdileri kendi zarif yuvalarında gösterilir
  const builtInKeyOf = (e: { category: { isBuiltIn?: boolean; builtInKey?: string } }) =>
    e.category.isBuiltIn ? e.category.builtInKey ?? "sleep" : undefined;
  const sleepEntries = (entries ?? []).filter((e) => builtInKeyOf(e) === "sleep");
  const moodEntries = (entries ?? []).filter((e) => builtInKeyOf(e) === "mood");
  const otherEntries = (entries ?? []).filter((e) => !e.category.isBuiltIn);

  // Kart → seçim durumu. Günün her öğesi (girdi, uyku, hedef, not) seçilebilir;
  // tür önekli anahtarla tutulur çünkü ayrı tablolarda yaşıyorlar. Bir kart
  // birden çok girdi taşıyorsa (paralel grup, aktivite) hepsi birlikte seçilir.
  const selectionActive = selected !== null;
  const allKeys = [
    ...sleepEntries.map((e) => dayItemKey("entry", e.id)),
    ...moodEntries.map((e) => dayItemKey("entry", e.id)),
    ...otherEntries.map((e) => dayItemKey("entry", e.id)),
    ...(goals ?? []).map((g) => dayItemKey("goal", g.id)),
    ...(notes ?? []).map((n) => dayItemKey("note", n.id)),
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
  const todayFlat = (() => {
    const t = new Date();
    return new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();
  })();
  const isToday = d.getTime() === todayFlat;

  /**
   * Komşu günler. Gün sayfasında en sık yapılan şey bir gün geri gitmek
   * ("dün ne yapmıştım"); bunun için takvime dönüp tekrar seçmek gerekiyordu.
   * Tuşlar geri bağlantısının satırında, sağ uçta: başlığın yanına konsa
   * tarihle yarışırdı, sayfanın altına konsa ulaşılmazdı.
   */
  const shift = (days: number) => {
    const next = new Date(d);
    next.setDate(d.getDate() + days);
    return toLocalDateValue(next.getTime());
  };

  // Komşu günleri arka planda oku — oklarla ya da kaydırarak geçince hazır
  // olsunlar. Sayfanın kendi sorgularıyla yarışmasın diye biraz sonra.
  const prevDay = shift(-1);
  const nextDay = shift(1);
  useEffect(
    () =>
      whenIdle(() => {
        void prefetchDay(prevDay);
        void prefetchDay(nextDay);
      }, 400),
    [prevDay, nextDay]
  );

  const addMenu = (
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
          // Yeni not da diğer kayıtlar gibi pencerede açılır
          onSelect: async () => {
            const note = await createNote(date);
            setNewNoteId(note.id);
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
        ...(hasMoodCategory
          ? ([
              {
                key: "mood",
                label: t("add.mood"),
                icon: Smile,
                iconClass: "text-pink-400",
                onSelect: () => setMoodSheetOpen(true),
              },
            ] satisfies AddMenuItem[])
          : []),
      ]}
    />
  );

  // Brütal başlığın sayıları
  const dayCategories = [...new Map(otherEntries.map((e) => [e.category.id, e.category])).values()];
  const goalsDone = (goals ?? []).filter((g) => g.completedEntryId).length;

  return (
    <>
      {brutal ? (
        <div className="pb-5 pt-safe">
          {/* Tepe: takvime dön, komşu günler — kare düğmeler */}
          <div className="flex items-center justify-between pt-4">
            <Link href="/calendar" data-brut-sq="" aria-label={t("nav.calendar")} className="flex h-10 w-10 items-center justify-center">
              <ArrowLeft className="h-[18px] w-[18px]" strokeWidth={2.5} />
            </Link>
            <div className="flex gap-2">
              <Link href={routes.day(shift(-1))} prefetch={false} data-brut-sq="" aria-label={t("day.prev")} className="flex h-10 w-10 items-center justify-center">
                <ChevronLeft className="h-5 w-5" strokeWidth={2.5} />
              </Link>
              <Link href={routes.day(shift(1))} prefetch={false} data-brut-sq="" aria-label={t("day.next")} className="flex h-10 w-10 items-center justify-center">
                <ChevronRight className="h-5 w-5" strokeWidth={2.5} />
              </Link>
            </div>
          </div>

          {/* Tarih kartı — gün adı, dev tarih, bugün etiketi, Ekle */}
          <div className="mt-4 flex items-end gap-3 rounded-2xl border-2 border-[#111] bg-[#ffd23f] p-4 text-[#111] shadow-[5px_5px_0_#111]">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-[12px] font-black uppercase tracking-wider">{weekdayLong(d, tag)}</span>
                {isToday && (
                  <span className="rounded-md bg-[#111] px-1.5 py-px text-[10.5px] font-black uppercase tracking-wider text-[#ffd23f]">
                    {t("datetime.today")}
                  </span>
                )}
              </div>
              <h1 className="mt-1 text-[40px] font-black leading-[0.95] tracking-tight">
                {d.getDate()} {monthName(d.getMonth(), tag)}
              </h1>
              <div className="mt-1 font-mono text-[13px] font-bold">{d.getFullYear()}</div>
            </div>
            <div data-brut-add="" className="shrink-0">{addMenu}</div>
          </div>

          {/* Sayılar — girdi, kategori, hedef */}
          <div className="mt-3 grid grid-cols-3 gap-2">
            {[
              { l: t("brut.entries"), v: String(otherEntries.length), bg: "#8ea6ff" },
              { l: t("brut.categories"), v: String(dayCategories.length), bg: "#7ae582" },
              { l: t("brut.goals"), v: goals && goals.length ? `${goalsDone}/${goals.length}` : "–", bg: "#ff9ecd" },
            ].map((b) => (
              <div key={b.l} className="rounded-xl border-2 border-[#111] px-2.5 py-2 text-[#111] shadow-[3px_3px_0_#111]" style={{ background: b.bg }}>
                <span className="block text-[10.5px] font-black uppercase tracking-wide">{b.l}</span>
                <b className="block font-mono text-[22px] font-bold leading-7 tabular-nums">{b.v}</b>
              </div>
            ))}
          </div>

          {/* Gün analizi */}
          <Link
            href={routes.period(`d-${date}`)}
            prefetch={false}
            className="mt-3 flex h-10 items-center justify-between rounded-xl border-2 border-[#111] bg-white px-3 text-[13px] font-black uppercase tracking-wide text-[#111] shadow-[2px_2px_0_#111] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
          >
            {t("day.insights")}
            <ArrowRight className="h-4 w-4" strokeWidth={2.75} />
          </Link>
        </div>
      ) : (
      <div className="pt-10 pb-5">
        <div className="mb-5 flex items-center justify-between gap-3">
          <Link
            href="/calendar"
            className="inline-flex items-center gap-1.5 -ml-0.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>{t("nav.calendar")}</span>
          </Link>

          {/* Komşu günler — tek parça, sönük; gün geçişi göz almasın */}
          <div data-brut-nav="" className="flex shrink-0 items-center rounded-full border border-border/70 bg-card/40">
            <Link
              href={routes.day(shift(-1))}
              prefetch={false}
              aria-label={t("day.prev")}
              className="flex h-7 w-8 items-center justify-center rounded-l-full text-muted-foreground/70 transition-colors hover:bg-[var(--sf-2)] hover:text-foreground"
            >
              <ChevronLeft className="h-4 w-4" />
            </Link>
            <span className="h-4 w-px bg-border/70" />
            <Link
              href={routes.day(shift(1))}
              prefetch={false}
              aria-label={t("day.next")}
              className="flex h-7 w-8 items-center justify-center rounded-r-full text-muted-foreground/70 transition-colors hover:bg-[var(--sf-2)] hover:text-foreground"
            >
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        </div>

        <div className="flex items-end justify-between gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-sm text-muted-foreground mb-0.5">
              {weekdayLong(d, tag)}
            </p>
            <h1 className="text-3xl font-bold tracking-tight leading-none">
              {d.getDate()} {monthName(d.getMonth(), tag)}
            </h1>
            <div className="mt-1.5 flex items-center gap-2">
              {isToday ? (
                <span className="text-xs font-semibold text-primary">{t("datetime.today")}</span>
              ) : (
                <span className="text-xs text-muted-foreground">{d.getFullYear()}</span>
              )}
              <span className="text-muted-foreground/30">·</span>
              {/* Bu günün dönem analizi (d-YYYY-MM-DD) */}
              <Link
                href={routes.period(`d-${date}`)}
                prefetch={false}
                className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {t("day.insights")}
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>

          {addMenu}
        </div>
      </div>
      )}

      {/* Divider */}
      {!brutal && <div className="h-px bg-border mb-5" />}

      {/* Yerleşik akış yuvaları — yalnızca kayıt varsa. Ruh hali günde birden
          çok kez girilebiliyor, o yüzden kartlar sırayla dizilir. */}
      {(sleepEntries.length > 0 || moodEntries.length > 0) && (
        <div className="mb-5 flex flex-col gap-2">
          {sleepEntries.map((e) => (
            <SleepCard
              key={e.id}
              entry={e}
              selection={selectionFor([`entry:${e.id}`])}
            />
          ))}
          {moodEntries.map((e) => (
            <MoodCard
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

      {/* Not yuvası — nota özgü kartlar (başlık + ilk satırlar), dokununca editör */}
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
          <div className="flex flex-col gap-2">
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
        moodEntries.length === 0 &&
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
                {brutal ? (
                  /* Dağılım çubuğu — günün kategorileri girdi payına göre bloklar */
                  <div className="mb-2 flex flex-col gap-2">
                    <span className="self-start rounded-md bg-[#111] px-2 py-0.5 text-[12px] font-black uppercase tracking-wider text-[#fff4dc]">
                      {t("brut.entryCount", { n: items.length })}
                    </span>
                    <div className="flex h-5 overflow-hidden rounded-lg border-2 border-[#111] shadow-[2px_2px_0_#111]">
                      {dayCats.map((c, i) => (
                        <span
                          key={c.id}
                          title={c.name}
                          className={i ? "border-l-2 border-[#111]" : undefined}
                          style={{ background: c.color, flex: otherEntries.filter((e) => e.category.id === c.id).length }}
                        />
                      ))}
                    </div>
                  </div>
                ) : (
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
                )}
                {items.map((item, idx) => {
                  // Brütal: saat değişince siyah saat damgası
                  const stamp =
                    brutal && (idx === 0 || hourLabel(itemTime(items[idx - 1])) !== hourLabel(itemTime(item)));
                  const card = item.type === "single" ? (
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
                  );
                  if (!stamp) return card;
                  return (
                    <Fragment key={`h-${idx}`}>
                      <span className="mt-2 flex items-center gap-2">
                        <span className="rounded-md border-2 border-[#111] bg-white px-2 py-0.5 font-mono text-[12.5px] font-bold text-[#111] shadow-[2px_2px_0_#111]">
                          {hourLabel(itemTime(item))}
                        </span>
                        <span className="h-[2px] flex-1 bg-[#111]" />
                      </span>
                      {card}
                    </Fragment>
                  );
                })}
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
            await moveDayItems(selected ?? [], target);
            setSelected(null);
            // Nereye gittiklerini görsün diye hedef güne geç
            router.push(routes.day(target));
          }}
          onDelete={async () => {
            // Tek grupta silinir ki "Geri al" hepsini birden döndürsün
            await deleteDayItems(selected ?? []);
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

      {newNoteId && (
        <NoteWindow noteId={newNoteId} open onClose={() => setNewNoteId(null)} />
      )}

      <MoodSheet
        date={date}
        open={moodSheetOpen}
        onClose={() => setMoodSheetOpen(false)}
      />
    </>
  );
}
