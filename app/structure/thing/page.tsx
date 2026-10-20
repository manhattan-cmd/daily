"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ThingScreen } from "./screen";

/** Yapı: tek nesne — /structure/thing?id=… (kimlik sorguda, bkz. lib/routes) */
export default function Page() {
  return (
    <Suspense fallback={null}>
      <Route />
    </Suspense>
  );
}

function Route() {
  const id = useSearchParams().get("id") ?? "";
  return <ThingScreen key={id} thingId={id} />;
}
