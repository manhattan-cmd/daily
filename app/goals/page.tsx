"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { routes } from "@/lib/routes";

/**
 * Eski adres: planlı girdiler artık Yapı › Girdiler'in Planlı girdiler
 * görünümünde (bkz. PlannedList). Eski bağlantılar ve yer imleri oraya gider.
 */
export default function GoalsPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace(routes.structureEntries("planned"));
  }, [router]);
  return null;
}
