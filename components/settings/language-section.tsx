"use client";

import { Check, Languages } from "lucide-react";
import {
  LOCALES,
  LOCALE_LABELS,
  setLocale,
  useLocale,
  useT,
} from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * Dil seçici. Seçim anında uygulanır (yeniden yükleme yok) çünkü metinler
 * sözlükten okunuyor ve dil deposu bileşenleri yeniden çiziyor. Tarih ve sayı
 * biçimi de aynı seçime bağlı.
 */
export function LanguageSection() {
  const locale = useLocale();
  const t = useT();

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex items-center gap-3 px-4 py-3.5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.06]">
          <Languages className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-medium">{t("settings.language")}</div>
          <div className="text-xs text-muted-foreground">
            {t("settings.languageHint")}
          </div>
        </div>
      </div>
      <div className="flex flex-col border-t border-border">
        {LOCALES.map((code) => {
          const active = code === locale;
          return (
            <button
              key={code}
              type="button"
              onClick={() => setLocale(code)}
              aria-pressed={active}
              className={cn(
                "flex items-center justify-between gap-2 px-4 py-3 text-left text-sm transition-colors",
                active ? "text-foreground" : "text-muted-foreground",
                "hover:bg-white/[0.03]"
              )}
            >
              <span className={cn(active && "font-semibold")}>
                {LOCALE_LABELS[code]}
              </span>
              {active && <Check className="h-4 w-4 shrink-0 text-primary" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
