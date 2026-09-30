"use client";


import { useT } from "@/lib/i18n";
import { useLiveQuery } from "dexie-react-hooks";
import { getCategory } from "@/lib/db/queries";
import { PageHeader } from "@/components/layout/page-header";
import { CategoryOverviewPanel } from "@/components/analytics/category-overview-panel";

/**
 * Kategori analiz sayfası — zaman perspektifinin (dönem sayfaları) yanındaki
 * kategori perspektifi: tüm zamanlar toplamı, günlük ortalama, istikrar, gelişim.
 */
export function CategoryAnalyticsPage({
  params,
}: {
  params: { categoryId: string };
}) {
  const t = useT();
  const { categoryId } = params;
  const category = useLiveQuery(() => getCategory(categoryId), [categoryId]);

  return (
    <>
      <PageHeader
        title={category?.name ?? "..."}
        description={t("insights.categoryInsights")}
        back={`/analytics?cat=${categoryId}`}
      />
      {category && <CategoryOverviewPanel category={category} />}
    </>
  );
}
