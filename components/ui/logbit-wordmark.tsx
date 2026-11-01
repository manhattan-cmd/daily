import type { ReactNode } from "react";
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
const I_STEM = 0.147;
const I_TOP = 0.538;

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

/**
 * Kutu maskotu o'nun arkasında: gövdesi o'nun mürekkep genişliğinde (l ve
 * g'ye taşarsa l'nin sapı gövdenin çerçevesiyle birleşip kayboluyor),
 * pembesi o'nun içinden görünür, yüzü o'nun üstünden bakar. Konumlar
 * kullanıcının onayladığı galeri sürümünden (U2) ölçüldü: gövde tabanın
 * 0.177em altından 0.93em yukarıya, gözler tabandan ~0.67em yukarıda.
 * Birim 0.01em.
 */
function MascotBehindO() {
  const w = O_WIDTH * 100;
  return (
    <svg
      viewBox={`0 0 ${w + 6} 111`}
      className="absolute -z-10 overflow-visible"
      style={{ left: `${O_LEFT}em`, bottom: "-0.177em", width: `${(w + 6) / 100}em`, height: "1.11em" }}
    >
      <rect x="5" y="5" width={w - 4} height="101" rx="13" fill={MARK.ink} />
      <rect x="2" y="2" width={w - 4} height="101" rx="13" fill={MARK.body} stroke={MARK.ink} strokeWidth="4" />
      <ellipse cx={w * 0.34} cy="26" rx="3.4" ry="5" fill={MARK.ink} />
      <ellipse cx={w * 0.62} cy="26" rx="3.4" ry="5" fill={MARK.ink} />
      <path
        d={`M${w * 0.36} 38 Q${w * 0.48} 45 ${w * 0.6} 38`}
        fill="none"
        stroke={MARK.ink}
        strokeWidth="3.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Maskotun o'yu iki yanından tutan küçük beyaz elleri (o'nun alt yarısında) */
function Hand({ at }: { at: number }) {
  return (
    <span
      className="absolute h-[0.15em] w-[0.15em] -translate-x-1/2 rounded-full border-[0.04em] border-[#111] bg-white"
      style={{ left: `${at}em`, bottom: "0.051em" }}
    />
  );
}

/**
 * Logbit kelime logosu — Geist 800, küçük harf, sıkı aralık; i'nin noktası
 * sarı bit (siyah çerçeveli daire), sapın 0.08em üstünde. `mascot` verilirse
 * Kutu maskotu o'nun arkasından onu tutar; yazının kendisi hiç değişmez.
 * Boyut yazı boyutuyla (em) ölçeklenir: className ile text-[..] ver. Ekran
 * okuyucu "Logbit" duyar.
 */
export function LogbitWordmark({ className, mascot = false }: { className?: string; mascot?: boolean }) {
  return (
    <span
      className={cn(
        // isolate: maskotun -z-10'u başlığın zemininin değil, yazının arkasına düşsün
        "relative isolate inline-flex items-baseline font-extrabold leading-none tracking-[-0.03em] text-[#111]",
        className
      )}
    >
      <span className="sr-only">{APP_NAME}</span>
      <span aria-hidden className="inline-flex items-baseline">
        l
        {mascot && (
          <Anchor>
            <MascotBehindO />
            <Hand at={O_LEFT + 0.01} />
            <Hand at={O_LEFT + O_WIDTH - 0.01} />
          </Anchor>
        )}
        ogb
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
