"use client";

import { useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { Boxes, ChevronRight, Diamond } from "lucide-react";
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
import { PageSheet } from "@/components/ui/layer";
import { SummaryBlock, SummaryEmpty } from "@/components/ui/summary-block";
import { useIsBrutal } from "@/components/structure/brutal";
import type { Thing } from "@/types";

/** Listenin bloğunda gösterilen nesne sayısı — fazlası "+N" */
const THING_PREVIEW = 10;

/**
 * Yapı › Nesneler — listeler (koleksiyonlar). Brütalde Yapı → Kategoriler'in
 * blok dili (bkz. SummaryBlock): her liste bir blok — listenin renginde ad
 * hücresi (simgesi, adı, nesne · aktif sayısı; dokununca listenin sayfası),
 * altında beyaz hücrede nesneleri etiket etiket (baklava = nesne; dokununca
 * nesnenin sayfası, fazlası "+N"). Boşsa boş pencere: hiç liste yoksa
 * "Henüz liste yok" ve ufak Oluştur, nesnesiz listede "Henüz nesne yok" ve
 * Ekle (listenin sayfası, ekleme orada). Sade temalarda sırt şeritli kartlar.
 */
export default function ObjectsPage() {
  const t = useT();
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const brutal = useIsBrutal();
  const data = useLiveQuery(async () => {
    const [cols, things] = await Promise.all([listCollections(), db.things.toArray()]);
    return cols.map((c) => {
      const mine = things.filter((th) => th.collectionId === c.id);
      const live: Thing[] = mine
        .filter((th) => !th.archivedAt)
        .sort((a, b) => a.name.localeCompare(b.name, "tr"));
      return { c, total: mine.length, active: live.length, live };
    });
  }, []);

  return (
    <PageSheet
      top={
        <StructureHeader
          action={
            <StructureAddButton labelKey="objects.addCollection" onClick={() => setAddOpen(true)} />
          }
        />
      }
    >

      {data === undefined ? null : brutal ? (
        data.length === 0 ? (
          <SummaryBlock
            compact
            lead={{ kind: "count", color: "#ffd23f", glyph: Diamond, overline: t("structure.objects"), value: "0", unit: "" }}
            stats={[]}
          >
            <SummaryEmpty text={t("objects.emptyTitle")} action={{ label: t("action.create"), onClick: () => setAddOpen(true) }} />
          </SummaryBlock>
        ) : (
          <div className="flex flex-col gap-4 pb-6 pt-1">
            {data.map(({ c, total, active, live }) => {
              const color = c.color ?? "#94a3b8";
              const more = live.length - THING_PREVIEW;
              return (
                <SummaryBlock
                  key={c.id}
                  leadHref={routes.structureCollection(c.id)}
                  compact
                  lead={{
                    kind: "thing",
                    color,
                    icon: c.icon,
                    glyph: c.icon ? undefined : Boxes,
                    title: c.name,
                    hint: t("objects.count", { n: total, active }),
                  }}
                  stats={[]}
                >
                  {live.length === 0 && (
                    <SummaryEmpty
                      text={t("objects.noThings")}
                      action={{ label: t("action.add"), onClick: () => router.push(routes.structureCollection(c.id)) }}
                    />
                  )}
                  {live.length > 0 && (
                    <div data-thing-chips="" className="flex flex-wrap gap-1.5 bg-white p-2.5">
                      {live.slice(0, THING_PREVIEW).map((th) => (
                        <Link
                          key={th.id}
                          href={routes.structureThing(th.id)}
                          prefetch={false}
                          className="flex max-w-full items-center gap-1.5 rounded-[9px] border-[1.5px] border-[#111] bg-white px-2 py-[5px] text-[12.5px] font-extrabold leading-none text-[#111] shadow-[1.5px_1.5px_0_#111] active:translate-x-px active:translate-y-px active:shadow-none"
                        >
                          {/* Baklava — şekil dilinde nesne */}
                          <span
                            aria-hidden
                            className="h-2 w-2 shrink-0 rotate-45 border-[1.5px]"
                            style={{ background: color, borderColor: "#111" }}
                          />
                          <span className="truncate">{th.name}</span>
                        </Link>
                      ))}
                      {more > 0 && (
                        <Link
                          href={routes.structureCollection(c.id)}
                          prefetch={false}
                          className="flex items-center rounded-[9px] border-[1.5px] border-dashed border-[#111]/60 px-2 py-[5px] font-mono text-[12px] font-bold leading-none text-[#111]/70"
                        >
                          +{more}
                        </Link>
                      )}
                    </div>
                  )}
                </SummaryBlock>
              );
            })}
          </div>
        )
      ) : data.length === 0 ? (
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
    </PageSheet>
  );
}
