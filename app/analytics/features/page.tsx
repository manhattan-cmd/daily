"use client";

import { Suspense } from "react";
import { FeatureLab } from "@/components/analytics/feature-lab";

/** DENEME — Analiz: Özellikler kapısı (/analytics/features?p=…&mod=…) */
export default function Page() {
  return (
    <Suspense fallback={null}>
      <FeatureLab />
    </Suspense>
  );
}
