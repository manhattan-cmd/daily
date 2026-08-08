/**
 * Arama karşılaştırması — tek yerde.
 *
 * İki ayrı arama var: /search sayfası (veritabanını tarar) ve girdi
 * listelerinin içindeki süzme (elindeki satırları eler). Aynı sorgunun iki
 * yerde farklı sonuç vermemesi için ikisi de buradaki kuralı kullanır.
 *
 * Kural aksan/şapka duyarsızdır. Sebebi Türkçe: "İ"nin küçüğü İngilizce
 * kurallarıyla "i" + birleşik nokta oluyor, yani "istanbul" yazan kullanıcı
 * "İstanbul"u bulamıyordu. Aynı şekilde kimse aramada "ışık"ı ı ile yazmak
 * zorunda kalmasın — "isik" de bulsun.
 *
 * Küçültme dilden bağımsız ("en-US"): uygulamanın dili değişince aynı
 * sorgunun farklı sonuç vermesi beklenmedik olurdu.
 */
export function normalizeSearch(text: string): string {
  return (
    text
      .toLocaleLowerCase("en-US")
      // Şapkayı harften ayır ve at: "ş" → "s", "ö" → "o", "İ" → "i"
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      // Noktasız ı ayrışmıyor, elle eşliyoruz
      .replace(/ı/g, "i")
  );
}

/**
 * needle ÖNCEDEN normalize edilmiş gelmeli — çağıran sorguyu bir kez
 * normalize edip yüzlerce satırda tekrar tekrar kullanır.
 * Boş sorgu her şeyle eşleşir (süzgeç yok demektir).
 */
export function matchesSearch(haystack: string, needle: string): boolean {
  return needle ? normalizeSearch(haystack).includes(needle) : true;
}
