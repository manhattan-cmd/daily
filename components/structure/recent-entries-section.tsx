"use client";

import { useT } from "@/lib/i18n";
import { useLiveQuery } from "dexie-react-hooks";
import {
  listEntriesByCategory,
  listEntriesBySubtree,
} from "@/lib/db/queries";
import {
  EntryListBlock,
  EntryListSection,
  type EntryListRow,
} from "@/components/analytics/entry-list";
import { useIsBrutal } from "@/components/structure/brutal";
import { fmtNum } from "@/lib/analytics";
import { Layer } from "@/components/ui/layer";
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
  /** Bütün girdilerin sayısı (liste en çok 200 getiriyor) — brütal bloğun başında */
  total,
}: {
  scope: "category" | "subcategory";
  categoryId: string;
  subcategoryId?: string;
  selfName?: string;
  color?: string;
  total?: number;
}) {
  const t = useT();
  const brutal = useIsBrutal();
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

  // Brütal: ana sayfanın Son girdiler bloğu (bkz. EntryListBlock)
  if (brutal) {
    if (!entries) return null;
    return (
      <EntryListBlock
        title={t("home.recentEntries")}
        total={total}
        hint={t("struct.recent.hint")}
        accent={color}
        rows={rows}
        emptyText={t("brut.noEntries")}
      />
    );
  }

  return (
    <Layer bare className="mb-6">
    <section>
      <EntryListSection
        framed
        title={t("home.recentEntries")}
        accent={color}
        rows={rows}
        emptyText="Henüz girdi yok"
      />
    </section>
    </Layer>
  );
}

/** Girdinin hangi kaleme ait olduğu — kök girdide kategori adı */
function subLabelOf(e: EntryWithContext): string {
  return e.subcategory.isCategoryRoot ? e.category.name : e.subcategory.name;
}

/** İlk sayısal değeri kısa etiket olarak göster (örn. "420 ₺") */
function valueLabelOf(e: EntryWithContext): string | undefined {
  for (const v of e.values) {
    if (!v.entryType || v.thingId) continue;
    const vt = v.entryType.valueType ?? "number";
    if (vt !== "number") continue;
    const n = Number(v.value);
    if (!Number.isFinite(n)) continue;
    return `${fmtNum(n)}${v.entryType.unit ? ` ${v.entryType.unit}` : ""}`;
  }
  return undefined;
}
