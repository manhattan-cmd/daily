"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ThingAnalyticsPage } from "./screen";

/** Analiz: nesne — /analytics/thing?id=… (kimlik sorguda, bkz. lib/routes) */
export default function Page() {
  return (
    <Suspense fallback={null}>
      <Route />
    </Suspense>
  );
}

function Route() {
  const id = useSearchParams().get("id") ?? "";
  return <ThingAnalyticsPage key={id} thingId={id} />;
}
