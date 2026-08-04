"use client";

import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowRight, BarChart3 } from "lucide-react";
import {
  listEntriesByCategory,
  listEntriesBySubtree,
} from "@/lib/db/queries";
import { EntryList, type EntryListRow } from "@/components/analytics/entry-list";
import { fmtNum } from "@/lib/analytics";
import type { EntryWithContext } from "@/types";

/**
 * Yapı sayfalarındaki "Son girdiler" bölümü — kategori/alt kategorinin kendi
 * kayıtları, yeniden eskiye. Liste analiz sayfalarındakiyle aynı bileşen:
 * sayfalıdır ("Daha fazla göster" ile eskiler açılır) ve satıra dokununca
 * girdinin düzenleme modalı açılır. Başlıkta analize gitme kısayolu var —
 * yapı sayfası böylece "bu ne, altında ne var, ne kaydettim, nasıl gidiyor"
 * sorularının hepsine cevap veren bir yer olur.
 */
export function RecentEntriesSection({
  scope,
  categoryId,
  subcategoryId,
  /** Sayfanın kendi adı — satırda tekrar etmesin, yalnız alt kalemler yazılır */
  selfName,
}: {
  scope: "category" | "subcategory";
  categoryId: string;
  subcategoryId?: string;
  selfName?: string;
}) {
  const entries = useLiveQuery(
    () =>
      scope === "subcategory" && subcategoryId
        ? listEntriesBySubtree(subcategoryId)
        : listEntriesByCategory(categoryId, 200),
    [scope, categoryId, subcategoryId]
  );

  const analyticsHref =
    scope === "subcategory" && subcategoryId
      ? `/analytics/${categoryId}/${subcategoryId}`
      : `/analytics/${categoryId}`;

  const rows: EntryListRow[] = (entries ?? []).map((e) => {
    const label = subLabelOf(e);
    return {
      id: e.id,
      occurredAt: e.occurredAt,
      title: e.title,
      notes: e.notes,
      subLabel: label === selfName ? undefined : label,
      valueLabel: valueLabelOf(e),
    };
  });

  return (
    <section className="mb-6">
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Son Girdiler
          {entries && entries.length > 0 && (
            <span className="ml-1.5 font-normal text-muted-foreground/50">
              {entries.length}
            </span>
          )}
        </h2>
        <Link
          href={analyticsHref}
          className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <BarChart3 className="h-3 w-3" />
          Analiz
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      <div className="rounded-2xl border border-border bg-card px-4 py-1">
        <EntryList rows={rows} emptyText="Henüz girdi yok" />
      </div>
    </section>
  );
}

/** Girdinin hangi kaleme ait olduğu — kök girdide kategori adı */
function subLabelOf(e: EntryWithContext): string {
  return e.subcategory.isCategoryRoot ? e.category.name : e.subcategory.name;
}

/** İlk sayısal değeri kısa etiket olarak göster (örn. "420 ₺") */
function valueLabelOf(e: EntryWithContext): string | undefined {
  for (const v of e.values) {
    if (!v.entryType) continue;
    const vt = v.entryType.valueType ?? "number";
    if (vt !== "number") continue;
    const n = Number(v.value);
    if (!Number.isFinite(n)) continue;
    return `${fmtNum(n)}${v.entryType.unit ? ` ${v.entryType.unit}` : ""}`;
  }
  return undefined;
}
