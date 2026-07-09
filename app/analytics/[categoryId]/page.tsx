"use client";

import { use } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { getCategory } from "@/lib/db/queries";
import { PageHeader } from "@/components/layout/page-header";
import { CategoryOverviewPanel } from "@/components/analytics/category-overview-panel";

/**
 * Kategori analiz sayfası — zaman perspektifinin (dönem sayfaları) yanındaki
 * kategori perspektifi: tüm zamanlar toplamı, günlük ortalama, istikrar, gelişim.
 */
export default function CategoryAnalyticsPage({
  params,
}: {
  params: Promise<{ categoryId: string }>;
}) {
  const { categoryId } = use(params);
  const category = useLiveQuery(() => getCategory(categoryId), [categoryId]);

  return (
    <>
      <PageHeader
        title={category?.name ?? "..."}
        description="Kategori Analizi"
        back={`/analytics?cat=${categoryId}`}
      />
      {category && <CategoryOverviewPanel category={category} />}
    </>
  );
}
