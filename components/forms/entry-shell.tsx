"use client";

import { Check, PenLine, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { DialogTitle } from "@/components/ui/dialog";
import { SmartText } from "@/components/ui/smart-text";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

/**
 * KAYIT PENCERESİNİN KABUĞU — girdi formunun (açık defter) dili, yerleşik
 * akışlar (uyku, ruh hali) için: tepede rengin ışığı, üst şeritte kapat,
 * başlıkta renkli karo + üst yazı + ad (+ zaman hapı), gövdede karodan inen
 * ip ve özellik kutuları, altta not ve rengin Ekle'si. Başlık ve alt düğme
 * sabit, yalnız gövde kayar.
 *
 * DialogContent'in içine konur; kap `overflow-hidden p-0 gap-0` olmalı.
 */
export function EntryShell({
  title,
  overline,
  icon: Icon,
  accent,
  onClose,
  time,
  children,
  notes,
  onOpenNote,
  onSave,
  saveLabel,
  saveDisabled,
}: {
  title: string;
  /** Başlığın üstündeki küçük yazı */
  overline?: string;
  icon: LucideIcon;
  accent: string;
  onClose: () => void;
  /** Zaman hapı (EntryTime) — yoksa gösterilmez */
  time?: React.ReactNode;
  /** Özellik kutuları */
  children: React.ReactNode;
  notes: string;
  onOpenNote: () => void;
  onSave: () => void;
  saveLabel: string;
  saveDisabled?: boolean;
}) {
  const t = useT();
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <DialogTitle className="sr-only">{title}</DialogTitle>
      {/* Tepede rengin ışığı */}
      <div
        aria-hidden
        data-glow=""
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-64"
        style={{
          background: `radial-gradient(120% 90% at 15% 0%, ${accent}40 0%, ${accent}14 45%, transparent 75%)`,
        }}
      />
      {/* Başlık bandı — Brütal temada kalemin renginde dolu bant (bkz. globals.css) */}
      <div data-entry-hero="" className="shrink-0" style={{ ["--hero-c" as string]: accent }}>
      {/* Üst şerit — kapat */}
      <div className="flex h-12 shrink-0 items-center justify-end px-3 pt-1.5">
        <button
          type="button"
          onClick={onClose}
          aria-label={t("action.close")}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--sf-2)] text-foreground/80 transition-[background-color,transform] hover:bg-[var(--sf-3)] active:scale-95"
        >
          <X className="h-[17px] w-[17px]" />
        </button>
      </div>

      {/* Başlık — karo, üst yazı, ad, zaman */}
      <div className="flex shrink-0 items-start gap-3 px-4 pb-3">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[13px]"
          style={{
            backgroundColor: accent,
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.25), inset 0 0 0 1px rgba(0,0,0,0.14)",
          }}
        >
          <Icon className="h-[22px] w-[22px] text-white" strokeWidth={2.2} />
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          {overline && (
            <SmartText text={overline} className="text-[12px] font-medium text-muted-foreground" />
          )}
          <SmartText text={title} lines={2} className="text-[19px] font-bold leading-6 tracking-tight" />
          {time}
        </div>
      </div>

      </div>

      {/* Gövde — ip ve özellik kutuları, altta not */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-4 pb-4">
        <div className="relative ml-[22px] flex flex-col gap-2 pl-3">
          <span
            aria-hidden
            className="absolute -top-2.5 bottom-4 left-0 w-[2px] -translate-x-1/2 rounded-full"
            style={{ background: `${accent}59` }}
          />
          {children}
        </div>

        <div className="mt-4 flex shrink-0 flex-col gap-1.5">
          <div className="px-1 text-[12px] font-semibold text-muted-foreground">
            {t("entry.note")}
          </div>
          <button
            type="button"
            data-note-box=""
            onClick={onOpenNote}
            className="flex min-h-[76px] w-full items-start gap-2.5 rounded-2xl bg-[var(--sf-1)] px-3.5 py-3 text-left ring-1 ring-inset ring-[var(--ln-1)] transition-colors hover:bg-[var(--sf-2)]"
          >
            <PenLine className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <span
              className={cn(
                "line-clamp-3 min-w-0 whitespace-pre-wrap break-words text-[14px] leading-5",
                notes ? "text-foreground" : "text-muted-foreground/70"
              )}
            >
              {notes || t("entry.notePlaceholder")}
            </span>
          </button>
        </div>
      </div>

      {/* Alt — rengin Ekle'si */}
      <div
        data-entry-foot=""
        className="shrink-0 border-t border-[var(--ln-1)] px-4 pt-3"
        style={{ paddingBottom: "max(1rem, calc(env(safe-area-inset-bottom, 0px) + 0.75rem))" }}
      >
        <button
          type="button"
          onClick={onSave}
          disabled={saveDisabled}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-[15px] font-semibold text-white transition-opacity active:opacity-85 disabled:opacity-50"
          style={{ background: accent }}
        >
          <Check className="h-5 w-5" strokeWidth={2.75} />
          {saveLabel}
        </button>
      </div>
    </div>
  );
}
