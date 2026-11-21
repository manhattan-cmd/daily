"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useT } from "@/lib/i18n";

/** Ana Sayfa'nın rengi — başlığından açılan sayfalar (Ara, Ayarlar) da onun şeridinde */
export const HOME_COLOR = "#a9b0ff";

/**
 * Alt sayfanın üst menüsü (Brütal) — Ana Sayfa, Takvim, Gün, Analiz ve
 * Yapı'nınki gibi şerit (bkz. AnalysisMenu): kenardan kenara bölümün
 * renginde, altında tek kalın siyah çizgi, durum çubuğu da aynı renk (bkz.
 * statusBarColor). Solda sönük geri oku, ortada sayfanın adı ve altında
 * kısa satır; sağda okun boyu kadar boşluk, ad tam ortada dursun. Altına
 * verilen satırlar (Ara'nın arama kutusu ve tarih sekmeleri) şeridin içinde.
 * Yapışkan.
 *
 * Eskiden Ara ve Ayarlar başlık bloğuydu (ortak çizgili beyaz geri sütunu,
 * benekli hücre, siyah etiket); öbür sayfalar şeride geçince krem döşemede
 * asılı kalmışlardı.
 */
export function SubPageMenu({
  title,
  sub,
  back = "/",
  color = HOME_COLOR,
  children,
}: {
  title: string;
  sub?: ReactNode;
  back?: string;
  color?: string;
  /** Başlığın altındaki satırlar */
  children?: ReactNode;
}) {
  const t = useT();
  return (
    <header
      data-sub-nav=""
      // -mx-4: main'in kenar payını aşıp kenardan kenara (alt menü gibi)
      className="sticky top-0 z-30 -mx-4 border-b-[3px] border-[#111] pt-[env(safe-area-inset-top,0px)]"
      style={{ background: color }}
    >
      <div className="flex items-stretch px-1">
        <Link
          href={back}
          prefetch={false}
          aria-label={t("action.back")}
          title={t("action.back")}
          className="flex w-10 shrink-0 items-center justify-center text-[#111]/70 active:text-[#111]"
        >
          <ArrowLeft className="h-5 w-5" strokeWidth={2.5} />
        </Link>
        <div className="flex min-w-0 flex-1 flex-col items-center justify-center pb-[11px] pt-3 text-center">
          <h1 className="max-w-full truncate text-[20px] font-black leading-none tracking-[-0.02em] text-[#111]">{title}</h1>
          {sub && <p className="mt-[6px] max-w-full truncate text-[11.5px] font-bold leading-none text-[#111]/65">{sub}</p>}
        </div>
        <span aria-hidden className="w-10 shrink-0" />
      </div>
      {children}
    </header>
  );
}
