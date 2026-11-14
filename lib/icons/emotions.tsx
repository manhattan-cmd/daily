import type { MessageKey } from "@/lib/i18n";
import {
  EMOTION_FACES,
  FACE_INK,
  FALLBACK_FACE,
  SCALE_FACE_PARTS,
  SHADE_OPACITY,
  type FaceInk,
  type FacePart,
} from "./emotion-faces";

/**
 * Duygu yüzleri — ruh hali akışının kendi sembol ailesi.
 *
 * Neden ayrı bir dosya: bunlar kullanıcının seçtiği semboller değil, yerleşik
 * duygu listesinin sabit karşılıkları. `vocabulary.ts`e konsalardı sözlük
 * birbirine benzeyen yüzlerle şişer, kategori sembolü seçicisi okunmaz olurdu.
 *
 * Çizim (geometri) `emotion-faces.ts`te — orada çizim dili de yazılı:
 * duygunun renginde disk, mürekkep halka, mürekkep yüz. Burada yalnız renk,
 * yerleşim ve çizen bileşenler var.
 *
 * DUYGU HARİTASI
 * Liste rastgele değil, iki eksenli bir harita (Russell'ın çember modeli;
 * Yale'in Mood Meter'ı ve Apple'ın State of Mind'ı da bunu kullanıyor):
 * yatayda hoş değil → hoş, dikeyde yüksek → düşük enerji. Dört çeyrek,
 * her birinde altı duygu; köşeye yaklaştıkça duygu yoğunlaşıyor (Kızgın
 * sol üst köşede, Kaygılı merkeze yakın).
 *
 * Renk çeyreği söylüyor, ton yoğunluğu: kırmızı = gergin, sarı = canlı,
 * mavi = durgun, yeşil = dingin. Köşedeki duygu koyu, merkeze yakın olan
 * açık. Eskiden 16 duygunun 16 ayrı rengi vardı ve üçü kırmızıydı (Stresli,
 * Kızgın, Bıkkın) — renk bir şey anlatmıyordu.
 */

export type EmotionQuadrant = "tense" | "lively" | "low" | "serene";

/**
 * Izgaradaki yerleşim: 6 satır × 4 sütun. Sol iki sütun hoş değil, sağ iki
 * sütun hoş; üst üç satır yüksek, alt üç satır düşük enerji. Yerleşik
 * listenin (MOOD_EMOTIONS) sırası da bu.
 */
export const EMOTION_GRID: readonly (readonly string[])[] = [
  ["Angry", "Scared", "Motivated", "Excited"],
  ["Overwhelmed", "Stressed", "Proud", "Happy"],
  ["Frustrated", "Anxious", "Focused", "Confident"],
  ["Hurt", "Bored", "Hopeful", "Grateful"],
  ["Sad", "Lonely", "Relieved", "Loved"],
  ["Drained", "Tired", "Content", "Calm"],
];

/** Haritanın dört çeyreği, okuma sırasıyla (sol üst, sağ üst, sol alt, sağ alt) */
export const EMOTION_QUADRANTS: readonly EmotionQuadrant[] = ["tense", "lively", "low", "serene"];

/**
 * Renkler çeyreğin tonundan, köşeye uzaklığa göre koyulaşarak hesaplandı
 * (HSL; dış sütun ile iç sütun arasında küçük bir ton kayması var ki aynı
 * yoğunluktaki iki komşu birbirinin aynısı olmasın). Hesap tasarım
 * önizlemesinde; burada sonucu duruyor — renk hex olmalı, çağıranlar
 * saydamlığı sonuna ekliyor (`${color}40`).
 */
export interface EmotionLook {
  color: string;
  quadrant: EmotionQuadrant | null;
}

const LOOK = (color: string, quadrant: EmotionQuadrant): EmotionLook => ({ color, quadrant });

export const EMOTION_LOOKS: Record<string, EmotionLook> = {
  // Gergin — yüksek enerji, hoş değil
  Angry: LOOK("#ef372a", "tense"),
  Scared: LOOK("#f1465d", "tense"),
  Overwhelmed: LOOK("#f15146", "tense"),
  Stressed: LOOK("#f36276", "tense"),
  Frustrated: LOOK("#f36c62", "tense"),
  Anxious: LOOK("#f57f8f", "tense"),
  // Canlı — yüksek enerji, hoş
  Motivated: LOOK("#fbcd28", "lively"),
  Excited: LOOK("#faac0f", "lively"),
  Proud: LOOK("#fbd23c", "lively"),
  Happy: LOOK("#fbb428", "lively"),
  Focused: LOOK("#fcd755", "lively"),
  Confident: LOOK("#fbbb3c", "lively"),
  // Durgun — düşük enerji, hoş değil
  Hurt: LOOK("#779cf3", "low"),
  Bored: LOOK("#93cbf6", "low"),
  Sad: LOOK("#5f8bf1", "low"),
  Lonely: LOOK("#77bdf3", "low"),
  Drained: LOOK("#487aef", "low"),
  Tired: LOOK("#5fb2f1", "low"),
  // Dingin — düşük enerji, hoş
  Hopeful: LOOK("#79d78c", "serene"),
  Grateful: LOOK("#5ecf9a", "serene"),
  Relieved: LOOK("#5ecf75", "serene"),
  Loved: LOOK("#46c88b", "serene"),
  Content: LOOK("#46c860", "serene"),
  Calm: LOOK("#36b57a", "serene"),
};

/** Listeyi kullanıcı değiştirirse (seçenekleri düzenlemek serbest) tanımadığımız
 *  duygu yüzsüz kalmasın — nötr yüz ve sönük renk, haritanın dışında. */
export const EMOTION_FALLBACK: EmotionLook = { color: "#a1a1aa", quadrant: null };

export const emotionLook = (name: string): EmotionLook =>
  EMOTION_LOOKS[name] ?? EMOTION_FALLBACK;

/**
 * Duygunun arayüzdeki adı. Kayıtta yerleşik listenin İngilizce adı durur
 * ("Anxious"); gösterirken dile çevrilir. Kullanıcının eklediği duygu
 * olduğu gibi yazılır.
 */
export function emotionName(name: string, t: (key: MessageKey) => string): string {
  return name in EMOTION_LOOKS ? t(`emotion.${name.toLowerCase()}` as MessageKey) : name;
}

/**
 * Yerleşik ruh hali kaleminin ve özelliklerinin adı. Kayıtta İngilizce
 * kanonik ad duruyor (bkz. BUILT_IN_CATEGORIES); Türkçe arayüzde pencere
 * "MOOD · HAPPINESS · EMOTIONS" yazıyordu. Kullanıcı yeniden adlandırdıysa
 * onun verdiği ad olduğu gibi kalır.
 */
const MOOD_NAMES: Record<string, MessageKey> = {
  Mood: "mood.title",
  Happiness: "mood.level",
  Emotions: "mood.emotions",
};
export function moodText(name: string | undefined, t: (key: MessageKey) => string): string {
  if (!name) return "";
  const key = MOOD_NAMES[name];
  return key ? t(key) : name;
}

// ── Mutluluk skalası ──────────────────────────────────────────────────────

/**
 * Basamak renkleri — mor (berbat) → mavi → gri (eh işte) → yeşil → sarı (harika).
 * Duygu haritasıyla aynı yön: hoş olmayan soğuk, hoş olan sıcak. Apple'ın
 * State of Mind kaydırıcısı da aynı mor → turuncu yönünü kullanıyor. Eskiden
 * bütün basamaklar ruh halinin pembesindeydi; hangisinin seçildiği ancak
 * yüzden okunuyordu.
 */
export const SCALE_COLORS = ["#8b7cf6", "#5aa6f2", "#aab4c3", "#5fcf86", "#ffc53d"];

/** Basamağı 5'lik diziye oturtur — 3, 5 ya da 10 basamaklı skala olsun */
function scaleSlot(index: number, total: number): number {
  if (total <= 1) return 2;
  return Math.round((index / (total - 1)) * (SCALE_FACE_PARTS.length - 1));
}

export function scaleColor(index: number, total: number): string {
  return SCALE_COLORS[scaleSlot(index, total)];
}

/**
 * Beş basamaklı skalada her basamağın adı (Daylio'nun rad/good/meh/bad/awful
 * dizisi gibi). Yalnız uç etiketleri yazmak ortadaki üç yüzü yoruma
 * bırakıyordu: "3 iyi mi kötü mü?"
 */
export const SCALE_STEP_KEYS: MessageKey[] = [
  "mood.step1",
  "mood.step2",
  "mood.step3",
  "mood.step4",
  "mood.step5",
];

/** Yerleşik skalanın uç etiketleri — kayıtta İngilizce durur */
const SCALE_END_KEYS: Record<string, MessageKey> = {
  Awful: "mood.step1",
  Great: "mood.step5",
};
export function scaleEndText(label: string | undefined, t: (key: MessageKey) => string): string {
  if (!label) return "";
  const key = SCALE_END_KEYS[label];
  return key ? t(key) : label;
}

/** Uç etiketleri yerleşik varsayılan mı (ya da hiç yok mu) */
export function scaleLabelsAreDefault(labels?: { low?: string; high?: string }): boolean {
  const low = labels?.low?.trim();
  const high = labels?.high?.trim();
  return (!low || low === "Awful") && (!high || high === "Great");
}

// ── Çizim ─────────────────────────────────────────────────────────────────

const paint = (k: FaceInk | undefined): string =>
  !k || k === "none" ? "none" : FACE_INK[k];

function Face({
  parts,
  color,
  size,
  className,
  style,
}: {
  parts: FacePart[];
  color: string;
  size: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      data-face=""
      className={className}
      style={{ width: size, height: size, flexShrink: 0, ...style }}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10.2" fill={color} stroke={FACE_INK.ink} strokeWidth="1.6" />
      {parts.map((p, i) => (
        <path
          key={i}
          d={p.d}
          fill={paint(p.fill ?? (p.stroke ? "none" : "ink"))}
          fillOpacity={p.fill === "shade" ? SHADE_OPACITY : undefined}
          stroke={p.stroke ? paint(p.stroke) : undefined}
          strokeWidth={p.stroke ? (p.w ?? 1.9) : undefined}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}

/** Skala basamağının yüzü — kendi renginde */
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
  const slot = scaleSlot(index, total);
  return (
    <Face
      parts={SCALE_FACE_PARTS[slot]}
      color={SCALE_COLORS[slot]}
      size={size}
      className={className}
      style={style}
    />
  );
}

/** Tek duygu yüzü — duygunun kendi renginde */
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
    <Face
      parts={EMOTION_FACES[name] ?? FALLBACK_FACE}
      color={emotionLook(name).color}
      size={size}
      className={className}
      style={style}
    />
  );
}
