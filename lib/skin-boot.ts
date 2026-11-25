/**
 * Temanın sabitleri ve açılış betiği — "use client" OLMAYAN dosya.
 *
 * lib/skin.ts istemci modülü; oradan dışa verilen bir sabit sunucu bileşenine
 * (app/layout.tsx) gerçek değer olarak değil istemci referansı olarak gelir.
 * Açılış betiği layout'ta yazıldığı için liste ve anahtar burada duruyor;
 * lib/skin.ts de buradan alıyor — ikisi hiç ayrışmasın.
 */

export const SKINS = [
  "gece",
  "pastel",
  "kagit",
  "nordik",
  "toprak",
  "retro",
  "neon",
  "mono",
  "brutal",
] as const;
export type Skin = (typeof SKINS)[number];

export const SKIN_STORAGE_KEY = "routine:skin";
export const DEFAULT_SKIN: Skin = "brutal";

/**
 * Blok dilindeki temalar: Brütal ve onun gece hali Gece. İkisi aynı
 * yerleşimi çiziyor (bloklar, şeritler, bilet kartlar — bileşenlerdeki
 * `brutal` dalları); ayrıldıkları yer yalnız renk değişkenleri (bkz.
 * app/globals.css "Blok dili renkleri"). Kök öğede `data-ui="block"`.
 * Öteki temalar eski sade düzende.
 */
export const BLOCK_SKINS: readonly Skin[] = ["brutal", "gece"];
export const isBlockSkin = (skin: string | null | undefined): boolean =>
  skin === "brutal" || skin === "gece";

/**
 * Telefonun durum çubuğunun rengi (<meta name="theme-color">) — Brütal'de
 * ekranın tepesindekiyle aynı, sayfa tepeden tek parça dursun: üst menüsü
 * kenardan kenara şerit olan sayfalarda şeridin rengi (Ana Sayfa'nın
 * moru, Takvim'in turkuazı, Gün'ün yeşili, Analiz'in mavisi, Yapı'nın sarısı — alt menüde sekmelerinin
 * renkleri), ötekilerde
 * başlık bloğunun durduğu krem döşeme. Diğer temalarda null —
 * çağıran temanın zemin rengini (--background) kullanır.
 *
 * Eskiden sayfanın bandının rengiydi (Ana Sayfa mor, Takvim yeşil…);
 * bantlar bloğa dönünce renkli şerit krem döşemenin üstünde asılı kaldı.
 *
 * Gece'de aynı şeritlerin gece tonları (lib/fill nightTone ile hesaplandı:
 * #a9b0ff → #2f3252, #5eead4 → #004037, #8ea6ff → #293357, #ffd23f →
 * #453300), ötekilerde gece döşemesi.
 *
 * Kendi içinde kapalı olmalı (dışarıdan değişken yok): açılış betiğine
 * kaynağıyla gömülüyor.
 */
export function statusBarColor(path: string, skin: string): string | null {
  if (skin !== "brutal" && skin !== "gece") return null;
  const night = skin === "gece";
  const p = path.replace(/\/+$/, "") || "/";
  // Ara ve Ayarlar ana sayfanın başlığından açılır, onun şeridinde (bkz. SubPageMenu)
  if (p === "/" || p === "/search" || p === "/settings") return night ? "#2f3252" : "#a9b0ff";
  // Takvim ve gün sayfası aynı turkuaz (gün sayfası Takvim sekmesinin altında)
  if (p === "/calendar" || p === "/calendar/day") return night ? "#004037" : "#5eead4";
  if (p === "/analytics") return night ? "#293357" : "#8ea6ff";
  if (p === "/structure" || p.indexOf("/structure/") === 0) return night ? "#453300" : "#ffd23f";
  return night ? "#0d0f15" : "#fff4dc";
}

/**
 * Durum çubuğu rengini meta etiketine yazar (yoksa ekler). Etiketin tek
 * sahibi bu dosya: layout'un viewport'unda sabit themeColor YOK — vardı ve
 * yanına ikinci bir koyu etiket düşüyordu, tarayıcı hangisini seçerse.
 */
export function applyStatusBarColor(color: string): void {
  const all = document.querySelectorAll('meta[name="theme-color"]');
  if (!all.length) {
    const m = document.createElement("meta");
    m.setAttribute("name", "theme-color");
    m.setAttribute("content", color);
    document.head.appendChild(m);
  }
  all.forEach((m) => m.setAttribute("content", color));
}

/**
 * <head>'de, ilk çizimden önce çalışan betik. Durum çubuğunu da o anda
 * boyar (statusBarColor) — açılışta koyu şerit görünmesin.
 *
 * Sunucu temayı bilmiyor (kayıt tarayıcıda), ilk HTML hep varsayılan
 * Brütal'le geliyordu: Gece'yi seçen biri her açılışta bir an Brütal
 * görüyordu. Betik kayıtlı temayı okuyup kök öğeye yazıyor — renkler ilk
 * karede doğru.
 *
 * Ama bazı bileşenler blok dilinde başka DÜZEN çiziyor (useSkin) ve sunucu
 * HTML'i o düzende. Tema blok dilinde değilse (Brütal ya da Gece değilse)
 * sayfa `data-skin-pending` ile gizli kalıyor; AppShell kendini gerçek
 * temayla çizince kaldırıyor. Gece aynı düzeni çizdiği için beklemiyor,
 * yalnız renkleri değişiyor. JS hiç çalışmazsa sayfa boş kalmasın diye
 * 2,5 sn sonra betik kendisi de kaldırıyor.
 */
export const SKIN_BOOT_SCRIPT = `(function(){var d=document.documentElement;try{var s=localStorage.getItem(${JSON.stringify(
  SKIN_STORAGE_KEY
)});if(${JSON.stringify(SKINS)}.indexOf(s)<0)s=${JSON.stringify(
  DEFAULT_SKIN
)};if(s!==${JSON.stringify(DEFAULT_SKIN)}){d.setAttribute("data-skin",s);if(${JSON.stringify(
  BLOCK_SKINS
)}.indexOf(s)<0){d.removeAttribute("data-ui");d.setAttribute("data-skin-pending","");setTimeout(function(){d.removeAttribute("data-skin-pending")},2500)}}var c=(${statusBarColor.toString()})(location.pathname,s)||getComputedStyle(d).getPropertyValue("--background").trim()||"#09090b";var m=document.createElement("meta");m.name="theme-color";m.content=c;document.head.appendChild(m)}catch(e){}})()`;
