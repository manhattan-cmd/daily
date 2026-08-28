/**
 * Alan pencerelerinin rengi.
 *
 * Uyku akışının her yüzeyi mor (kart, sayfa başlığı, kaydet düğmesi); aralık ve
 * kalite pencereleri tek başına nötr kalınca yamalı duruyordu. Ton bir sınıf
 * demeti: pencereyi kuran bileşen hangi parçaya hangi sınıfın gideceğini bilir,
 * çağıran yalnız "hangi akış" der.
 */
export type FieldTone = "default" | "sleep" | "mood";

export interface FieldToneSkin {
  /**
   * Pencerenin dış kabuğu — YALNIZ zemin sınıfı.
   *
   * Kenarlık rengi sınıfla verilemiyor: globals.css'teki
   * `* { border-color: var(--border) }` katmansız bir kural ve Tailwind'in
   * katmanlı `border-*` yardımcılarını eziyor. Yazılan renk hiç uygulanmıyor,
   * pencere varsayılan gri çerçeveyle çiziliyordu. Bu yüzden kenarlık
   * renkleri aşağıda ham CSS rengi olarak duruyor ve satır içi stille
   * veriliyor.
   */
  shell: string;
  /** Kabuğun kenarlık rengi — satır içi stile gider */
  shellBorder: string;
  /** Bölüm ayıran çizginin rengi — satır içi stile gider */
  lineBorder: string;
  /** İçteki dikey ayraç */
  divide: string;
  /** Bölüm ayıran yatay çizgi */
  line: string;
  /** Alt özet şeridinin zemini */
  strip: string;
  /** Özet şeridindeki nokta */
  dot: string;
  /** Seçili tarih kapsülü */
  chipOn: string;
  /** Açık durumdaki saat yazısı */
  open: string;
  /** Çarkın okuma bandı */
  band: string;
  /** Seçili seçenek düğmesi */
  choiceOn: string;
  /** Seçilmemiş seçenek düğmesi */
  choiceOff: string;
  /** Pencere başlığı */
  caption: string;
}

/**
 * Rastgele bir renkten pencere yüzeyleri.
 *
 * Sabit tonlar (uyku moru, ruh hali pembesi) sınıf demeti olarak duruyor. Ama
 * sıradan girdilerde renk KATEGORİDEN geliyor, yani çalışma anında belli
 * oluyor — Tailwind sınıfı üretilemez. Aynı yüzeyler burada ham CSS rengi
 * olarak hesaplanıyor; saydamlıklar sabit tonlarla aynı ağırlıkta seçildi.
 */
export interface ColorSkin {
  shellBg: string;
  shellBorder: string;
  lineBorder: string;
  stripBg: string;
  caption: string;
  dot: string;
  fieldBg: string;
  fieldBorder: string;
}

export function colorSkin(color: string): ColorSkin {
  return {
    shellBg: `${color}12`,
    shellBorder: `${color}59`,
    lineBorder: `${color}33`,
    stripBg: `${color}0d`,
    caption: `${color}cc`,
    dot: `${color}8c`,
    fieldBg: `${color}14`,
    fieldBorder: `${color}33`,
  };
}

export const FIELD_TONES: Record<FieldTone, FieldToneSkin> = {
  default: {
    shell: "bg-card",
    shellBorder: "var(--border)",
    lineBorder: "color-mix(in srgb, var(--border) 60%, transparent)",
    divide: "divide-border",
    line: "border-border/60",
    strip: "bg-muted/10",
    dot: "bg-primary/50",
    chipOn: "bg-primary/90 text-white shadow-sm",
    open: "text-primary",
    band: "bg-primary/10 ring-primary/25",
    choiceOn: "border-primary bg-primary/10 text-primary",
    choiceOff:
      "border-border bg-input text-muted-foreground hover:text-foreground",
    caption: "text-muted-foreground/50",
  },
  mood: {
    shell: "bg-pink-500/[0.07]",
    shellBorder: "rgba(244,114,182,0.40)",
    lineBorder: "rgba(244,114,182,0.22)",
    divide: "divide-pink-500/15",
    line: "border-pink-500/15",
    strip: "bg-pink-500/[0.05]",
    dot: "bg-pink-400/70",
    chipOn: "bg-pink-500/80 text-white shadow-sm",
    open: "text-pink-300",
    band: "bg-pink-500/12 ring-pink-400/30",
    choiceOn: "border-pink-400 bg-pink-500/25 text-pink-100",
    choiceOff:
      "border-pink-500/15 bg-pink-500/[0.06] text-muted-foreground hover:text-foreground",
    caption: "text-pink-300/50",
  },
  sleep: {
    shell: "bg-violet-500/[0.07]",
    shellBorder: "rgba(139,92,246,0.40)",
    lineBorder: "rgba(139,92,246,0.22)",
    divide: "divide-violet-500/15",
    line: "border-violet-500/15",
    strip: "bg-violet-500/[0.05]",
    dot: "bg-violet-400/70",
    chipOn: "bg-violet-500/80 text-white shadow-sm",
    open: "text-violet-300",
    band: "bg-violet-500/12 ring-violet-400/30",
    choiceOn: "border-violet-400 bg-violet-500/25 text-violet-100",
    choiceOff:
      "border-violet-500/15 bg-violet-500/[0.06] text-muted-foreground hover:text-foreground",
    caption: "text-violet-300/50",
  },
};
