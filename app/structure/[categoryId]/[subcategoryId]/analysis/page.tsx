"use client";

import { use } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { getCategory, getSubCategory } from "@/lib/db/queries";
import { PageHeader } from "@/components/layout/page-header";
import { AnalysisSettings } from "@/components/structure/analysis-settings";

export default function SubcategoryAnalysisSettingsPage({
  params,
}: {
  params: Promise<{ categoryId: string; subcategoryId: string }>;
}) {
  const { categoryId, subcategoryId } = use(params);
  const category = useLiveQuery(() => getCategory(categoryId), [categoryId]);
  const subcategory = useLiveQuery(
    () => getSubCategory(subcategoryId),
    [subcategoryId]
  );

  return (
    <>
      <PageHeader
        title="Analiz Ayarları"
        description={
          subcategory && category
            ? `${category.name} · ${subcategory.name}`
            : undefined
        }
        back={`/structure/${categoryId}/${subcategoryId}`}
      />
      {category && subcategory && (
        <AnalysisSettings
          targetType="subcategory"
          targetId={subcategoryId}
          category={category}
        />
      )}
    </>
  );
}
