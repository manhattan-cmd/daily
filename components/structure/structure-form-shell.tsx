"use client";

import { createContext, useContext } from "react";
import { Check, Folder, X, type LucideIcon } from "lucide-react";
import {
  DialogClose,
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
import { useSkin } from "@/lib/skin";
import { SmartText } from "@/components/ui/smart-text";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

/**
 * Brütal temada pencere ayrı bir düzenle çizilir (bkz. BrutalFormShell);
 * bölümler ve eylemler bunu bağlamdan öğrenir — formların haberi olmaz.
 */
const BrutalCtx = createContext(false);

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
  atom,
  title,
  eyebrow,
  onSubmit,
  footer,
  children,
}: {
  /** Önizleme karosunun rengi — kategorinin rengi */
  color: string;
  icon?: string;
  /** Özellik penceresi: karo yerine daire, içinde ölçü türünün simgesi
   *  (şekil dili: kare = kategori, daire = özellik) */
  atom?: LucideIcon;
  /** Başlık: yazılan ad, boşsa pencerenin adı ("Yeni kategori") */
  title: string;
  /** Başlığın üstündeki küçük satır — nereye eklendiği ya da ne olduğu */
  eyebrow?: React.ReactNode;
  onSubmit: (e: React.FormEvent) => void;
  footer: React.ReactNode;
  children: React.ReactNode;
}) {
  const brutal = useSkin() === "brutal";
  if (brutal) {
    return (
      <BrutalCtx.Provider value>
        <BrutalFormShell
          color={color}
          icon={icon}
          atom={atom}
          title={title}
          eyebrow={eyebrow}
          onSubmit={onSubmit}
          footer={footer}
        >
          {children}
        </BrutalFormShell>
      </BrutalCtx.Provider>
    );
  }
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
          <PreviewTile color={color} icon={icon} atom={atom} size={48} />
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
 * Brütal pencere — girdi ve uyku pencereleriyle aynı fiş dili (EntryShell,
 * globals.css'teki data-entry-hero / data-entry-foot kuralları): tepede
 * kategorinin renginde dolu bant, beyaz çerçeveli karo, büyük kalın ad;
 * gövdede kenarına renkli sekme oturan beyaz bölümler; altta sarı ana düğme.
 * Bant seçilen renkle canlı değişir — önizleme bandın kendisi. Başlık ve alt
 * düğmeler sabit, yalnız gövde kayar.
 */
function BrutalFormShell({
  color,
  icon,
  atom: Atom,
  title,
  eyebrow,
  onSubmit,
  footer,
  children,
}: {
  color: string;
  icon?: string;
  atom?: LucideIcon;
  title: string;
  eyebrow?: React.ReactNode;
  onSubmit: (e: React.FormEvent) => void;
  footer: React.ReactNode;
  children: React.ReactNode;
}) {
  const t = useT();
  return (
    <DialogContent
      hideClose
      aria-describedby={undefined}
      className={cn(ENTRY_WINDOW_LARGE, "gap-0 overflow-hidden p-0")}
      onOpenAutoFocus={(e) => e.preventDefault()}
    >
      <form
        onSubmit={onSubmit}
        data-struct-form=""
        className="flex min-h-0 flex-1 flex-col"
        style={{ ["--form-c" as string]: color }}
      >
        <div data-entry-hero="" className="shrink-0" style={{ ["--hero-c" as string]: color }}>
          <div className="flex h-12 items-center justify-end px-3 pt-1.5">
            <DialogClose
              type="button"
              aria-label={t("action.close")}
              className="flex h-9 w-9 items-center justify-center rounded-full"
            >
              <X className="h-[17px] w-[17px]" strokeWidth={2.6} />
            </DialogClose>
          </div>
          <div className="flex items-center gap-3 px-4 pb-3">
            <span
              className={cn(
                "flex h-11 w-11 shrink-0 items-center justify-center transition-colors duration-300",
                Atom ? "rounded-full" : "rounded-[13px]"
              )}
            >
              {Atom ? (
                <Atom className="h-[22px] w-[22px]" strokeWidth={2.4} />
              ) : icon ? (
                <SymbolIcon name={icon} size={22} />
              ) : (
                <Folder className="h-[22px] w-[22px]" strokeWidth={2.4} />
              )}
            </span>
            <div className="min-w-0 flex-1 leading-tight">
              {eyebrow && (
                <div className="truncate text-[12px] text-muted-foreground">{eyebrow}</div>
              )}
              <DialogTitle asChild>
                <div>
                  <SmartText text={title} lines={2} className="text-[19px] font-bold leading-6" />
                </div>
              </DialogTitle>
            </div>
          </div>
        </div>

        {/* Çubuğun yeri hep ayrılı — ölçü türü değişip gövde kısalınca
            kutular 6 px yana oynamasın (bkz. AppShell'in main'i) */}
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-4 pb-6 pt-6 [scrollbar-gutter:stable]">
          {children}
        </div>

        <div
          data-entry-foot=""
          className="flex shrink-0 gap-2.5 px-4 pt-3"
          style={{ paddingBottom: "max(1rem, calc(env(safe-area-inset-bottom, 0px) + 0.75rem))" }}
        >
          {footer}
        </div>
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
  className,
  children,
}: {
  label: string;
  hint?: string;
  /** Başlık satırının sağındaki küçük eylem (ör. "+ Yeni") */
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  const brutal = useContext(BrutalCtx);
  if (brutal) {
    // Ad, kutunun üst kenarına oturan renkli sekmede (girdi formundaki
    // özellik kutularıyla aynı — bkz. LedgerField)
    return (
      <section
        data-struct-section=""
        className={cn(
          "relative mt-3 flex flex-col gap-2.5 rounded-2xl border-2 border-[#111] bg-white px-3 pb-3 pt-6 shadow-[3px_3px_0_#111]",
          className
        )}
      >
        <div className="absolute -top-[13px] left-2.5 right-2.5 flex items-center gap-2">
          <span
            className="rounded-lg border-2 border-[#111] px-2 py-px text-[11.5px] font-black uppercase tracking-wide text-[#111]"
            style={{ background: "color-mix(in srgb, var(--form-c) 45%, #ffffff)" }}
          >
            {label}
          </span>
          {hint && <span className="text-[11px] font-semibold text-[#111]/60">{hint}</span>}
          {action && <div className="ml-auto">{action}</div>}
        </div>
        {children}
      </section>
    );
  }
  return (
    <section
      className={cn(
        "flex flex-col gap-2.5 rounded-2xl bg-[var(--sf-1)] px-3.5 pb-3.5 pt-3 ring-1 ring-inset ring-[var(--ln-1)]",
        className
      )}
    >
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
  atom: Atom,
  size,
}: {
  color: string;
  icon?: string;
  /** Verilirse daire (özellik) ve içinde bu simge */
  atom?: LucideIcon;
  size: number;
}) {
  const glyph = Math.round(size * 0.5);
  return (
    <span
      className="flex shrink-0 items-center justify-center transition-colors duration-300"
      style={{
        width: size,
        height: size,
        borderRadius: Atom ? "9999px" : Math.round(size * 0.28),
        backgroundColor: color,
        boxShadow:
          "inset 0 1px 0 rgba(255,255,255,0.25), inset 0 0 0 1px rgba(0,0,0,0.14)",
      }}
    >
      {Atom ? (
        <Atom style={{ color: "#fff", width: glyph, height: glyph }} strokeWidth={2} />
      ) : icon ? (
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
  const brutal = useContext(BrutalCtx);
  if (brutal) {
    // Fiş dili: beyaz Vazgeç, yanında sarı ana düğme (renkler globals.css'te
    // data-entry-foot kurallarından — satır içi stilli düğme sarı olur)
    return (
      <>
        <button
          type="button"
          onClick={onCancel}
          className="h-12 shrink-0 rounded-2xl px-4 text-[15px] font-extrabold"
        >
          {cancelLabel}
        </button>
        <button
          type="submit"
          disabled={disabled}
          className="flex h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-2xl disabled:opacity-50"
          style={{ background: "#ffd23f" }}
        >
          <Check className="h-5 w-5 shrink-0" strokeWidth={2.75} />
          <span className="truncate">{submitLabel}</span>
        </button>
      </>
    );
  }
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
