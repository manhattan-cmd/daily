"use client";

import type { ReactNode } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Check, LayoutGrid } from "lucide-react";
import { SymbolIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { useSkin } from "@/lib/skin";
import { loadQuickAdd, type QuickCell } from "@/lib/db/quick";
import type { Category, SubCategory } from "@/types";
import { SummaryBlock, SummaryEmpty } from "@/components/ui/summary-block";
import { tabDef, type AddTab } from "@/components/calendar/add-tabs";

/** Kategoriler bloğunun rengi — ana sayfanın Kategorilerin'i gibi pembe */
const CATEGORIES_COLOR = "#ff9ecd";

/**
 * EKLE › HIZLI — Ekle ekranının ilk sekmesi: en çok kullanılan şeyler tek
 * dokunuşta. Son 30 günde en çok GÜN eklenenler, tür ya da kalem ayırmadan
 * aynı ızgarada (her gün uyku giriliyorsa Uyku en önde; sık not yazılıyorsa
 * Not da gelir): kalem doğrudan formunu açar (bu sekmenin içinde, geri
 * dönünce yine burası), tür kendi sekmesine geçer. Sayfanın gününde
 * eklenmiş olanın köşesinde ✓ (yine eklenebilir). Altında en çok girdi alan
 * kategoriler: Girdi sekmesinde o kategoriyi açık getirir.
 *
 * Hücreler ana sayfanın "Yine ekle"siyle aynı dilde (bkz. FrequentBlock).
 */
export function QuickPicker({
  date,
  onPick,
  onTab,
  onCategory,
}: {
  date: string;
  onPick: (sub: SubCategory) => void;
  onTab: (k: AddTab) => void;
  onCategory: (c: Category) => void;
}) {
  const t = useT();
  const brutal = useSkin() === "brutal";
  const data = useLiveQuery(() => loadQuickAdd(date), [date]);

  const cellProps = (c: QuickCell) => {
    if (c.kind === "item") {
      const name = c.isRoot ? c.category.name : c.sub.name;
      const icon = c.sub.icon ?? c.category.icon;
      return {
        key: c.sub.id,
        kind: "item",
        color: c.category.color,
        icon: (fg: string) => icon && <SymbolIcon name={icon} size={17} style={{ color: fg }} />,
        name,
        sub: c.isRoot ? t("brut.category") : c.category.name,
        done: c.done,
        label: t("quick.addAria", { name }),
        onClick: () => onPick(c.sub),
      };
    }
    const d = tabDef(c.type);
    const name = t(d.label);
    return {
      key: c.type,
      kind: "type",
      color: d.color,
      icon: (fg: string) => <d.icon className="h-[17px] w-[17px]" strokeWidth={2.5} style={{ color: fg }} />,
      name,
      sub: c.done ? t("quick.done") : t("quick.days", { n: c.days }),
      done: c.done,
      label: t("quick.addAria", { name }),
      onClick: () => onTab(c.type),
    };
  };

  const empty = (
    <SummaryEmpty
      text={t("quick.empty")}
      action={{ label: t("quick.emptyAction"), onClick: () => onTab("entry") }}
    />
  );

  if (!brutal) {
    return (
      <div data-quick-list="" className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-4 pb-8 pt-3">
        {data && (
          <>
            <SadeTitle title={t("quick.frequent")} hint={t("quick.hint")} />
            {data.cells.length === 0 ? (
              <button
                type="button"
                onClick={() => onTab("entry")}
                className="rounded-2xl border border-dashed border-[var(--ln-2)] px-5 py-6 text-center text-sm text-muted-foreground hover:bg-[var(--sf-1)]"
              >
                {t("quick.empty")}
              </button>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {data.cells.map((c) => {
                  const p = cellProps(c);
                  return (
                    <SadeCell
                      key={p.key}
                      kind={p.kind}
                      color={p.color}
                      icon={p.icon(p.color)}
                      name={p.name}
                      sub={p.sub}
                      done={p.done}
                      label={p.label}
                      onClick={p.onClick}
                    />
                  );
                })}
              </div>
            )}
            {data.categories.length > 0 && (
              <>
                <SadeTitle title={t("quick.categories")} className="mt-5" />
                <div className="grid grid-cols-2 gap-2">
                  {data.categories.map(({ category, count }) => (
                    <SadeCell
                      key={category.id}
                      kind="category"
                      color={category.color}
                      icon={category.icon && <SymbolIcon name={category.icon} size={17} style={{ color: category.color }} />}
                      name={category.name}
                      sub={t("quick.catCount", { n: count })}
                      label={t("quick.openCat", { name: category.name })}
                      onClick={() => onCategory(category)}
                    />
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    );
  }

  // Sayfa zemini (bkz. PageSheet, EntryTreePicker): krem döşemenin önünde beyaz yüzey
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        data-page-sheet=""
        className="mx-2.5 mt-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-t-[20px] border-2 border-b-0 bg-white"
        style={{ borderColor: "#111" }}
      >
        <div
          data-quick-list=""
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1.5 pt-3"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 28px)" }}
        >
          {data && (
            <div className="flex flex-col gap-2.5">
              <SummaryBlock
                compact
                dense
                lead={{ kind: "title", overline: "", title: t("quick.frequent"), hint: t("quick.hint"), color: tabDef("quick").color, glyph: tabDef("quick").icon }}
                stats={[]}
              >
                {data.cells.length === 0 ? (
                  empty
                ) : (
                  <div className="grid grid-cols-2 gap-[2px]">
                    {data.cells.map((c, idx) => {
                      const p = cellProps(c);
                      return (
                        <BrutCell
                          key={p.key}
                          kind={p.kind}
                          color={p.color}
                          icon={p.icon("#111")}
                          name={p.name}
                          sub={p.sub}
                          done={p.done}
                          label={p.label}
                          onClick={p.onClick}
                          wide={data.cells.length % 2 === 1 && idx === data.cells.length - 1}
                        />
                      );
                    })}
                  </div>
                )}
              </SummaryBlock>
              {data.categories.length > 0 && (
                <SummaryBlock
                  compact
                  dense
                  lead={{ kind: "title", overline: "", title: t("quick.categories"), hint: t("quick.catHint"), color: CATEGORIES_COLOR, glyph: LayoutGrid }}
                  stats={[]}
                >
                  <div className="grid grid-cols-2 gap-[2px]">
                    {data.categories.map(({ category, count }, idx) => (
                      <BrutCell
                        key={category.id}
                        kind="category"
                        color={category.color}
                        icon={category.icon && <SymbolIcon name={category.icon} size={17} style={{ color: "#111" }} />}
                        name={category.name}
                        sub={t("quick.catCount", { n: count })}
                        label={t("quick.openCat", { name: category.name })}
                        onClick={() => onCategory(category)}
                        wide={data.categories.length % 2 === 1 && idx === data.categories.length - 1}
                      />
                    ))}
                  </div>
                </SummaryBlock>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Ana sayfanın Yine ekle hücresi: tepede renk bandı, renkli karo, ad ve altında bağlamı */
function BrutCell({
  kind,
  color,
  icon,
  name,
  sub,
  done = false,
  label,
  onClick,
  wide,
}: {
  kind: string;
  color: string;
  icon: ReactNode;
  name: string;
  sub: string;
  done?: boolean;
  label: string;
  onClick: () => void;
  wide: boolean;
}) {
  return (
    <button
      type="button"
      data-quick-cell={kind}
      onClick={onClick}
      aria-label={label}
      className={cn("flex min-w-0 flex-col bg-white text-left text-[#111] active:bg-[#f5f1e8]", wide && "col-span-2")}
    >
      <span className="h-1.5 shrink-0" style={{ background: color }} />
      <span className="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-2">
        <span
          className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] border-[1.5px] border-[#111]"
          style={{ background: color }}
        >
          {icon}
          {done && <DoneBadge brutal />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 break-words text-[13px] font-extrabold leading-tight">{name}</span>
          <span className="block truncate text-[10.5px] font-bold text-[#111]/50">{sub}</span>
        </span>
      </span>
    </button>
  );
}

/**
 * Sayfanın gününde eklenmiş — karonun köşesinde yeşil ✓ (hücre yine
 * dokunulur, bir daha eklenir). Eskiden her hücrenin sağında + karosu vardı:
 * hücrenin kendisi düğme, karo dar ekranda adı ikiye bölüyordu ("Harcamala r")
 */
function DoneBadge({ brutal }: { brutal: boolean }) {
  return (
    <span
      data-quick-done=""
      className={cn(
        "absolute -right-1.5 -top-1.5 flex h-[18px] w-[18px] items-center justify-center rounded-full",
        brutal ? "border-[1.5px] border-[#111] bg-[#7ae582] text-[#111]" : "bg-emerald-500 text-white"
      )}
    >
      <Check className="h-2.5 w-2.5" strokeWidth={4} />
    </span>
  );
}

function SadeTitle({ title, hint, className }: { title: string; hint?: string; className?: string }) {
  return (
    <div className={cn("mb-2 flex items-baseline gap-2 px-1", className)}>
      <span className="text-[13px] font-semibold">{title}</span>
      {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
    </div>
  );
}

function SadeCell({
  kind,
  color,
  icon,
  name,
  sub,
  done = false,
  label,
  onClick,
}: {
  kind: string;
  color: string;
  icon: ReactNode;
  name: string;
  sub: string;
  done?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-quick-cell={kind}
      onClick={onClick}
      aria-label={label}
      className="flex min-w-0 items-center gap-2.5 rounded-2xl bg-[var(--sf-1)] px-3 py-2.5 text-left ring-1 ring-inset ring-[var(--ln-1)] transition-colors hover:bg-[var(--sf-2)]"
    >
      <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-xl" style={{ background: `${color}26` }}>
        {icon}
        {done && <DoneBadge brutal={false} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 break-words text-[13px] font-semibold leading-tight">{name}</span>
        <span className="block truncate text-[11px] text-muted-foreground">{sub}</span>
      </span>
    </button>
  );
}
