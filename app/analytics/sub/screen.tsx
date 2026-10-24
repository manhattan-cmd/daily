"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { getCategory, getSubCategory } from "@/lib/db/queries";
import { CategoryOverviewPanel } from "@/components/analytics/category-overview-panel";
import { ScopeAnalysisHeader, ScopeTitle, useScopePeriod } from "@/components/analytics/scope-period-bar";
import { routes } from "@/lib/routes";

/**
 * Alt kategori analiz sayfası — kategori analiziyle aynı panel, bu düğümün
 * alt ağacına (kendisi + tüm torunları) odaklı; üstte dönem seçici.
 */
export function SubcategoryAnalyticsPage({
  params,
}: {
  params: { categoryId: string; subcategoryId: string };
}) {
  return (
    <Suspense fallback={null}>
      <SubcategoryAnalyticsPageContent params={params} />
    </Suspense>
  );
}

function SubcategoryAnalyticsPageContent({
  params,
}: {
  params: { categoryId: string; subcategoryId: string };
}) {
  const { categoryId, subcategoryId } = params;
  const searchParams = useSearchParams();
  const metricParam = searchParams.get("metric") ?? undefined;
  const [period, setPeriod] = useScopePeriod();

  const category = useLiveQuery(() => getCategory(categoryId), [categoryId]);
  const subcategory = useLiveQuery(
    () => getSubCategory(subcategoryId),
    [subcategoryId]
  );

  // Geri: üst alt kategoriye (dönem ve metrik taşınır) ya da kategorinin analizine
  const backPath = subcategory?.parentId
    ? routes.analyticsSub(categoryId, subcategory.parentId, `p=${period.key}&metric=${metricParam ?? "count"}`)
    : `${routes.analyticsCategory(categoryId)}&p=${period.key}`;

  return (
    <>
      <ScopeAnalysisHeader
        category={category}
        subcategory={subcategory}
        period={period}
        onPick={setPeriod}
        back={backPath}
      />

      {category && subcategory && (
        <>
        <CategoryOverviewPanel
          header={<ScopeTitle category={category} subcategory={subcategory} kicker={category.name} />}
          key={subcategory.id}
          category={category}
          subcategory={subcategory}
          period={period}
          initialMetricId={metricParam}
        />
        </>
      )}
    </>
  );
}
