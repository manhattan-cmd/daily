"use client";

import { use, useMemo } from "react";
import { CalendarX } from "lucide-react";
import { parsePeriodKey } from "@/lib/period";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { PeriodView } from "@/components/analytics/period-view";

/** Dönem analiz sayfası — URL'deki dönem anahtarını çözüp ortak görünümü render eder */
export default function PeriodAnalyticsPage({
  params,
}: {
  params: Promise<{ periodKey: string }>;
}) {
  const { periodKey } = use(params);
  const period = useMemo(
    () => parsePeriodKey(decodeURIComponent(periodKey)),
    [periodKey]
  );

  if (!period) {
    return (
      <>
        <PageHeader title="Period" back="/analytics" />
        <EmptyState
          icon={CalendarX}
          title="Invalid period"
          description="This address wasn't recognised — try again from the insights page."
        />
      </>
    );
  }

  return <PeriodView period={period} back="/analytics" />;
}
