/**
 * Uygulamanın değişken adresleri — tek yerden.
 *
 * Kimlikler adresin YOLUNDA değil sorgusunda (`/notes?id=…`, `/notes/…`
 * değil). Sebep mobil uygulama: Next.js'in statik çıktısı (output: "export")
 * önceden bilinmeyen yol parçalarını kabul etmiyor, oysa not/gün/kategori
 * kimlikleri cihazdaki veritabanından geliyor ve derleme anında bilinemez.
 * Sorgu parametresiyle her rota tek bir statik sayfa oluyor; web sürümü de
 * aynı adreslerle çalışıyor.
 *
 * Yeni bir bağlantı yazarken adresi elle kurma, buradan al — biçim değişirse
 * tek yerden değişsin.
 */

const q = (params: Record<string, string>, extra?: string) => {
  const s = new URLSearchParams(params).toString();
  return extra ? `${s}&${extra}` : s;
};

export const routes = {
  /** Not editörü */
  note: (id: string) => `/notes?${q({ id })}`,
  /** Gün sayfası — tarih YYYY-MM-DD */
  day: (date: string) => `/calendar/day?${q({ d: date })}`,
  /** Yapı: kategori ayrıntısı */
  structureCategory: (categoryId: string) =>
    `/structure/category?${q({ id: categoryId })}`,
  /** Yapı: alt kategori (kalem) ayrıntısı */
  structureSub: (categoryId: string, subcategoryId: string) =>
    `/structure/sub?${q({ cat: categoryId, id: subcategoryId })}`,
  /** Analiz: kategorinin tüm zamanlar görünümü */
  analyticsCategory: (categoryId: string) =>
    `/analytics/category?${q({ id: categoryId })}`,
  /** Analiz: alt kategori — `extra` ek sorgu ("range=tum&metric=count" gibi) */
  analyticsSub: (categoryId: string, subcategoryId: string, extra?: string) =>
    `/analytics/sub?${q({ cat: categoryId, id: subcategoryId }, extra)}`,
  /** Analiz: bir aktivitenin geçmişi */
  activity: (name: string) => `/analytics/activity?${q({ name })}`,
  /** Analiz: dönem görünümü — anahtar lib/period biçiminde ("m-2026-09") */
  period: (key: string) => `/analytics/period?${q({ key })}`,
};
