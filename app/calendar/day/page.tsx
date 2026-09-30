"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { CalendarDayPage } from "./screen";

/**
 * Gün sayfası — /calendar/day?d=YYYY-MM-DD
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
  const date = q.get("d") ?? "";
  return <CalendarDayPage key={`${date}`} params={{ date }} />;
}
