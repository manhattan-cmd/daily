"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Rows3 } from "lucide-react";
import { searchEntries } from "@/lib/db/queries";
import { intlTag, useLocale, useT } from "@/lib/i18n";
import { useSkin } from "@/lib/skin";
import { toLocalDateValue } from "@/lib/utils";
import type { EntryWithContext } from "@/types";
import { EntryCard } from "@/components/dashboard/entry-card";
import { EmptyState } from "@/components/ui/empty-state";
import { SummaryBlock, SummaryEmpty } from "@/components/ui/summary-block";
import { DayCell, groupByDay, useDayLabel } from "@/components/ui/day-cell";

/** Bir seferde okunan girdi — fazlası "Daha fazla göster" ile */
const PAGE = 60;
/** Girdilerin rengi — gün sayfasındaki Günün girdileri bloğunun turuncusu */
const ENTRIES = "#ffb38a";

/**
 * Bütün girdiler (Yapı › Girdiler): yeniden eskiye, gün gün. Arama girdinin
 * kendi metninde (başlık, not, takma ad) ve yerin adında — "kahve" yazınca
 * Kafe kalemindekiler de gelir (bkz. searchEntries). Girdiler sayfa sayfa
 * okunur, binlercesi birden belleğe alınmaz. Karta dokunmak girdiyi açar
 * (girdi kartının kendi davranışı).
 */
export function AllEntries({ query, onAdd }: { query: string; onAdd: () => void }) {
  const t = useT();
  const tag = intlTag(useLocale());
  const brutal = useSkin() === "brutal";
  const [limit, setLimit] = useState(PAGE);
  const q = query.trim();
  const entries = useLiveQuery(() => searchEntries({ query: q, limit }), [q, limit]);

  // Gün gün — Ara'yla aynı gün hücresi ve tarih yazılışı (bkz. DayCell)
  const groups = groupByDay(entries ?? [], (e: EntryWithContext) => toLocalDateValue(e.occurredAt));
  const dayLabel = useDayLabel();
  const fmt = (n: number) => new Intl.NumberFormat(tag).format(n);
  // Sayfa doldu: belki daha fazlası var
  const more = !!entries && entries.length >= limit;
  const moreButton = more && (
    <button
      type="button"
      data-entries-more=""
      onClick={() => setLimit((n) => n + PAGE)}
      className={
        brutal
          ? "mt-3 h-11 w-full rounded-[12px] border-2 border-[#111] bg-white text-[14px] font-extrabold text-[#111] shadow-[2px_2px_0_#111] active:translate-x-px active:translate-y-px"
          : "mt-3 h-10 w-full rounded-xl bg-[var(--sf-2)] text-[13px] font-semibold text-foreground/80"
      }
    >
      {t("entries.more")}
    </button>
  );

  if (entries === undefined) return null;
  if (entries.length === 0) {
    if (q) return <p className="px-1 text-[13px] font-medium text-muted-foreground">{t("entries.noMatch")}</p>;
    return brutal ? (
      <SummaryBlock
        compact
        lead={{ kind: "count", color: ENTRIES, glyph: Rows3, overline: t("structure.entries"), value: "0", unit: "" }}
        stats={[]}
      >
        <SummaryEmpty text={t("entries.none")} action={{ label: t("action.add"), onClick: onAdd }} />
      </SummaryBlock>
    ) : (
      <EmptyState icon={Rows3} title={t("entries.none")} description={t("day.empty.hint")} />
    );
  }

  if (brutal) {
    return (
      <div data-all-entries="" className="pb-8">
        <SummaryBlock
          compact
          dense
          lead={{
            kind: "count",
            color: ENTRIES,
            overline: q ? t("notes.results") : t("entries.latest"),
            value: `${entries.length}${more ? "+" : ""}`,
            unit: "",
          }}
          stats={[]}
        >
          {/* Eskiden gün krem ara satırdı, girdiler ayrı beyaz hücrede: iki
              tarih arasında tek girdi kalınca hangi güne ait olduğu
              okunmuyordu. Artık Ara'daki gibi her gün tek hücre, tarihe
              dokununca gün sayfası */}
          {groups.map((g) => (
            <DayCell key={g.key} day={g.key} label={dayLabel(g.key)} count={fmt(g.items.length)}>
              {g.items.map((e) => (
                <EntryCard key={e.id} entry={e} />
              ))}
            </DayCell>
          ))}
        </SummaryBlock>
        {moreButton}
      </div>
    );
  }

  return (
    <div data-all-entries="" className="flex flex-col gap-4 pb-8">
      {groups.map((g) => (
        <section key={g.key}>
          <div className="mb-1.5 px-1 text-[11px] font-medium text-muted-foreground/70">{dayLabel(g.key)}</div>
          <div className="flex flex-col gap-2">
            {g.items.map((e) => (
              <EntryCard key={e.id} entry={e} />
            ))}
          </div>
        </section>
      ))}
      {moreButton}
    </div>
  );
}
