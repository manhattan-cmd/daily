"use client";

import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { Boxes, ChevronRight } from "lucide-react";
import { db } from "@/lib/db";
import { SymbolIcon } from "@/lib/icons";
import { routes } from "@/lib/routes";
import { useT } from "@/lib/i18n";

/**
 * Analiz sayfasında "Nesneler" kartı — listeler ve dönem içinde nesne
 * iliştirilmiş girdi sayısı. Liste satırı liste analizine, oradan nesneye.
 * Hiç liste yoksa kart çizilmez.
 */
export function ObjectsCard({ start, end }: { start: number; end: number }) {
  const t = useT();
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
    }));
  }, [start, end]);

  if (!rows?.length) return null;
  return (
    <div className="rounded-2xl border border-border bg-card p-4" data-objects-card="">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {t("objects.title")}
      </h3>
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
  );
}
