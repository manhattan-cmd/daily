# Routine — Personal Data Engine for Life Analytics

## Proje Özeti

Routine, kullanıcıların kendi veri yapısını tanımladığı ve bu verilerden otomatik içgörüler ürettiği modüler bir yaşam takip ve analitik sistemidir. Önceden tanımlı kategori yoktur — her şey kullanıcı tarafından şekillendirilir.

---

## Tech Stack

| Katman | Teknoloji |
|---|---|
| Framework | Next.js 14 (App Router) |
| Dil | TypeScript |
| Stil | Tailwind CSS |
| UI Bileşenleri | shadcn/ui |
| Veritabanı | Supabase (PostgreSQL) |
| Auth | Supabase Auth |
| Grafikler | Recharts |
| Form Yönetimi | React Hook Form + Zod |
| State | Zustand |

---

## Veri Modeli

```
Category
  id, name, icon, color, user_id, created_at

SubCategory
  id, category_id, name, icon, user_id, created_at

Field
  id, subcategory_id, name, type, options (JSONB), required
  global_dimension_id (nullable)
  global_dimension_config (JSONB, nullable)
    → { classification: "expense" | "income" | "investment", label: "Alcohol / Beer" }

GlobalDimension
  id, name, type ("money" | "time"), user_id

Entry
  id, subcategory_id, user_id, created_at, notes

EntryValue
  id, entry_id, field_id, value (TEXT — serialize edilmiş)
```

### Field Tipleri

| Tip | Açıklama | Örnek |
|---|---|---|
| number | Sayısal değer | 100, 3.5 |
| text | Metin | "İyi hissettim" |
| rating | 1–10 arası puan | 7 |
| time | Saat/dakika | 22:30 |
| duration | Süre (dakika) | 480 |
| money | Para birimi + miktar | 150 TL |
| select | Önceden tanımlı seçenekler | "hafif / orta / ağır" |
| boolean | Evet / Hayır | true |

### Örnek Veri Akışı

```
Category:    Alcohol
SubCategory: Beer
Fields:
  - amount (number, "cl cinsinden")
  - price  (money, GlobalDimension: Money, classification: expense, label: "Alcohol / Beer")

Entry: { subcategory: Beer, created_at: 2026-05-05, notes: "" }
EntryValues:
  - { field: amount, value: "500" }
  - { field: price,  value: "150" }
```

Bu entry, Money analitik ekranında `Alcohol / Beer: 150 TL` olarak görünür.  
Ayrı bir "Money" kategorisi yaratılmaz — tek kaynak, tek entry.

---

## Global Dimensions

Farklı kategorilerdeki field'ları kesen analitik katmanlar.

**Money Dimension:**
- Tüm `money` tipli ve Money dimension'a bağlı field değerlerini toplar
- expense / income / investment olarak sınıflandırır
- Label ile kaynak gösterir (örn. "Alcohol / Beer", "Transport / Taxi")

**Time Dimension:**
- Tüm `duration` / `time` tipli ve Time dimension'a bağlı field değerlerini toplar
- Günlük, haftalık toplam süre hesaplar

---

## Fazlar

### Faz 1 — Çekirdek + Tasarım Sistemi ✦ (Şimdi)

**Hedef:** Kullanıcı veri yapısını tanımlayabilsin ve entry girebilsin.

- [ ] Proje kurulumu (Next.js + Tailwind + shadcn)
- [ ] Supabase şeması ve tablolar
- [ ] Tasarım sistemi (renkler, tipografi, spacing, dark theme)
- [ ] Layout: bottom navigation (mobil), sidebar (desktop)
- [ ] Structure ekranı: Category / SubCategory / Field CRUD
- [ ] Field tip konfigürasyonu (type seçimi, options, global dimension bağlama)
- [ ] Entry ekranı: dinamik form motoru
- [ ] Entry listesi (basit)
- [ ] Dashboard: son 5 entry, özet kartlar

### Faz 2 — Category Analytics

- [ ] Category bazlı analitik ekran
- [ ] Field bazlı ortalama, trend, dağılım grafikleri
- [ ] Zaman filtresi (bugün / bu hafta / bu ay / özel)
- [ ] Entry detay & düzenleme

### Faz 3 — Global Dimensions

- [ ] Money dimension ekranı (toplam, breakdown, zaman serisi)
- [ ] Time dimension ekranı
- [ ] Field → Global Dimension bağlama UI'ı
- [ ] Özel Global Dimension oluşturma

### Faz 4 — Correlation & Advanced Analytics

- [ ] Cross-category korelasyon analizi
- [ ] Örnek: Alcohol amount vs Sleep quality rating
- [ ] Korelasyon skoru + görsel
- [ ] AI içgörü önerileri (opsiyonel)

### Faz 5 — Polish & Extras

- [ ] Etiket sistemi
- [ ] Veri export (CSV / JSON)
- [ ] Bildirimler / hatırlatıcılar
- [ ] Custom dashboard

---

## UX Prensipleri

- **Dark theme default** — göz yormuyor, modern hissettiriyor
- **Mobile-first** — tüm tasarım önce 390px için yapılır
- **Hızlı entry** — en fazla 3 dokunuşta form açılmalı
- **Empty states** — veri yoksa ne yapılacağını yönlendir
- **Renk kodlaması** — her Category'nin kendi rengi var (kullanıcı seçer)

---

## Klasör Yapısı (Planlanan)

```
routine/
├── app/
│   ├── (auth)/
│   ├── dashboard/
│   ├── entry/
│   ├── analytics/
│   ├── structure/
│   └── settings/
├── components/
│   ├── ui/          ← shadcn bileşenleri
│   ├── forms/       ← dinamik form motoru
│   ├── charts/      ← grafik bileşenleri
│   └── layout/      ← navigation, shell
├── lib/
│   ├── supabase/    ← client + server
│   ├── db/          ← query fonksiyonları
│   └── utils/
├── types/
│   └── index.ts     ← tüm TypeScript tipleri
└── hooks/
```

---

## Notlar

- Entry'ler asla kopyalanmaz. Tek kaynak, tek entry prensibi her zaman korunur.
- Global Dimension'lar analitik katmandır, veri katmanı değil.
- Korelasyon analizi Pearson correlation coefficient kullanır.
- Supabase RLS (Row Level Security) ile her kullanıcı sadece kendi verisini görür.
