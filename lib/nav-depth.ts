/**
 * Uygulamanın içinde kaç adım ilerlendi — "geri" düğmesi geldiği yere mi
 * dönsün, yoksa sayfanın üstüne mi gitsin, buna bakar.
 *
 * history.length işe yaramıyor: yeni sekmede ya da ana ekrandan açılışta
 * geçmişte uygulamanın dışından bir kayıt (about:blank, yeni sekme sayfası)
 * duruyor; router.back() kullanıcıyı uygulamadan çıkarıyordu. Next'in
 * gezintileri history.pushState'ten geçiyor: her ileri adım sayılır, geri
 * (popstate) bir düşer. İleri tuşu da popstate — o zaman sayı eksik kalır ve
 * geri düğmesi sayfanın üstüne gider; zararsız.
 */

let depth = 0;
let installed = false;

/** AppShell bir kez çağırır */
export function installNavDepth(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const push = window.history.pushState.bind(window.history);
  window.history.pushState = (...args: Parameters<History["pushState"]>) => {
    depth += 1;
    return push(...args);
  };
  window.addEventListener("popstate", () => {
    depth = Math.max(0, depth - 1);
  });
}

/** Bu sayfaya uygulamanın içinden mi gelindi */
export function canGoBackInApp(): boolean {
  return depth > 0;
}
