"use client";

import { useMemo, useState } from "react";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { EmotionFace, emotionLook } from "@/lib/icons/emotions";
import { LevelBar } from "@/components/forms/level-bar";
import { FIELD_TONES, type FieldTone } from "@/components/forms/field-tone";
import {
  LEVEL_DEFAULT,
  LEVEL_MAX,
  packChoiceLevel,
  splitChoiceLevel,
} from "@/lib/choice-level";

/**
 * Duygu seçici — ızgara + ızgaranın hemen ÜSTÜNDE açılan ayar penceresi.
 *
 * Üç tasarım turu oldu, ikisi de gerçek kullanımda düştü:
 *   1. Seçilen kutucuk bulunduğu yerde tam satıra açılıyordu — birkaç duygu
 *      seçilince ızgara çubuklarla bölünüp okunmaz oluyordu.
 *   2. Çubuklar ızgaranın altında liste halinde toplanıyordu — ızgara sabit
 *      kaldı ama ayarlanan duygu ile kutucuğu arasındaki bağ koptu, liste de
 *      seçim arttıkça uzayıp pencereyi şişirdi.
 * Şimdi: ayar penceresi ızgaranın üstünde TEK ve sabit yer kaplıyor, hangi
 * duyguya dokunulduysa onu gösteriyor. Ayarlanan ölçü kutucuğun kendi
 * üstünde ince bir çubuk olarak kalıyor, yani ızgaraya bakınca "hangi duygu,
 * ne kadar" tek bakışta okunuyor.
 *
 * Dokunma kuralları: seçili olmayana dokunmak seçer ve penceresini açar;
 * seçili olana dokunmak penceresini açar (yeniden ayarlamak için), açıkken
 * dokunmak pencereyi kapatır. Pencereyi kapatmanın açık yolu çubuğun yanındaki
 * yeşil onay düğmesi — kutucuğa tekrar dokunmayı keşfetmek gerekmiyor. Seçimi
 * kaldırmak × ile; kutucuğa tekrar dokunmak silseydi ayarlamak için dokunmak
 * da tehlikeli olurdu. İki düğme renkle ayrışıyor: yeşil onay, sönük ×.
 *
 * Değer biçimi ham EntryValue biçimiyle aynı: "Happy" ya da "Happy|70"
 * (bkz. lib/choice-level). Böylece hem ekleme hem düzenleme penceresi aynı
 * diziyi doğrudan kaydedebiliyor.
 */
export function EmotionPicker({
  choices,
  values,
  onChange,
  tone = "mood",
}: {
  choices: string[];
  values: string[];
  onChange: (values: string[]) => void;
  tone?: FieldTone;
}) {
  const t = useT();
  const skin = FIELD_TONES[tone];
  /** Ayar penceresi açık olan duygu */
  const [active, setActive] = useState<string | null>(null);

  /** Seçilenler: etiket → yoğunluk (null = eski kayıt, yoğunluksuz) */
  const picked = useMemo(() => {
    const map = new Map<string, number | null>();
    for (const raw of values) {
      const { label, level } = splitChoiceLevel(raw);
      if (label) map.set(label, level);
    }
    return map;
  }, [values]);

  /** Izgara sırasında yaz; listede olmayan (elle/eski) etiketler sona eklenir */
  function emit(next: Map<string, number | null>) {
    const known = choices.filter((c) => next.has(c));
    const unknown = [...next.keys()].filter((k) => !choices.includes(k));
    onChange(
      [...known, ...unknown].map((k) => packChoiceLevel(k, next.get(k) ?? null))
    );
  }

  function tap(label: string) {
    if (!picked.has(label)) {
      const next = new Map(picked);
      next.set(label, LEVEL_DEFAULT);
      emit(next);
      setActive(label);
      return;
    }
    setActive((cur) => (cur === label ? null : label));
  }

  function remove(label: string) {
    const next = new Map(picked);
    next.delete(label);
    emit(next);
    setActive(null);
  }

  function setLevel(label: string, level: number) {
    const next = new Map(picked);
    next.set(label, level);
    emit(next);
  }

  const activeLook = active ? emotionLook(active) : null;
  const activeLevel = active ? (picked.get(active) ?? LEVEL_DEFAULT) : 0;

  return (
    <>
      {/* Ayar penceresi — ızgaranın hemen üstünde, tek yer */}
      {active && activeLook && (
        <div className="px-4 pt-2.5">
          <div
            className="rounded-xl border px-3 py-2"
            style={{
              borderColor: `${activeLook.color}66`,
              background: `${activeLook.color}16`,
            }}
          >
            <div className="flex items-center gap-2">
              <EmotionFace
                name={active}
                size={24}
                style={{ color: activeLook.color }}
              />
              <span className="flex-1 truncate text-[13px] font-semibold">
                {active}
              </span>
              <span
                className="shrink-0 text-[15px] font-bold tabular-nums"
                style={{ color: activeLook.color }}
              >
                {activeLevel}
              </span>
              <button
                type="button"
                onClick={() => remove(active)}
                aria-label={t("mood.removeEmotion", { name: active })}
                className="-mr-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-muted-foreground/60 transition-colors hover:bg-white/10 hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <LevelBar
                value={activeLevel}
                onChange={(v) => setLevel(active, v)}
                color={activeLook.color}
                label={t("mood.intensityOf", { name: active })}
              />
              <button
                type="button"
                onClick={() => setActive(null)}
                aria-label={t("action.done")}
                title={t("action.done")}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400 transition-colors hover:bg-emerald-500/25 hover:text-emerald-300 active:scale-95"
              >
                <Check className="h-4 w-4" strokeWidth={2.5} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Izgara — kendi içinde kaydırılır, seçim onu yeniden dizmez */}
      <div className="no-scrollbar max-h-[208px] overflow-y-auto overscroll-contain px-4 pb-3 pt-2.5">
        <div className="grid grid-cols-4 gap-2">
          {choices.map((c) => {
            const look = emotionLook(c);
            const on = picked.has(c);
            const level = picked.get(c);
            return (
              <button
                key={c}
                type="button"
                onClick={() => tap(c)}
                aria-pressed={on}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-xl border px-1.5 pb-1.5 pt-2 transition-colors",
                  !on && skin.choiceOff,
                  active === c && "ring-1 ring-inset"
                )}
                style={
                  on
                    ? {
                        borderColor: `${look.color}80`,
                        background: `${look.color}24`,
                        ...(active === c
                          ? ({ "--tw-ring-color": look.color } as React.CSSProperties)
                          : {}),
                      }
                    : undefined
                }
              >
                <EmotionFace
                  name={c}
                  size={22}
                  style={{ color: look.color, opacity: on ? 1 : 0.62 }}
                />
                <span
                  className={cn(
                    "w-full truncate text-center text-[9px] font-medium leading-3",
                    on ? "text-foreground" : undefined
                  )}
                >
                  {c}
                </span>
                {/* Ölçü satırı hep var: seçili olmayanda görünmez durur ki
                    seçmek kutucuğun boyunu değiştirip ızgarayı oynatmasın */}
                <span
                  className={cn(
                    "flex w-full items-center gap-1",
                    !on && "invisible"
                  )}
                >
                  <span className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/10">
                    <span
                      className="block h-full rounded-full"
                      style={{
                        width: `${((level ?? LEVEL_DEFAULT) / LEVEL_MAX) * 100}%`,
                        background: look.color,
                      }}
                    />
                  </span>
                  <span
                    className="text-[8px] font-bold leading-none tabular-nums"
                    style={{ color: look.color }}
                  >
                    {level ?? LEVEL_DEFAULT}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
