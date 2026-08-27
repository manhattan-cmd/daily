import type { ReactNode } from "react";

/**
 * Duygu yüzleri — ruh hali akışının kendi sembol ailesi.
 *
 * Neden ayrı bir dosya: bunlar kullanıcının seçtiği semboller değil, yerleşik
 * duygu listesinin sabit karşılıkları. `vocabulary.ts`e konsalardı sözlük 16
 * birbirine benzeyen yüzle şişer, kategori sembolü seçicisi okunmaz olurdu.
 * Çizim dili set-1 ile aynı (bkz. lib/icons/sets/set-1.tsx):
 *   dolu kütle · currentColor · 24×24 · en ince kütle 2,6px · en dar boşluk
 *   1,8px · yalnız geometrik parçalar · delik dış şeklin İÇİNDE.
 *
 * Yüzün tamamı TEK yol: disk + gözler/kaşlar/ağız `fill-rule="evenodd"` ile
 * delik. Emoji yerine bunlar çiziliyor çünkü emoji her cihazda başka görünüyor
 * ve kendi rengini dayatıyor — burada rengi duygunun kendisi veriyor.
 *
 * Geometri elle değil hesapla kuruluyor: 16 yüzü elde koordinatla yazmak hem
 * aileyi bozuyor hem de kaş/göz boşluğunu 1,8px'in altına düşürüyordu.
 */

const f = (n: number) => Math.round(n * 100) / 100;
const rad = (deg: number) => (deg * Math.PI) / 180;

/** Yüzün diski — bütün ailenin ortak gövdesi */
const DISC = "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z";

/** Daire delik — göz, ağız */
const dot = (cx: number, cy: number, r: number) =>
  `M${f(cx - r)} ${f(cy)}a${f(r)} ${f(r)} 0 1 0 ${f(r * 2)} 0 ${f(r)} ${f(r)} 0 1 0 ${f(-r * 2)} 0Z`;

/** Yuvarlak uçlu eğik çubuk — kaş, kapalı göz, düz ağız */
const bar = (x1: number, y1: number, x2: number, y2: number, w: number) => {
  const len = Math.hypot(x2 - x1, y2 - y1) || 1;
  const h = w / 2;
  const nx = (-(y2 - y1) / len) * h;
  const ny = ((x2 - x1) / len) * h;
  return (
    `M${f(x1 - nx)} ${f(y1 - ny)}` +
    `A${f(h)} ${f(h)} 0 0 0 ${f(x1 + nx)} ${f(y1 + ny)}` +
    `L${f(x2 + nx)} ${f(y2 + ny)}` +
    `A${f(h)} ${f(h)} 0 0 0 ${f(x2 - nx)} ${f(y2 - ny)}Z`
  );
};

/** Yay şeridi — gülümseme, asık ağız. Açılar derece, 0 sağ, 90 aşağı. */
const arcBand = (
  cx: number,
  cy: number,
  r: number,
  w: number,
  a0: number,
  a1: number
) => {
  const ro = r + w / 2;
  const ri = r - w / 2;
  const p = (a: number, rr: number) =>
    `${f(cx + rr * Math.cos(rad(a)))} ${f(cy + rr * Math.sin(rad(a)))}`;
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  const sweep = a1 > a0 ? 1 : 0;
  return (
    `M${p(a0, ro)}A${f(ro)} ${f(ro)} 0 ${large} ${sweep} ${p(a1, ro)}` +
    `L${p(a1, ri)}A${f(ri)} ${f(ri)} 0 ${large} ${1 - sweep} ${p(a0, ri)}Z`
  );
};

/** Yarım disk — kocaman açık ağız, kapalı "mutlu" göz */
const halfDisc = (cx: number, cy: number, r: number, down: boolean) =>
  `M${f(cx - r)} ${f(cy)}a${f(r)} ${f(r)} 0 0 ${down ? 0 : 1} ${f(r * 2)} 0Z`;

// ── Gözler ────────────────────────────────────────────────────────────────
// Kaş kullanan yüzlerde gözler 11,8'e iner: kaşın alt kenarıyla arada 1,8px
// kalsın diye. Kaşsız yüzlerde göz 10,4–10,9 arasında, ağza yer açar.
const eyesRound = (r: number, y: number) => dot(9, y, r) + dot(15, y, r);
const eyesOpen = eyesRound(1.5, 10.4);
const eyesUnder = eyesRound(1.4, 11.8);
const eyesWide = eyesRound(1.95, 10.2);
const eyesSmall = (y = 11.6) => eyesRound(1.1, y);
/** Kapalı göz — yatay çubuk */
const eyesShut = bar(7.4, 10.9, 10.6, 10.9, 2) + bar(13.4, 10.9, 16.6, 10.9, 2);
/** Gülen kapalı göz — yukarı kabaran yarım disk */
const eyesArch = halfDisc(9, 11.9, 2.2, false) + halfDisc(15, 11.9, 2.2, false);

// ── Kaşlar ────────────────────────────────────────────────────────────────
/** Öfke: iç uçlar aşağı */
const browAngry = bar(6.7, 6, 10.3, 7.7, 1.9) + bar(17.3, 6, 13.7, 7.7, 1.9);
/** Kaygı/üzüntü: iç uçlar yukarı */
const browWorry = bar(6.7, 7.7, 10.3, 6.1, 1.9) + bar(17.3, 7.7, 13.7, 6.1, 1.9);
/** Kararlılık: düz */
const browFlat = bar(6.8, 7.5, 10.2, 7.5, 1.9) + bar(17.2, 7.5, 13.8, 7.5, 1.9);
/** Umut: düz ama yukarıda ve kısa — "kaşlar kalkmış" */
const browRaised = bar(7.2, 6.9, 10, 6.9, 1.8) + bar(16.8, 6.9, 14, 6.9, 1.8);

// ── Ağızlar ───────────────────────────────────────────────────────────────
const mouthGrin = halfDisc(12, 14, 5, true);
const mouthSmile = arcBand(12, 12.6, 4.4, 1.9, 32, 148);
const mouthSmileSm = arcBand(12, 13.4, 3.4, 1.9, 34, 146);
const mouthFlat = bar(8.6, 16.4, 15.4, 16.4, 2);
const mouthFrown = arcBand(12, 20.4, 4.4, 1.9, -148, -32);
const mouthFrownSm = arcBand(12, 19.6, 3.4, 1.9, -146, -34);
const mouthO = dot(12, 16.8, 1.7);
const mouthOWide = dot(12, 16.4, 2.5);
/** Yamuk ağız — kendine güven, bıkkınlık */
const mouthSmirk = bar(8.8, 17, 15.2, 15.4, 2);
/** Sıkılmış ağız — geniş ve alçak düz çubuk */
const mouthGrit = bar(8, 16.6, 16, 16.6, 2.4);

/** Gözyaşı — diskin İÇİNDE kalan damla (kural: delik dışa taşmaz) */
const tear =
  "M6.6 13.4c1.45 1.7 1.45 2.15 1.45 2.5a1.45 1.45 0 0 1-2.9 0c0-.35 0-.8 1.45-2.5Z";

const glyph = (...parts: string[]) => (
  <path fillRule="evenodd" clipRule="evenodd" d={DISC + parts.join("")} />
);

/**
 * Duygu → yüz + renk. Anahtarlar yerleşik listedeki adlar (MOOD_EMOTIONS).
 * Renk yüzü tek başına ayırt etmeye yetmez, ayırt eden çift: biçim + renk;
 * ızgarada her ikisinin altında adı da yazıyor.
 */
export interface EmotionLook {
  glyph: ReactNode;
  color: string;
}

export const EMOTION_LOOKS: Record<string, EmotionLook> = {
  Happy: { glyph: glyph(eyesOpen, mouthGrin), color: "#fbbf24" },
  Calm: { glyph: glyph(eyesShut, mouthSmileSm), color: "#7dd3fc" },
  Grateful: { glyph: glyph(eyesShut, mouthSmile), color: "#a3e635" },
  Excited: { glyph: glyph(eyesWide, mouthOWide), color: "#fb923c" },
  Confident: { glyph: glyph(eyesOpen, mouthSmirk), color: "#34d399" },
  Loved: { glyph: glyph(eyesArch, mouthGrin), color: "#fb7185" },
  Hopeful: { glyph: glyph(browRaised, eyesRound(1.4, 11.4), mouthSmileSm), color: "#22d3ee" },
  Focused: { glyph: glyph(browFlat, eyesSmall(), mouthFlat), color: "#818cf8" },
  Tired: { glyph: glyph(eyesShut, mouthFrownSm), color: "#94a3b8" },
  Stressed: { glyph: glyph(browWorry, eyesSmall(11.8), mouthGrit), color: "#f87171" },
  Anxious: { glyph: glyph(browWorry, eyesUnder, mouthO), color: "#c084fc" },
  Sad: { glyph: glyph(browWorry, eyesUnder, mouthFrown), color: "#60a5fa" },
  Angry: { glyph: glyph(browAngry, eyesUnder, mouthFrown), color: "#ef4444" },
  Lonely: { glyph: glyph(eyesSmall(10.9), mouthFrownSm, tear), color: "#a78bfa" },
  Bored: { glyph: glyph(eyesShut, mouthSmirk), color: "#a1a1aa" },
  Frustrated: { glyph: glyph(browAngry, eyesShut, mouthOWide), color: "#e11d48" },
};

/** Listeyi kullanıcı değiştirirse (seçenekleri düzenlemek serbest) tanımadığımız
 *  duygu yüzsüz kalmasın — nötr yüz ve sönük renk. */
export const EMOTION_FALLBACK: EmotionLook = {
  glyph: glyph(eyesOpen, mouthFlat),
  color: "#a1a1aa",
};

export const emotionLook = (name: string): EmotionLook =>
  EMOTION_LOOKS[name] ?? EMOTION_FALLBACK;

/**
 * Mutluluk skalasının basamak yüzleri — en düşükten en yükseğe. Skala
 * kaç basamaklıysa dizi ona göre örneklenir (bkz. scaleFace).
 * Duygularla aynı ailede: skala emoji, duygular çizim olsaydı pencere iki
 * ayrı dilde konuşuyor olurdu.
 */
export const SCALE_FACES: ReactNode[] = [
  glyph(browWorry, eyesUnder, mouthFrown),
  glyph(eyesShut, mouthFrownSm),
  glyph(eyesOpen, mouthFlat),
  glyph(eyesOpen, mouthSmileSm),
  glyph(eyesOpen, mouthGrin),
];

/** Basamağı 5'lik yüz dizisine oturtur — 3, 5 ya da 10 basamaklı skala olsun */
export function scaleFace(index: number, total: number): ReactNode {
  if (total <= 1) return SCALE_FACES[2];
  const pos = (index / (total - 1)) * (SCALE_FACES.length - 1);
  return SCALE_FACES[Math.round(pos)];
}

/** Skala basamağının yüzü — currentColor ile boyanır */
export function ScaleFace({
  index,
  total,
  size = 24,
  className,
  style,
}: {
  index: number;
  total: number;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      style={{ width: size, height: size, ...style }}
      aria-hidden="true"
    >
      {scaleFace(index, total)}
    </svg>
  );
}

/** Tek duygu yüzü. Renk currentColor'dan gelir — çağıran boyar. */
export function EmotionFace({
  name,
  size = 24,
  className,
  style,
}: {
  name: string;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      style={{ width: size, height: size, ...style }}
      aria-hidden="true"
    >
      {emotionLook(name).glyph}
    </svg>
  );
}
