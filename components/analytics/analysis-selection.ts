import type { SubCategory } from "@/types";

/**
 * Analizde bakılan yer — dönem değişse de korunur.
 *
 * Dönem çipleri ve önceki/sonraki okları başka bir sayfaya gidiyor
 * (/analytics ↔ /analytics/period/…); sayfa değişince bileşen durumu da
 * gidiyordu. "İş › Süre"ye bakarken haftadan aya geçen kişi aynı soruyu başka
 * bir pencerede sormak istiyor, baştan seçmek değil.
 *
 * Modül düzeyinde tutuluyor: sekme açıkken yaşar, yenilemede sıfırlanır.
 * Yeni dönemde geçerli mi (o dönemde verisi var mı) kararını okuyan verir —
 * burası yalnız son seçimi hatırlar.
 */
export interface AnalysisSelection {
  catId: string | null;
  /** Kırılımda inilen yol — catId'ye ait */
  path: SubCategory[];
  /** Seçili özellik ("count" = girdi sayısı) — catId'ye ait */
  metricId: string | null;
}

let current: AnalysisSelection = { catId: null, path: [], metricId: null };

export function getAnalysisSelection(): AnalysisSelection {
  return current;
}

/** Kategori değişince yol ve özellik o kategoriye ait olmadığından sıfırlanır */
export function selectAnalysisCategory(catId: string) {
  if (current.catId === catId) return;
  current = { catId, path: [], metricId: null };
}

export function setAnalysisPath(catId: string, path: SubCategory[]) {
  current = { ...current, catId, path };
}

export function setAnalysisMetric(catId: string, metricId: string) {
  current = { ...current, catId, metricId };
}
