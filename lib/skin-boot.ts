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
 * <head>'de, ilk çizimden önce çalışan betik.
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
export const SKIN_BOOT_SCRIPT = `(function(){try{var s=localStorage.getItem(${JSON.stringify(
  SKIN_STORAGE_KEY
)});if(${JSON.stringify(SKINS)}.indexOf(s)<0||s===${JSON.stringify(
  DEFAULT_SKIN
)})return;var d=document.documentElement;if(s===${JSON.stringify(
  BASE_SKIN
)})d.removeAttribute("data-skin");else d.setAttribute("data-skin",s);d.setAttribute("data-skin-pending","");setTimeout(function(){d.removeAttribute("data-skin-pending")},2500)}catch(e){}})()`;
