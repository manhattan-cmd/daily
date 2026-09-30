"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { parsePeriodKey, weekPeriod } from "@/lib/period";
import { PeriodView } from "@/components/analytics/period-view";
import { useT } from "@/lib/i18n";

/**
 * Analiz sekmesi — bütün dönemler BU sayfada: /analytics (içinde bulunulan
 * hafta) ve /analytics?key=… (herhangi bir dönem).
 *
 * Dönemler eskiden ayrı bir sayfadaydı (/analytics/period); bu haftadan aya
 * geçmek sayfa değiştirmek demekti ve görünüm baştan kurulup yükleme
 * iskeletine dönüyordu ("açılıp kapanıp yeniden açılıyor"). Tek sayfada
 * görünüm yerinde kalıyor, yalnız verisi değişiyor (bkz. period-data).
 */
export default function AnalyticsPage() {
  return (
    <Suspense fallback={null}>
      <AnalyticsPageContent />
    </Suspense>
  );
}

function AnalyticsPageContent() {
  const t = useT();
  const searchParams = useSearchParams();
  // Alt kategori detayından geri dönüşte seçili kategori korunur (?cat=)
  const initialCatId = searchParams.get("cat");
  const key = searchParams.get("key");
  // Sekme açık kaldığı sürece hafta sabit — lazy init, render başına yeniden hesaplanmaz
  const [week] = useState(() => weekPeriod(Date.now()));
  // Tanınmayan anahtar içinde bulunulan haftaya düşer
  const period = useMemo(() => (key && parsePeriodKey(key)) || week, [key, week]);
  const isDefault = period.key === week.key;

  return (
    <PeriodView
      period={period}
      title={isDefault ? t("insights.title") : undefined}
      back={isDefault ? undefined : "/analytics"}
      initialCatId={initialCatId}
    />
  );
}
