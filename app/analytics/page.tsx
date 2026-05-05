"use client";

import { BarChart3 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export default function AnalyticsPage() {
  return (
    <>
      <PageHeader title="Analiz" description="Faz 2'de gelecek" />
      <EmptyState
        icon={BarChart3}
        title="Analizler yakında"
        description="Faz 2'de category bazlı grafikler, ortalamalar ve trendler. Faz 3'te global money/time analizleri eklenecek."
      />
    </>
  );
}
