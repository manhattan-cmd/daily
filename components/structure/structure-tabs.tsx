"use client";

import Link from "next/link";
import { Circle, Diamond, Map as MapIcon, Rows3, Square, StickyNote, type LucideIcon } from "lucide-react";
import { useRoutePath } from "@/lib/use-route-path";
import { useT, type MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useSkin, isBlockSkin } from "@/lib/skin";

export const STRUCTURE_TABS: { href: string; key: MessageKey; icon: LucideIcon }[] = [
  // Simgeler şekil dilinden: kare = kategori, daire = özellik, baklava = nesne
  { href: "/structure", key: "structure.categories", icon: Square },
  { href: "/structure/mods", key: "structure.features", icon: Circle },
  { href: "/structure/objects", key: "structure.objects", icon: Diamond },
  // Girdiler: bütün girdiler ve planlı girdiler (satır satır kayıtlar)
  { href: "/structure/entries", key: "structure.entries", icon: Rows3 },
  // Ölçüler sekmesi v18'de kalktı — ölçüm artık özelliğin kendi içinde
  { href: "/structure/notes", key: "structure.notes", icon: StickyNote },
  { href: "/structure/galaxy", key: "structure.map", icon: MapIcon },
];

/**
 * Seçili sekme — kategori ve alt kategori sayfaları Kategoriler sekmesinin,
 * liste ve nesne sayfaları Nesneler sekmesinin içi: sayfa başı aynı (bkz.
 * StructureHead), aşağı indikçe yalnız altındaki konum yolu değişir.
 */
export function structureTabIndex(path: string): number {
  const i = STRUCTURE_TABS.findIndex((tab) => tab.href === path);
  if (i >= 0) return i;
  if (/^\/structure\/(category|sub)(\/|$)/.test(path)) return 0;
  if (/^\/structure\/(collection|thing)(\/|$)/.test(path)) return 2;
  return -1;
}

/**
 * Yapı bölümünün üst menüsü.
 *
 * Tek parça bir ray. Eskiden bunlar sayfa gövdesinde duran ayrı ayrı
 * çiplerdi ve Analiz'in dönem SÜZGEÇ çipleriyle aynı biçimdeydi — iki ayrı
 * iş aynı görünüyordu. Burası gezinme; süzgeç değil, o yüzden kendi biçimi
 * var ve başlığın yapışkan bandının içinde duruyor (bkz. PageHeader `nav`).
 *
 * Her sekme simge üstte, ad altta: beş ad tek satırda yan yana sığmıyordu
 * ("Kategoril…"); alt alta dizilince her ad hücrenin bütün genişliğini alıyor.
 *
 * Sekme genişliği adı kadar, artan yer sekmelere eşit paylaşılır (flex-auto).
 * Altı eşit hücrede (63 px) "Kategoriler" hücreyi bütünüyle dolduruyor,
 * "Özellikler"e 3 px kalıyordu; Notlar ve Harita ise boşlukta yüzüyordu.
 * Artık adlar arasındaki boşluk her yerde aynı.
 */
export function StructureTabs() {
  const t = useT();
  const pathname = useRoutePath();
  const activeIndex = structureTabIndex(pathname);
  const brutal = isBlockSkin(useSkin());

  // Brütal: şeridin sekmeleri (bkz. StructureHeader) — alt menünün aynası:
  // simge ve altında ad, çerçevesiz; seçili olanın simgesi kalkık beyaz
  // kapsülde (şekli sarı dolu), adı koyu. Eskiden beş beyaz hücre ortak
  // çizgilerle, seçili olan siyahtı.
  if (brutal) {
    return (
      <nav aria-label={t("structure.title")}>
        <div data-tab-strip="" className="flex px-1.5 pb-2 pt-2">
          {STRUCTURE_TABS.map((tab, i) => {
            const on = i === activeIndex;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={on ? "page" : undefined}
                className="flex flex-auto flex-col items-center gap-[5px] pt-1 text-ink"
              >
                <span
                  className={cn(
                    "box-content flex h-[18px] w-[18px] items-center justify-center rounded-full border-[1.5px] px-[10px] py-[2px] transition-transform",
                    on ? "-translate-y-0.5 bg-paper shadow-[2px_2px_0_var(--shade)]" : "text-ink/60"
                  )}
                  // Çerçeve rengi satır içi: katmansız "* { border-color }" kuralı border-transparent'ı eziyor
                  style={{ borderColor: on ? "var(--line)" : "transparent" }}
                >
                  <tab.icon
                    className={cn("shrink-0", tab.icon === Diamond ? "h-[15px] w-[15px]" : "h-3.5 w-3.5")}
                    strokeWidth={2.6}
                    fill={on ? "#ffd23f" : "none"}
                  />
                </span>
                {/* Görünmez kalın kopya yer ayırır: seçilen sekmenin adı
                    kalınlaşınca genişleyip öteki sekmeleri itmesin */}
                <span className="grid whitespace-nowrap text-center text-[10.5px] leading-none tracking-[-0.01em]">
                  <span aria-hidden className="invisible col-start-1 row-start-1 font-black">
                    {t(tab.key)}
                  </span>
                  <span
                    className={cn(
                      "col-start-1 row-start-1",
                      on ? "font-black" : "font-bold text-ink/65"
                    )}
                  >
                    {t(tab.key)}
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    );
  }

  return (
    <nav aria-label={t("structure.title")}>
      {/* Seçili sekmenin zemini kendi hücresinde. Eskiden ray üstünde kayan
          ayrı bir göstergeydi, ama her Yapı sayfası başlığı yeniden kurduğu
          için kayma hiç oynamıyordu. Üstelik eşit hücre gerektiriyordu ve
          adı uzun sekmede yazı zeminin dışına taşıyordu */}
      <div data-brut-tabs="" className="flex rounded-2xl border border-border/70 bg-card/40 p-[3px]">
        {STRUCTURE_TABS.map((tab, i) => {
          const on = i === activeIndex;
          return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={on ? "page" : undefined}
            data-active={on ? "" : undefined}
            className={cn(
              "flex flex-auto flex-col items-center gap-1 rounded-xl px-1.5 pb-1.5 pt-2 transition-colors",
              on
                ? "bg-primary/15 text-primary ring-1 ring-inset ring-primary/30"
                : "text-muted-foreground/75 hover:text-foreground"
            )}
          >
            {/* Simgeler aynı yükseklikte kutuda — baklava biraz büyük, adlar aynı hizada */}
            <span className="flex h-4 items-center justify-center">
              <tab.icon
                className={cn("shrink-0", tab.icon === Diamond ? "h-[15px] w-[15px]" : "h-3.5 w-3.5")}
                strokeWidth={2.4}
                // Satırlar (Girdiler) dolunca kareye dönüyor, kategoriyle karışıyordu
                fill={on && tab.icon !== Rows3 ? "currentColor" : "none"}
              />
            </span>
            <span className="w-full whitespace-nowrap text-center text-[10.5px] font-semibold leading-none tracking-[-0.01em]">
              {t(tab.key)}
            </span>
          </Link>
          );
        })}
      </div>
    </nav>
  );
}
