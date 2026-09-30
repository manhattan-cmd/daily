"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { routes } from "@/lib/routes";

/**
 * Eski dönem adresi (/analytics/period?key=…) — artık dönemler Analiz'in
 * kendi sayfasında (/analytics?key=…). Kayıtlı eski bağlantılar çalışsın
 * diye yönlendirir; geri tuşu buraya düşmesin diye replace.
 */
export default function Page() {
  return (
    <Suspense fallback={null}>
      <Redirect />
    </Suspense>
  );
}

function Redirect() {
  const router = useRouter();
  const key = useSearchParams().get("key") ?? "";
  useEffect(() => {
    router.replace(key ? routes.period(key) : "/analytics");
  }, [router, key]);
  return null;
}
