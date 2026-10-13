"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { routes } from "@/lib/routes";

/**
 * Eski kategori analizi adresi (/analytics/category?id=…) — artık Analiz'in
 * tek ekranında "her şey · kategori" cümlesi. Kayıtlı bağlantılar çalışsın
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
  const q = useSearchParams();
  const id = q.get("id") ?? "";
  const p = q.get("p") ?? undefined;
  useEffect(() => {
    router.replace(id ? routes.analyticsCategory(id, p) : "/analytics");
  }, [router, id, p]);
  return null;
}
