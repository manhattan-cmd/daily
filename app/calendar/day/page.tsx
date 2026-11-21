"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { toLocalDateValue } from "@/lib/utils";
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
  // Tarih yoksa ya da bozuksa bugün: çıplak /calendar/day eskiden haftanın
  // günlerini "NaN-NaN-NaN" anahtarıyla çizip hata veriyordu
  const raw = q.get("d");
  const date = raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : toLocalDateValue();
  // Bildirimden gelindiyse: hangi planlı girdi; fill=1 tamamlama formu açılsın
  const goal = q.get("goal") ?? undefined;
  const slot = q.get("slot") ?? undefined;
  const fill = q.get("fill") === "1";
  return <CalendarDayPage key={`${date}`} params={{ date, goal, slot, fill }} />;
}
