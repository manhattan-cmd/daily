"use client";

import { useMemo } from "react";
import { bucketAncestorId, fmtNum } from "@/lib/analytics";
import { useT } from "@/lib/i18n";
import type { Category, Entry, SubCategory } from "@/types";
import { ShareBars, type ShareRow } from "./share-bars";
import { useCategoryMetrics } from "./use-category-metrics";

/**
 * Kademe kartı — bir düğümün (kategori ya da alt kategori) ALT KALEMLERİNİN
 * dönemdeki dağılımı.
 *
 * Analiz sayfası bir kademe yığını: en üstte kategoriler, altında seçilen
 * kategorinin alt kategorileri, altında seçilen alt kategorinin alt kalemleri…
 * en sonda seçilen yerin özellikleri. Her kart bir öncekinde seçilen satırın
 * içi; satıra dokunmak bir sonraki kademeyi açar ve sayfa oraya kayar. Nerede
 * olunduğunu yapışkan konum çubuğu söyler (bkz. AnalysisTrail).
 *
 * Rakamlar alttaki özellik seçimine göre (Para seçiliyse kalemler tutara göre
 * paylaşılır). SATIRLAR ise özellikten bağımsız: dönemde girdisi olan her
 * kalem hep satırdadır — özellik değişince kart kısalıp sayfayı oynatmasın.
 */
export function DrillLevel({
  sectionKey,
  category,
  parent,
  fetchStart,
  fetchEnd,
  excludeRegular,
  metricId,
  selectedId,
  onPick,
  onClear,
}: {
    /** Kaydırma hedefi işareti (data-section) */
    sectionKey: string;
    category: Category;
    /** Kimin altı — yoksa kategorinin kendisi */
    parent?: SubCategory;
    fetchStart: number;
    fetchEnd: number;
    excludeRegular: boolean;
    metricId: string;
    /** Bu kademede seçili kalem — vurgulu, diğerleri soluk */
    selectedId: string | null;
    onPick: (sub: SubCategory) => void;
    /** Seçili satıra yeniden dokunmak — bu kademeye geri dön */
    onClear: () => void;
}) {
  const t = useT();
  const { data, compute, metric } = useCategoryMetrics({
    category,
    rootSubId: parent?.id,
    fetchStart,
    fetchEnd,
    resetKey: category.id,
    preferredMetricId: metricId,
    initialMetricId: "count",
    excludeRegular,
  });

  const share = useMemo(() => {
    if (!data || !compute) return null;
    const by = new Map<string, Entry[]>();
    for (const e of data.entries) {
      const top = bucketAncestorId(e.subcategoryId, data.subById, parent?.id);
      if (!top) continue;
      const list = by.get(top) ?? [];
      list.push(e);
      by.set(top, list);
    }
    // Girdi sayısına düşülen durumlar: çoktan seçmelide paylaştırılacak bir
    // sayı yok; paylaşım modunda bu kademede o özelliğe hiç değer yoksa kart
    // "veri yok" yazısına dönüp kısalırdı
    const byCount =
      compute.isChoice ||
      (!compute.isRate &&
        !compute.scale &&
        [...by.values()].every((l) => compute.aggregate(l) === 0));
    const rows: ShareRow[] = [...by.entries()].map(([id, list]) => {
      const value = byCount ? list.length : compute.aggregate(list);
      const outOf = byCount ? list.length : compute.filledCount(list);
      const sub = data.subById.get(id)!;
      // Kademenin KENDİ doğrudan girdileri (kategori kökü ya da üst kalemin
      // kendisi) — satırda görünür ama inilecek bir yer değil
      const isSelf = id === parent?.id || sub.isCategoryRoot;
      const empty =
        !byCount && (compute.isRate || compute.scale ? outOf === 0 : value === 0);
      return {
        id,
        name: sub.isCategoryRoot
          ? category.name
          : id === parent?.id
            ? `${parent.name} (${t("insights.itself")})`
            : sub.name,
        color: category.color,
        value,
        outOf,
        display: empty
          ? "—"
          : !byCount && compute.unit
            ? `${fmtNum(value)} ${compute.unit}`
            : fmtNum(value),
        drillable: !isSelf,
      };
    });
    return {
      rows,
      byCount,
      isRate: !byCount && compute.isRate,
      scale: byCount ? undefined : compute.scale,
    };
  }, [data, compute, parent, category.name, category.color, t]);

  const metricLabel =
    share && !share.byCount && metric.type !== "count" ? metric.mod.name : null;

  return (
    <section
      data-section={sectionKey}
      // Yapışkan başlık + konum çubuğunun altında kalmasın
      className="scroll-mt-40 rounded-2xl border bg-card p-4"
      style={{ borderColor: `${category.color}40` }}
    >
      <div className="mb-3 flex items-center gap-2">
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: category.color }}
        />
        <h3 className="min-w-0 truncate text-[15px] font-semibold">
          {parent ? parent.name : category.name}
        </h3>
        <span className="shrink-0 text-[12px] text-muted-foreground">
          · {t("insights.subcategories")}
        </span>
        {metricLabel && (
          <span
            className="ml-auto shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium"
            style={{ background: `${category.color}1f`, color: category.color }}
          >
            {metricLabel}
          </span>
        )}
      </div>
      {share ? (
        <ShareBars
          rows={share.rows}
          mode={share.isRate ? "rate" : share.scale ? "level" : "share"}
          range={share.scale}
          selectedId={selectedId}
          emptyText={t("insights.noEntriesInPeriod")}
          onSelect={(id) => {
            const sub = data?.subById.get(id);
            if (!sub || sub.isCategoryRoot || id === parent?.id) return;
            if (id === selectedId) onClear();
            else onPick(sub);
          }}
        />
      ) : (
        // İlk okuma — kart şeklini korusun
        <div className="h-24" />
      )}
    </section>
  );
}
