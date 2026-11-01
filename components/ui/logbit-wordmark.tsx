import type { CSSProperties, ReactNode } from "react";
import { APP_NAME, MARK } from "@/lib/brand";
import { cn } from "@/lib/utils";

/*
 * Geist 800 ölçüleri (em; harfin çizildiği başlangıç noktasına ve taban
 * çizgisine göre; büyük çizilip piksel taranarak ölçüldü).
 * o: mürekkep solu 0.034, genişliği 0.565, üstü 0.55, altı -0.012.
 * ı: simetrik, sapın ortası 0.147, üstü (x-yüksekliği) 0.538.
 */
const O_LEFT = 0.034;
const O_WIDTH = 0.565;
const O_CENTER = O_LEFT + O_WIDTH / 2;
const I_STEM = 0.147;
const I_TOP = 0.538;

/** Harfler: beyaz dolgu, siyah kontur, siyah sert gölge — uygulamanın brütal yazısı */
const LETTERS: CSSProperties = {
  color: "#fff",
  WebkitTextStroke: `0.045em ${MARK.ink}`,
  paintOrder: "stroke fill",
  textShadow: `0.07em 0.07em 0 ${MARK.ink}`,
};
/** o'nun glifi yalnız boşluğu tutar (yerine bit çizilir): görünmez */
const HIDDEN: CSSProperties = { color: "transparent", WebkitTextStroke: "0", textShadow: "none" };

/**
 * Taban çizgisinde, harfin başlangıç noktasında duran sıfır boyutlu çapa:
 * içindekiler buna göre konumlanır (bottom = tabandan yukarı). Satır
 * yüksekliğinden ve yazı tipinin üst/alt boşluklarından bağımsız — harfin
 * kutusuna göre konumlamak, cn'nin text-[..] yüzünden leading-none'ı
 * silmesiyle maskotu ve noktayı kaydırmıştı.
 */
function Anchor({ children }: { children: ReactNode }) {
  return (
    <span aria-hidden className="relative inline-block h-0 w-0 align-baseline">
      {children}
    </span>
  );
}

/** o'nun yerindeki sarı bit: o'nun mürekkebinden biraz iri, sert gölgeli */
function OBit() {
  return (
    <span
      className="absolute h-[0.6em] w-[0.6em] -translate-x-1/2 rounded-full border-[0.06em] border-[#111]"
      style={{ left: `${O_CENTER}em`, bottom: "-0.015em", background: MARK.bit, boxShadow: `0.05em 0.05em 0 ${MARK.ink}` }}
    />
  );
}

/**
 * Kutu maskotu o'nun arkasında: logodaki gibi kareye yakın (0.98×0.9em),
 * o'nun ortasına göre ortalı, l ve g'nin arkasına taşar — harflerin beyaz
 * dolgusu ve siyah gölgesi onları gövdeden ayırır. Tepesi tabandan 1.02em
 * yukarıda, yüzü bitin üstünde. Birim 0.01em.
 */
function MascotBehindO() {
  return (
    <svg
      viewBox="0 0 106 98"
      className="absolute -z-10 overflow-visible"
      style={{ left: `${O_CENTER - 0.49}em`, bottom: "0.12em", width: "1.06em", height: "0.98em" }}
    >
      <rect x="6" y="6" width="94" height="86" rx="16" fill={MARK.ink} />
      <rect x="2" y="2" width="94" height="86" rx="16" fill={MARK.body} stroke={MARK.ink} strokeWidth="4.5" />
      <ellipse cx="35.3" cy="24" rx="3.8" ry="5.4" fill={MARK.ink} />
      <ellipse cx="58.8" cy="24" rx="3.8" ry="5.4" fill={MARK.ink} />
      <path d="M39.2 38 Q47 45 54.9 38" fill="none" stroke={MARK.ink} strokeWidth="3.4" strokeLinecap="round" />
    </svg>
  );
}

/** Maskotun biti iki yanından tutan küçük beyaz elleri */
function Hand({ at }: { at: number }) {
  return (
    <span
      className="absolute h-[0.17em] w-[0.17em] -translate-x-1/2 rounded-full border-[0.045em] border-[#111] bg-white"
      style={{ left: `${at}em`, bottom: "0.2em" }}
    />
  );
}

/**
 * Logbit kelime logosu — Geist 800, küçük harf, sıkı aralık; harfler beyaz,
 * siyah konturlu ve sert gölgeli. o'nun yerinde sarı bit (yazı kaymaz: o'nun
 * glifi görünmez durup boşluğu tutar), i'nin üstünde de sarı bit. `mascot`
 * verilirse Kutu maskotu biti arkasından tutar. Boyut yazı boyutuyla (em)
 * ölçeklenir: className ile text-[..] ver. Ekran okuyucu "Logbit" duyar.
 */
export function LogbitWordmark({ className, mascot = false }: { className?: string; mascot?: boolean }) {
  return (
    <span
      className={cn(
        // isolate: maskotun -z-10'u başlığın zemininin değil, yazının arkasına düşsün
        "relative isolate inline-flex items-baseline font-extrabold leading-none tracking-[-0.03em]",
        className
      )}
    >
      <span className="sr-only">{APP_NAME}</span>
      <span aria-hidden className="inline-flex items-baseline" style={LETTERS}>
        l
        <Anchor>
          {mascot && <MascotBehindO />}
          <OBit />
          {mascot && (
            <>
              <Hand at={O_LEFT - 0.005} />
              <Hand at={O_LEFT + O_WIDTH + 0.005} />
            </>
          )}
        </Anchor>
        <span style={HIDDEN}>o</span>
        gb
        <Anchor>
          <span
            className="absolute h-[0.32em] w-[0.32em] -translate-x-1/2 rounded-full border-[0.06em] border-[#111]"
            style={{ left: `${I_STEM}em`, bottom: `${I_TOP + 0.08}em`, background: MARK.bit }}
          />
        </Anchor>
        ıt
      </span>
    </span>
  );
}
