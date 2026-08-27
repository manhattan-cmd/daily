"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { EmotionFace, emotionLook } from "@/lib/icons/emotions";
import { LevelBar } from "@/components/forms/level-bar";
import { HScroll } from "@/components/ui/h-scroll";
import { FIELD_TONES, type FieldTone } from "@/components/forms/field-tone";
import {
  LEVEL_DEFAULT,
  LEVEL_MAX,
  packChoiceLevel,
  splitChoiceLevel,
} from "@/lib/choice-level";

/** Açılır ayar balonunun ölçüleri — konum hesabı sabit boy istiyor */
const POP_W = 178;
const POP_H = 58;
/** Balon ile kutucuk arasındaki pay */
const POP_GAP = 6;

/**
 * Duygu seçici — ızgara + dokunulan kutucuğun üstünde açılan küçük ayar balonu.
 *
 * Dört tasarım turu oldu, üçü gerçek kullanımda düştü:
 *   1. Seçilen kutucuk bulunduğu yerde tam satıra açılıyordu — birkaç duygu
 *      seçilince ızgara çubuklarla bölünüp okunmaz oluyordu.
 *   2. Çubuklar ızgaranın altında liste halinde toplanıyordu — ayarlanan duygu
 *      ile kutucuğu arasındaki bağ koptu, liste de seçim arttıkça uzadı.
 *   3. Tek bir ayar penceresi ızgaranın üstünde duruyordu — bağ yine uzaktı ve
 *      kocaman duruyordu.
 * Şimdi: çubuk, dokunulan kutucuğun hemen üstünde küçük bir balonda ve
 * ızgaranın ÖNÜNDE açılıyor. Göz kutucuktan ayrılmıyor, ızgara hiç bölünmüyor.
 * İlk satırda balon pencerenin dışına taşacağı için kutucuğun ALTINDA açılır.
 *
 * Ayarlanan ölçü kutucuğun kendi üstünde ince bir çubuk olarak kalıyor, yani
 * balon kapandıktan sonra da "hangi duygu, ne kadar" tek bakışta okunuyor.
 * Pencerenin en üstündeki şerit seçilenlerin tamamını gösteriyor: ızgara
 * kaydırıldığında ne seçtiğin gözden kaybolmasın diye.
 *
 * Dokunma kuralları: seçili olmayana dokunmak seçer ve balonunu açar; seçili
 * olana dokunmak balonunu açar (yeniden ayarlamak için), açıkken dokunmak
 * kapatır. Balondaki yeşil onay kapatır, × seçimi kaldırır — kutucuğa tekrar
 * dokunmak silseydi ayarlamak için dokunmak da tehlikeli olurdu.
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
  /** Ayar balonu açık olan duygu */
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

  /** Şeritteki sıra ızgaranın sırası — seçim şeridi yeniden dizmesin */
  const selected = [
    ...choices.filter((c) => picked.has(c)),
    ...[...picked.keys()].filter((k) => !choices.includes(k)),
  ];

  // ── Balonun konumu ────────────────────────────────────────────────────
  const anchorRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const tileRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [pop, setPop] = useState<{ left: number; top: number } | null>(null);

  const place = useCallback(() => {
    const host = anchorRef.current;
    const tile = active ? tileRefs.current[active] : null;
    if (!host || !tile) {
      setPop(null);
      return;
    }
    const h = host.getBoundingClientRect();
    const b = tile.getBoundingClientRect();
    const left = Math.min(
      Math.max(b.left - h.left + b.width / 2 - POP_W / 2, 4),
      Math.max(4, h.width - POP_W - 4)
    );
    // Üstte yer yoksa (ilk satır) balon kutucuğun altına düşer
    const above = b.top - h.top - POP_H - POP_GAP;
    const top = above >= 0 ? above : b.bottom - h.top + POP_GAP;
    setPop({ left, top });
  }, [active]);

  useLayoutEffect(place, [place, values]);

  // Izgara kaydırılınca balon kutucuğuyla birlikte gitmeli; pencere yeniden
  // ölçülünce de (klavye, dönme) konum tazelenir
  useEffect(() => {
    if (!active) return;
    const el = scrollRef.current;
    el?.addEventListener("scroll", place, { passive: true });
    window.addEventListener("resize", place);
    return () => {
      el?.removeEventListener("scroll", place);
      window.removeEventListener("resize", place);
    };
  }, [active, place]);

  // Şeritten bir duyguya dokunulduğunda kutucuğu görünür değilse ızgara ona
  // kayar — yoksa balon boşlukta açılmış gibi görünüyordu
  useEffect(() => {
    if (!active) return;
    tileRefs.current[active]?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const activeLook = active ? emotionLook(active) : null;
  const activeLevel = active ? (picked.get(active) ?? LEVEL_DEFAULT) : 0;

  return (
    <>
      {/* Seçilenler şeridi — pencerenin en üstü */}
      {selected.length > 0 && (
        <div className="px-4 pt-2.5">
          <HScroll className="gap-1.5">
            {selected.map((c) => {
              const look = emotionLook(c);
              const level = picked.get(c) ?? LEVEL_DEFAULT;
              const on = active === c;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => setActive(on ? null : c)}
                  aria-label={t("mood.intensityOf", { name: c })}
                  className={cn(
                    "flex shrink-0 items-center gap-1 rounded-full border py-1 pl-1.5 pr-2 transition-transform active:scale-95",
                    on && "ring-1 ring-inset"
                  )}
                  style={{
                    borderColor: `${look.color}59`,
                    background: `${look.color}1c`,
                    ...(on
                      ? ({ "--tw-ring-color": look.color } as React.CSSProperties)
                      : {}),
                  }}
                >
                  <EmotionFace name={c} size={16} style={{ color: look.color }} />
                  <span
                    className="text-[10px] font-bold leading-none tabular-nums"
                    style={{ color: look.color }}
                  >
                    {level}
                  </span>
                </button>
              );
            })}
          </HScroll>
        </div>
      )}

      {/* Izgara + önünde açılan balon */}
      <div ref={anchorRef} className="relative">
        <div
          ref={scrollRef}
          className="no-scrollbar overflow-y-auto overscroll-contain px-4 pb-3 pt-2.5"
          style={{ maxHeight: gridHeight }}
        >
          <div className="grid grid-cols-4 gap-2">
            {choices.map((c) => {
              const look = emotionLook(c);
              const on = picked.has(c);
              const level = picked.get(c);
              return (
                <button
                  key={c}
                  ref={(el) => {
                    tileRefs.current[c] = el;
                  }}
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
                            ? ({
                                "--tw-ring-color": look.color,
                              } as React.CSSProperties)
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

        {active && activeLook && pop && (
          <div
            className="absolute z-20 rounded-xl border px-2 py-1.5"
            style={{
              left: pop.left,
              top: pop.top,
              width: POP_W,
              height: POP_H,
              borderColor: `${activeLook.color}80`,
              // Izgaranın ÖNÜNDE duruyor: altındaki kutucuklar okunmasın diye
              // zemin donuk
              background: "#14151c",
              boxShadow: `0 8px 24px rgba(0,0,0,0.55), inset 0 0 0 1px ${activeLook.color}26`,
            }}
          >
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => remove(active)}
                aria-label={t("mood.removeEmotion", { name: active })}
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-white/10 hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
              <span className="flex-1 truncate text-[10px] font-semibold text-muted-foreground">
                {active}
              </span>
              <span
                className="shrink-0 text-[12px] font-bold leading-none tabular-nums"
                style={{ color: activeLook.color }}
              >
                {activeLevel}
              </span>
              <button
                type="button"
                onClick={() => setActive(null)}
                aria-label={t("action.done")}
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-emerald-500/15 text-emerald-400 transition-colors hover:bg-emerald-500/25 active:scale-95"
              >
                <Check className="h-3 w-3" strokeWidth={2.5} />
              </button>
            </div>
            <LevelBar
              size="sm"
              value={activeLevel}
              onChange={(v) => setLevel(active, v)}
              color={activeLook.color}
              label={t("mood.intensityOf", { name: active })}
            />
          </div>
        )}
      </div>
    </>
  );
}
