"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Pencereler KİPSİZ (modal={false}) açılıyor — bilinçli, performans için.
 *
 * Kipli Radix açılırken sayfanın tamamını etkileyen dört şey yapıyor: head'e
 * kaydırma kilidi stil etiketi ekliyor, body'ye data-scroll-locked ve
 * pointer-events:none koyuyor, uygulamanın ana kabına aria-hidden veriyor.
 * Her biri bütün sayfanın stilini baştan hesaplatıyordu: 16 girdili gün
 * sayfasında (~1300 öğe) bir kart açmak iki kez tam stil hesabı demekti
 * (telefonda ~100 ms). Kaydırma kilidi zaten boşa çalışıyordu — uygulama
 * body'de değil içerik kabında kayıyor.
 *
 * Kipin verdiği şeyler burada elle: karartılmış arka plan (dokununca kapanır,
 * arkadaki sayfaya dokunulamaz), aria-modal (ekran okuyucu için "arkası
 * devre dışı"); Esc ile kapanma Radix'te zaten var.
 */
export function Dialog(
  props: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Root>
) {
  return <DialogPrimitive.Root modal={false} {...props} />;
}
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogPortal = DialogPrimitive.Portal;
export const DialogClose = DialogPrimitive.Close;

export const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/70 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
  />
));
DialogOverlay.displayName = "DialogOverlay";

export const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, onInteractOutside, ...props }, ref) => (
  <DialogPortal>
    {/* Kipsiz Radix kendi karartmasını çizmiyor (bkz. Dialog). Dokununca
        pencere kapanır: karartma pencerenin dışı sayılıyor. */}
    <div
      aria-hidden
      data-dialog-overlay=""
      className="animate-in fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
    />
    <DialogPrimitive.Content
      ref={ref}
      aria-modal="true"
      className={cn(
        // grid-cols-[minmax(0,1fr)]: ızgara satırlarının varsayılan en küçük
        // boyu "min-content" — içeride kendi asgari genişliği olan tek bir
        // öğe (ör. size özniteliği olan bir <input>) sütunu şişirip tüm
        // içeriği panelin sağ kenarından taşırıyordu. Sütunu 0'a
        // sıkıştırılabilir yapmak paneli her koşulda aynı genişlikte tutar.
        "fixed left-[50%] top-[50%] z-50 grid w-full max-w-md grid-cols-[minmax(0,1fr)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-2xl border border-border bg-card p-6 shadow-2xl duration-200",
        className
      )}
      {...props}
      // Yalnız kendi karartmasına dokunmak kapatır. Kipsiz Radix, pencerenin
      // DIŞINA her dokunuşta ve odak dışarı kaydığında da kapatıyor — onay
      // kutusu (confirmDialog, ayrı katman) açılıp odağı alınca düzenleme
      // penceresi arkadan kapanırdı. Esc ayrı, o hep kapatır.
      onInteractOutside={(e) => {
        onInteractOutside?.(e);
        if (e.defaultPrevented) return;
        const target = e.target as Element | null;
        if (!target?.closest?.("[data-dialog-overlay]")) e.preventDefault();
      }}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 rounded-md opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring">
        <X className="h-4 w-4" />
        <span className="sr-only">{"Close"}</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
));
DialogContent.displayName = "DialogContent";

export const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("flex flex-col space-y-1.5 text-left", className)}
    {...props}
  />
);

export const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
      className
    )}
    {...props}
  />
);

export const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      "text-lg font-semibold leading-none tracking-tight",
      className
    )}
    {...props}
  />
));
DialogTitle.displayName = "DialogTitle";

export const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
DialogDescription.displayName = "DialogDescription";
