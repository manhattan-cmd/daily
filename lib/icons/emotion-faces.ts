/**
 * Duygu yüzlerinin geometrisi — JSX'siz, saf veri.
 *
 * Ayrı dosya çünkü hem uygulama (emotions.tsx) hem de tasarım önizlemesi
 * aynı çizimi okuyor; önizleme betiği bu dosyayı Node ile doğrudan açıyor
 * (tip ayıklama), JSX olsaydı açamazdı.
 *
 * ÇİZİM DİLİ — "çıkartma yüz"
 * Brütal temanın kendisi: düz renk + siyah mürekkep. Yüzün diski duygunun
 * renginde, çevresinde ince mürekkep halka; gözler, kaşlar, ağız MÜREKKEP.
 * Eski yüzler tek renkti ve gözler/ağız disk içinde DELİKTİ: açık zeminde
 * (brütal, kâğıt) delikler beyaz çıkıyor, koyu zeminde siyah — aynı yüz iki
 * temada iki ayrı ifade taşıyordu. Mürekkep her zeminde aynı.
 *
 * Üçüncü ton yalnız iki yerde: kâğıt beyazı (diş, göz akı, parıltı) ve su
 * mavisi (gözyaşı, ter damlası). Yanak allığı mürekkebin saydamı.
 *
 * KURALLAR
 * - 24×24 ızgara; disk r=10,2 + 1,6 halka → kenarda 1 px pay.
 * - Hat kalınlığı 1,7–1,9: 20 pikselde 1,5 px, 14 pikselde 1 px kalıyor.
 * - Göz noktası r=1,55; kaş varsa gözler 10,8'e iner (kaşla arası açılsın).
 * - Her yüzün KENDİNE AİT bir imzası var (göz × ağız × ek); emoji
 *   alışkanlığından gelen kalıplar (😍 kalp göz, 😎 gözlük, 😬 diş, 😢 yaş)
 *   bilerek korunuyor: tanıdık kalıp ad okunmadan da yön veriyor.
 */

export type FaceInk = "ink" | "white" | "water" | "shade" | "none";

export interface FacePart {
  d: string;
  fill?: FaceInk;
  stroke?: FaceInk;
  /** Hat kalınlığı (24'lük ızgarada) */
  w?: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

// ── Temel biçimler ──────────────────────────────────────────────────────
const circle = (cx: number, cy: number, r: number) =>
  `M${r2(cx - r)} ${r2(cy)}a${r2(r)} ${r2(r)} 0 1 0 ${r2(r * 2)} 0a${r2(r)} ${r2(r)} 0 1 0 ${r2(-r * 2)} 0Z`;
const ellipse = (cx: number, cy: number, rx: number, ry: number) =>
  `M${r2(cx - rx)} ${r2(cy)}a${r2(rx)} ${r2(ry)} 0 1 0 ${r2(rx * 2)} 0a${r2(rx)} ${r2(ry)} 0 1 0 ${r2(-rx * 2)} 0Z`;
const seg = (x1: number, y1: number, x2: number, y2: number) =>
  `M${r2(x1)} ${r2(y1)}L${r2(x2)} ${r2(y2)}`;
const curve = (x1: number, y1: number, cx: number, cy: number, x2: number, y2: number) =>
  `M${r2(x1)} ${r2(y1)}Q${r2(cx)} ${r2(cy)} ${r2(x2)} ${r2(y2)}`;

const inkLine = (d: string, w = 1.9): FacePart => ({ d, stroke: "ink", w, fill: "none" });
const inkFill = (d: string): FacePart => ({ d, fill: "ink" });
const paper = (d: string, w = 1.3): FacePart => ({ d, fill: "white", stroke: "ink", w });

// ── Gözler ──────────────────────────────────────────────────────────────
const EL = 8.7;
const ER = 15.3;
/** Kaşsız yüzde göz hizası */
const EY = 10.2;
/** Kaşlı yüzde göz hizası */
const EYB = 10.9;

const both = (fn: (x: number, side: -1 | 1) => FacePart[]) => [...fn(EL, -1), ...fn(ER, 1)];

const eyesDot = (y = EY, r = 1.55) => both((x) => [inkFill(circle(x, y, r))]);
/** Göz akı + bebek; (dx, dy) bakış yönü */
const eyesWhite = (y: number, dx = 0, dy = 0, pr = 1.25) =>
  both((x) => [paper(circle(x, y, 2.45)), inkFill(circle(x + dx, y + dy, pr))]);
/** Gülen kapalı göz ∩ */
const eyesArch = (y = EY + 0.4) => both((x) => [inkLine(curve(x - 2, y + 0.8, x, y - 2, x + 2, y + 0.8), 1.8)]);
/** Gevşek kapalı göz ∪ (sakin, içe dönük) */
const eyesRest = (y = EY) => both((x) => [inkLine(curve(x - 2, y - 0.5, x, y + 1.8, x + 2, y - 0.5), 1.8)]);
/** Düz kapalı göz — */
const eyesShut = (y = EY + 0.3) => both((x) => [inkLine(seg(x - 2, y, x + 2, y), 1.8)]);
/** Sıkılmış göz > < */
const eyesSqueeze = (y = EY + 0.3) =>
  both((x, s) => [
    inkLine(
      s < 0
        ? `M${r2(x - 1.6)} ${r2(y - 1.7)}L${r2(x + 1.5)} ${r2(y)}L${r2(x - 1.6)} ${r2(y + 1.7)}`
        : `M${r2(x + 1.6)} ${r2(y - 1.7)}L${r2(x - 1.5)} ${r2(y)}L${r2(x + 1.6)} ${r2(y + 1.7)}`,
      1.8
    ),
  ]);
/** Ağır göz kapağı ◒ — kapak çizgisi + altında yarım bebek; dx yana bakış */
const eyesLid = (y = EY, dx = 0) =>
  both((x) => [
    inkFill(`M${r2(x + dx - 1.55)} ${r2(y)}A1.55 1.55 0 0 0 ${r2(x + dx + 1.55)} ${r2(y)}Z`),
    inkLine(seg(x - 2.2, y, x + 2.2, y), 1.7),
  ]);
/** Çatık kapalı göz  / — öfkeyi içine atmak */
const eyesClench = (y = EY + 0.4) =>
  both((x, s) => [inkLine(seg(x + 1.9 * s, y - 1.1, x - 1.7 * s, y + 0.6), 1.8)]);
/** Çarpı göz × */
const eyesCross = (y = EY + 0.2) =>
  both((x) => [inkLine(seg(x - 1.5, y - 1.5, x + 1.5, y + 1.5), 1.7), inkLine(seg(x - 1.5, y + 1.5, x + 1.5, y - 1.5), 1.7)]);
/** Parlayan iri göz (🥹) */
const eyesShine = (y = EY + 0.2) =>
  both((x) => [
    inkFill(circle(x, y, 2.35)),
    { d: circle(x + 0.8, y - 0.8, 0.85), fill: "white" },
    { d: circle(x - 0.75, y + 0.85, 0.42), fill: "white" },
  ]);
/** Kalp göz */
const heart = (cx: number, cy: number, s: number) =>
  `M${r2(cx)} ${r2(cy + s * 0.95)}` +
  `C${r2(cx - s * 1.6)} ${r2(cy - s * 0.05)} ${r2(cx - s * 0.85)} ${r2(cy - s * 1.25)} ${r2(cx)} ${r2(cy - s * 0.5)}` +
  `C${r2(cx + s * 0.85)} ${r2(cy - s * 1.25)} ${r2(cx + s * 1.6)} ${r2(cy - s * 0.05)} ${r2(cx)} ${r2(cy + s * 0.95)}Z`;
const eyesHeart = (y = EY) => both((x) => [inkFill(heart(x, y, 2.75))]);
/** Yıldız göz */
const star = (cx: number, cy: number, ro: number, ri: number) => {
  let d = "";
  for (let i = 0; i < 10; i++) {
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const r = i % 2 ? ri : ro;
    d += `${i ? "L" : "M"}${r2(cx + r * Math.cos(a))} ${r2(cy + r * Math.sin(a))}`;
  }
  return d + "Z";
};
const eyesStar = (y = EY) => both((x) => [inkFill(star(x, y, 2.75, 1.2))]);
/** Güneş gözlüğü — iki cam + boydan boya çerçeve */
const sunglasses: FacePart[] = [
  inkLine(seg(2.7, 8.9, 21.3, 8.9), 1.4),
  inkFill("M5.2 8.5H10.9V10.4C10.9 11.75 9.95 12.6 8.55 12.6H7.55C6.15 12.6 5.2 11.75 5.2 10.4Z"),
  inkFill("M13.1 8.5H18.8V10.4C18.8 11.75 17.85 12.6 16.45 12.6H15.45C14.05 12.6 13.1 11.75 13.1 10.4Z"),
];

// ── Kaşlar ──────────────────────────────────────────────────────────────
/** Kaygı / üzüntü: iç uçlar yukarı (AU1+4) */
const browWorry = [inkLine(seg(6.3, 7.5, 10.1, 6), 1.7), inkLine(seg(17.7, 7.5, 13.9, 6), 1.7)];
/** Kırgınlık: kaygı kaşının yükseği — altındaki kapalı gözle birleşmesin */
const browWorryHigh = [inkLine(seg(6.4, 6.6, 10, 5.1), 1.6), inkLine(seg(17.6, 6.6, 14, 5.1), 1.6)];
/** Öfke: iç uçlar aşağı (AU4) */
const browAngry = [inkLine(seg(6.6, 6.1, 10.3, 7.7), 1.8), inkLine(seg(17.4, 6.1, 13.7, 7.7), 1.8)];
/** Odak: düz, alçak */
const browFlat = [inkLine(seg(6.6, 7.4, 10.4, 7.4), 1.7), inkLine(seg(17.4, 7.4, 13.6, 7.4), 1.7)];
/** Kalkık: yay (umut, heves, gurur) */
const browRaise = [inkLine(curve(6.5, 7.1, 8.6, 5.3, 10.7, 6.9), 1.6), inkLine(curve(17.5, 7.1, 15.4, 5.3, 13.3, 6.9), 1.6)];

// ── Ağızlar ─────────────────────────────────────────────────────────────
/** Açık gülüş D */
const mouthGrin = inkFill("M7.3 13.7H16.7C16.6 16.9 14.6 18.9 12 18.9C9.4 18.9 7.4 16.9 7.3 13.7Z");
const mouthGrinSm = inkFill("M8.5 14.3H15.5C15.4 16.6 13.9 18 12 18C10.1 18 8.6 16.6 8.5 14.3Z");
/** Dişli gülüş (😁) — kâğıt beyazı, gülüş eğrisinde */
const mouthTeeth: FacePart[] = [
  paper("M7.2 13.6Q12 15.3 16.8 13.6Q16.3 18.7 12 18.7Q7.7 18.7 7.2 13.6Z", 1.4),
  inkLine("M7.9 15.4Q12 16.9 16.1 15.4", 1.1),
];
/** Sıkılmış diş (😬) */
const mouthGrimace: FacePart[] = [
  paper("M7.6 14.3H16.4A1.9 1.9 0 0 1 16.4 18.1H7.6A1.9 1.9 0 0 1 7.6 14.3Z", 1.4),
  inkLine(seg(6.4, 16.2, 17.6, 16.2), 1.1),
  inkLine(seg(10.1, 14.4, 10.1, 18), 1.1),
  inkLine(seg(13.9, 14.4, 13.9, 18), 1.1),
];
const mouthSmile = inkLine(curve(7.9, 14.2, 12, 18.6, 16.1, 14.2));
const mouthSmileWide = inkLine(curve(7.3, 13.9, 12, 19.2, 16.7, 13.9));
const mouthSmileSm = inkLine(curve(9.3, 15.1, 12, 17.5, 14.7, 15.1));
/** Titrek küçük gülüş (🥹) */
const mouthWobble = inkLine("M9 15.6Q10.5 16.9 12 16Q13.5 16.9 15 15.6", 1.7);
const mouthFlat = inkLine(seg(9, 16, 15, 16));
const mouthFlatShort = inkLine(seg(9.9, 16, 14.1, 16));
/** Yana kaçan düz ağız (😒) */
const mouthSide = inkLine(seg(11, 16.3, 15.6, 15.7));
const mouthFrown = inkLine(curve(8.2, 17.6, 12, 13.7, 15.8, 17.6));
const mouthFrownSm = inkLine(curve(9.5, 17.1, 12, 15.1, 14.5, 17.1));
const mouthO = inkFill(ellipse(12, 16.4, 2.1, 2.7));
const mouthYawn = inkFill(ellipse(12, 16.6, 1.8, 2.2));
/** Dalgalı ağız (kaygı) */
const mouthWave = inkLine("M8.3 16.4Q9.5 15 10.7 16.4T13.1 16.4T15.5 16.4", 1.7);
/** Zikzak (öfkeyi tutmak) */
const mouthZig = inkLine("M8.1 16.7L9.7 15.3L11.2 16.7L12.8 15.3L14.3 16.7L15.9 15.3", 1.6);
/** Açık asık ağız — kubbe (😫) */
const mouthDome = inkFill("M7.9 18.3C8.4 15.3 10 13.7 12 13.7C14 13.7 15.6 15.3 16.1 18.3Z");
/** Yan gülüş (😏) */
const mouthSmirk = inkLine(curve(9, 16.1, 13.2, 17.4, 15.8, 14.3));

// ── Ekler ───────────────────────────────────────────────────────────────
const drop = (cx: number, cy: number, h: number) =>
  `M${r2(cx)} ${r2(cy - h * 0.55)}` +
  `C${r2(cx + h * 0.55)} ${r2(cy + h * 0.02)} ${r2(cx + h * 0.42)} ${r2(cy + h * 0.45)} ${r2(cx)} ${r2(cy + h * 0.45)}` +
  `C${r2(cx - h * 0.42)} ${r2(cy + h * 0.45)} ${r2(cx - h * 0.55)} ${r2(cy + h * 0.02)} ${r2(cx)} ${r2(cy - h * 0.55)}Z`;
const tear: FacePart = { d: drop(7.3, 14.6, 3.6), fill: "water", stroke: "ink", w: 1.1 };
const sweat: FacePart = { d: drop(18.1, 6.4, 3.8), fill: "water", stroke: "ink", w: 1.1 };
const blush: FacePart[] = [
  { d: ellipse(6.3, 13.7, 1.7, 1.05), fill: "shade" },
  { d: ellipse(17.7, 13.7, 1.7, 1.05), fill: "shade" },
];

/**
 * Duygu → yüz. Anahtar yerleşik listedeki İngilizce ad (kayıtta o durur).
 * Yorumdaki emoji, yüzün dayandığı tanıdık kalıp.
 */
export const EMOTION_FACES: Record<string, FacePart[]> = {
  // Yüksek enerji · hoş değil
  Angry: [...browAngry, ...eyesDot(EYB), mouthFrown], // 😠
  Scared: [...browWorry, ...eyesWhite(EYB, 0, 0, 1.05), mouthO], // 😨
  Overwhelmed: [...eyesSqueeze(), mouthDome], // 😫
  Stressed: [...browWorry, ...eyesDot(EYB), ...mouthGrimace, sweat], // 😬💧
  Anxious: [...browWorry, ...eyesDot(EYB), mouthWave], // 😟
  Frustrated: [...eyesClench(), mouthZig], // 😤
  // Yüksek enerji · hoş
  Excited: [...eyesStar(), mouthGrin], // 🤩
  Motivated: [...browRaise, ...eyesDot(EYB), ...mouthTeeth], // 😁
  Proud: [...eyesArch(), mouthSmileWide], // 😊↑
  Happy: [...eyesDot(), mouthGrin], // 😀
  Confident: [...sunglasses, mouthSmirk], // 😎
  Focused: [...browFlat, ...eyesDot(EYB, 1.35), mouthFlatShort], // 🧐
  // Düşük enerji · hoş
  Hopeful: [...eyesWhite(EY, 0, -0.95), mouthSmileSm], // 🙂↑
  Grateful: [...eyesShine(), mouthWobble, ...blush], // 🥹
  Loved: [...eyesHeart(), mouthSmile], // 😍
  Relieved: [...eyesArch(), mouthGrinSm, sweat], // 😅
  Content: [...eyesRest(), mouthSmileSm, ...blush], // ☺️
  Calm: [...eyesShut(), mouthSmileSm], // 😌
  // Düşük enerji · hoş değil
  Hurt: [...browWorryHigh, ...eyesRest(11.4), mouthFrownSm], // 😔
  Bored: [...eyesLid(EY, 0.7), mouthSide], // 😒
  Sad: [...browWorry, ...eyesDot(EYB), mouthFrown, tear], // 😢
  Lonely: [...eyesWhite(EY, -0.8, 0.7), mouthFrownSm], // 🥺→
  Drained: [...eyesCross(), mouthWave], // 😵
  Tired: [...eyesLid(), mouthYawn], // 🥱
};

/** Tanınmayan (kullanıcının eklediği) duygu — nötr yüz */
export const FALLBACK_FACE: FacePart[] = [...eyesDot(), mouthFlat];

/** Mutluluk skalası — en kötüden en iyiye */
export const SCALE_FACE_PARTS: FacePart[][] = [
  [...eyesSqueeze(), mouthDome], // 😫 berbat
  [...eyesDot(), mouthFrown], // 🙁 kötü
  [...eyesDot(), mouthFlat], // 😐 eh işte
  [...eyesDot(), mouthSmile], // 🙂 iyi
  [...eyesArch(), mouthGrin], // 😄 harika
];

/** Mürekkep tonlarının karşılığı */
export const FACE_INK: Record<Exclude<FaceInk, "none">, string> = {
  ink: "#111111",
  white: "#ffffff",
  water: "#8fd0ff",
  shade: "#111111",
};
export const SHADE_OPACITY = 0.17;
