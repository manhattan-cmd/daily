"use client";

import { useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { Boxes, ChevronRight } from "lucide-react";
import { db } from "@/lib/db";
import { listCollections } from "@/lib/db/things";
import { EmptyState } from "@/components/ui/empty-state";
import { CollectionForm } from "@/components/structure/collection-form";
import {
  StructureAddButton,
  StructureHeader,
} from "@/components/structure/structure-header";
import { SymbolIcon } from "@/lib/icons";
import { SmartText } from "@/components/ui/smart-text";
import { useT } from "@/lib/i18n";
import { routes } from "@/lib/routes";
import { useRouter } from "next/navigation";

/**
 * Yapı › Nesneler — listeler (koleksiyonlar). Kart dili Kategoriler
 * sayfasındaki brütal kartla aynı: solda listenin renginde sırt şeridi,
 * simge karosu, ad ve sayılar.
 */
export default function ObjectsPage() {
  const t = useT();
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const data = useLiveQuery(async () => {
    const [cols, things] = await Promise.all([listCollections(), db.things.toArray()]);
    return cols.map((c) => {
      const mine = things.filter((th) => th.collectionId === c.id);
      return { c, total: mine.length, active: mine.filter((th) => !th.archivedAt).length };
    });
  }, []);

  return (
    <>
      <StructureHeader
        action={
          <StructureAddButton labelKey="objects.addCollection" onClick={() => setAddOpen(true)} />
        }
      />

      {data === undefined ? null : data.length === 0 ? (
        <EmptyState icon={Boxes} title={t("objects.emptyTitle")} description={t("objects.emptyBody")} />
      ) : (
        <div className="flex flex-col gap-4 pb-6 pt-1">
          {data.map(({ c, total, active }) => {
            const color = c.color ?? "#94a3b8";
            return (
              <Link
                key={c.id}
                href={routes.structureCollection(c.id)}
                prefetch={false}
                data-collection-card=""
                className="flex overflow-hidden rounded-2xl border-2 border-[#111] bg-white text-[#111] shadow-[4px_4px_0_#111] transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-[2px_2px_0_#111]"
              >
                <span className="w-3.5 shrink-0 border-r-2 border-[#111]" style={{ background: color }} />
                <span className="flex min-w-0 flex-1 items-center gap-3 p-3">
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] border-[1.5px] border-[#111]"
                    style={{ background: color }}
                  >
                    {c.icon ? (
                      <SymbolIcon name={c.icon} size={21} style={{ color: "#111" }} />
                    ) : (
                      <Boxes className="h-5 w-5" strokeWidth={2.4} />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <SmartText text={c.name} className="block text-[17px] font-black leading-tight tracking-tight" />
                    <span className="block text-[11.5px] font-semibold text-[#111]/55">
                      {t("objects.count", { n: total, active })}
                    </span>
                  </span>
                  <ChevronRight className="h-5 w-5 shrink-0 opacity-50" strokeWidth={2.6} />
                </span>
              </Link>
            );
          })}
        </div>
      )}

      <CollectionForm
        open={addOpen}
        onOpenChange={setAddOpen}
        nextOrder={data?.length ?? 0}
        onSaved={(c) => c && router.push(routes.structureCollection(c.id))}
      />
    </>
  );
}
