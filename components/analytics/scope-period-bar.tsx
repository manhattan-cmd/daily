"use client";

import { useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { HeaderOverline } from "@/components/ui/header-block";
import { canGoBackInApp } from "@/lib/nav-depth";
import { useLiveQuery } from "dexie-react-hooks";
import { useT } from "@/lib/i18n";
import { getSubCategory } from "@/lib/db/queries";
import { allPeriod, parsePeriodKey, type Period } from "@/lib/period";
import { routes } from "@/lib/routes";
import { SymbolIcon } from "@/lib/icons";
import { useSkin } from "@/lib/skin";
import { cn } from "@/lib/utils";
import type { Category, SubCategory } from "@/types";
import { PageHeader } from "@/components/layout/page-header";
import { PeriodNav, PeriodTabs } from "./period-switcher";
import { AnalysisTrail } from "./analysis-trail";
import { ANALYSIS_HEADER } from "./period-view";
import { ANALYSIS_COLOR, AnalysisMenu } from "./analysis-header";

/**
 * Kategori / alt kategori analizinin dönemi — ?p= (lib/period anahtarı),
 * yoksa "Tümü". Seçim URL'ye yazılır (geçmişe yeni kayıt açmadan): geri
 * dönüldüğünde ya da sayfa yenilendiğinde bakılan dönem korunur.
 */
export function useScopePeriod(): [Period, (p: Period) => void] {
  const params = useSearchParams();
  const [period, setPeriod] = useState<Period>(
    () => parsePeriodKey(params.get("p") ?? "all") ?? allPeriod()
  );
  const pick = (p: Period) => {
    setPeriod(p);
    const url = new URL(window.location.href);
    url.searchParams.set("p", p.key);
    url.searchParams.delete("range");
    window.history.replaceState(null, "", url.toString());
  };
  return [period, pick];
}

/** Alt kategorinin üst dalları, kökten başlayarak (kendisi hariç) */
async function ancestorsOf(sub: SubCategory): Promise<SubCategory[]> {
  const chain: SubCategory[] = [];
  let parentId = sub.parentId;
  while (parentId) {
    const p = await getSubCategory(parentId);
    if (!p) break;
    chain.unshift(p);
    parentId = p.parentId;
  }
  return chain;
}

/**
 * Kapsam analizinin üst menüsü — ana analizdeki bandın aynısı: ortada
 * ‹ dönem ›, altında Gün · Hafta · Ay · Yıl · Tümü, en altta konum yolu
 * (Kategoriler / Harcamalar / Ulaşım). Geri oku bandın solunda. Bant
 * yapışkan; sayfa kayarken dönem ve yer hep görünür.
 */
export function ScopeAnalysisHeader({
  category,
  subcategory,
  period,
  onPick,
  back,
}: {
  category?: Category;
  subcategory?: SubCategory;
  period: Period;
  onPick: (p: Period) => void;
  back: string;
}) {
  const t = useT();
  const router = useRouter();
  const brutal = useSkin() === "brutal";
  const ancestors =
    useLiveQuery(
      () => (subcategory ? ancestorsOf(subcategory) : Promise.resolve([])),
      [subcategory?.id, subcategory?.parentId]
    ) ?? [];
  const p = `p=${period.key}`;

  const trail = (
    <AnalysisTrail
      steps={[
        {
          key: "cats",
          label: t("structure.categories"),
          root: true,
          onClick: () =>
            router.push(category ? `/analytics?cat=${category.id}` : "/analytics"),
        },
        ...(category
          ? [
              {
                key: category.id,
                label: category.name,
                color: category.color,
                onClick: () =>
                  subcategory &&
                  router.push(`${routes.analyticsCategory(category.id)}&${p}`),
              },
              ...ancestors.map((a) => ({
                key: a.id,
                label: a.name,
                color: category.color,
                onClick: () => router.push(routes.analyticsSub(category.id, a.id, p)),
              })),
              ...(subcategory
                ? [
                    {
                      key: subcategory.id,
                      label: subcategory.name,
                      color: category.color,
                      onClick: () => {},
                    },
                  ]
                : []),
            ]
          : []),
      ]}
    />
  );

  // Brütal: Analiz'in üst menüsü (bkz. AnalysisMenu) — mavi şerit; üstte
  // geri, ANALİZ etiketi ve neyin analizi olduğu, altında dönem ve türleri.
  //
  // Bu sayfalar eskiden Analiz sekmesinin gezintisinin bir durağıydı
  // (Kategoriler › Harcamalar); sekme artık yeri kendi içinde açıyor, buraya
  // yapının "Analizi aç"ından geliniyor. O yüzden "Kategoriler" kökü (Analiz
  // sekmesine atıyordu) yok; geri geldiğin yere (yapı sayfası ya da üst
  // kalemin analizi), yol yalnız kalemin üstlerini gösterir — dokununca o
  // üstün analizi.
  if (brutal) {
    return (
      <AnalysisMenu
        period={period}
        onPick={onPick}
        top={
          category && (
            <ScopeNavRow
              category={category}
              ancestors={ancestors}
              subcategory={subcategory}
              periodParam={p}
              fallback={
                subcategory
                  ? routes.structureSub(category.id, subcategory.id)
                  : routes.structureCategory(category.id)
              }
            />
          )
        }
      />
    );
  }

  return (
    <PageHeader
      compact
      className={ANALYSIS_HEADER}
      title={subcategory?.name ?? category?.name ?? "..."}
      titleSlot={
        <div className="flex items-center gap-1">
          <Link
            href={back}
            aria-label={t("action.back")}
            className={cn(
              "flex shrink-0 items-center justify-center",
              // Brütal: dönem oklarıyla aynı ince çerçeveli kare
              brutal
                ? "h-[30px] w-[30px] rounded-[9px] border-[1.5px] border-[#111] text-[#111]"
                : "-ml-1.5 h-8 w-8 rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            )}
          >
            <ArrowLeft className="h-[18px] w-[18px]" strokeWidth={brutal ? 2.5 : 2} />
          </Link>
          <div className="min-w-0 flex-1">
            <PeriodNav period={period} onPick={onPick} />
          </div>
          {/* Geri okunun karşılığı — kumanda tam ortada dursun */}
          <span className="w-8 shrink-0" aria-hidden />
        </div>
      }
      nav={
        <div className="flex flex-col">
          <PeriodTabs period={period} onPick={onPick} />
          <div data-trail-wrap="" className="py-2">
            {trail}
          </div>
        </div>
      }
    />
  );
}

/**
 * Kategori / alt kategori analizinin üst satırı (Brütal) — Yapı'nın alt
 * sayfalarının üst menüsü gibi (bkz. TopBar: geri, bölümün etiketi,
 * bulunulan yer): sönük geri oku, ANALİZ etiketi, kalemin yolu
 * ("Harcamalar › Faturalar › Elektrik"). Üstler sönük ve dokununca o üstün
 * analizi (dönem taşınır); bulunulan yer kalın. Uzayınca satır yana kayar,
 * sona yaslı açılır.
 *
 * Geri: geldiğin yere (çoğu zaman kalemin yapı sayfası, kırılımdan
 * inildiyse üst kalemin analizi); sayfa doğrudan açıldıysa kalemin yapı
 * sayfasına.
 */
function ScopeNavRow({
  category,
  ancestors,
  subcategory,
  periodParam,
  fallback,
}: {
  category: Category;
  ancestors: SubCategory[];
  subcategory?: SubCategory;
  periodParam: string;
  fallback: string;
}) {
  const t = useT();
  const router = useRouter();
  const pathRef = useRef<HTMLDivElement>(null);
  // Sol kenarda gizli kalan kısım var mı — varsa yazı orada solarak biter
  // (yoksa harfin ortasından kesiliyordu)
  const [clipped, setClipped] = useState(false);
  const pathKey = [category.id, ...ancestors.map((a) => a.id), subcategory?.id].join("/");
  useLayoutEffect(() => {
    const el = pathRef.current;
    if (!el) return;
    el.scrollLeft = el.scrollWidth;
    setClipped(el.scrollLeft > 0);
  }, [pathKey]);
  const steps: { key: string; label: string; href?: string }[] = [
    {
      key: category.id,
      label: category.name,
      href: subcategory ? `${routes.analyticsCategory(category.id)}&${periodParam}` : undefined,
    },
    ...ancestors.map((a) => ({
      key: a.id,
      label: a.name,
      href: routes.analyticsSub(category.id, a.id, periodParam),
    })),
    ...(subcategory ? [{ key: subcategory.id, label: subcategory.name }] : []),
  ];
  const goBack = () => {
    // Uygulamanın içinden gelindiyse geldiği yere; doğrudan açıldıysa yapı
    // sayfası (bkz. nav-depth — history.length uygulama dışını da sayıyor)
    if (canGoBackInApp()) router.back();
    else router.push(fallback);
  };
  return (
    <div data-scope-nav="" className="flex items-center gap-2 pl-1 pr-3 pt-1">
      <button
        type="button"
        onClick={goBack}
        aria-label={t("action.back")}
        title={t("action.back")}
        className="flex h-10 w-10 shrink-0 items-center justify-center text-[#111]/60 active:text-[#111]"
      >
        <ArrowLeft className="h-5 w-5" strokeWidth={2.5} />
      </button>
      <HeaderOverline color={ANALYSIS_COLOR} className="mb-0 shrink-0 self-center">
        {t("nav.insights")}
      </HeaderOverline>
      <div
        ref={pathRef}
        onScroll={(e) => setClipped(e.currentTarget.scrollLeft > 0)}
        className="no-scrollbar flex min-w-0 flex-1 items-center overflow-x-auto"
        style={
          clipped
            ? {
                maskImage: "linear-gradient(to right, transparent, #000 18px)",
                WebkitMaskImage: "linear-gradient(to right, transparent, #000 18px)",
              }
            : undefined
        }
      >
        {steps.map((s, i) => (
          <span key={s.key} className="flex shrink-0 items-center">
            {i > 0 && <ChevronRight className="mx-0.5 h-3.5 w-3.5 shrink-0 text-[#111]/45" strokeWidth={2.75} />}
            {s.href ? (
              <Link
                href={s.href}
                prefetch={false}
                className="whitespace-nowrap text-[14px] font-bold leading-none text-[#111]/60 active:text-[#111]"
              >
                {s.label}
              </Link>
            ) : (
              <span aria-current="location" className="whitespace-nowrap text-[15px] font-black leading-none text-[#111]">
                {s.label}
              </span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Sayfanın başlığı — kalemin sembolü kendi renginde karoda, yanında üst
 * yazı (kategori / alt kategori analizi) ve büyük ad. Bantta değil sayfada:
 * kayınca yerini konum yolu tutar.
 */
export function ScopeTitle({
  category,
  subcategory,
  kicker,
}: {
  category: Category;
  subcategory?: SubCategory;
  kicker: string;
}) {
  const brutal = useSkin() === "brutal";
  const icon = subcategory?.icon ?? category.icon;
  const name = subcategory?.name ?? category.name;
  return (
    <div data-scope-title="" className="mb-4 flex items-center gap-3 px-1">
      {icon && (
        <span
          className={cn(
            "flex shrink-0 items-center justify-center",
            brutal
              ? "h-14 w-14 rounded-xl border-2 border-[#111] shadow-[3px_3px_0_#111]"
              : "h-12 w-12 rounded-2xl"
          )}
          style={{ background: brutal ? category.color : `${category.color}22` }}
        >
          <SymbolIcon
            name={icon}
            size={brutal ? 28 : 24}
            style={{ color: brutal ? "#111" : category.color }}
          />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div
          className={cn(
            "truncate",
            brutal
              ? "text-[12px] font-extrabold uppercase tracking-wider text-[#111]"
              : "text-[12px] font-medium text-muted-foreground"
          )}
        >
          {kicker}
        </div>
        <h2
          className={cn(
            "break-words leading-tight",
            brutal
              ? "text-[32px] font-black leading-none tracking-tight text-[#111]"
              : "text-[22px] font-semibold tracking-tight"
          )}
        >
          {name}
        </h2>
      </div>
    </div>
  );
}
