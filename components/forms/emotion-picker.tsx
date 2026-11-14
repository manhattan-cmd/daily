"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import {
  EMOTION_GRID,
  EMOTION_QUADRANTS,
  EmotionFace,
  emotionLook,
  emotionName,
  type EmotionQuadrant,
} from "@/lib/icons/emotions";
import { HScroll } from "@/components/ui/h-scroll";
import { FIELD_TONES, type FieldTone } from "@/components/forms/field-tone";
import { packChoiceLevel, splitChoiceLevel } from "@/lib/choice-level";

/** Çeyreğin ızgaradaki hücreleri: üst çeyrekler 0–2. satırlar, sol çeyrekler 0–1. sütunlar */
function quadrantCells(q: EmotionQuadrant): string[] {
  const rows = q === "tense" || q === "lively" ? [0, 1, 2] : [3, 4, 5];
  const cols = q === "tense" || q === "low" ? [0, 1] : [2, 3];
  return rows.flatMap((r) => cols.map((c) => EMOTION_GRID[r][c]));
}

/**
 * Duygu seçici — duygu haritasından çok seçimli işaretleme.
 *
 * Izgara bir HARİTA: sol yarı hoş olmayan, sağ yarı hoş duygular; üst yarı
 * yüksek, alt yarı düşük enerji (bkz. lib/icons/emotions). Dört çeyrek
 * arasında boşluk var ve her çeyrek kendi renginde: kırmızı gergin, sarı
 * canlı, mavi durgun, yeşil dingin. "Nasıl hissediyorum?" sorusu önce
 * "hangi köşedeyim?"e iniyor, sonra o köşenin altı adından biri seçiliyor
 * (Yale'in Mood Meter'ı aynı iki adımı kullanıyor). Eskiden 16 duygu iyi
 * ve kötü diye iki yarıya dizilmişti, sıranın bir anlamı yoktu.
 *
 * Kullanıcının listeye eklediği (haritada yeri olmayan) duygular haritanın
 * altında ayrı bir satırda; haritadan çıkardığı duygunun yeri boş kalmıyor,
 * çeyreğin geri kalanı kayıyor.
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

  /** Haritanın çeyrekleri (yalnız listede olanlar) + haritada yeri olmayanlar */
  const { quadrants, others } = useMemo(() => {
    const offered = new Set(choices);
    const onMap = new Set(EMOTION_GRID.flat());
    return {
      quadrants: EMOTION_QUADRANTS.map((q) => ({
        q,
        cells: quadrantCells(q).filter((c) => offered.has(c)),
      })),
      others: choices.filter((c) => !onMap.has(c)),
    };
  }, [choices]);

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

  // Şerit yalnız ızgara kendi içinde kayıyorsa: ızgaranın tamamı görünürken
  // seçilenler zaten orada işaretli, şerit aynı bilgiyi tekrar edip pencereyi
  // uzatıyordu (ruh hali penceresinde ızgara kaydırmadan görünmüyordu).
  const gridRef = useRef<HTMLDivElement>(null);
  const [gridScrolls, setGridScrolls] = useState(false);
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() =>
      setGridScrolls(el.scrollHeight > el.clientHeight + 1)
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const cell = (c: string) => {
    const look = emotionLook(c);
    const on = picked.has(c);
    return (
      <button
        key={c}
        type="button"
        onClick={() => toggle(c)}
        aria-pressed={on}
        data-emotion={c}
        className={cn(
          "flex min-w-0 flex-col items-center gap-1 rounded-xl border px-1 pb-1 pt-1.5 transition-colors",
          !on && skin.choiceOff
        )}
        style={
          on
            ? {
                borderColor: look.color,
                background: `${look.color}4d`,
                boxShadow: `inset 0 0 0 1px ${look.color}`,
              }
            : undefined
        }
      >
        <EmotionFace name={c} size={24} />
        <span
          className={cn(
            "w-full truncate text-center text-[10px] leading-3",
            on ? "font-bold text-foreground" : "font-medium"
          )}
        >
          {emotionName(c, t)}
        </span>
      </button>
    );
  };

  return (
    <>
      {/* Seçilenler şeridi — pencerenin en üstü */}
      {gridScrolls && selected.length > 0 && (
        <div className="px-4 pt-2.5">
          <HScroll className="gap-1.5">
            {selected.map((c) => {
              const look = emotionLook(c);
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => toggle(c)}
                  aria-label={t("mood.removeEmotion", { name: emotionName(c, t) })}
                  className="flex shrink-0 items-center rounded-full border p-0.5 transition-transform active:scale-95"
                  style={{
                    borderColor: `${look.color}80`,
                    background: `${look.color}26`,
                  }}
                >
                  <EmotionFace name={c} size={20} />
                </button>
              );
            })}
          </HScroll>
        </div>
      )}

      {/* overscroll-contain YOK: ızgara kaymıyorken bile kaydırmayı yutuyor,
          parmak duygular kutusunun üstündeyken pencere kaydırılamıyordu. */}
      <div
        ref={gridRef}
        data-emotion-grid=""
        className="no-scrollbar overflow-y-auto px-4 pb-3 pt-2"
        style={{ maxHeight: gridHeight }}
      >
        {/* Harita: 2×2 çeyrek, çeyrekler arası geniş, içi sık */}
        <div className="grid grid-cols-2 gap-x-2.5 gap-y-2.5">
          {quadrants.map(({ q, cells }) =>
            cells.length > 0 ? (
              <div key={q} data-quadrant={q} className="grid grid-cols-2 content-start gap-1.5">
                {cells.map(cell)}
              </div>
            ) : (
              <div key={q} aria-hidden />
            )
          )}
        </div>
        {others.length > 0 && (
          <div className="mt-2.5 grid grid-cols-4 gap-1.5">{others.map(cell)}</div>
        )}
      </div>
    </>
  );
}
