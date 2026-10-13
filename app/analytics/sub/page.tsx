"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { routes } from "@/lib/routes";

/**
 * Eski alt kategori analizi adresi (/analytics/sub?cat=…&id=…) — artık
 * Analiz'in tek ekranında bir cümle (özellik seçiliyse "özellik · alt
 * kategori"). Kayıtlı bağlantılar çalışsın diye yönlendirir.
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
  const cat = q.get("cat") ?? "";
  const id = q.get("id") ?? "";
  const metric = q.get("metric");
  const p = q.get("p") ?? undefined;
  useEffect(() => {
    router.replace(id ? routes.analyticsSub(cat, id, { ne: metric && metric !== "count" ? metric : undefined, p }) : "/analytics");
  }, [router, cat, id, metric, p]);
  return null;
}
