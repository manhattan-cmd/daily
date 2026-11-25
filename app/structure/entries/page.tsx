"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { useT } from "@/lib/i18n";
import { useSkin, isBlockSkin } from "@/lib/skin";
import { routes } from "@/lib/routes";
import { cn, toLocalDateValue } from "@/lib/utils";
import { PageSheet } from "@/components/ui/layer";
import { StructureAddButton, StructureHeader } from "@/components/structure/structure-header";
import { StructureHead, YAPI, headNum, periodStarts } from "@/components/structure/structure-head";
import { CalendarDays } from "lucide-react";
import { occursOn } from "@/lib/goals";
import { StructureSearch } from "@/components/structure/structure-search";
import { AllEntries } from "@/components/structure/all-entries";
import { PlannedList } from "@/components/goals/planned-list";
import { useDayAdd } from "@/components/calendar/day-add";

type View = "all" | "planned";

/**
 * Yapı › Girdiler — girdilerin yapıdaki yeri. İki görünüm: Girdiler (bütün
 * girdiler, yeniden eskiye) ve Planlı girdiler (tekrar edenler, yaklaşanlar,
 * bitenler). Görünüm adreste (?view=planned): gün sayfasının "Tüm girdiler"
 * bağlantısı ve eski /goals adresi doğrudan doğru görünüme gelir.
 */
export default function Page() {
  return (
    <Suspense fallback={null}>
      <EntriesScreen />
    </Suspense>
  );
}

function EntriesScreen() {
  const q = useSearchParams();
  const view: View = q.get("view") === "planned" ? "planned" : "all";
  // Görünüm değişince arama sıfırlanır
  return <EntriesView key={view} view={view} />;
}

function EntriesView({ view }: { view: View }) {
  const t = useT();
  const brutal = isBlockSkin(useSkin());
  const [query, setQuery] = useState("");
  const add = useDayAdd(toLocalDateValue());
  const counts = useLiveQuery(async () => ({ entries: await db.entries.count(), planned: await db.goals.count() }), []);
  // Başın sayıları — Girdiler'de bugün · bu hafta · bu ay; Planlı girdiler'de
  // bugün olan · tekrar eden · tek seferlik
  const stats = useLiveQuery(async () => {
    const st = periodStarts();
    const since = (ms: number) => db.entries.where("occurredAt").aboveOrEqual(ms).count();
    const goals = await db.goals.toArray();
    const today = toLocalDateValue();
    return {
      today: await since(st.today),
      week: await since(st.week),
      month: await since(st.month),
      plannedToday: goals.filter((g) => occursOn(g, today)).length,
      repeating: goals.filter((g) => !!g.repeat).length,
    };
  }, []);
  const planned = view === "planned";

  return (
    <PageSheet
      top={
        <StructureHeader
          action={
            brutal ? undefined : (
              <StructureAddButton
                labelKey={planned ? "structure.addPlanned" : "structure.addEntry"}
                onClick={planned ? add.openGoal : () => add.openEntry()}
              />
            )
          }
        />
      }
    >
      {/* Brütal: sayfa başı (bkz. StructureHead) — görünüm anahtarı başın
          ikinci satırı, arama Ara karosunun ardında */}
      {brutal ? (
        <StructureHead
          lead={{
            kind: "count",
            color: YAPI,
            overline: planned ? t("entries.view.planned") : t("structure.entries"),
            value: counts ? headNum(planned ? counts.planned : counts.entries) : "–",
            unit: planned ? t("yhead.unit.planned") : t("home.entries"),
          }}
          stats={
            counts && stats
              ? planned
                ? [
                    { label: t("yhead.stat.today"), value: headNum(stats.plannedToday), color: "#ff9ecd" },
                    { label: t("yhead.stat.repeating"), value: headNum(stats.repeating), color: "#c9b8ff" },
                    { label: t("yhead.stat.once"), value: headNum(counts.planned - stats.repeating), color: "#ffb38a" },
                  ]
                : [
                    { label: t("yhead.stat.today"), value: headNum(stats.today), color: "#ffd23f" },
                    { label: t("yhead.stat.week"), value: headNum(stats.week), color: "#7ae582" },
                    { label: t("brut.thisMonth"), value: headNum(stats.month), color: "#8ea6ff" },
                  ]
              : []
          }
          // Girdiler günlerde yaşar — Takvim'in turkuazı (bkz. ana sayfa)
          link={{ href: "/calendar", label: t("home.openCalendar"), color: "#5eead4", icon: CalendarDays }}
          add={{
            label: planned ? t("structure.addPlanned") : t("yhead.add.entry"),
            onClick: planned ? add.openGoal : () => add.openEntry(),
          }}
          search={{ value: query, onChange: setQuery, placeholder: planned ? t("goal.searchList") : t("entries.searchPlaceholder") }}
          rows={<ViewSwitch view={view} />}
        />
      ) : (
        <>
          <ViewSwitch view={view} />
          <StructureSearch
            value={query}
            onChange={setQuery}
            placeholder={planned ? t("goal.searchList") : t("entries.searchPlaceholder")}
          />
        </>
      )}
      {planned ? (
        <PlannedList query={query} onPlan={add.openGoal} />
      ) : (
        <AllEntries query={query} onAdd={() => add.openEntry()} />
      )}
      {add.sheets}
    </PageSheet>
  );
}

/**
 * Girdiler | Planlı girdiler — sayfanın kendi menüsü (adres değişir, geçmiş
 * şişmez). Brütalde sayfa başının ikinci satırı: iki hücre, aralarında
 * bloğun çizgisi; seçili olan başın sarısında, başa bağlı sekme gibi.
 * Siyah denendi: alt köşede bloğun çerçevesine karışıp köşeyi siliyordu.
 */
function ViewSwitch({ view }: { view: View }) {
  const t = useT();
  const brutal = isBlockSkin(useSkin());
  const items: { key: View; label: string; href: string }[] = [
    { key: "all", label: t("entries.view.all"), href: routes.structureEntries() },
    { key: "planned", label: t("entries.view.planned"), href: routes.structureEntries("planned") },
  ];
  if (brutal) {
    return (
      <nav aria-label={t("structure.entries")} data-entries-switch="" className="grid grid-cols-2 gap-[2px]">
        {items.map((it) => {
          const on = it.key === view;
          return (
            <Link
              key={it.key}
              href={it.href}
              replace
              aria-current={on ? "page" : undefined}
              className={cn(
                "flex h-10 items-center justify-center text-[13.5px] font-extrabold transition-colors",
                on ? "bg-fill-[#ffd23f] font-black text-ink" : "bg-paper text-ink/60 active:bg-paper-2"
              )}
            >
              {it.label}
            </Link>
          );
        })}
      </nav>
    );
  }
  return (
    <nav
      aria-label={t("structure.entries")}
      data-entries-switch=""
      className={cn(
        "mb-3 mt-1 grid grid-cols-2 overflow-hidden",
        brutal ? "rounded-[14px] border-2 border-line bg-paper shadow-[2px_2px_0_var(--shade)]" : "rounded-2xl bg-[var(--sf-1)] p-1 ring-1 ring-inset ring-[var(--ln-1)]"
      )}
    >
      {items.map((it, i) => {
        const on = it.key === view;
        return (
          <Link
            key={it.key}
            href={it.href}
            replace
            aria-current={on ? "page" : undefined}
            className={cn(
              "flex h-10 items-center justify-center text-[14px] transition-colors",
              brutal
                ? cn("font-extrabold text-ink", i > 0 && "border-l-2 border-line", on ? "bg-fill-[#ffd23f]" : "bg-paper text-ink/60")
                : cn("rounded-xl font-semibold", on ? "bg-background text-foreground shadow-sm" : "text-muted-foreground")
            )}
          >
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
