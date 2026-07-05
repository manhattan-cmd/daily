---
name: verify
description: Bu repo için doğrulama reçetesi — Next.js + Dexie (IndexedDB) habit uygulamasını Playwright ile sürme
---

# Habbit-app doğrulama

## Çalıştırma
- Kullanıcının dev sunucusu genelde **localhost:3000**'de zaten çalışıyor (`next dev`). Önce onu dene; `npx next dev -p <port>` ikinci bir sunucuyu reddeder ("Another next dev server is already running").
- Playwright devDependency olarak kurulu (`node_modules/playwright`). Script'i scratchpad'e yazarken mutlak yolla require et: `require("C:\\Users\\Doğacan\\Desktop\\habbit-app\\node_modules\\playwright")`.
- Viewport 390×844 (uygulama telefon çerçeveli).

## Veri tohumlama
- Tüm veri IndexedDB'de (`RoutineDB`, Dexie). **Her `chromium.launch()` taze profil açar — önceki çalıştırmanın verisi kaybolur.** Her script kendi verisini tohumlamalı.
- Tohum reçetesi: sayfayı bir kez yükle (uygulama DB'yi ve yerleşikleri oluşturur, ~1.5s bekle), sonra `page.evaluate` içinde ham `indexedDB.open("RoutineDB")` + `put` ile kategori/alt kategori ekle, sonra `page.reload()`.

## Sürülecek akışlar
- Gün görünümü: `/calendar/YYYY-MM-DD`. Sağ üstte "Ekle" butonu → yay menü: "Girdi", "Hedef", "Uyku" (aria-label'lar).
- Girdi sheet'i (DayEntrySheet) kapalıyken de DOM'da — seçicilerde `exact: true` kullan, yoksa strict mode çakışması olur. "Kaydet" butonu birden fazla sheet'te var → `.first()`.
- Hedef akışı: Hedef → kategori satırı → alt kategori adımı ("Doğrudan kategoriye ekle" satırı dahil) → mod seç → değer → "Hedef Ekle".
- Hedef tamamlama: hedef kartındaki daire, aria-label "Tamamlandı olarak işaretle".

## Analiz sayfası (/analytics)
- Grafikler Recharts; veri tohumlarken sayısal mod değerleri için havuzdaki "Para" modunu IDB'den bulup (`mods` tablosu, name === "Para") `entryValues`'a `modId` + `entryTypeId` ile yaz.
- Sayfa içi kaydırma app-shell'in içinde — `scrollIntoViewIfNeeded` yetmezse `page.mouse.move(195,500)` + `page.mouse.wheel(0, 4000)` kullan.
- Kategori paneli `key={category.id}` ile remount olur; kategori chip'ine tıkladıktan sonra metrik chip'leri sıfırlanır ("Girdi" seçili).

## PWA (manifest, ikonlar, service worker)
- `next dev`de service worker kayıt olmaz (bilinçli — Turbopack HMR'ıyla çakışmasın diye, bkz. `components/layout/app-shell.tsx`). Test için **production build** şart: `npx next build && npx next start -p 3001` (3000 genelde kullanıcının dev sunucusuyla dolu).
- İkonlar `public/icons/` + Next dosya-konvansiyonu `app/icon.png` / `app/apple-icon.png` — bunları yeniden üretmek gerekirse scratchpad'teki SVG+Playwright-screenshot yöntemini kullan (bkz. session geçmişi: `icon-any.html`/`icon-maskable.html` + viewport boyutunda screenshot, `omitBackground: true` "any" için köşe şeffaflığı sağlar).
- SW kaydı doğrulama: `navigator.serviceWorker.getRegistration()` ilk yüklemede `undefined` dönebilir — `document.readyState === "complete"` ise hemen, değilse `load` event'inde register olur (bu event effect mount'tan ÖNCE geçmiş olabilir, dikkat).
- Offline test: Playwright `context.setOffline(true)` + daha önce ziyaret edilmiş bir sayfayı reload → çalışmalı. Hiç ziyaret edilmemiş bir rotaya offline gidilirse SW cache'deki "/" HTML'ine düşer (Ana Sayfa içeriği görünür, URL değişmez) — bilinen sınırlama, hata değil.

## Dikkat
- Yerleşik "Uyku" kategorisi girdi seçiciden gizlidir (isBuiltIn).
- Kategori kökü girdileri gizli `isCategoryRoot` alt kategorisi üzerinden gider — seçim listelerinde görünmemeli.
