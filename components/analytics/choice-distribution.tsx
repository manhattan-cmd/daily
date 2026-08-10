"use client";

import { fmtNum } from "@/lib/analytics";
import { useT } from "@/lib/i18n";
import { ShareBars, type ShareRow } from "./share-bars";

/**
 * Çoktan seçmeli özelliğin ana görseli — seçeneklerin dağılımı.
 *
 * Alt kategori kırılımının YERİNE geçer, yanına değil: bu türde sorulan soru
 * "ne nereye gitmiş" değil "hangisi ne sıklıkla". Pay barı burada matematiksel
 * olarak da doğru — seçenekler gerçekten tek bir bütünü paylaşıyor.
 *
 * Satıra dokunmak o seçeneği süzgeç yapar ve seri grafiği onun kova başına
 * adedine döner ("gergin günlerim artıyor mu"). Tekrar dokunmak süzgeci kaldırır.
 */
export function ChoiceDistribution({
  rows,
  color,
  selected,
  onSelect,
  title,
}: {
  rows: { choice: string; count: number }[];
  color: string;
  /** Süzgeç olarak seçili seçenek; null = tümü */
  selected: string | null;
  onSelect: (choice: string | null) => void;
  /** Kapsam öneki gibi başlığa eklenen içerik */
  title?: React.ReactNode;
}) {
  const t = useT();
  const shareRows: ShareRow[] = rows.map((r) => ({
    id: r.choice,
    name: r.choice,
    color,
    value: r.count,
    display: fmtNum(r.count),
  }));

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="min-w-0 text-xs font-semibold uppercase leading-tight tracking-wider text-muted-foreground">
          {title}
          {t("insights.optionDistribution")}
        </h3>
        {/* Süzgeç açıkken çıkışı görünür olmalı — satıra tekrar dokunmak da
            aynı işi yapıyor ama bu daha keşfedilebilir */}
        {selected && (
          <button
            type="button"
            onClick={() => onSelect(null)}
            className="shrink-0 rounded-full bg-white/8 px-2.5 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-white/12 hover:text-foreground"
          >
            {t("insights.allOptions")}
          </button>
        )}
      </div>
      <ShareBars
        rows={shareRows}
        selectedId={selected}
        emptyText={t("stat.noData")}
        onSelect={(choice) => onSelect(choice === selected ? null : choice)}
      />
    </div>
  );
}
