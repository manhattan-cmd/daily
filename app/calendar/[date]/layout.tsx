/**
 * Gün sayfasının sunucu tarafı: yok.
 *
 * Sayfanın tüm içeriği cihazdaki IndexedDB'den geliyor, yani sunucunun
 * ürettiği HTML her tarih için AYNI boş kabuk. Buna rağmen [date] dinamik bir
 * segment olduğu için Next rotayı "istek anında sunucuda çiz" diye
 * işaretliyordu: alt menüden Bugün'e her dokunuşta bir sunucu gidiş-dönüşü.
 * Ölçümde gezinmenin geri kalanı 50–80 ms iken bu adım tek başına gecikmenin
 * kaynağıydı.
 *
 * force-static + boş generateStaticParams: bilinmeyen tarihler ilk istekte
 * üretilip önbelleğe alınır, sonraki gidişler CDN'den gelir. Kabuk tarihe
 * bağlı olmadığı için önbellek her zaman doğru. Ayrıca statik rotalar tam
 * önden çekilebildiği için alt menüdeki Bugün bağlantısı da hazır bekler.
 */
export const dynamic = "force-static";
export const dynamicParams = true;

export function generateStaticParams() {
  return [];
}

export default function DayLayout({ children }: { children: React.ReactNode }) {
  return children;
}
