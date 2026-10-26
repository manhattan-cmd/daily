"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import {
  ArrowRight,
  Layers,
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
  listRecentNotes,
  noteMoment,
  type DayBar,
} from "@/lib/db/queries";
import { loadHomeSnapshot, type FrequentItem, type HomeSnapshot } from "@/lib/db/home";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Layer, PageSheet } from "@/components/ui/layer";
import { SummaryBlock } from "@/components/ui/summary-block";
import { CardListSkeleton } from "@/components/ui/skeleton";
import { EntryCard } from "@/components/dashboard/entry-card";
import { NoteCard } from "@/components/notes/note-card";
import { prefetchDay, prefetchDayOnPress, whenIdle } from "@/lib/db/day-cache";
import { BackupReminder } from "@/components/dashboard/backup-reminder";
import { GettingStarted, WELCOME_DISMISSED, type StartStep } from "@/components/dashboard/getting-started";
import { AddMenu, type AddMenuItem } from "@/components/calendar/add-menu";
import { useDayAdd } from "@/components/calendar/day-add";
import { CategoryForm } from "@/components/structure/category-form";
import { SymbolIcon } from "@/lib/icons";
import { useLocalFlag } from "@/lib/local-flag";
import { useLastBackupAt } from "@/lib/storage-health";
import { cn, toLocalDateValue } from "@/lib/utils";
import { intlTag, translate, useLocale, useT } from "@/lib/i18n";
import { routes } from "@/lib/routes";
import { useSkin } from "@/lib/skin";
import type { SubCategory } from "@/types";

const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** Ana sayfadaki son kayıtlar (girdi + not) */
const RECENT_LIMIT = 20;

/**
 * Ana sayfa — yeni kullanıcının ilk, eski kullanıcının her gün açtığı yer.
 *
 * Yukarıdan aşağı: Başlarken (yeni kullanıcıyı yapıya, ilk girdiye, hedefe
 * ve yedeğe götüren liste; bitince kalkar), Bugün (sayının neyin sayısı
 * olduğu yazılı, yanında gün sayfasındakiyle aynı genel Ekle — girdi,
 * aktivite, hedef, not, uyku, ruh hali, nesne), Yine ekle (son 30 günün en
 * sık kalemleri, tek dokunuşla formu açar), son 7 gün, Yapın (yapıya giden
 * kapı) ve son girdiler.
 *
 * Eskiden "8 girdi" yazıyordu ama bugünün mü belli değildi; ekleme düğmesi
 * yalnız girdi açıyordu, uyku ya da hedef için güne gitmek gerekiyordu.
 */
export default function HomePage() {
  const t = useT();
  // Dil kancadan gelmeli: doğrudan getLocale() okumak sunucu çıktısıyla
  // istemci ilk çizimini ayrıştırıp hydration uyuşmazlığı yaratıyor
  const locale = useLocale();
  const brutal = useSkin() === "brutal";
  const router = useRouter();
  const today = toLocalDateValue();
  // Gün sayfasıyla aynı Ekle menüsü ve pencereleri, bugün için
  const add = useDayAdd(today);
  const [catFormOpen, setCatFormOpen] = useState(false);

  // Son girdiler notlarla karışık, zaman sırasıyla — not da günün bir
  // kaydı; ayrı bir bölüm açmak yerine aynı akışa giriyor
  const recent = useLiveQuery(async () => {
    const [entries, notes] = await Promise.all([
      listRecentEntries(RECENT_LIMIT),
      listRecentNotes(RECENT_LIMIT),
    ]);
    return [
      ...entries.map((e) => ({ kind: "entry" as const, at: e.occurredAt, entry: e })),
      ...notes.map((n) => ({ kind: "note" as const, at: noteMoment(n), note: n })),
    ]
      .sort((a, b) => b.at - a.at)
      .slice(0, RECENT_LIMIT);
  }, []);
  const week = useLiveQuery(() => getRecentDaySummaries(7), []);
  const home = useLiveQuery(() => loadHomeSnapshot(), []);

  // Ana sayfadan gidilen günler: bugün ve hafta şeridinde GİRDİSİ OLAN
  // günler önceden okunsun, dokununca kartlar beklenmeden çizilsin (bkz.
  // day-cache). Tarayıcı boşa çıkınca: açılışla yarışınca uygulamanın
  // açılışını uzatıyordu (8 gün × 3 sorgu). Boş günün okunacak bir şeyi yok.
  const weekDates = (week ?? [])
    .filter((d) => d.count > 0)
    .map((d) => d.date)
    .join(",");
  useEffect(
    () =>
      whenIdle(async () => {
        await prefetchDay(today);
        for (const d of weekDates.split(",").reverse()) if (d) await prefetchDay(d);
      }),
    [today, weekDates]
  );
  const goals = useLiveQuery(() => listGoalsByDate(today), [today]);
  const hasCategories = (home?.counts.categories ?? 0) > 0;

  const todayInfo = week?.[week.length - 1];
  const doneGoals = (goals ?? []).filter((g) => g.completedEntryId).length;

  // Başlarken — adımların durumu verinin kendisinden
  const lastBackupAt = useLastBackupAt();
  const [startDismissed, dismissStart] = useLocalFlag(WELCOME_DISMISSED);
  const steps: StartStep[] | undefined = home && [
    { key: "category", done: home.ownCategory },
    { key: "entry", done: home.totalEntries > 0 },
    { key: "goal", done: home.goalsEver > 0 },
    { key: "backup", done: lastBackupAt !== null },
  ];
  const showStart = !startDismissed && !!steps && steps.some((s) => !s.done);
  const start = showStart && steps && (
    <GettingStarted
      steps={steps}
      onDismiss={dismissStart}
      onCreateCategory={() => setCatFormOpen(true)}
      onAddEntry={() => add.openEntry()}
      onAddGoal={add.openGoal}
    />
  );

  // Son girdilerin başındaki arama düğmesi — brütalde katman adının sağında
  const searchLink = (
    <Link
      href="/search"
      className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
    >
      <Search className="h-3.5 w-3.5" />
      {t("search.title")}
    </Link>
  );

  return (
    <>
    {/* Brütal: bant krem döşemede, sayfanın geri kalanı önündeki zeminde (bkz. PageSheet) */}
    <PageSheet
      top={
      /* Brütal: sayfanın başlığı bölümün bandında (uygulamanın moru, tram benekli;
          bkz. globals.css "bolum bantlari") — selam üst yazı, tarih ters etiket */
      <header
        // Bant sayfayla kayıyor — durum çubuğu ekrandan çıkınca zemine döner
        // (bkz. AppShell)
        data-band-scrolls={brutal ? "" : undefined}
        className={cn(
          "-mx-4 flex items-end gap-3 px-4",
          brutal ? "band-home band-pad mb-6" : "mb-5 pb-2 pt-12"
        )}
      >
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              brutal
                ? "mb-1.5 text-[12px] font-extrabold uppercase tracking-wider text-[#111]"
                : "text-sm text-muted-foreground"
            )}
          >
            {getGreeting(t)}
          </p>
          <h1
            className={cn(
              "mt-0.5 tracking-tight",
              brutal ? "text-[26px] font-black leading-tight" : "text-2xl font-semibold"
            )}
          >
            {longDate(locale)}
          </h1>
        </div>
        {/* Brütalde Ekle Bugün bloğunun karosu; ötekilerde başlıkta */}
        {!brutal && <div className="mb-1"><AddMenu items={add.items} /></div>}
        <Link
          href="/settings"
          aria-label={t("nav.settings")}
          data-brut-sq=""
          className="mb-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground transition-colors hover:text-foreground"
        >
          <Settings className="h-4 w-4" />
        </Link>
      </header>
      }
    >

      {brutal ? (
        <>
          {start}
          {/* Başlarken açıkken yedek orada bir adım — iki kez söylenmesin */}
          {!showStart && <BackupReminder />}
          <BrutTodayBlock
            today={today}
            snapshot={home}
            goals={goals?.length ?? 0}
            goalsDone={doneGoals}
            items={add.items}
          />
          {home && home.frequent.length > 0 && (
            <FrequentLayer items={home.frequent} onPick={(sub) => add.openEntry({ presetSub: sub })} />
          )}
          {/* Hiç girdisi olmayana boş çubuklar bir şey söylemiyor */}
          {home && home.totalEntries > 0 && week && <BrutWeek week={week} today={today} />}
          {home && !showStart && <StructureLink counts={home.counts} />}
        </>
      ) : (
      <>
      <Layer label={t("home.today")}>
      {start}
      {!showStart && <BackupReminder />}

      {/* Bugün — günün özeti + doğrudan girdi ekleme */}
      <section data-home-today="" className="mb-4 overflow-hidden rounded-2xl border border-border bg-card">
        <Link
          href={routes.day(today)}
          className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-[var(--sf-1)]"
        >
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/60">
              {t("home.today")}
            </p>
            <p className="mt-0.5 flex items-baseline gap-1.5">
              <span className="text-2xl font-semibold tabular-nums leading-none">
                {home?.today.entries ?? 0}
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
        onClick={() => add.openEntry()}
        data-home-cta=""
        className="group mb-6 flex w-full items-center gap-3.5 overflow-hidden rounded-2xl border border-primary/40 bg-gradient-to-br from-primary/20 via-primary/10 to-transparent px-4 py-4 text-left transition-all hover:border-primary/60 hover:from-primary/25 active:scale-[0.99]"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/30 transition-transform group-hover:scale-105">
          <Plus className="h-6 w-6" strokeWidth={2.5} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-base font-semibold leading-tight">
            {t("home.addEntry")}
          </span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {t("home.prompt")}
          </span>
        </span>
        <ArrowRight className="h-4 w-4 shrink-0 text-primary/70 transition-transform group-hover:translate-x-0.5" />
      </button>
      </Layer>

      {/* Son 7 gün — ritim şeridi; sütuna dokun, o güne git */}
      {week && week.some((d) => d.count > 0) && (
        <Layer label={t("home.last7Days")}>
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
        </Layer>
      )}

      </>
      )}

      {/* Arama buraya ait: aranan şey girdiler, listenin başında duruyor.
          Tepedeki simge sırasında ne aradığı belirsizdi. Buradaki listede
          yalnız son 20 var, düğme tüm geçmişi tarayan sayfaya götürür —
          bölüm içi büyüteçlerden (yerinde süzme) ayrılsın diye yazılı.
          Hiç girdi yokken Başlarken'in ikinci adımı aynı şeyi söylüyor. */}
      {!(showStart && recent?.length === 0) && (
      <Layer label={t("home.recentEntries")} action={searchLink}>
      {!brutal && (
      <div className="mb-3 flex items-center justify-between gap-2 px-1">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t("home.recentEntries")}
        </h2>
        {searchLink}
      </div>
      )}

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
              <Button onClick={() => add.openEntry()}>
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
          {recent.map((it) =>
            it.kind === "entry" ? (
              <EntryCard key={it.entry.id} entry={it.entry} />
            ) : (
              <NoteCard key={it.note.id} note={it.note} />
            )
          )}
        </div>
      )}
      </Layer>
      )}
    </PageSheet>

      {add.sheets}
      {/* Başlarken → Kategori oluştur: kaydedince kategorinin sayfası, alt
          kategorileri orada eklenir */}
      <CategoryForm
        open={catFormOpen}
        onOpenChange={setCatFormOpen}
        onSaved={(c) => {
          if (c) router.push(routes.structureCategory(c.id));
        }}
      />
    </>
  );
}

/**
 * Brütal Bugün bloğu — gün sayfasının özetiyle aynı blok (bkz. SummaryBlock):
 * solda "BUGÜN · 8 girdi" ve son girdinin saati, yanında kare Ekle (gün
 * sayfasındaki menünün aynısı), altında kategori · hedef · seri, en altta
 * güne giden satır ve bugünün kategori dağılımı.
 */
function BrutTodayBlock({
  today,
  snapshot,
  goals,
  goalsDone,
  items,
}: {
  today: string;
  snapshot: HomeSnapshot | undefined;
  goals: number;
  goalsDone: number;
  items: AddMenuItem[];
}) {
  const t = useT();
  const tag = intlTag(useLocale());
  const lastAt = snapshot?.today.lastAt;
  return (
    <SummaryBlock
      className="mb-4"
      lead={{
        kind: "count",
        overline: t("home.today"),
        value: String(snapshot?.today.entries ?? 0),
        unit: t("home.entries"),
        hint: lastAt
          ? t("home.lastAt", {
              time: new Date(lastAt).toLocaleTimeString(tag, { hour: "2-digit", minute: "2-digit" }),
            })
          : t("home.prompt"),
      }}
      action={<AddMenu tile items={items} />}
      stats={
        snapshot
          ? [
              { label: t("brut.categories"), value: String(snapshot.today.categories), color: "#7ae582" },
              { label: t("brut.goals"), value: goals ? `${goalsDone}/${goals}` : "–", color: "#ff9ecd" },
              {
                label: t("home.streak"),
                value: String(snapshot.streak.current),
                unit: t("home.streakUnit"),
                color: "#8ea6ff",
              },
            ]
          : []
      }
      link={{ href: routes.day(today), label: t("home.openDay"), bars: snapshot?.today.bars }}
    />
  );
}

/**
 * Yine ekle — son 30 günün en sık kalemleri. Dokununca girdi penceresi o
 * kalemin formuyla açılır; kategori › alt kategori aramaya gerek kalmıyor.
 * Kare karo = kategori/alt kategori (şekil dili).
 */
function FrequentLayer({ items, onPick }: { items: FrequentItem[]; onPick: (sub: SubCategory) => void }) {
  const t = useT();
  return (
    <Layer label={t("home.frequent")}>
      <div className="grid grid-cols-2 gap-2">
        {items.map((it) => {
          const name = it.isRoot ? it.category.name : it.sub.name;
          const icon = it.sub.icon ?? it.category.icon;
          return (
            <button
              key={it.sub.id}
              type="button"
              onClick={() => onPick(it.sub)}
              aria-label={t("home.frequentAdd", { name })}
              className="flex min-w-0 items-center gap-2 rounded-xl border-2 border-[#111] bg-white p-1.5 pr-2.5 text-left text-[#111] shadow-[2px_2px_0_#111] transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
            >
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] border-[1.5px] border-[#111]"
                style={{ background: it.category.color }}
              >
                {icon && <SymbolIcon name={icon} size={17} style={{ color: "#111" }} />}
              </span>
              {/* Ad iki satıra sarar — iki sütunda "Kahve / ç…" diye kesiliyordu;
                  altında kategorisi (Beslenme › Su ile Faturalar › Su ayrılsın) */}
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 break-words text-[13px] font-black leading-tight">{name}</span>
                <span className="block truncate text-[10.5px] font-bold text-[#111]/50">
                  {it.isRoot ? t("brut.category") : it.category.name}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </Layer>
  );
}

/**
 * Son 7 gün — sütunlar günün kategori kırılımıyla yığılı, tepesinde sayısı;
 * bugün en sağda. Sütuna dokun, o güne git.
 */
function BrutWeek({ week, today }: { week: DayBar[]; today: string }) {
  const t = useT();
  const locale = useLocale();
  const max = Math.max(...week.map((x) => x.count), 1);
  const total = week.reduce((n, d) => n + d.count, 0);
  return (
    <Layer label={t("home.last7Days")} count={total}>
      <div className="flex items-end gap-1.5 rounded-2xl border-2 border-[#111] bg-white px-3 pb-3 pt-2.5 text-[#111] shadow-[3px_3px_0_#111]">
        {week.map((d) => {
          const [y, m, dd] = d.date.split("-").map(Number);
          const dt = new Date(y, m - 1, dd);
          const isToday = d.date === today;
          return (
            <Link
              key={d.date}
              href={routes.day(d.date)}
              {...prefetchDayOnPress(d.date)}
              prefetch={false}
              aria-label={`${dt.getDate()} · ${d.count}`}
              className="flex flex-1 flex-col items-center gap-1"
            >
              <span className="flex h-[66px] w-full flex-col items-center justify-end gap-0.5">
                {d.count > 0 && (
                  <span className="font-mono text-[10px] font-bold leading-none tabular-nums text-[#111]/70">{d.count}</span>
                )}
                {d.count > 0 ? (
                  <span
                    className="flex w-full flex-col-reverse overflow-hidden rounded-[6px] border-[1.5px] border-[#111]"
                    style={{ height: 10 + Math.round((d.count / max) * 42) }}
                  >
                    {d.segments.map((s, i) => (
                      <span key={i} style={{ flex: s.count, backgroundColor: s.color }} />
                    ))}
                  </span>
                ) : (
                  <span className="h-[6px] w-full rounded-full border-[1.5px] border-dashed border-[#111]/30" />
                )}
              </span>
              <span className="text-[9.5px] font-bold uppercase leading-none text-[#111]/45">
                {dt.toLocaleDateString(intlTag(locale), { weekday: "short" })}
              </span>
              <span
                className={cn(
                  "flex h-5 min-w-5 items-center justify-center rounded-md px-1 font-mono text-[11px] font-bold leading-none tabular-nums",
                  isToday ? "bg-[#111] text-white" : "text-[#111]/70"
                )}
              >
                {dt.getDate()}
              </span>
            </Link>
          );
        })}
      </div>
    </Layer>
  );
}

/**
 * Yapın — kategori, alt kategori ve özelliklerin kapısı. Ana sayfadan yapıya
 * giden yol alt menüdeki "Yapı"ydı; ne olduğunu bilmeyen oraya gitmiyordu.
 * Sayılar zincirin üç halkasını adıyla söylüyor.
 */
function StructureLink({ counts }: { counts: HomeSnapshot["counts"] }) {
  const t = useT();
  return (
    <Link
      href="/structure"
      className="mb-4 flex items-center gap-3 rounded-[18px] border-2 border-[#111] bg-white p-2.5 pr-3.5 text-[#111] shadow-[4px_4px_0_#111] transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-[2px_2px_0_#111]"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] border-2 border-[#111] bg-[#ffd23f]">
        <Layers className="h-5 w-5" strokeWidth={2.5} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-black leading-tight">{t("home.structure")}</span>
        <span className="block text-[11.5px] font-bold leading-snug text-[#111]/55">
          {t("settings.structureCounts", {
            categories: counts.categories,
            subcategories: counts.subcategories,
            features: counts.features,
          })}
        </span>
      </span>
      <ArrowRight className="h-5 w-5 shrink-0" strokeWidth={2.75} />
    </Link>
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
      href={routes.day(day.date)}
      {...prefetchDayOnPress(day.date)}
      prefetch={false}
      aria-label={`${WEEKDAYS_SHORT[dt.getDay()]} ${dt.getDate()} · ${day.count} entries`}
      className="group flex flex-1 flex-col items-center gap-1.5"
    >
      <span
        className="flex w-full flex-col-reverse overflow-hidden rounded-md transition-opacity group-hover:opacity-80"
        style={{
          height: h,
          backgroundColor:
            day.count === 0 ? "var(--sf-3)" : undefined,
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
