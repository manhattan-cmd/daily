"use client";

import { Suspense } from "react";
import { useT } from "@/lib/i18n";
import { useLiveQuery } from "dexie-react-hooks";
import { getCategory } from "@/lib/db/queries";
import { CategoryOverviewPanel } from "@/components/analytics/category-overview-panel";
import { ScopeAnalysisHeader, ScopeTitle, useScopePeriod } from "@/components/analytics/scope-period-bar";
import { PageSheet } from "@/components/ui/layer";

/**
 * Kategori analiz sayfası — zaman perspektifinin (dönem sayfaları) yanındaki
 * kategori perspektifi: seçili dönemde (varsayılan tüm zamanlar) toplam,
 * günlük ortalama, istikrar, gelişim.
 */
export function CategoryAnalyticsPage({
  params,
}: {
  params: { categoryId: string };
}) {
  return (
    <Suspense fallback={null}>
      <CategoryAnalyticsContent params={params} />
    </Suspense>
  );
}

function CategoryAnalyticsContent({
  params,
}: {
  params: { categoryId: string };
}) {
  const t = useT();
  const { categoryId } = params;
  const category = useLiveQuery(() => getCategory(categoryId), [categoryId]);
  const [period, setPeriod] = useScopePeriod();

  return (
    <PageSheet
      top={
        <ScopeAnalysisHeader
          category={category}
          period={period}
          onPick={setPeriod}
          back={`/analytics?cat=${categoryId}`}
        />
      }
    >
      {category && (
        <>
          <CategoryOverviewPanel
            header={<ScopeTitle category={category} kicker={t("insights.categoryInsights")} />} category={category} period={period} />
        </>
      )}
    </PageSheet>
  );
}
