"use client";

import { Check, Palette } from "lucide-react";
import { SKINS, SKIN_META, setSkin, useSkin } from "@/lib/skin";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * Görüntü teması seçici.
 *
 * Dil seçicinin kardeşi: seçim anında uygulanıyor, yeniden yükleme yok —
 * tema kök öğedeki `data-skin` ve CSS değişkenlerinden ibaret. Her satırda
 * dört renk örneği var (zemin, yüzey, vurgu, metin); ad okumadan da hangi
 * dünyaya geçileceği görülüyor.
 */
export function SkinSection() {
  const skin = useSkin();
  const t = useT();

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex items-center gap-3 px-4 py-3.5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--sf-2)]">
          <Palette className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-medium">{t("settings.skin")}</div>
          <div className="text-xs text-muted-foreground">
            {t("settings.skinHint")}
          </div>
        </div>
      </div>

      <div className="flex flex-col border-t border-border">
        {SKINS.map((id) => {
          const meta = SKIN_META[id];
          const active = id === skin;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setSkin(id)}
              aria-pressed={active}
              className={cn(
                "flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--sf-1)]"
              )}
            >
              {/* Renk örneği — dört ton, temanın kendi sırası */}
              <span className="flex shrink-0 overflow-hidden rounded-lg border border-border">
                {meta.swatch.map((c) => (
                  <span
                    key={c}
                    className="h-7 w-4"
                    style={{ backgroundColor: c }}
                  />
                ))}
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    "block text-sm",
                    active ? "font-semibold text-foreground" : "text-muted-foreground"
                  )}
                >
                  {meta.name}
                </span>
                <span className="block text-[11px] text-muted-foreground/70">
                  {meta.hint}
                </span>
              </span>
              {active && <Check className="h-4 w-4 shrink-0 text-primary" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
