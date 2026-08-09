/**
 * Sunucu tarafı içerik yok — sayfa tamamen cihazdaki IndexedDB'den çiziliyor,
 * yani sunucunun ürettiği HTML her parametre için aynı boş kabuk. Dinamik
 * segment yüzünden Next bunu "istek anında sunucuda çiz" sayıyor ve her
 * gezinme bir sunucu gidiş-dönüşü oluyordu.
 *
 * force-static: kabuk ilk istekte üretilip önbelleğe alınır, sonrası CDN'den.
 * Statik rotalar tam önden çekilebildiği için bağlantılar da hazır bekler.
 */
export const dynamic = "force-static";
export const dynamicParams = true;

export function generateStaticParams() {
  return [];
}

export default function ShellLayout({ children }: { children: React.ReactNode }) {
  return children;
}
