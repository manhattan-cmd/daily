"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { SubcategoryAnalyticsPage } from "./screen";

/**
 * Analiz: alt kategori — /analytics/sub?cat=…&id=…
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
  const categoryId = q.get("cat") ?? "";
  const subcategoryId = q.get("id") ?? "";
  return <SubcategoryAnalyticsPage key={`${categoryId}|${subcategoryId}`} params={{ categoryId, subcategoryId }} />;
}
