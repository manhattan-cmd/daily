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
        <PageHeader title="Dönem" back="/analytics" />
        <EmptyState
          icon={CalendarX}
          title="Geçersiz dönem"
          description="Bu adres tanınmadı — analiz sayfasından tekrar dene."
        />
      </>
    );
  }

  return <PeriodView period={period} back="/analytics" />;
}
