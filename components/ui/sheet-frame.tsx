"use client";

import { createContext, useContext, type ReactNode } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * Kayıt pencerelerinin çerçevesi — tek başına bir pencere ya da Ekle
 * ekranının bir sekmesi (bkz. AddScreen).
 *
 * Girdi, ruh hali, uyku, not, nesne ve hedef pencereleri eskiden yalnız
 * kendi pencerelerinde açılıyordu; Ekle önce bir menü açıp her satırı başka
 * bir pencereye götürüyordu. Ekle ekranı bunların içini sekmelerinde
 * gösteriyor: aynı içerik, pencere yerine ekranın gövdesinde. İçerik
 * değişmesin diye pencereler yalnız çerçevelerini buradan alıyor.
 *
 * Gömülüyken pencerenin kendi kapatma düğmesi çizilmez (Ekle ekranının
 * şeridinde var) ve başlık düz başlık olur (ekranın kendi başlığı var).
 */
const EmbeddedContext = createContext(false);

/** İçerik Ekle ekranının bir sekmesinde mi */
export const useEmbedded = () => useContext(EmbeddedContext);

export function SheetFrame({
  embedded,
  open,
  onClose,
  className,
  embeddedClassName,
  hideClose = true,
  onOpenAutoFocus,
  children,
}: {
  embedded?: boolean;
  open: boolean;
  onClose: () => void;
  /** Tek başınayken pencerenin (DialogContent) sınıfı */
  className?: string;
  /** Gömülüyken gövdenin sınıfı — pencerenin iç boşluğu gerekiyorsa */
  embeddedClassName?: string;
  hideClose?: boolean;
  onOpenAutoFocus?: (e: Event) => void;
  children: ReactNode;
}) {
  if (embedded) {
    return (
      <EmbeddedContext.Provider value>
        <div
          data-embedded-sheet=""
          className={cn("relative flex min-h-0 flex-1 flex-col overflow-hidden", embeddedClassName)}
        >
          {children}
        </div>
      </EmbeddedContext.Provider>
    );
  }
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        hideClose={hideClose}
        aria-describedby={undefined}
        className={className}
        onOpenAutoFocus={onOpenAutoFocus}
      >
        {children}
      </DialogContent>
    </Dialog>
  );
}

/** Pencerenin başlığı — gömülüyken düz başlık; `asChild` ise öğenin kendisi */
export function SheetTitle({
  asChild,
  className,
  children,
}: {
  asChild?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const embedded = useEmbedded();
  if (!embedded) {
    return (
      <DialogTitle asChild={asChild} className={className}>
        {children}
      </DialogTitle>
    );
  }
  if (asChild) return <>{children}</>;
  return <h2 className={className}>{children}</h2>;
}
