"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { CollectionScreen } from "./screen";

/** Yapı: nesne listesi — /structure/collection?id=… (kimlik sorguda, bkz. lib/routes) */
export default function Page() {
  return (
    <Suspense fallback={null}>
      <Route />
    </Suspense>
  );
}

function Route() {
  const id = useSearchParams().get("id") ?? "";
  return <CollectionScreen key={id} collectionId={id} />;
}
