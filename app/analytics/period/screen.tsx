"use client";

import { useMemo } from "react";
import { useT } from "@/lib/i18n";
import { CalendarX } from "lucide-react";
import { parsePeriodKey } from "@/lib/period";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { PeriodView } from "@/components/analytics/period-view";

/** Dönem analiz sayfası — URL'deki dönem anahtarını çözüp ortak görünümü render eder */
export function PeriodAnalyticsPage({
  params,
}: {
  params: { periodKey: string };
}) {
  const t = useT();
  const { periodKey } = params;
  const period = useMemo(
    () => parsePeriodKey(periodKey),
    [periodKey]
  );

  if (!period) {
    return (
      <>
        <PageHeader title="Period" back="/analytics" />
        <EmptyState
          icon={CalendarX}
          title={t("insights.invalidPeriod")}
          description="This address wasn't recognised — try again from the insights page."
        />
      </>
    );
  }

  return <PeriodView period={period} back="/analytics" />;
}
