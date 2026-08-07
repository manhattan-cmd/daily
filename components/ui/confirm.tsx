"use client";

import { useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle } from "lucide-react";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * Uygulama içi onay.
 *
 * Tarayıcının confirm() kutusu yerine: uygulamanın dilinde, temasında ve
 * ne silineceğini açıkça yazan bir yüzey. Çağrı biçimi confirm() ile aynı
 * kalsın diye kanca değil, beklenebilir bir fonksiyon:
 *
 *     if (!(await confirmDialog({ title, body, destructive: true }))) return;
 *
 * Radix Dialog KULLANILMIYOR: onay çoğu zaman zaten açık bir dialogun içinden
 * çağrılıyor (girdi düzenleme, özellik detayı) ve üst üste Radix dialog bu
 * uygulamada kırılgan. Bu yüzden kendi katmanı var — tek örnek, kabukta.
 */

export interface ConfirmOptions {
  title: string;
  body?: string;
  /** Onay düğmesinin metni — verilmezse "Sil" ya da "Tamam" */
  confirmLabel?: string;
  cancelLabel?: string;
  /** Kırmızı onay düğmesi — geri alınamaz işlemler */
  destructive?: boolean;
}

type Request = ConfirmOptions & { resolve: (ok: boolean) => void };

let current: Request | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());

/** Onay ister; kullanıcı onaylarsa true döner. */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  // Açık bir istek varsa onu iptal et — iki onay üst üste birikmesin
  current?.resolve(false);
  return new Promise<boolean>((resolve) => {
    current = { ...options, resolve };
    emit();
  });
}

function settle(ok: boolean) {
  current?.resolve(ok);
  current = null;
  emit();
}

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

/** Kabukta tek örnek olarak render edilir */
export function ConfirmHost() {
  const req = useSyncExternalStore(
    subscribe,
    () => current,
    () => null
  );
  const t = useT();
  // Portal yalnızca istemcide — sunucu çıktısında document yok.
  // Sunucu anlık görüntüsü false, istemcininki true: hydration sırasında
  // yeniden çizim useSyncExternalStore'un kendi işi, effect'te setState yok.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  useEffect(() => {
    if (!req) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") settle(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [req]);

  if (!req || !mounted) return null;

  // Doğrudan body'ye portal: telefon çerçevesinin overflow/transform bağlamı
  // sabit katmanı kırpıyor. pointer-events-auto ŞART — Radix modal bir dialog
  // açıkken body'ye pointer-events:none koyuyor, onay kutusu görünüp
  // tıklanamaz hale geliyordu (özellik detayından silme bunu yakaladı).
  return createPortal(
    <div
      className="pointer-events-auto fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-4 backdrop-blur-[2px] sm:items-center"
      onClick={() => settle(false)}
      role="presentation"
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={req.title}
        onClick={(e) => e.stopPropagation()}
        className="animate-in w-full max-w-[340px] overflow-hidden rounded-2xl border border-border bg-card shadow-[0_20px_60px_rgba(0,0,0,0.7)]"
      >
        <div className="flex items-start gap-3 px-4 pb-3 pt-4">
          {req.destructive && (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-destructive/12">
              <AlertTriangle className="h-4 w-4 text-destructive" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold leading-snug">{req.title}</p>
            {req.body && (
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {req.body}
              </p>
            )}
          </div>
        </div>

        <div className="flex gap-2 border-t border-border p-3">
          <button
            type="button"
            onClick={() => settle(false)}
            className="h-11 flex-1 rounded-xl border border-border bg-white/[0.04] text-sm font-medium transition-colors hover:bg-white/[0.08]"
          >
            {req.cancelLabel ?? t("action.cancel")}
          </button>
          <button
            type="button"
            autoFocus
            onClick={() => settle(true)}
            className={cn(
              "h-11 flex-1 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90",
              req.destructive
                ? "bg-destructive text-destructive-foreground"
                : "bg-primary text-primary-foreground"
            )}
          >
            {req.confirmLabel ??
              (req.destructive ? t("action.delete") : t("action.gotIt"))}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
