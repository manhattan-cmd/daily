"use client";

import { setLocalFlag, useLocalFlag } from "./local-flag";

/**
 * Girdi sesleri. Dosya yok: her ses Web Audio ile o an üretiliyor, uygulama
 * büyümüyor ve çevrimdışı da çalışıyor. Üç ayrı ses var: uyku, ruh hali ve
 * geri kalan bütün girdiler. Ayarlar'dan kapatılabiliyor (bkz. SoundSection).
 *
 * Ses kayıt bittikten hemen sonra çalıyor, yani yalnız gerçekten eklenen
 * girdide duyuluyor. Tarayıcı sesi ancak bir dokunuştan sonra açtığı için
 * ses bağlamı ilk dokunuşta hazırlanıyor (iOS dokunuştan sonraki await'i
 * jest saymıyor).
 */

export type EntrySoundKind = "entry" | "mood" | "sleep";

/** İşaretliyse sesler kapalı. Varsayılan: açık. */
export const SOUND_OFF_KEY = "logbit-sound-off";

export function isSoundOn(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(SOUND_OFF_KEY) !== "1";
  } catch {
    return true;
  }
}

export function setSoundOn(on: boolean): void {
  setLocalFlag(SOUND_OFF_KEY, !on);
}

export function useSoundOn(): boolean {
  const [off] = useLocalFlag(SOUND_OFF_KEY);
  return !off;
}

let ctx: AudioContext | null = null;
let out: GainNode | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    try {
      ctx = new Ctor();
    } catch {
      return null;
    }
    // Akorlar üst üste binince patlamasın diye yumuşak bir sıkıştırıcı
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 4;
    out = ctx.createGain();
    out.gain.value = 0.7;
    out.connect(comp);
    comp.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

// İlk dokunuşta ses bağlamını hazırla — kayıt await'inden sonra çalabilsin
if (typeof window !== "undefined") {
  const unlock = () => {
    if (isSoundOn()) audio();
    window.removeEventListener("pointerdown", unlock, true);
  };
  window.addEventListener("pointerdown", unlock, true);
}

interface Tone {
  f: number;
  t?: number;
  dur?: number;
  gain?: number;
  type?: OscillatorType;
  attack?: number;
  /** FM yoğunluğu (taşıyıcı frekansın katı); verilirse tokmak ya da çan tınısı */
  fm?: number;
  ratio?: number;
}

function tone(c: AudioContext, o: Tone): void {
  if (!out) return;
  const t0 = c.currentTime + 0.005 + (o.t ?? 0);
  const dur = o.dur ?? 0.3;
  const osc = c.createOscillator();
  osc.type = o.type ?? "sine";
  osc.frequency.setValueAtTime(o.f, t0);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(o.gain ?? 0.2, t0 + (o.attack ?? 0.004));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  if (o.fm) {
    const m = c.createOscillator();
    const mg = c.createGain();
    m.frequency.setValueAtTime(o.f * (o.ratio ?? 2), t0);
    mg.gain.setValueAtTime(o.f * o.fm, t0);
    mg.gain.exponentialRampToValueAtTime(0.01, t0 + dur);
    m.connect(mg);
    mg.connect(osc.frequency);
    m.start(t0);
    m.stop(t0 + dur + 0.05);
  }
  osc.connect(g);
  g.connect(out);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

/** Marimba benzeri tokmak: kısa FM vuruşu + bir oktav üstte ince parlaklık */
function mallet(c: AudioContext, f: number, t: number, dur: number, gain: number): void {
  tone(c, { f, t, dur, gain, fm: 1.4, ratio: 4, attack: 0.003 });
  tone(c, { f: f * 2, t, dur: dur * 0.35, gain: gain * 0.12 });
}

// Do majör: hepsi aynı ailede, yan yana çalınca uyumlu
const C4 = 261.63, G4 = 392.0, C5 = 523.25, E5 = 659.25, F5 = 698.46, G5 = 783.99,
  A5 = 880.0, C6 = 1046.5, E6 = 1318.51;

const SOUNDS: Record<EntrySoundKind, (c: AudioContext) => void> = {
  // Girdi: yükselen iki tokmak notası (büyük üçlü) — kısa, net, "tamam"
  entry: (c) => {
    mallet(c, C6, 0, 0.3, 0.22);
    mallet(c, E6, 0.075, 0.5, 0.22);
    tone(c, { f: E6 * 2, t: 0.075, dur: 0.3, gain: 0.025 });
  },
  // Ruh hali: sıcak bir açılış — yumuşak tokmak ve arpej gibi açılan maj7 akoru
  mood: (c) => {
    mallet(c, F5, 0, 0.45, 0.16);
    [F5, A5, C6, E6].forEach((f, i) =>
      tone(c, { f, t: i * 0.045, dur: 0.95, gain: 0.075, type: "triangle", attack: 0.02 })
    );
    tone(c, { f: A5 * 2, t: 0.18, dur: 0.5, gain: 0.03 });
  },
  // Uyku: aşağı inip duran müzik kutusu ve altında alçak, sakin bir uğultu
  sleep: (c) => {
    [G5, E5, C5].forEach((f, i) =>
      tone(c, { f, t: i * 0.13, dur: 1.1, gain: 0.13, fm: 0.6, ratio: 3, attack: 0.004 })
    );
    [C4, G4].forEach((f) =>
      tone(c, { f, t: 0.05, dur: 1.5, gain: 0.045, type: "triangle", attack: 0.15 })
    );
  },
};

const HAPTICS: Record<EntrySoundKind, number | number[]> = {
  entry: 14,
  mood: [10, 50, 14],
  sleep: 24,
};

/** Girdi eklendi: türüne göre ses ve kısa titreşim. Sesler kapalıysa yalnız titreşim. */
export function playEntrySound(kind: EntrySoundKind): void {
  if (typeof window === "undefined") return;
  try {
    navigator.vibrate?.(HAPTICS[kind]);
  } catch {
    /* titreşim yoksa sessizce geç */
  }
  if (!isSoundOn()) return;
  const c = audio();
  if (!c) return;
  try {
    SOUNDS[kind](c);
  } catch {
    /* ses çalınamazsa kayıt yine de tamam */
  }
}

/** Kategorinin yerleşik anahtarından ses türü */
export function entrySoundFor(builtInKey?: string): EntrySoundKind {
  if (builtInKey === "sleep") return "sleep";
  if (builtInKey === "mood") return "mood";
  return "entry";
}
