"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
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
          </div>
        </div>
      }
    />
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
