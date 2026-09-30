"use client";

import { Capacitor } from "@capacitor/core";

/**
 * Mobil uygulama (Capacitor) köprüsü — web sürümünde hiçbiri çalışmaz,
 * `isNative()` false döner ve çağıranlar eski web yolunu kullanır.
 *
 * Eklentiler dinamik yükleniyor: web paketine ve Vercel'e yük olmasınlar.
 */
export const isNative = () => Capacitor.isNativePlatform();

/**
 * Yedeği telefonun paylaşım menüsüne ver (Drive, Dosyalar, WhatsApp…).
 *
 * Uygulamanın içindeki web görünümünde ne `navigator.share` ne de dosya
 * indirme var — web yolu sessizce hiçbir şey yapmıyordu. Dosya önce
 * uygulamanın geçici klasörüne yazılıyor, sonra paylaşılıyor.
 *
 * Kullanıcı menüyü kapatırsa "cancelled" döner — hata değil.
 */
export async function shareFileNative(
  fileName: string,
  text: string,
  title: string
): Promise<"shared" | "cancelled"> {
  const [{ Filesystem, Directory, Encoding }, { Share }] = await Promise.all([
    import("@capacitor/filesystem"),
    import("@capacitor/share"),
  ]);
  const { uri } = await Filesystem.writeFile({
    path: fileName,
    data: text,
    directory: Directory.Cache,
    encoding: Encoding.UTF8,
  });
  try {
    await Share.share({ title, files: [uri] });
    return "shared";
  } catch (err) {
    // Paylaşım penceresini kapatmak eklentide hata olarak geliyor
    const msg = err instanceof Error ? err.message : String(err);
    if (/cancel/i.test(msg)) return "cancelled";
    throw err;
  }
}

/**
 * Android geri tuşu: açık bir pencere varsa önce onu kapat (Esc gibi), yoksa
 * bir önceki sayfaya dön, ilk sayfadaysa uygulamadan çık. Varsayılan davranış
 * pencere açıkken bile sayfayı geri alıyordu — pencere arkada açık kalıyordu.
 *
 * Döndürdüğü fonksiyon dinleyiciyi kaldırır.
 */
export function listenBackButton(): () => void {
  let remove: (() => void) | null = null;
  let cancelled = false;
  import("@capacitor/app").then(({ App }) => {
    if (cancelled) return;
    App.addListener("backButton", ({ canGoBack }) => {
      const open = document.querySelector(
        '[role="dialog"][data-state="open"], [role="dialog"][aria-modal="true"]'
      );
      if (open) {
        document.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
        );
        return;
      }
      if (canGoBack) window.history.back();
      else App.exitApp();
    }).then((h) => {
      if (cancelled) h.remove();
      else remove = () => h.remove();
    });
  });
  return () => {
    cancelled = true;
    remove?.();
  };
}
