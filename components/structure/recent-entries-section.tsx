"use client";

import { useLiveQuery } from "dexie-react-hooks";
import {
  listEntriesByCategory,
  listEntriesBySubtree,
} from "@/lib/db/queries";
import {
  EntryListSection,
  type EntryListRow,
} from "@/components/analytics/entry-list";
import { fmtNum } from "@/lib/analytics";
import type { EntryWithContext } from "@/types";

/**
 * Yapı sayfalarındaki "Son girdiler" bölümü — kategori/alt kategorinin kendi
 * kayıtları, yeniden eskiye. Liste analiz sayfalarındakiyle aynı bileşen:
 * sayfalıdır ("Daha fazla göster" ile eskiler açılır) ve satıra dokununca
 * girdinin düzenleme modalı açılır.
 *
 * Analize gidiş burada değil sayfa başlığında: buradayken "bu listenin
 * analizi" gibi okunuyordu, oysa analiz kalemin tamamına ait.
 */
export function RecentEntriesSection({
  scope,
  categoryId,
  subcategoryId,
  /** Sayfanın kendi adı — satırda tekrar etmesin, yalnız alt kalemler yazılır */
  selfName,
  /** Kategori rengi — sayı rozeti, sol şerit ve değer etiketi bununla boyanır */
  color = "#6366f1",
}: {
  scope: "category" | "subcategory";
  categoryId: string;
  subcategoryId?: string;
  selfName?: string;
  color?: string;
}) {
  const entries = useLiveQuery(
    () =>
      scope === "subcategory" && subcategoryId
        ? listEntriesBySubtree(subcategoryId)
        : listEntriesByCategory(categoryId, 200),
    [scope, categoryId, subcategoryId]
  );

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
      <EntryListSection
        title="Son Girdiler"
        accent={color}
        rows={rows}
        emptyText="Henüz girdi yok"
      />
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
