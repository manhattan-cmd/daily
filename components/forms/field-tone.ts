/**
 * Alan pencerelerinin rengi.
 *
 * Uyku akışının her yüzeyi mor (kart, sayfa başlığı, kaydet düğmesi); aralık ve
 * kalite pencereleri tek başına nötr kalınca yamalı duruyordu. Ton bir sınıf
 * demeti: pencereyi kuran bileşen hangi parçaya hangi sınıfın gideceğini bilir,
 * çağıran yalnız "hangi akış" der.
 */
export type FieldTone = "default" | "sleep";

export interface FieldToneSkin {
  /** Pencerenin dış kabuğu — kenarlık + zemin */
  shell: string;
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

export const FIELD_TONES: Record<FieldTone, FieldToneSkin> = {
  default: {
    shell: "border-border bg-card",
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
  sleep: {
    shell: "border-violet-500/25 bg-violet-500/[0.07]",
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
