"use client";

import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { Boxes, ChevronRight } from "lucide-react";
import { db } from "@/lib/db";
import { SymbolIcon } from "@/lib/icons";
import { routes } from "@/lib/routes";
import { intlTag, useLocale, useT } from "@/lib/i18n";
import { Layer } from "@/components/ui/layer";
import { SummaryBlock } from "@/components/ui/summary-block";
import { useIsBrutal } from "@/components/structure/brutal";

/** Nesneler bloğunun rengi (Brütal) */
const OBJECTS = "#ffd23f";

/**
 * Analiz sayfasında "Nesneler" kartı — listeler ve dönem içinde nesne
 * iliştirilmiş girdi sayısı. Liste satırı liste analizine, oradan nesneye.
 * Hiç liste yoksa kart çizilmez.
 *
 * Brütalde blok (bkz. SummaryBlock): sarı "NESNELER · 5 girdi" (dönemde
 * nesne iliştirilmiş girdiler), altında listeler beyaz hücrede satır satır.
 */
export function ObjectsCard({ start, end }: { start: number; end: number }) {
  const t = useT();
  const brutal = useIsBrutal();
  const tag = intlTag(useLocale());
  const rows = useLiveQuery(async () => {
    const cols = (await db.collections.toArray()).sort((a, b) => a.order - b.order);
    if (!cols.length) return [];
    const things = await db.things.toArray();
    const collOf = new Map(things.map((th) => [th.id, th.collectionId]));
    const entries = await db.entries
      .where("occurredAt")
      .between(start, end, true, false)
      .filter((e) => !!e.thingIds?.length)
      .toArray();
    return cols.map((c) => ({
      c,
      things: things.filter((th) => th.collectionId === c.id).length,
      entries: entries.filter((e) => e.thingIds!.some((tid) => collOf.get(tid) === c.id)).length,
      // Bloğun sayısı: aynı girdi iki listeye değse de bir kez
      ids: entries.filter((e) => e.thingIds!.some((tid) => collOf.get(tid) === c.id)).map((e) => e.id),
    }));
  }, [start, end]);

  if (!rows?.length) return null;
  if (brutal) {
    const total = new Set(rows.flatMap((r) => r.ids)).size;
    return (
      <SummaryBlock
        lead={{
          kind: "count",
          color: OBJECTS,
          overline: t("objects.title"),
          value: new Intl.NumberFormat(tag).format(total),
          unit: t("home.entries"),
        }}
        stats={[]}
      >
        <div data-objects-card="" className="flex flex-col bg-white">
          {rows.map(({ c, things, entries }, i) => (
            <Link
              key={c.id}
              href={routes.analyticsCollection(c.id)}
              prefetch={false}
              className={i > 0 ? "flex items-center gap-2.5 border-t-[1.5px] px-3 py-2.5 text-[#111] active:bg-[#f5f1e8]" : "flex items-center gap-2.5 px-3 py-2.5 text-[#111] active:bg-[#f5f1e8]"}
              style={i > 0 ? { borderTopColor: "#111" } : undefined}
            >
              <span
                className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[8px] border-2"
                style={{ background: c.color ?? "#94a3b8", borderColor: "#111" }}
              >
                {c.icon ? (
                  <SymbolIcon name={c.icon} size={16} style={{ color: "#111" }} />
                ) : (
                  <Boxes className="h-4 w-4" strokeWidth={2.5} />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-black leading-tight">{c.name}</span>
                <span className="mt-0.5 block truncate text-[11px] font-bold leading-tight text-[#111]/60">
                  {t("objects.an.cardLine", { things, entries })}
                </span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0" strokeWidth={2.75} />
            </Link>
          ))}
        </div>
      </SummaryBlock>
    );
  }
  return (
    // Brütalde katman (bkz. Layer), ad katmanın başında; ötekilerde kart
    <Layer label={t("objects.title")} className="mb-0">
    <div className={brutal ? undefined : "rounded-2xl border border-border bg-card p-4"} data-objects-card="">
      {!brutal && (
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {t("objects.title")}
      </h3>
      )}
      <div className="flex flex-col divide-y divide-border/50">
        {rows.map(({ c, things, entries }) => (
          <Link
            key={c.id}
            href={routes.analyticsCollection(c.id)}
            prefetch={false}
            className="-mx-1 flex items-center gap-3 rounded-lg px-1 py-2.5 transition-colors hover:bg-[var(--sf-2)]"
          >
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
              style={{ background: c.color ?? "#94a3b8" }}
            >
              {c.icon ? (
                <SymbolIcon name={c.icon} size={16} style={{ color: "#111" }} />
              ) : (
                <Boxes className="h-4 w-4 text-[#111]" />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{c.name}</span>
              <span className="block text-[11px] text-muted-foreground">
                {t("objects.an.cardLine", { things, entries })}
              </span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/40" />
          </Link>
        ))}
      </div>
    </div>
    </Layer>
  );
}
