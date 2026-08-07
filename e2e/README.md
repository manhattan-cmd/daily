# Duman testleri

Gerçek tarayıcıda, gerçek IndexedDB üzerinde çalışan uçtan uca senaryolar.
Buradaki her kontrol, elle doğrulama sırasında **gerçek bir hata yakaladığı
için** kalıcı hale getirildi:

| Senaryo | Neyi koruyor |
|---|---|
| `backup` | Notlar v12'de eklenmiş ama yedeğe hiç girmemişti. Birleştirmede "yeni olan kazanır" ve "fazladan kayıt silinmez" kuralları, bozuk dosyada açıklayıcı hata, dosya adında yerel tarih. |
| `undo` | Toplu silme + geri alma: kayıtların değerleriyle birlikte dönmesi ve silme günlüğünün temizlenmesi. |
| `move` | Başka güne taşıma: kaydın günü değişir, hedef güne yönlendirilir. Gün öğesi türü kaydı (`lib/db/day-items.ts`) refactor edilirken bu yol sessizce bozulabilirdi. |
| `search` | Aramanın hem girdi metnini hem kalem adını görmesi; tarih aralığı süzgeci. |
| `language` | Dil değişiminin anında uygulanması, tarih biçiminin de dile uyması, seçimin yeniden yüklemede korunması, `<html lang>`. |

## Çalıştırma

```bash
npm run dev      # ayrı bir terminalde
npm run e2e      # hepsi
npm run e2e -- backup    # tek senaryo
```

Ortam değişkenleri:

- `E2E_BASE` — varsayılan `http://localhost:3000`
- `E2E_HEADED=1` — tarayıcıyı görünür aç (hata ayıklarken)

## Kurallar

- **Her senaryo taze bir tarayıcı profili açar.** Playwright'in her
  `newPage()`'i boş bir IndexedDB ile gelir; senaryolar birbirinin verisini
  görmez, sıraları önemsizdir.
- Tohumlama ham IndexedDB üzerinden yapılır, ardından **sayfa yenilenir** —
  Dexie'nin canlı sorguları dışarıdan yazılan kayıtları kendiliğinden görmez.
- Kayıt id'leri kalem adını içerir; iki tohumlama birbirinin üstüne yazmasın.
- Sayfa hataları ve **native `confirm()` kutuları** her senaryoda yakalanır;
  biri çıkarsa senaryo başarısız olur.

## Kapsam dışı

Şema göçü (v15 → v16) burada yok: eski kodun çalıştırılmasını gerektiriyor
(git stash + iki aşamalı çalıştırma). Migrasyon değiştiğinde elle
doğrulanmalı — yöntem `lib/db/index.ts` sürüm notlarında anlatılıyor.
