"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { useT } from "@/lib/i18n";
import { useSkin } from "@/lib/skin";
import { routes } from "@/lib/routes";
import { cn, toLocalDateValue } from "@/lib/utils";
import { PageSheet } from "@/components/ui/layer";
import { StructureAddButton, StructureHeader } from "@/components/structure/structure-header";
import { StructureHead } from "@/components/structure/structure-head";
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
  const brutal = useSkin() === "brutal";
  const [query, setQuery] = useState("");
  const add = useDayAdd(toLocalDateValue());
  const counts = useLiveQuery(async () => ({ entries: await db.entries.count(), planned: await db.goals.count() }), []);
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
          count={
            counts &&
            (planned ? t("struct.planned.count", { n: counts.planned }) : t("struct.entries.count", { n: counts.entries }))
          }
          add={{
            label: t(planned ? "structure.addPlanned" : "structure.addEntry"),
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
  const brutal = useSkin() === "brutal";
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
                on ? "bg-[#ffd23f] font-black text-[#111]" : "bg-white text-[#111]/60 active:bg-[#f5f1e8]"
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
        brutal ? "rounded-[14px] border-2 border-[#111] bg-white shadow-[2px_2px_0_#111]" : "rounded-2xl bg-[var(--sf-1)] p-1 ring-1 ring-inset ring-[var(--ln-1)]"
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
                ? cn("font-extrabold text-[#111]", i > 0 && "border-l-2 border-[#111]", on ? "bg-[#ffd23f]" : "bg-white text-[#111]/60")
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
