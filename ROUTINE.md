# Routine — vizyon notları

> Bu dosya ürünün **niyetini** tutar. Teknik durum ve veri modeli için
> `README.md`'ye bak. (Eski hâli Supabase + Next 14 anlatıyordu; gerçek yapı
> baştan beri tamamen istemci tarafı — Dexie/IndexedDB.)

## Vaat

Kullanıcı neyi takip edeceğine kendi karar verir. Önceden tanımlı bir "alışkanlık"
listesi yok: kategori → alt kategori → özellik zincirini kendi kurar, uygulamadaki
her sayı ve grafik bu yapıdan türer.

**Veri kullanıcının cihazında kalır.** Hesap yok, sunucu yok. Bu bir kısıt değil,
ürünün kimliği: harcama, uyku ve günce aynı yerde duruyor.

## Hayat haritası

Ölçülebilir girdilerin yanında serbest yazım katmanı var (günce/notlar).
Kullanıcı yazarken kendi bağlarını kuruyor: bir kelime bir girdiye, bir öbek
başka bir nota bağlanıyor. Zamanla ortaya kişinin kendi eliyle ördüğü bir
harita çıkıyor.

Yapay zekâ bu haritada **bağ uydurmaz** — var olan grafiği anlatır. Bir önceki
deneme (AI'ın kendi bağlarını önermesi) bilinçli olarak geri alındı.

## Ürün öncesi geliştirilecek alanlar

- **Notlar ve Yaşam Haritası** — bağ kurma ve gezinme deneyimi olgunlaşacak.
- **Özellikler ve Ölçüler** — atom/ölçü ayrımı, paylaşım ve düzenleme akışları.

## Ürünleşme sırası

1. Veri güveni (tam yedek, updatedAt, silme günlüğü, kalıcı depolama) ✔
2. Yeni kullanıcı yolu (zengin örnek yapı, karşılama, boş durumlar, Ayarlar) ✔
3. Gündelik kullanım + tam İngilizce arayüz
4. Sağlamlaştırma (lint, testler, gerçek cihaz turu)

Senkron ancak talep geldiğinde ve tercihen uçtan uca şifreli eklenecek.
Bildirim/hatırlatıcı, ürünleşme sonrası ilk aday.
