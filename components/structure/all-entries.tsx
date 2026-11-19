"use client";

import { Fragment, useState } from "react";
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

  const groups: { day: string; entries: EntryWithContext[] }[] = [];
  for (const e of entries ?? []) {
    const day = toLocalDateValue(e.occurredAt);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.entries.push(e);
    else groups.push({ day, entries: [e] });
  }
  const dayLabel = (key: string) => {
    const [y, m, d] = key.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(tag, { weekday: "short", day: "numeric", month: "long", year: "numeric" });
  };
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
          {groups.map((g) => (
            <Fragment key={g.day}>
              <div className="bg-[#f5f1e8] px-3.5 py-1.5 text-[10.5px] font-black uppercase tracking-[0.08em] text-[#111]">
                {dayLabel(g.day)}
              </div>
              <div className="flex flex-col gap-2 bg-white p-2.5">
                {g.entries.map((e) => (
                  <EntryCard key={e.id} entry={e} />
                ))}
              </div>
            </Fragment>
          ))}
        </SummaryBlock>
        {moreButton}
      </div>
    );
  }

  return (
    <div data-all-entries="" className="flex flex-col gap-4 pb-8">
      {groups.map((g) => (
        <section key={g.day}>
          <div className="mb-1.5 px-1 text-[11px] font-medium text-muted-foreground/70">{dayLabel(g.day)}</div>
          <div className="flex flex-col gap-2">
            {g.entries.map((e) => (
              <EntryCard key={e.id} entry={e} />
            ))}
          </div>
        </section>
      ))}
      {moreButton}
    </div>
  );
}
