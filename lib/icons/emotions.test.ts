import { describe, expect, it } from "vitest";
import { en, tr } from "@/lib/i18n/messages";
import { MOOD_EMOTIONS } from "@/lib/db/queries";
import { EMOTION_FACES, SCALE_FACE_PARTS } from "./emotion-faces";
import {
  EMOTION_GRID,
  EMOTION_LOOKS,
  SCALE_COLORS,
  SCALE_STEP_KEYS,
  scaleColor,
  scaleEndText,
  scaleLabelsAreDefault,
} from "./emotions";

const onMap = EMOTION_GRID.flat();

describe("duygu haritası", () => {
  it("yerleşik liste haritanın okuma sırası — 24 duygu, tekrarsız", () => {
    expect([...MOOD_EMOTIONS]).toEqual(onMap);
    expect(new Set(onMap).size).toBe(24);
    EMOTION_GRID.forEach((row) => expect(row).toHaveLength(4));
  });

  it("her duygunun yüzü, rengi ve iki dilde adı var", () => {
    for (const name of onMap) {
      expect(EMOTION_FACES[name], name).toBeDefined();
      expect(EMOTION_LOOKS[name]?.color, name).toMatch(/^#[0-9a-f]{6}$/);
      const key = `emotion.${name.toLowerCase()}` as keyof typeof en;
      expect(en[key], name).toBeTruthy();
      expect(tr[key], name).toBeTruthy();
    }
    expect(Object.keys(EMOTION_LOOKS).sort()).toEqual([...onMap].sort());
  });

  it("çeyrek konumdan gelir: sol üst gergin, sağ üst canlı, sol alt durgun, sağ alt dingin", () => {
    EMOTION_GRID.forEach((row, r) =>
      row.forEach((name, c) => {
        const want = r < 3 ? (c < 2 ? "tense" : "lively") : c < 2 ? "low" : "serene";
        expect(EMOTION_LOOKS[name].quadrant, name).toBe(want);
      })
    );
  });

  it("ilk sürümün 16 duygusu yeni haritada da var — eski kayıtlar yüzünü korur", () => {
    const v1 = ["Happy", "Calm", "Grateful", "Excited", "Confident", "Loved", "Hopeful", "Focused",
      "Tired", "Stressed", "Anxious", "Sad", "Angry", "Lonely", "Bored", "Frustrated"];
    for (const name of v1) expect(onMap).toContain(name);
  });

  it("aynı yüz iki duyguda kullanılmıyor", () => {
    const sigs = onMap.map((n) => EMOTION_FACES[n].map((p) => p.d).join("|"));
    expect(new Set(sigs).size).toBe(sigs.length);
  });
});

describe("mutluluk skalası", () => {
  it("beş yüz, beş renk, beş ad", () => {
    expect(SCALE_FACE_PARTS).toHaveLength(5);
    expect(SCALE_COLORS).toHaveLength(5);
    expect(SCALE_STEP_KEYS).toHaveLength(5);
  });

  it("basamak sayısı ne olursa olsun uçlar uç renklere oturur", () => {
    for (const total of [3, 5, 7, 10]) {
      expect(scaleColor(0, total)).toBe(SCALE_COLORS[0]);
      expect(scaleColor(total - 1, total)).toBe(SCALE_COLORS[4]);
    }
    expect(scaleColor(1, 3)).toBe(SCALE_COLORS[2]);
  });

  it("yerleşik uç etiketleri çevrilir, kullanıcınınkiler olduğu gibi kalır", () => {
    const t = (k: keyof typeof tr) => tr[k];
    expect(scaleEndText("Awful", t)).toBe("Berbat");
    expect(scaleEndText("Great", t)).toBe("Harika");
    expect(scaleEndText("Süper", t)).toBe("Süper");
    expect(scaleLabelsAreDefault({ low: "Awful", high: "Great" })).toBe(true);
    expect(scaleLabelsAreDefault(undefined)).toBe(true);
    expect(scaleLabelsAreDefault({ low: "Kötü", high: "Great" })).toBe(false);
  });
});
