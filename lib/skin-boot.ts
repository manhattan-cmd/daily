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
/** CSS'in temel (`:root`) tonları Gece'ninki; ona özel `data-skin` yok */
export const BASE_SKIN: Skin = "gece";

/**
 * Telefonun durum çubuğunun rengi (<meta name="theme-color">) — Brütal'de
 * sayfanın bandıyla aynı: bant ekranın tepesine kadar uzanıyormuş gibi
 * dursun (eskiden her sayfada koyu #09090b şerit). Bandı olmayan sayfalar
 * (gün, kategori, ayarlar…) kâğıt zemin rengi. Diğer temalarda null — çağıran
 * temanın zemin rengini (--background) kullanır.
 *
 * Kendi içinde kapalı olmalı (dışarıdan değişken yok): açılış betiğine
 * kaynağıyla gömülüyor. Renkler globals.css'teki "bolum bantlari"yla aynı.
 */
export function statusBarColor(path: string, skin: string): string | null {
  if (skin !== "brutal") return null;
  const p = path.replace(/\/+$/, "") || "/";
  if (p === "/") return "#5ce1e6";
  if (p === "/calendar") return "#7ae582";
  if (p === "/analytics" || p.indexOf("/analytics/") === 0) return "#8ea6ff";
  if (/^\/structure(\/(mods|notes|galaxy))?$/.test(p)) return "#ffd23f";
  return "#fff4dc";
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
 * Ama bazı bileşenler Brütal'de başka DÜZEN çiziyor (useSkin) ve sunucu
 * HTML'i o düzende. Tema Brütal değilse sayfa `data-skin-pending` ile gizli
 * kalıyor; AppShell kendini gerçek temayla çizince kaldırıyor. JS hiç
 * çalışmazsa sayfa boş kalmasın diye 2,5 sn sonra betik kendisi de kaldırıyor.
 */
export const SKIN_BOOT_SCRIPT = `(function(){var d=document.documentElement;try{var s=localStorage.getItem(${JSON.stringify(
  SKIN_STORAGE_KEY
)});if(${JSON.stringify(SKINS)}.indexOf(s)<0)s=${JSON.stringify(
  DEFAULT_SKIN
)};if(s!==${JSON.stringify(DEFAULT_SKIN)}){if(s===${JSON.stringify(
  BASE_SKIN
)})d.removeAttribute("data-skin");else d.setAttribute("data-skin",s);d.setAttribute("data-skin-pending","");setTimeout(function(){d.removeAttribute("data-skin-pending")},2500)}var c=(${statusBarColor.toString()})(location.pathname,s)||getComputedStyle(d).getPropertyValue("--background").trim()||"#09090b";var m=document.createElement("meta");m.name="theme-color";m.content=c;document.head.appendChild(m)}catch(e){}})()`;
