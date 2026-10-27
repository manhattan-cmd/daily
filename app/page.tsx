"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import {
  ArrowRight,
  CalendarDays,
  CalendarRange,
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
 * aktivite, hedef, not, uyku, ruh hali, nesne), Kategorilerin (Bugün'ün eşi:
 * girdilerle dolan kareler, Kategori yarat, yapıya giden kapı), Yine ekle
 * (son 30 günün en sık kalemleri, tek dokunuşla formu açar), son 7 gün ve
 * son girdiler.
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

  // Son girdilerin gövdesi — brütalde bloğun hücresi, ötekilerde katman
  const recentBody =
    recent === undefined ? (
      <CardListSkeleton rows={3} />
    ) : recent.length === 0 ? (
      <EmptyState
        icon={Sparkles}
        title={t("home.empty.title")}
        description={hasCategories ? t("home.empty.ready") : t("home.empty.buildFirst")}
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
          {/* Girdilerin gittiği yer, yapıya giden kapı — Bugün'ün eşi */}
          {home && <CategoriesBlock snapshot={home} onNew={() => setCatFormOpen(true)} />}
          {home && home.frequent.length > 0 && (
            <FrequentBlock items={home.frequent} onPick={(sub) => add.openEntry({ presetSub: sub })} />
          )}
          {/* Hiç girdisi olmayana boş çubuklar bir şey söylemiyor */}
          {home && home.totalEntries > 0 && week && <BrutWeek week={week} today={today} />}
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
      {!(showStart && recent?.length === 0) && (brutal ? (
        <RecentBlock total={home?.totalEntries}>{recentBody}</RecentBlock>
      ) : (
      <Layer label={t("home.recentEntries")} action={searchLink}>
      <div className="mb-3 flex items-center justify-between gap-2 px-1">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t("home.recentEntries")}
        </h2>
        {searchLink}
      </div>
      {recentBody}
      </Layer>
      ))}
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
      // Günün sarısı — gün sayfasının tarih kartı gibi
      link={{ href: routes.day(today), label: t("home.openDay"), bars: snapshot?.today.bars, color: "#ffd23f", icon: CalendarDays }}
    />
  );
}

/**
 * Yine ekle — son 30 günün en sık kalemleri, Bugün ve Kategorilerin'le aynı
 * birleşik blokta: üstte mavi başlık, altında hücreler ortak çizgilerle.
 * Her hücrenin tepesinde kategorisinin rengi (Bugün'ün sayılarındaki bant
 * gibi), kare karo (şekil dili: kare = kategori/alt kategori), ad ve
 * kategorisi. Dokununca girdi penceresi o kalemin formuyla açılır;
 * kategori › alt kategori aramaya gerek kalmıyor. Tek sayıda kalem varsa
 * sonuncusu iki sütuna yayılır (boş hücre siyah görünmesin).
 */
function FrequentBlock({ items, onPick }: { items: FrequentItem[]; onPick: (sub: SubCategory) => void }) {
  const t = useT();
  return (
    <SummaryBlock
      className="mb-4"
      lead={{
        kind: "title",
        color: "#8ea6ff",
        overline: t("home.frequent"),
        title: t("home.frequentTitle"),
        hint: t("home.frequentHint"),
      }}
      stats={[]}
    >
      <div className="grid grid-cols-2 gap-[2px]">
        {items.map((it, idx) => {
          const name = it.isRoot ? it.category.name : it.sub.name;
          const icon = it.sub.icon ?? it.category.icon;
          const wide = items.length % 2 === 1 && idx === items.length - 1;
          return (
            <button
              key={it.sub.id}
              type="button"
              onClick={() => onPick(it.sub)}
              aria-label={t("home.frequentAdd", { name })}
              className={cn(
                "flex min-w-0 flex-col bg-white text-left text-[#111] active:bg-[#f5f1e8]",
                wide && "col-span-2"
              )}
            >
              <span className="h-1.5 shrink-0" style={{ background: it.category.color }} />
              <span className="flex min-w-0 items-center gap-2 px-2.5 py-2">
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
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] bg-[#111] text-white">
                  <Plus className="h-3.5 w-3.5" strokeWidth={3} />
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </SummaryBlock>
  );
}

/**
 * Son girdiler — öteki bloklarla aynı dilde: üstte turuncu "SON GİRDİLER ·
 * 592 girdi · bugüne kadar", yanında Ekle karosu gibi renkli Ara karosu
 * (bütün geçmişte arama; listede yalnız son 20 var), altında kartlar.
 */
function RecentBlock({ total, children }: { total: number | undefined; children: ReactNode }) {
  const t = useT();
  const tag = intlTag(useLocale());
  return (
    <SummaryBlock
      className="mb-4"
      lead={{
        kind: "count",
        color: "#ffb38a",
        overline: t("home.recentEntries"),
        value: new Intl.NumberFormat(tag).format(total ?? 0),
        unit: t("home.entries"),
        hint: t("home.recentHint"),
      }}
      action={
        <Link
          href="/search"
          aria-label={t("search.title")}
          className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-[#8ea6ff] text-[#111] active:brightness-95"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[#111] text-[#8ea6ff]">
            <Search className="h-5 w-5" strokeWidth={3} />
          </span>
          <span className="text-[13px] font-black leading-none">{t("search.title")}</span>
        </Link>
      }
      stats={[]}
    >
      <div className="flex flex-col gap-2 bg-white p-3">{children}</div>
    </SummaryBlock>
  );
}

/**
 * Son 7 gün — Bugün, Kategorilerin ve Yine ekle'yle aynı birleşik blokta:
 * üstte yeşil "SON 7 GÜN · 107 girdi", altında tarih aralığı ve günlük
 * ortalama; ortada sütunlar (günün kategori kırılımıyla yığılı, tepesinde
 * sayısı, bugün en sağda — dokun, o güne git); altta Takvimi aç.
 */
function BrutWeek({ week, today }: { week: DayBar[]; today: string }) {
  const t = useT();
  const locale = useLocale();
  const tag = intlTag(locale);
  const max = Math.max(...week.map((x) => x.count), 1);
  const total = week.reduce((n, d) => n + d.count, 0);
  const avg = new Intl.NumberFormat(tag, { maximumFractionDigits: 1 }).format(total / Math.max(1, week.length));
  return (
    <SummaryBlock
      className="mb-4"
      lead={{
        kind: "count",
        // Takvim'in yeşili — sütunlar günler
        color: "#7ae582",
        overline: t("home.last7Days"),
        value: cap(total),
        unit: t("home.entries"),
        hint: t("home.weekHint", { range: weekRange(week, tag), avg }),
      }}
      stats={[]}
      // Takvim'in yeşili — bölümün bandı gibi
      link={{ href: "/calendar", label: t("home.openCalendar"), color: "#7ae582", icon: CalendarRange }}
    >
      <div className="flex items-end gap-1.5 bg-white px-3 pb-3 pt-3 text-[#111]">
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
    </SummaryBlock>
  );
}

/** "21–27 Eki" ya da ay değişiyorsa "28 Eyl – 4 Eki" */
function weekRange(week: DayBar[], tag: string): string {
  if (!week.length) return "";
  const toDate = (key: string) => {
    const [y, m, d] = key.split("-").map(Number);
    return new Date(y, m - 1, d);
  };
  const a = toDate(week[0].date);
  const b = toDate(week[week.length - 1].date);
  const short = (d: Date) => d.toLocaleDateString(tag, { day: "numeric", month: "short" });
  return a.getMonth() === b.getMonth() ? `${a.getDate()}–${short(b)}` : `${short(a)} – ${short(b)}`;
}

/** Görünen en çok kare; fazlası "+N" karosuyla Yapı'ya */
const CATS_SHOWN = 12;

/** Başlıktaki sayılar en çok üç basamak: 1000 ve fazlası "999+" */
const cap = (n: number) => (n > 999 ? "999+" : String(n));


/**
 * Kategorilerin — girdilerin gittiği yer, yapıya giden kapı. Bugün bloğunun
 * eşi, aynı birleşik blok (bkz. SummaryBlock): üstte "KATEGORİLERİN · 10
 * kategori" ve altında küçük "66 alt kategori · 26 özellik" (999'u aşan
 * sayı 999+), yanında Ekle karosu gibi renkli Kategori yarat karosu (sarı:
 * Yapı'nın rengi); ortada kareler; en altta yalnız Yapıya git düğmesi.
 *
 * "Girdi eklemek için önce yapıda kategori kurulur" anlatılmıyor,
 * gösteriliyor: her kategori kendi renginde bir kare, son 30 günün
 * girdileriyle aşağıdan dolar (en çok girdisi olan dolu, hiç olmayan boş —
 * yalnız rengini gösteren ince taban). Renkler Bugün şeridi, haftanın
 * sütunları ve girdi kartlarıyla aynı; kullanıcı "girdim şu kategoriye
 * düştü" bağını kendisi kuruyor. Kareye dokununca Yapı'da kategorinin sayfası.
 *
 * İlk denemede bölüm sıradan bir katmandı ve yeni kategori ızgaranın
 * sonunda kesik çerçeveli küçük bir kareydi; kullanıcı Ekle kadar çekici,
 * renkli bir düğme istedi.
 */
function CategoriesBlock({ snapshot, onNew }: { snapshot: HomeSnapshot; onNew: () => void }) {
  const t = useT();
  const cats = snapshot.categories;
  const overflow = cats.length > CATS_SHOWN;
  const shown = overflow ? cats.slice(0, CATS_SHOWN - 1) : cats;
  const max = Math.max(1, ...cats.map((c) => c.count));
  const tileCls = "relative aspect-square w-full overflow-hidden rounded-[14px] border-2 border-[#111] shadow-[2px_2px_0_#111]";
  const nameCls = "w-full truncate text-center text-[11px] font-extrabold leading-tight";
  return (
    <SummaryBlock
      className="mb-4"
      lead={{
        kind: "count",
        color: "#ff9ecd",
        overline: t("home.cats.title"),
        value: cap(cats.length),
        unit: t("home.cats.unit"),
        // Zincirin öteki iki halkası — kategorilerin içinde ne var
        hint: t("home.cats.depth", {
          subcategories: cap(snapshot.counts.subcategories),
          features: cap(snapshot.counts.features),
        }),
      }}
      // Ekle karosunun eşi — kategori yarat
      action={
        <button
          type="button"
          onClick={onNew}
          aria-label={t("home.cats.newAria")}
          className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-[#ffd23f] px-1 text-[#111] active:bg-[#f5c400]"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[#111] text-[#ffd23f]">
            <Plus className="h-6 w-6" strokeWidth={3} />
          </span>
          <span className="text-center text-[12px] font-black leading-[1.05]">{t("home.cats.create")}</span>
        </button>
      }
      stats={[]}
      // Yapıya git — sayısız, yalnız düğme: Yapı bandının sarısı ve benekleri
      link={{ href: "/structure", label: t("home.cats.open"), color: "#ffd23f", icon: Layers }}
    >
      <div className="grid grid-cols-4 gap-x-2 gap-y-2.5 bg-white p-3">
        {shown.map(({ category: c, count }) => {
          // Boş kategoride yalnız rengini gösteren taban; doluluk en çok
          // girdisi olana göre
          const fill = count ? 24 + Math.round((76 * count) / max) : 12;
          return (
            <Link
              key={c.id}
              href={routes.structureCategory(c.id)}
              prefetch={false}
              aria-label={t("home.cats.tile", { name: c.name, n: count })}
              className="flex min-w-0 flex-col items-center gap-1 text-[#111] active:opacity-70"
            >
              <span className={cn(tileCls, "bg-white")}>
                <span
                  className="absolute inset-x-0 bottom-0 border-t-[1.5px] border-[#111] transition-[height] duration-500"
                  style={{ height: `${fill}%`, background: c.color }}
                />
                <span className="absolute inset-0 flex items-center justify-center">
                  {c.icon && <SymbolIcon name={c.icon} size={22} style={{ color: "#111" }} />}
                </span>
                {count > 0 && (
                  <b className="absolute right-1 top-1 rounded-[5px] bg-[#111] px-1 py-px font-mono text-[9.5px] font-bold leading-tight text-white tabular-nums">
                    {count}
                  </b>
                )}
              </span>
              <span className={nameCls}>{c.name}</span>
            </Link>
          );
        })}
        {overflow && (
          <Link
            href="/structure"
            aria-label={t("home.cats.more", { n: cats.length - shown.length })}
            className="flex min-w-0 flex-col items-center gap-1 text-[#111] active:opacity-70"
          >
            <span className={cn(tileCls, "flex items-center justify-center bg-white font-mono text-[16px] font-bold")}>
              +{cats.length - shown.length}
            </span>
            <span className={nameCls}>{t("nav.structure")}</span>
          </Link>
        )}
      </div>
    </SummaryBlock>
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
