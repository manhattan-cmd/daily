"use client";

import { Suspense } from "react";
import { useT } from "@/lib/i18n";
import { useLiveQuery } from "dexie-react-hooks";
import { getCategory } from "@/lib/db/queries";
import { PageHeader } from "@/components/layout/page-header";
import { CategoryOverviewPanel } from "@/components/analytics/category-overview-panel";
import { ScopePeriodBar, useScopePeriod } from "@/components/analytics/scope-period-bar";

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
    <>
      <PageHeader
        title={category?.name ?? "..."}
        description={t("insights.categoryInsights")}
        back={`/analytics?cat=${categoryId}`}
      />
      <ScopePeriodBar period={period} onPick={setPeriod} />
      {category && <CategoryOverviewPanel category={category} period={period} />}
    </>
  );
}
