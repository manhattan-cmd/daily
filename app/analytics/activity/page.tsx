"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ActivityAnalyticsPage } from "./screen";

/**
 * Analiz: aktivite — /analytics/activity?name=…
 *
 * Kimlik yolda değil sorguda: statik çıktı (mobil uygulama) önceden
 * bilinmeyen yol parçalarını kabul etmiyor (bkz. lib/routes). Ekran
 * kimliğe göre anahtarlanıyor — başka bir kayda geçince eskiden olduğu gibi
 * baştan kuruluyor, önceki kaydın açık penceresi ya da seçimi taşınmıyor.
 */
export default function Page() {
  return (
    <Suspense fallback={null}>
      <Route />
    </Suspense>
  );
}

function Route() {
  const q = useSearchParams();
  const name = q.get("name") ?? "";
  return <ActivityAnalyticsPage key={`${name}`} params={{ name }} />;
}
