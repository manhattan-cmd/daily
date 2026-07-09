"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { weekPeriod } from "@/lib/period";
import { PeriodView } from "@/components/analytics/period-view";

/**
 * Analiz sekmesinin kökü — default görünüm içinde bulunulan haftanın dönem
 * analizidir ("hafta tamamlanmadıysa şu ana kadar ne durumdayız" vizyonu).
 * Diğer pencerelere üstteki hızlı çipler ve seri drill-down'ı ile gidilir.
 */
export default function AnalyticsPage() {
  return (
    <Suspense fallback={null}>
      <AnalyticsPageContent />
    </Suspense>
  );
}

function AnalyticsPageContent() {
  const searchParams = useSearchParams();
  // Alt kategori detayından geri dönüşte seçili kategori korunur (?cat=)
  const initialCatId = searchParams.get("cat");
  // Sekme açık kaldığı sürece hafta sabit — lazy init, render başına yeniden hesaplanmaz
  const [period] = useState(() => weekPeriod(Date.now()));

  return (
    <PeriodView period={period} title="Analiz" initialCatId={initialCatId} />
  );
}
