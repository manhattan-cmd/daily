"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { CategoryDetailPage } from "./screen";

/**
 * Yapı: kategori — /structure/category?id=…
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
  const categoryId = q.get("id") ?? "";
  return <CategoryDetailPage key={`${categoryId}`} params={{ categoryId }} />;
}
