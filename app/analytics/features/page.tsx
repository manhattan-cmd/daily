"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * Deneme dönemindeki Özellikler sayfası (/analytics/features?mod=…&thing=…)
 * — artık Analiz'in tek ekranı. Bağlantılar çalışsın diye yönlendirir.
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
  useEffect(() => {
    const u = new URLSearchParams();
    const p = q.get("p");
    const mod = q.get("mod");
    const thing = q.get("thing");
    if (p) u.set("p", p);
    if (mod) u.set("ne", mod);
    if (thing) u.set("yer", `t:${thing}`);
    router.replace(`/analytics${u.size ? `?${u.toString()}` : ""}`);
  }, [router, q]);
  return null;
}
