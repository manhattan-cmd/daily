"use client";

import { useState, useSyncExternalStore } from "react";
import { FolderTree, Layers, Lightbulb, Sliders, X } from "lucide-react";
import { cn } from "@/lib/utils";

const DISMISS_KEY = "routine.howItWorksDismissed";

/**
 * Yapı ana sayfasının tepesindeki tanıtım kartı — Kategori → Alt kategori → Mod
 * zincirini yeni kullanıcıya öğretir. X ile kapatılır, tercih localStorage'da
 * kalır (SSR uyumu için mount'tan sonra görünür).
 */
export function HowItWorksCard() {
  const [dismissedNow, setDismissedNow] = useState(false);
  // SSR'da (server snapshot) kapalı sayılır — hidrasyon uyuşmazlığı olmaz
  const initiallyDismissed = useSyncExternalStore(
    () => () => {},
    () => localStorage.getItem(DISMISS_KEY) === "1",
    () => true
  );

  if (initiallyDismissed || dismissedNow) return null;

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setDismissedNow(true);
  }

  return (
    <div className="relative mb-5 rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-primary/4 to-transparent p-4">
      <button
        onClick={dismiss}
        className="absolute right-2 top-2 rounded-lg p-1.5 text-muted-foreground/50 transition-colors hover:bg-muted hover:text-foreground"
        aria-label="Tanıtımı kapat"
      >
        <X className="h-3.5 w-3.5" />
      </button>

      <h3 className="text-sm font-semibold">Yapı nasıl çalışır?</h3>
      <div className="mt-3 flex flex-col gap-2.5">
        <GuideStep
          icon={Layers}
          title="Kategori"
          text="Hayatının bir alanı — Harcamalar, Spor, Uyku…"
        />
        <GuideStep
          icon={FolderTree}
          title="Alt kategori"
          text="Kategorinin dalları — Harcamalar için Market, Fatura, Ulaşım…"
        />
        <GuideStep
          icon={Sliders}
          title="Mod"
          text="Girdilerde ölçtüğün değer — Para (₺), Süre (dk), Miktar (adet)…"
        />
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground/70">
        Girdilerini Takvim&apos;den eklersin; Analiz sayfası hepsini kendiliğinden
        özetler.
      </p>
    </div>
  );
}

function GuideStep({
  icon: Icon,
  title,
  text,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  title: string;
  text: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-primary/15">
        <Icon className="h-3.5 w-3.5 text-primary" strokeWidth={1.75} />
      </span>
      <p className="text-xs leading-relaxed text-muted-foreground">
        <span className="font-semibold text-foreground">{title}</span> — {text}
      </p>
    </div>
  );
}

/**
 * Bağlama özel küçük rehber kartı — kesikli çerçeve + ampul; boş bölümlerde
 * kullanıcıya sıradaki doğru adımı anlatır. action ile CTA butonu eklenir.
 */
export function GuideHint({
  children,
  action,
  className,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-dashed border-border bg-card/40 px-4 py-3.5",
        className
      )}
    >
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-amber-400/15">
          <Lightbulb className="h-3.5 w-3.5 text-amber-300" strokeWidth={1.75} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-xs leading-relaxed text-muted-foreground">
            {children}
          </p>
          {action && <div className="mt-2.5">{action}</div>}
        </div>
      </div>
    </div>
  );
}
