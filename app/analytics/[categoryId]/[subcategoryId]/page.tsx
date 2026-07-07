"use client";

import { Suspense, use, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { getCategory, getSubCategory } from "@/lib/db/queries";
import { PageHeader } from "@/components/layout/page-header";
import { SubcategoryPanel } from "@/components/analytics/subcategory-panel";
import { rangeStartMs, type RangeKey } from "@/lib/analytics";

const VALID_RANGES: RangeKey[] = ["7", "30", "ay"];

export default function SubcategoryAnalyticsPage({
  params,
}: {
  params: Promise<{ categoryId: string; subcategoryId: string }>;
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
  params: Promise<{ categoryId: string; subcategoryId: string }>;
}) {
  const { categoryId, subcategoryId } = use(params);
  const searchParams = useSearchParams();

  const rangeParam = searchParams.get("range");
  const range: RangeKey = (VALID_RANGES as string[]).includes(rangeParam ?? "")
    ? (rangeParam as RangeKey)
    : "7";
  const metricParam = searchParams.get("metric") ?? undefined;

  // Aralık başlangıcı — dakikalık oynamalar yeniden sorgu tetiklemesin diye memo
  const rangeStart = useMemo(() => rangeStartMs(range, new Date()), [range]);

  const category = useLiveQuery(() => getCategory(categoryId), [categoryId]);
  const subcategory = useLiveQuery(
    () => getSubCategory(subcategoryId),
    [subcategoryId]
  );

  const backPath = subcategory?.parentId
    ? `/analytics/${categoryId}/${subcategory.parentId}?range=${range}&metric=${metricParam ?? "count"}`
    : `/analytics?cat=${categoryId}&range=${range}`;

  return (
    <>
      <PageHeader
        title={subcategory?.name ?? "..."}
        description={category?.name}
        back={backPath}
      />

      {category && subcategory && (
        <SubcategoryPanel
          key={subcategory.id}
          category={category}
          subcategory={subcategory}
          range={range}
          rangeStart={rangeStart}
          initialMetricId={metricParam}
        />
      )}
    </>
  );
}
