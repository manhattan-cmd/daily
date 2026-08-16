"use client";

import { useState } from "react";
import { Plus, Settings2, X } from "lucide-react";
import { ModAtomCore, modAtomIcon } from "@/components/structure/mod-atom";
import { formatDTRDisplay } from "@/components/forms/datetime-range-input";
import { ModInput } from "@/components/calendar/day-entry-sheet";
import { SymbolIcon } from "@/lib/icons";
import type { CategoryModifierWithType } from "@/lib/db/queries";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

/** Kapalı atomun altında görünen değer — girilmişse ne girildiği okunuyor */
function displayOf(mod: CategoryModifierWithType, value: string): string {
  if (!value) return "";
  const vt = mod.entryType.valueType ?? "number";
  if (vt === "boolean") return value === "true" ? "✓" : "—";
  if (vt === "datetime-range") return formatDTRDisplay(value);
  return mod.entryType.unit ? `${value} ${mod.entryType.unit}` : value;
}

/**
 * EKLEME YÜZEYİ — uygulamanın en çok dokunulacak yeri.
 *
 * Tek kural: nereden gelirsen gel (hızlı ekle şeridi, listeden yaprak,
 * "buraya ekle") aynı pencere açılıyor. Önceden üç ayrı yüzey vardı —
 * kimi yerde iki düğmeli bir modül, kimi yerde doğrudan uzun form — ve
 * aynı işi yapmanın yolu bulunduğun yere göre değişiyordu.
 *
 * Pencerenin asli eylemi TEK: "Ekle". Değer girmek ZORUNLU değil, çünkü
 * "koştum" demek için ölçü şart değil; ama ölçüler de bir tık uzakta
 * durmalı, yoksa hiç girilmiyor. Çözüm: kalemin özellikleri burada birer
 * ATOM olarak duruyor (uygulamanın şekil dili: daire = özellik), dokununca
 * altında değer alanı açılıyor. Girilen değer atomun altında yazılı
 * kalıyor, yani pencere kapanmadan ne kaydedileceği görünüyor.
 *
 * Not, zaman ve paralel perspektifler gibi seyrek işler burada değil:
 * başlıktaki düğme uzun forma götürüyor.
 */
export function AddEntryPanel({
  name,
  icon,
  color,
  path,
  mods,
  valueOf,
  onChange,
  onSave,
  saving,
  onDetail,
  onClose,
  entryDate,
}: {
  name: string;
  icon?: string;
  color: string;
  /** "Spor › Koşu" — aynı adı taşıyan iki kalemi ayırt ettiriyor */
  path: string;
  mods: CategoryModifierWithType[];
  valueOf: (m: CategoryModifierWithType) => string;
  onChange: (m: CategoryModifierWithType, v: string) => void;
  onSave: () => void;
  saving: boolean;
  /** Uzun form — not, zaman, paralel perspektifler */
  onDetail: () => void;
  onClose: () => void;
  entryDate: string;
}) {
  const t = useT();
  // Açık atomlar. Değer girilmiş olan kendiliğinden açık başlıyor ki
  // kullanıcı girdiğini düzeltmek için aramak zorunda kalmasın.
  const [open, setOpen] = useState<Set<string>>(
    () => new Set(mods.filter((m) => valueOf(m)).map((m) => m.id))
  );
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="flex flex-col">
      <div className="flex shrink-0 items-start gap-3 px-5 pb-4 pt-1">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
          style={{
            backgroundColor: color,
            boxShadow:
              "inset 0 1px 0 rgba(255,255,255,0.25), inset 0 0 0 1px rgba(0,0,0,0.14)",
          }}
        >
          <SymbolIcon name={icon} size={22} style={{ color: "#fff" }} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-lg font-semibold leading-7">{name}</div>
          <div className="truncate text-xs leading-5 text-muted-foreground">
            {path}
          </div>
        </div>
        <button
          onClick={onDetail}
          aria-label={t("entry.addWithDetail")}
          title={t("entry.addWithDetail")}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/6 text-muted-foreground transition-colors hover:text-foreground"
        >
          <Settings2 className="h-4 w-4" />
        </button>
        <button
          onClick={onClose}
          aria-label={t("action.close")}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/6 text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="min-h-0 overflow-y-auto overscroll-contain px-5">
        {mods.length > 0 ? (
          <>
            {/* Atom sırası — dokun, altında değeri gir */}
            <div className="flex flex-wrap gap-x-4 gap-y-3">
              {mods.map((m) => {
                const value = valueOf(m);
                const isOpen = open.has(m.id);
                const label = m.name ?? m.entryType.name;
                const shown = displayOf(m, value);
                return (
                  <button
                    key={m.id}
                    onClick={() => toggle(m.id)}
                    aria-pressed={isOpen}
                    className="flex w-[68px] flex-col items-center gap-1 text-center"
                  >
                    <span
                      className={cn(
                        "rounded-full transition-shadow",
                        isOpen && "ring-2 ring-offset-2 ring-offset-background"
                      )}
                      style={
                        isOpen
                          ? ({ "--tw-ring-color": color } as React.CSSProperties)
                          : undefined
                      }
                    >
                      <ModAtomCore icon={modAtomIcon(m)} size="sm" />
                    </span>
                    <span
                      className={cn(
                        "w-full truncate text-[11px] leading-4",
                        value ? "font-semibold text-foreground" : "text-muted-foreground"
                      )}
                    >
                      {label}
                    </span>
                    {shown && (
                      <span
                        className="w-full truncate text-[10px] font-semibold leading-4"
                        style={{ color }}
                      >
                        {shown}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Açılan alanlar — atomların altında, sırayla */}
            {mods.some((m) => open.has(m.id)) && (
              <div className="mt-4 flex flex-col gap-4 border-t border-white/8 pt-4">
                {mods
                  .filter((m) => open.has(m.id))
                  .map((m) => (
                    <ModInput
                      key={m.id}
                      mod={m}
                      value={valueOf(m)}
                      onChange={(v) => onChange(m, v)}
                      entryDate={entryDate}
                    />
                  ))}
              </div>
            )}
          </>
        ) : (
          <p className="py-2 text-sm leading-5 text-muted-foreground">
            {t("entry.noFeaturesYet")}
          </p>
        )}
      </div>

      <div className="shrink-0 px-5 pb-6 pt-4">
        <button
          onClick={onSave}
          disabled={saving}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl text-[15px] font-semibold text-white transition-opacity active:opacity-85 disabled:opacity-60"
          style={{ backgroundColor: color }}
        >
          <Plus className="h-4 w-4" strokeWidth={2.5} />
          {t("entry.addNow")}
        </button>
      </div>
    </div>
  );
}
