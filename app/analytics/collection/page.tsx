"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { CollectionAnalyticsPage } from "./screen";

/** Analiz: nesne listesi — /analytics/collection?id=… (kimlik sorguda, bkz. lib/routes) */
export default function Page() {
  return (
    <Suspense fallback={null}>
      <Route />
    </Suspense>
  );
}

function Route() {
  const id = useSearchParams().get("id") ?? "";
  return <CollectionAnalyticsPage key={id} collectionId={id} />;
}
