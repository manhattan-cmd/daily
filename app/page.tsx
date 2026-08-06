"use client";

import { useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import {
  ArrowRight,
  PenLine,
  Plus,
  Settings,
  Sparkles,
  Target,
} from "lucide-react";
import {
  getRecentDaySummaries,
  listGoalsByDate,
  listRecentEntries,
  type DayBar,
} from "@/lib/db/queries";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { CardListSkeleton } from "@/components/ui/skeleton";
import { EntryCard } from "@/components/dashboard/entry-card";
import { BackupReminder } from "@/components/dashboard/backup-reminder";
import { WelcomeCard } from "@/components/dashboard/welcome-card";
import { DayEntrySheet } from "@/components/calendar/day-entry-sheet";
import { cn, toLocalDateValue } from "@/lib/utils";

const WEEKDAYS_SHORT = ["Pz", "Pt", "Sa", "Çr", "Pe", "Cu", "Ct"];

export default function HomePage() {
  const today = toLocalDateValue();
  const [sheetOpen, setSheetOpen] = useState(false);

  const recent = useLiveQuery(() => listRecentEntries(20), []);
  const week = useLiveQuery(() => getRecentDaySummaries(7), []);
  const goals = useLiveQuery(() => listGoalsByDate(today), [today]);
  const hasCategories = useLiveQuery(
    async () => (await db.categories.count()) > 0,
    []
  );

  const todayInfo = week?.[week.length - 1];
  const doneGoals = (goals ?? []).filter((g) => g.completedEntryId).length;

  return (
    <>
      <header className="-mx-4 mb-5 flex items-end gap-3 px-4 pb-2 pt-12">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-muted-foreground">{getGreeting()}</p>
          <h1 className="mt-0.5 text-2xl font-semibold tracking-tight">
            {longDate()}
          </h1>
        </div>
        <Link
          href="/settings"
          aria-label="Ayarlar"
          className="mb-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground transition-colors hover:text-foreground"
        >
          <Settings className="h-4 w-4" />
        </Link>
      </header>

      <WelcomeCard />
      <BackupReminder />

      {/* Bugün — günün özeti + doğrudan girdi ekleme */}
      <section className="mb-4 overflow-hidden rounded-2xl border border-border bg-card">
        <Link
          href={`/calendar/${today}`}
          className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-white/[0.03]"
        >
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/60">
              Bugün
            </p>
            <p className="mt-0.5 flex items-baseline gap-1.5">
              <span className="text-2xl font-semibold tabular-nums leading-none">
                {todayInfo?.count ?? 0}
              </span>
              <span className="text-sm text-muted-foreground">girdi</span>
            </p>
            {(todayInfo?.segments.length ?? 0) > 0 && (
              <span className="mt-1.5 flex items-center gap-1">
                {todayInfo!.segments.slice(0, 5).map((s, i) => (
                  <span
                    key={i}
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: s.color }}
                  />
                ))}
              </span>
            )}
          </div>

          {goals && goals.length > 0 && (
            <div className="shrink-0 text-right">
              <p className="flex items-center justify-end gap-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400/70">
                <Target className="h-3 w-3" />
                Hedef
              </p>
              <p className="mt-0.5 text-sm font-semibold tabular-nums">
                {doneGoals}
                <span className="text-muted-foreground">/{goals.length}</span>
              </p>
            </div>
          )}

          <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground/40" />
        </Link>

        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="flex w-full items-center justify-center gap-1.5 border-t border-border bg-primary/[0.07] py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-primary/[0.12]"
        >
          <PenLine className="h-3.5 w-3.5" />
          Girdi ekle
        </button>
      </section>

      {/* Son 7 gün — ritim şeridi; sütuna dokun, o güne git */}
      {week && week.some((d) => d.count > 0) && (
        <section className="mb-6">
          <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Son 7 Gün
          </h2>
          <div className="flex items-end justify-between gap-1.5 rounded-2xl border border-border bg-card px-3 py-3">
            {week.map((d) => (
              <WeekBar
                key={d.date}
                day={d}
                max={Math.max(...week.map((x) => x.count), 1)}
                isToday={d.date === today}
              />
            ))}
          </div>
        </section>
      )}

      <h2 className="mb-3 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Son girdiler
      </h2>

      {recent === undefined ? (
        <CardListSkeleton rows={3} />
      ) : recent.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title="Henüz girdi yok"
          description={
            hasCategories
              ? "İlk girdini yapmaya hazır mısın?"
              : "Önce yapını oluştur, sonra girdi yap."
          }
          action={
            hasCategories ? (
              <Button onClick={() => setSheetOpen(true)}>
                <Plus className="h-4 w-4" />
                Girdi ekle
              </Button>
            ) : (
              <Button asChild>
                <Link href="/structure">
                  <Plus className="h-4 w-4" />
                  Yapı oluştur
                </Link>
              </Button>
            )
          }
        />
      ) : (
        <div className="flex flex-col gap-2">
          {recent.map((e) => (
            <EntryCard key={e.id} entry={e} />
          ))}
        </div>
      )}

      <DayEntrySheet
        date={today}
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
      />
    </>
  );
}

/**
 * Şeritteki tek gün — yükseklik girdi sayısıyla, gövde o günün kategori
 * kırılımıyla yığılmış (en çok girdisi olan altta).
 */
function WeekBar({
  day,
  max,
  isToday,
}: {
  day: DayBar;
  max: number;
  isToday: boolean;
}) {
  const [y, m, d] = day.date.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  // En düşük dolu gün de görünsün diye taban yükseklik
  const h = day.count > 0 ? 10 + Math.round((day.count / max) * 30) : 3;

  return (
    <Link
      href={`/calendar/${day.date}`}
      aria-label={`${dt.getDate()} ${WEEKDAYS_SHORT[dt.getDay()]} · ${day.count} girdi`}
      className="group flex flex-1 flex-col items-center gap-1.5"
    >
      <span
        className="flex w-full flex-col-reverse overflow-hidden rounded-md transition-opacity group-hover:opacity-80"
        style={{
          height: h,
          backgroundColor:
            day.count === 0 ? "rgba(255,255,255,0.07)" : undefined,
        }}
      >
        {day.segments.map((s, i) => (
          <span
            key={i}
            style={{ flex: s.count, backgroundColor: `${s.color}d9` }}
          />
        ))}
      </span>
      <span
        className={cn(
          "text-[10px] leading-none tabular-nums",
          isToday ? "font-bold text-foreground" : "text-muted-foreground/60"
        )}
      >
        {dt.getDate()}
      </span>
    </Link>
  );
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "İyi geceler";
  if (h < 12) return "Günaydın";
  if (h < 18) return "İyi öğlenler";
  return "İyi akşamlar";
}

function longDate(): string {
  return new Date().toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "long",
    weekday: "long",
  });
}
