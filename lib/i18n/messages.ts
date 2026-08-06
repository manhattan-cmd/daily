/**
 * Çeviri sözlükleri. İngilizce ana sözlük — anahtar kümesini o belirler,
 * diğer diller ondan türetilir (eksik anahtar derleme hatası verir).
 *
 * Anahtar düzeni: <alan>.<parça>. Metinler kısa tutulur; uzun paragraflar da
 * buraya girer ki çeviri tek yerde toplansın.
 */

export const en = {
  // ── Genel eylemler ───────────────────────────────────────────────────
  "action.save": "Save",
  "action.cancel": "Cancel",
  "action.delete": "Delete",
  "action.create": "Create",
  "action.add": "Add",
  "action.remove": "Remove",
  "action.edit": "Edit",
  "action.done": "Done",
  "action.skip": "Skip",
  "action.back": "Back",
  "action.continue": "Continue",
  "action.close": "Close",
  "action.select": "Select",
  "action.search": "Search",
  "action.undo": "Undo",
  "action.gotIt": "Got it",
  "action.saveAndContinue": "Save and continue",

  // ── Navigasyon ───────────────────────────────────────────────────────
  "nav.home": "Home",
  "nav.calendar": "Calendar",
  "nav.today": "Today",
  "nav.insights": "Insights",
  "nav.structure": "Structure",
  "nav.todayPage": "Today's page",
  "nav.settings": "Settings",

  // ── Ana sayfa ────────────────────────────────────────────────────────
  "home.greeting.night": "Good night",
  "home.greeting.morning": "Good morning",
  "home.greeting.afternoon": "Good afternoon",
  "home.greeting.evening": "Good evening",
  "home.today": "Today",
  "home.entries": "entries",
  "home.goal": "Goal",
  "home.addEntry": "Add entry",
  "home.last7Days": "Last 7 Days",
  "home.recentEntries": "Recent entries",
  "home.empty.title": "No entries yet",
  "home.empty.ready": "Ready to make your first entry?",
  "home.empty.buildFirst": "Build your structure first, then start logging.",
  "home.empty.buildAction": "Build structure",

  // ── Karşılama ────────────────────────────────────────────────────────
  "welcome.title": "Welcome",
  "welcome.lead": "You decide what to track. The structure has three links:",
  "welcome.category": "Category",
  "welcome.categoryExample": "Expenses, Fitness, Health",
  "welcome.categoryHint": "the main headings of your life",
  "welcome.subcategory": "Subcategory",
  "welcome.subcategoryExample": "Bills › Electricity",
  "welcome.subcategoryHint": "nests as deep as you want",
  "welcome.feature": "Feature",
  "welcome.featureExample": "Money, Duration, Weight",
  "welcome.featureHint": "what gets measured here",
  "welcome.sample":
    "A sample structure is ready — explore it, delete what you don't need, make it yours.",
  "welcome.explore": "Explore the sample structure",
  "welcome.dismiss": "Dismiss welcome",

  // ── Yapı ─────────────────────────────────────────────────────────────
  "structure.title": "Structure",
  "structure.categories": "Categories",
  "structure.features": "Features",
  "structure.measures": "Measures",
  "structure.notes": "Notes",
  "structure.map": "Map",
  "structure.categoriesLead": "Categories — the main headings of your routine",
  "structure.empty.title": "No categories yet",
  "structure.empty.body": "Tap +, pick from the list or write your own.",
  "structure.sampleHint":
    "These categories are samples — open them, see their subcategories and features. Delete what you don't need, rename the rest.",
  "structure.sampleHintDismiss": "Dismiss note",

  // ── Gün sayfası ──────────────────────────────────────────────────────
  "day.empty.title": "Nothing logged today",
  "day.empty.body": "No entries yet — tap Add in the top right to start.",
  "day.insights": "Day insights",
  "day.holdToSelect": "hold to select multiple",
  "day.entries": "ENTRIES",
  "day.notes": "Notes",
  "day.goals": "Goals",

  // ── Toplu seçim ──────────────────────────────────────────────────────
  "selection.count": "{n} selected",
  "selection.clear": "Clear selection",
  "selection.selectAll": "Select all",
  "selection.move": "Move to another day",
  "selection.moveTitle": "Move to which day?",
  "selection.moveHint": "{n} items · times are kept",
  "selection.moving": "Moving...",
  "selection.deleteTitle": "Delete {n} items?",
  "selection.deleteBody": "They are deleted with their contents.",
  "selection.deleting": "Deleting...",
  "selection.previousDay": "Previous day",
  "selection.nextDay": "Next day",

  // ── Geri alma ────────────────────────────────────────────────────────
  "undo.deleted": "{what} deleted",
  "undo.running": "Undoing…",
  "undo.entry": "entry",
  "undo.entries": "entries",
  "undo.note": "note",
  "undo.notes": "notes",
  "undo.goal": "goal",
  "undo.goals": "goals",
  "undo.category": "category",
  "undo.categories": "categories",
  "undo.subcategory": "subcategory",
  "undo.subcategories": "subcategories",
  "undo.activity": "activity",
  "undo.activities": "activities",
  "undo.feature": "feature",
  "undo.features": "features",
  "undo.records": "{n} records",

  // ── Analiz ───────────────────────────────────────────────────────────
  "insights.title": "Insights",
  "insights.period": "Period insights",
  "insights.empty.title": "No data to analyse yet",
  "insights.empty.body":
    "Once you start logging, totals, daily averages and the category breakdown appear here.",
  "insights.empty.action": "Make your first entry",

  // ── Ayarlar ──────────────────────────────────────────────────────────
  "settings.title": "Settings",
  "settings.lead": "Data, backup and app",
  "settings.dataSection": "Data & backup",
  "settings.structureSection": "Structure",
  "settings.appSection": "App",
  "settings.structureLink": "Categories and features",
  "settings.structureCounts":
    "{categories} categories · {subcategories} subcategories · {features} features",
  "settings.showWelcome": "Show the welcome again",
  "settings.showWelcomeHint":
    "The category → subcategory → feature walkthrough reappears on the home page",
  "settings.about":
    "Routine · version {version} — your data is kept on this device only and never sent to a server.",
  "settings.language": "Language",
  "settings.languageHint": "Also sets date and number formatting",

  // ── Yedek ────────────────────────────────────────────────────────────
  "backup.reminder.never": "Your data has no backup",
  "backup.reminder.stale": "Last backup {when}",
  "backup.reminder.body":
    "Everything lives on this device only. If you switch phones or clear browser data, it's gone.",
  "backup.reminder.action": "Back up",
  "backup.reminder.dismiss": "Dismiss for now",
  "time.today": "today",
  "time.yesterday": "yesterday",
  "time.daysAgo": "{n} days ago",
} as const;

export type MessageKey = keyof typeof en;

/** Türkçe — anahtar kümesi İngilizceyle birebir aynı olmalı */
export const tr: Record<MessageKey, string> = {
  "action.save": "Kaydet",
  "action.cancel": "Vazgeç",
  "action.delete": "Sil",
  "action.create": "Oluştur",
  "action.add": "Ekle",
  "action.remove": "Kaldır",
  "action.edit": "Düzenle",
  "action.done": "Bitti",
  "action.skip": "Geç",
  "action.back": "Geri",
  "action.continue": "Devam",
  "action.close": "Kapat",
  "action.select": "Seç",
  "action.search": "Ara",
  "action.undo": "Geri al",
  "action.gotIt": "Tamam",
  "action.saveAndContinue": "Kaydet ve devam",

  "nav.home": "Ana Sayfa",
  "nav.calendar": "Takvim",
  "nav.today": "Bugün",
  "nav.insights": "Analiz",
  "nav.structure": "Yapı",
  "nav.todayPage": "Bugünün sayfası",
  "nav.settings": "Ayarlar",

  "home.greeting.night": "İyi geceler",
  "home.greeting.morning": "Günaydın",
  "home.greeting.afternoon": "İyi öğlenler",
  "home.greeting.evening": "İyi akşamlar",
  "home.today": "Bugün",
  "home.entries": "girdi",
  "home.goal": "Hedef",
  "home.addEntry": "Girdi ekle",
  "home.last7Days": "Son 7 Gün",
  "home.recentEntries": "Son girdiler",
  "home.empty.title": "Henüz girdi yok",
  "home.empty.ready": "İlk girdini yapmaya hazır mısın?",
  "home.empty.buildFirst": "Önce yapını oluştur, sonra girdi yap.",
  "home.empty.buildAction": "Yapı oluştur",

  "welcome.title": "Hoş geldin",
  "welcome.lead": "Neyi takip edeceğine sen karar veriyorsun. Yapı üç halkadan oluşuyor:",
  "welcome.category": "Kategori",
  "welcome.categoryExample": "Harcamalar, Spor, Sağlık",
  "welcome.categoryHint": "hayatının ana başlıkları",
  "welcome.subcategory": "Alt kategori",
  "welcome.subcategoryExample": "Fatura › Elektrik",
  "welcome.subcategoryHint": "istediğin kadar derinleşir",
  "welcome.feature": "Özellik",
  "welcome.featureExample": "Para, Süre, Ağırlık",
  "welcome.featureHint": "kalemde ne ölçülüyor",
  "welcome.sample":
    "Örnek bir yapı hazır geldi — gez, işine yaramayanı sil, kendine göre değiştir.",
  "welcome.explore": "Örnek yapıyı incele",
  "welcome.dismiss": "Karşılamayı kapat",

  "structure.title": "Yapı",
  "structure.categories": "Kategoriler",
  "structure.features": "Özellikler",
  "structure.measures": "Ölçüler",
  "structure.notes": "Notlar",
  "structure.map": "Harita",
  "structure.categoriesLead": "Kategoriler — rutinin ana başlıkları",
  "structure.empty.title": "Henüz kategori yok",
  "structure.empty.body": "+ butonuna bas, listeden seç ya da kendin yaz.",
  "structure.sampleHint":
    "Bu kategoriler örnek — içlerine gir, alt kategorilerini ve özelliklerini gör. İşine yaramayanı sil, istediğini yeniden adlandır.",
  "structure.sampleHintDismiss": "Notu kapat",

  "day.empty.title": "Bu gün boş",
  "day.empty.body": "Henüz girdi yok — sağ üstteki Ekle ile başla.",
  "day.insights": "Gün Analizi",
  "day.holdToSelect": "basılı tut: çoklu seçim",
  "day.entries": "GİRDİ",
  "day.notes": "Notlar",
  "day.goals": "Hedefler",

  "selection.count": "{n} öğe seçildi",
  "selection.clear": "Seçimi temizle",
  "selection.selectAll": "Tümünü seç",
  "selection.move": "Başka güne taşı",
  "selection.moveTitle": "Hangi güne taşınsın?",
  "selection.moveHint": "{n} öğe · girdilerin saati korunur",
  "selection.moving": "Taşınıyor...",
  "selection.deleteTitle": "{n} öğe silinsin mi?",
  "selection.deleteBody": "İçerikleriyle birlikte kalıcı olarak silinir.",
  "selection.deleting": "Siliniyor...",
  "selection.previousDay": "Önceki gün",
  "selection.nextDay": "Sonraki gün",

  "undo.deleted": "{what} silindi",
  "undo.running": "Geri alınıyor…",
  "undo.entry": "girdi",
  "undo.entries": "girdi",
  "undo.note": "not",
  "undo.notes": "not",
  "undo.goal": "hedef",
  "undo.goals": "hedef",
  "undo.category": "kategori",
  "undo.categories": "kategori",
  "undo.subcategory": "alt kategori",
  "undo.subcategories": "alt kategori",
  "undo.activity": "aktivite",
  "undo.activities": "aktivite",
  "undo.feature": "özellik",
  "undo.features": "özellik",
  "undo.records": "{n} kayıt",

  "insights.title": "Analiz",
  "insights.period": "Dönem Analizi",
  "insights.empty.title": "Analiz için henüz veri yok",
  "insights.empty.body":
    "Girdi girmeye başladığında toplamlar, günlük ortalamalar ve kategori dağılımı burada oluşur.",
  "insights.empty.action": "İlk girdini yap",

  "settings.title": "Ayarlar",
  "settings.lead": "Veri, yedek ve uygulama",
  "settings.dataSection": "Veri ve Yedek",
  "settings.structureSection": "Yapı",
  "settings.appSection": "Uygulama",
  "settings.structureLink": "Kategoriler ve özellikler",
  "settings.structureCounts":
    "{categories} kategori · {subcategories} alt kategori · {features} özellik",
  "settings.showWelcome": "Karşılamayı tekrar göster",
  "settings.showWelcomeHint":
    "Kategori → alt kategori → özellik anlatımı ana sayfada tekrar çıkar",
  "settings.about":
    "Routine · sürüm {version} — verilerin yalnızca bu cihazda tutulur, hiçbir sunucuya gönderilmez.",
  "settings.language": "Dil",
  "settings.languageHint": "Tarih ve sayı biçimini de belirler",

  "backup.reminder.never": "Verinin yedeği yok",
  "backup.reminder.stale": "Son yedeğin {when}",
  "backup.reminder.body":
    "Her şey yalnızca bu cihazda. Telefon değişirse ya da tarayıcı verisi silinirse geri dönüşü yok.",
  "backup.reminder.action": "Yedek al",
  "backup.reminder.dismiss": "Şimdilik kapat",
  "time.today": "bugün",
  "time.yesterday": "dün",
  "time.daysAgo": "{n} gün önce",
};

export const messages = { en, tr };
