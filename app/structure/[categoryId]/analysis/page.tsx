"use client";

import { use } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { getCategory } from "@/lib/db/queries";
import { PageHeader } from "@/components/layout/page-header";
import { AnalysisSettings } from "@/components/structure/analysis-settings";

export default function CategoryAnalysisSettingsPage({
  params,
}: {
  params: Promise<{ categoryId: string }>;
}) {
  const { categoryId } = use(params);
  const category = useLiveQuery(() => getCategory(categoryId), [categoryId]);

  return (
    <>
      <PageHeader
        title="Analiz Ayarları"
        description={category?.name}
        back={`/structure/${categoryId}`}
      />
      {category && (
        <AnalysisSettings
          targetType="category"
          targetId={categoryId}
          category={category}
        />
      )}
    </>
  );
}
