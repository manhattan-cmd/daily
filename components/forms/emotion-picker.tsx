"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { EmotionFace, emotionLook } from "@/lib/icons/emotions";
import { HScroll } from "@/components/ui/h-scroll";
import { FIELD_TONES, type FieldTone } from "@/components/forms/field-tone";
import { packChoiceLevel, splitChoiceLevel } from "@/lib/choice-level";

/**
 * Duygu seçici — ızgaradan çok seçimli işaretleme.
 *
 * Bir de yoğunluk (0–100) katmanı vardı: seçilen duygunun üstünde küçük bir
 * balonda çubuk açılıyordu. Dört tasarım turundan sonra fikirden şimdilik
 * vazgeçildi; çubuk formu ağırlaştırıyordu. Geri getirilecekse çalışan hali
 * `d78bb8f` etiketli commit'te duruyor (balon konumlandırma + LevelBar).
 *
 * KAYITLI YOĞUNLUKLAR SİLİNMİYOR. Değer biçimi hâlâ "Happy" ya da "Happy|70"
 * (bkz. lib/choice-level): daha önce yoğunlukla kaydedilmiş bir duygu
 * dokunulmadığı sürece yoğunluğunu koruyor, yeni seçimler yalnız etiket
 * yazıyor. Böylece özellik geri geldiğinde eski kayıtlar yerinde olacak.
 *
 * Pencerenin en üstündeki şerit seçilenlerin tamamını gösteriyor: ızgara
 * kaydırıldığında ne seçtiğin gözden kaybolmasın diye. Şeritteki bir yüze
 * dokunmak o duyguyu listeden çıkarır.
 */
export function EmotionPicker({
  choices,
  values,
  onChange,
  tone = "mood",
  gridHeight = 208,
}: {
  choices: string[];
  values: string[];
  onChange: (values: string[]) => void;
  tone?: FieldTone;
  /** Izgaranın en fazla kaç piksel yer kaplayacağı. Pencereye göre değişir:
   *  ekleme penceresinde kaydet düğmesiyle paylaşıyor, düzenleme penceresinde
   *  daha çok yer var. Bir satırı yarıda kesen bir değer seçilmeli ki
   *  kaydırılabildiği görülsün. */
  gridHeight?: number;
}) {
  const t = useT();
  const skin = FIELD_TONES[tone];

  /** Seçilenler: etiket → kayıtlı yoğunluk (yoksa null; artık ayarlanmıyor) */
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

  function toggle(label: string) {
    const next = new Map(picked);
    if (next.has(label)) next.delete(label);
    else next.set(label, null);
    emit(next);
  }

  /** Şeritteki sıra ızgaranın sırası — seçim şeridi yeniden dizmesin */
  const selected = [
    ...choices.filter((c) => picked.has(c)),
    ...[...picked.keys()].filter((k) => !choices.includes(k)),
  ];

  return (
    <>
      {/* Seçilenler şeridi — pencerenin en üstü */}
      {selected.length > 0 && (
        <div className="px-4 pt-2.5">
          <HScroll className="gap-1.5">
            {selected.map((c) => {
              const look = emotionLook(c);
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => toggle(c)}
                  aria-label={t("mood.removeEmotion", { name: c })}
                  className="flex shrink-0 items-center rounded-full border p-1 transition-transform active:scale-95"
                  style={{
                    borderColor: `${look.color}59`,
                    background: `${look.color}1c`,
                  }}
                >
                  <EmotionFace name={c} size={16} style={{ color: look.color }} />
                </button>
              );
            })}
          </HScroll>
        </div>
      )}

      <div
        className="no-scrollbar overflow-y-auto overscroll-contain px-4 pb-3 pt-2.5"
        style={{ maxHeight: gridHeight }}
      >
        <div className="grid grid-cols-4 gap-2">
          {choices.map((c) => {
            const look = emotionLook(c);
            const on = picked.has(c);
            return (
              <button
                key={c}
                type="button"
                onClick={() => toggle(c)}
                aria-pressed={on}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-xl border px-1.5 pb-2 pt-2 transition-colors",
                  !on && skin.choiceOff
                )}
                style={
                  on
                    ? {
                        borderColor: `${look.color}80`,
                        background: `${look.color}24`,
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
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
