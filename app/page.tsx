"use client";

import { useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import {
  ArrowRight,
  PenLine,
  Plus,
  Search,
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
import { intlTag, translate, useLocale, useT } from "@/lib/i18n";

const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function HomePage() {
  const t = useT();
  // Dil kancadan gelmeli: doğrudan getLocale() okumak sunucu çıktısıyla
  // istemci ilk çizimini ayrıştırıp hydration uyuşmazlığı yaratıyor
  const locale = useLocale();
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
          <p className="text-sm text-muted-foreground">{getGreeting(t)}</p>
          <h1 className="mt-0.5 text-2xl font-semibold tracking-tight">
            {longDate(locale)}
          </h1>
        </div>
        <Link
          href="/settings"
          aria-label={t("nav.settings")}
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
              {t("home.today")}
            </p>
            <p className="mt-0.5 flex items-baseline gap-1.5">
              <span className="text-2xl font-semibold tabular-nums leading-none">
                {todayInfo?.count ?? 0}
              </span>
              <span className="text-sm text-muted-foreground">{t("home.entries")}</span>
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
                {t("home.goal")}
              </p>
              <p className="mt-0.5 text-sm font-semibold tabular-nums">
                {doneGoals}
                <span className="text-muted-foreground">/{goals.length}</span>
              </p>
            </div>
          )}

          <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground/40" />
        </Link>

      </section>

      {/* Uygulamanın asıl işi: bir şey kaydetmek. Eskiden bugün kartının
          altında ince bir şeritti ve yeni kullanıcı ne yapacağını anlamıyordu.
          Artık soruyla karşılıyor — "ne yapıyorsun" sorusu cevabı bir girdi
          olan tek soru, kullanıcıyı düşünmeden forma sokuyor. */}
      <button
        type="button"
        onClick={() => setSheetOpen(true)}
        className="group mb-6 flex w-full items-center gap-3.5 overflow-hidden rounded-2xl border border-primary/40 bg-gradient-to-br from-primary/20 via-primary/10 to-transparent px-4 py-4 text-left transition-all hover:border-primary/60 hover:from-primary/25 active:scale-[0.99]"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/30 transition-transform group-hover:scale-105">
          <PenLine className="h-5 w-5" strokeWidth={2} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-base font-semibold leading-tight">
            {t("home.prompt")}
          </span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {t("home.promptHint")}
          </span>
        </span>
        <ArrowRight className="h-4 w-4 shrink-0 text-primary/70 transition-transform group-hover:translate-x-0.5" />
      </button>

      {/* Son 7 gün — ritim şeridi; sütuna dokun, o güne git */}
      {week && week.some((d) => d.count > 0) && (
        <section className="mb-6">
          <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("home.last7Days")}
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

      {/* Arama buraya ait: aranan şey girdiler, listenin başında duruyor.
          Tepedeki simge sırasında ne aradığı belirsizdi. Buradaki listede
          yalnız son 20 var, düğme tüm geçmişi tarayan sayfaya götürür —
          bölüm içi büyüteçlerden (yerinde süzme) ayrılsın diye yazılı. */}
      <div className="mb-3 flex items-center justify-between gap-2 px-1">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t("home.recentEntries")}
        </h2>
        <Link
          href="/search"
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <Search className="h-3.5 w-3.5" />
          {t("search.title")}
        </Link>
      </div>

      {recent === undefined ? (
        <CardListSkeleton rows={3} />
      ) : recent.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title={t("home.empty.title")}
          description={
            hasCategories
              ? t("home.empty.ready")
              : t("home.empty.buildFirst")
          }
          action={
            hasCategories ? (
              <Button onClick={() => setSheetOpen(true)}>
                <Plus className="h-4 w-4" />
                {t("home.addEntry")}
              </Button>
            ) : (
              <Button asChild>
                <Link href="/structure">
                  <Plus className="h-4 w-4" />
                  {t("home.empty.buildAction")}
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
      prefetch={false}
      aria-label={`${WEEKDAYS_SHORT[dt.getDay()]} ${dt.getDate()} · ${day.count} entries`}
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

function getGreeting(t: (k: Parameters<typeof translate>[0]) => string): string {
  const h = new Date().getHours();
  if (h < 5) return t("home.greeting.night");
  if (h < 12) return t("home.greeting.morning");
  if (h < 18) return t("home.greeting.afternoon");
  return t("home.greeting.evening");
}

function longDate(locale: Parameters<typeof intlTag>[0]): string {
  return new Date().toLocaleDateString(intlTag(locale), {
    day: "numeric",
    month: "long",
    weekday: "long",
  });
}
