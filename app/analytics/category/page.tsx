"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { routes } from "@/lib/routes";

/**
 * Eski adres: kategori analizi — /analytics/category?id=…
 *
 * Bu sayfanın kendi analizi vardı (özet, istikrar, gelişim…); Analiz sekmesi
 * yeri kendi içinde açınca işlevi kalmadı — bölümleri de oranın panosuna
 * taşındı (bkz. AnalysisSections). Eski bağlantılar ve yer imleri için
 * adres duruyor: Analiz sekmesine, bu yer seçili olarak yönlendirir; dönem
 * (?p=) varsa o dönemle, yoksa Tümü (sayfanın kendi varsayılanı gibi).
 */
export default function Page() {
  return (
    <Suspense fallback={null}>
      <Redirect />
    </Suspense>
  );
}

function Redirect() {
  const q = useSearchParams();
  const router = useRouter();
  const target = routes.analyticsCategory(q.get("id") ?? "", q.get("p") || undefined);
  useEffect(() => {
    router.replace(target);
  }, [router, target]);
  return null;
}
