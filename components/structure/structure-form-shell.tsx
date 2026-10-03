"use client";

import { Folder } from "lucide-react";
import {
  DialogContent,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ENTRY_WINDOW_FOOTER,
  ENTRY_WINDOW_LARGE,
} from "@/components/ui/entry-window";
import { Button } from "@/components/ui/button";
import { SymbolIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";

/**
 * Kategori ve alt kategori pencerelerinin ortak iskeleti.
 *
 * Eskiden üç ayrı yüzey vardı: Yapı sayfasında açılır küçük bir menü (hazır
 * listeler + sıkışık bir "kendin yaz" satırı), girdi eklerken açılan düz bir
 * kategori formu ve ayrı biçimde bir alt kategori formu. Aynı iş üç ayrı
 * görünümdeydi. Artık hepsi bu pencere: üstte CANLI ÖNİZLEME (yazdıkça ad,
 * seçtikçe renk ve sembol değişir — ne yarattığın baştan belli), altında
 * bölümler, en altta sabit eylemler. Kayıt pencereleriyle aynı ölçü ve aynı
 * yaylı açılış.
 */
export function StructureFormShell({
  color,
  icon,
  title,
  eyebrow,
  onSubmit,
  footer,
  children,
}: {
  /** Önizleme karosunun rengi — kategorinin rengi */
  color: string;
  icon?: string;
  /** Başlık: yazılan ad, boşsa pencerenin adı ("Yeni kategori") */
  title: string;
  /** Başlığın üstündeki küçük satır — nereye eklendiği ya da ne olduğu */
  eyebrow?: React.ReactNode;
  onSubmit: (e: React.FormEvent) => void;
  footer: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <DialogContent
      aria-describedby={undefined}
      className={cn(ENTRY_WINDOW_LARGE, "gap-0")}
      // Açılır açılmaz ad alanına odaklanıp klavyeyi açmasın: önce öneriye,
      // renge ya da sembole bakan kullanıcı için ekranın yarısı kapanıyordu.
      // Klavye ad alanına dokununca açılır.
      onOpenAutoFocus={(e) => e.preventDefault()}
    >
      <form onSubmit={onSubmit} className="flex flex-1 flex-col">
        <div className="flex items-center gap-3.5 pb-5 pr-6">
          <PreviewTile color={color} icon={icon} size={48} />
          <div className="min-w-0 flex-1">
            {eyebrow && (
              <div className="mb-0.5 truncate text-[12px] font-medium text-muted-foreground">
                {eyebrow}
              </div>
            )}
            <DialogTitle className="truncate text-lg font-semibold tracking-tight">
              {title}
            </DialogTitle>
          </div>
        </div>

        <div className="flex flex-col gap-2.5 pb-6">{children}</div>

        <DialogFooter className={ENTRY_WINDOW_FOOTER}>{footer}</DialogFooter>
      </form>
    </DialogContent>
  );
}

/**
 * Bölme — kendi kibar penceresinde: hafif zemin, ince çerçeve, başlığı
 * içinde. Bölümler çıplak dururken ad, öneriler ve semboller tek bir uzun
 * akışa karışıyordu; her biri kendi kutusunda olunca göz sırayla geziyor.
 */
export function FormSection({
  label,
  hint,
  action,
  children,
}: {
  label: string;
  hint?: string;
  /** Başlık satırının sağındaki küçük eylem (ör. "+ Yeni") */
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2.5 rounded-2xl bg-[var(--sf-1)] px-3.5 pb-3.5 pt-3 ring-1 ring-inset ring-[var(--ln-1)]">
      <div className="flex min-h-6 items-center gap-2">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/70">
          {label}
        </span>
        {hint && <span className="text-[11px] text-muted-foreground/60">{hint}</span>}
        {action && <div className="ml-auto">{action}</div>}
      </div>
      {children}
    </section>
  );
}

/** Ad alanı — büyük, yuvarlak; pencerenin asıl sorusu */
export const NAME_INPUT =
  "h-11 w-full rounded-xl bg-[var(--sf-2)] px-3.5 text-[15px] ring-1 ring-inset ring-[var(--ln-1)] placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/50";

/** Öneri çipi — dokununca adı (ve kategoride rengi/sembolü) doldurur */
export const SUGGESTION_CHIP =
  "flex items-center gap-1.5 rounded-full bg-[var(--sf-2)] py-1 pl-1 pr-2.5 text-[13px] font-medium ring-1 ring-inset ring-[var(--ln-1)] transition-transform active:scale-95";

/** Önizleme karosu — dolu renk, beyaz sembol (listelerdeki karonun aynısı) */
export function PreviewTile({
  color,
  icon,
  size,
}: {
  color: string;
  icon?: string;
  size: number;
}) {
  const glyph = Math.round(size * 0.5);
  return (
    <span
      className="flex shrink-0 items-center justify-center transition-colors duration-300"
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.28),
        backgroundColor: color,
        boxShadow:
          "inset 0 1px 0 rgba(255,255,255,0.25), inset 0 0 0 1px rgba(0,0,0,0.14)",
      }}
    >
      {icon ? (
        <SymbolIcon name={icon} size={glyph} style={{ color: "#fff" }} />
      ) : (
        <Folder style={{ color: "#fff", width: glyph, height: glyph }} strokeWidth={2} />
      )}
    </span>
  );
}

/** Ortak eylem düğmeleri — kayıt pencereleriyle aynı sıra (asli üstte) */
export function FormActions({
  submitLabel,
  disabled,
  onCancel,
  cancelLabel,
}: {
  submitLabel: string;
  disabled: boolean;
  onCancel: () => void;
  cancelLabel: string;
}) {
  return (
    <>
      <Button type="button" variant="outline" onClick={onCancel}>
        {cancelLabel}
      </Button>
      <Button type="submit" disabled={disabled}>
        {submitLabel}
      </Button>
    </>
  );
}
