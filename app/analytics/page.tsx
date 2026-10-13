"use client";

import { Suspense } from "react";
import { LensPage } from "@/components/analytics/lens/lens-page";

/**
 * Analiz sekmesi — tek ekran, bir cümle: ne · nerede · ne zaman
 * (/analytics?p=…&ne=…&yer=…). Dönem, kategori, alt kategori ve özellik
 * analizleri bu ekranın farklı cümleleri (bkz. components/analytics/lens).
 */
export default function AnalyticsPage() {
  return (
    <Suspense fallback={null}>
      <LensPage />
    </Suspense>
  );
}
