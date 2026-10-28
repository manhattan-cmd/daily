"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BarChart3, ChevronDown, Pencil, Plus, Trash2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { SymbolIcon } from "@/lib/icons";
import { useSkin } from "@/lib/skin";
import type { StructureSummary } from "@/lib/db/queries";
import type { Category, SubCategory } from "@/types";
import { routes } from "@/lib/routes";
import { SmartText } from "@/components/ui/smart-text";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { TopBar, TopBarButton } from "@/components/ui/top-bar";
import { SummaryBlock, SummaryTile, type SummaryStat } from "@/components/ui/summary-block";

/**
 * BRÜTAL YAPI SAYFALARI — yalnız Brütal tema seçiliyken (deneme).
 *
 * Yapı ekranları için 21 yönlü öneri sayfasındaki "P · Brütal" yerleşimi:
 * kategoriler düz renkli, kalın çerçeveli kartlar; kategori ve alt kategori
 * sayfasının tepesinde renkli büyük bir kart ve özet kutuları; altta tek
 * ana eylem. Başlığın hizasında simge yok — analiz, düzenle, sil üst
 * şeritte kare düğmeler. Diğer temalarda bu parçalar hiç çizilmez.
 */
export function useIsBrutal(): boolean {
  return useSkin() === "brutal";
}

const fmt = (n: number) => n.toLocaleString("tr-TR", { maximumFractionDigits: 0 });

/** Kare düğme — ortak üst menünün düğmesi (bkz. components/ui/top-bar) */
export function BrutIconButton({
  icon,
  label,
  href,
  onClick,
  danger,
}: {
  icon: LucideIcon;
  label: string;
  href?: string;
  onClick?: () => void;
  danger?: boolean;
}) {
  return <TopBarButton icon={icon} label={label} href={href} onClick={onClick} tone={danger ? "danger" : undefined} />;
}

/** Yapı sayfalarının üst menüsü: solda geri, sağda alt kategori ekle · analiz · düzenle · sil */
export function BrutTopStrip({
  back,
  analyticsHref,
  onEdit,
  onDelete,
  onAddSub,
  trail,
  nav,
}: {
  back: string;
  /** Bloğun alt satırı — kategori şeridi (bkz. CategoryNav) */
  nav?: React.ReactNode;
  /** Başlıkta etiketin altında: geri karosunun döndüğü yer */
  trail?: string;
  analyticsHref?: string;
  onEdit?: () => void;
  onDelete?: () => void;
  /** Bulunulan yerin altına alt kategori aç */
  onAddSub?: () => void;
}) {
  const t = useT();
  return (
    <TopBar back={back} label={t("nav.structure")} trail={trail} rows={nav}>
      {onAddSub && <TopBarButton icon={Plus} label={t("entry.addSub")} onClick={onAddSub} tone="add" />}
      {analyticsHref && <TopBarButton icon={BarChart3} label={t("nav.insights")} href={analyticsHref} />}
      {onEdit && <TopBarButton icon={Pencil} label={t("action.edit")} onClick={onEdit} />}
      {onDelete && <TopBarButton icon={Trash2} label={t("action.delete")} onClick={onDelete} tone="danger" />}
    </TopBar>
  );
}

/** Kategori sayfasının büyük kartı — renkli zemin, beyaz karo, ad, sayılar, damga */
export function BrutHeroCard({
  color,
  icon,
  overline,
  title,
  summary,
  className,
}: {
  color: string;
  icon?: string;
  overline: string;
  title: string;
  summary?: StructureSummary;
  className?: string;
}) {
  const t = useT();
  // Damga: bağlı sayısal özelliklerin toplamı; dokundukça sıradaki özellik
  const metrics = summary?.metrics ?? [];
  const [mi, setMi] = useState(0);
  const metric = metrics.length ? metrics[mi % metrics.length] : undefined;
  return (
    <div
      className={cn("relative mb-6 flex items-center gap-3 rounded-2xl border-2 border-[#111] p-4 shadow-[5px_5px_0_#111]", className)}
      style={{ background: color }}
    >
      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border-2 border-[#111] bg-white">
        {icon ? <SymbolIcon name={icon} size={28} style={{ color: "#111" }} /> : null}
      </span>
      <div className="min-w-0 flex-1 text-[#111]">
        <div className="text-[11px] font-extrabold uppercase tracking-wider opacity-80">{overline}</div>
        <div className="break-words text-[26px] font-black leading-[1.05] tracking-tight">{title}</div>
        {summary && (
          <div className="mt-1 text-[12.5px] font-bold">
            {t("brut.subsAndEntries", { subs: summary.subs, entries: summary.entries })}
          </div>
        )}
      </div>
      {/* Damga — düz; bağlı sayısal özelliklerin toplamı, dokundukça sıradaki */}
      {metric && (
        <button
          type="button"
          onClick={() => setMi((i) => i + 1)}
          aria-label={`${metric.name}: ${fmt(metric.total)} ${metric.unit}`}
          className="absolute -right-2 -top-3 flex items-center gap-1.5 rounded-lg border-2 border-[#111] bg-[#ff6b6b] px-2 py-0.5 text-[#111] shadow-[2px_2px_0_#111] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
        >
          <span className="text-[14px] font-black tabular-nums">
            {fmt(metric.total)}{metric.unit ? ` ${metric.unit}` : ""}
          </span>
          {metrics.length > 1 && (
            <span className="text-[10px] font-extrabold uppercase opacity-80">{metric.name}</span>
          )}
        </button>
      )}
    </div>
  );
}

/**
 * Kategori / alt kategori sayfasının tepesi — tek blokta (bkz. SummaryBlock):
 * üstte renkli şeritte karo, üst kategori ve ad; altında sayılar. Eskiden
 * kategoride damgalı tek kart, alt kategoride çıplak başlık ve üç ayrı kutu
 * vardı. Sayılar aynı: para varsa para · girdi · ortalama; yoksa girdi · alt
 * kategori · bağlı sayısal özelliğin toplamı (birden çoksa dokundukça
 * sıradaki — eski damga gibi). Analiz üst menüde.
 */
export function BrutThingSummary({
  color,
  icon,
  overline,
  title,
  summary,
  className,
}: {
  color: string;
  icon?: string;
  overline: string;
  title: string;
  summary?: StructureSummary;
  className?: string;
}) {
  const t = useT();
  const [mi, setMi] = useState(0);
  const stats: SummaryStat[] = [];
  if (summary?.money) {
    stats.push({ label: summary.money.name, value: fmt(summary.money.total), unit: unitUnlessName(summary.money.unit, summary.money.name), color: "#ff6b6b" });
    stats.push({ label: t("brut.entries"), value: String(summary.entries), color: "#8ea6ff" });
    stats.push({ label: t("brut.average"), value: fmt(summary.money.avg), color: "#7ae582" });
  } else if (summary) {
    const metrics = summary.metrics;
    const m = metrics.length ? metrics[mi % metrics.length] : undefined;
    stats.push({ label: t("brut.entries"), value: String(summary.entries), color: "#8ea6ff" });
    stats.push({ label: t("graph.kindSub"), value: String(summary.subs), color: "#7ae582" });
    if (m)
      stats.push({
        label: m.name,
        value: fmt(m.total),
        unit: unitUnlessName(m.unit, m.name),
        color: "#ff6b6b",
        onClick: metrics.length > 1 ? () => setMi((i) => i + 1) : undefined,
      });
  }
  return (
    <SummaryBlock
      className={className}
      lead={{ kind: "thing", color, icon, overline, title }}
      stats={stats}
    />
  );
}

/**
 * Kategori / alt kategori sayfasının Alt kategoriler bölümü — ana sayfanın
 * blok dili (bkz. SummaryBlock): solda pembe "ALT KATEGORİLER · 6 alt
 * kategori" (Kategorilerin'in rengi — yapının zinciri), yanında yeşil Alt
 * kategori ekle karosu (eskiden ağacın altında kesik çerçeveli soluk satır),
 * altında ağaç beyaz hücrede (bkz. BrutSubRows). Hiç yoksa ne işe yaradığı
 * yazıyor. Sayı bu kalemin altındaki bütün dallar.
 */
export function BrutSubsBlock({
  category,
  subs,
  counts,
  rootId,
  onAdd,
}: {
  category: Category;
  subs?: SubCategory[];
  counts?: Map<string, number>;
  /** Alt kategori sayfasında kendisi — yalnız altı */
  rootId?: string;
  onAdd: () => void;
}) {
  const t = useT();
  const total = useMemo(() => {
    if (!subs) return undefined;
    const own = subs.filter((s) => s.categoryId === category.id);
    if (!rootId) return own.length;
    let n = 0;
    const walk = (pid: string) => {
      for (const s of own) if (s.parentId === pid) { n++; walk(s.id); }
    };
    walk(rootId);
    return n;
  }, [subs, category.id, rootId]);
  return (
    <SummaryBlock
      className="mb-4"
      lead={{
        kind: "count",
        color: "#ff9ecd",
        overline: t("structure.subcategories"),
        value: total === undefined ? "–" : String(total),
        unit: t("struct.subs.unit"),
        hint: total ? t("struct.subs.hint") : undefined,
      }}
      action={<SummaryTile color="#7ae582" icon={Plus} label={t("entry.addSub")} onClick={onAdd} />}
      stats={[]}
    >
      {subs && total ? (
        <div data-subs-cell="" className="bg-white px-1.5 py-2">
          <BrutSubRows category={category} subs={subs} counts={counts} rootId={rootId} />
        </div>
      ) : subs ? (
        <p className="bg-white px-3.5 py-3 text-[12.5px] font-semibold leading-snug text-[#111]/65">
          {t("struct.subs.empty")}
        </p>
      ) : null}
    </SummaryBlock>
  );
}

/** Birim adın aynısıysa ("Bardak · 201 bardak") yazılmaz */
function unitUnlessName(unit: string | undefined, name: string) {
  return unit && unit.toLocaleLowerCase("tr") !== name.toLocaleLowerCase("tr") ? unit : undefined;
}

/** Kategoriler: düz renkli, kalın çerçeveli kartlar */
export function BrutCategoryCard({
  href,
  color,
  icon,
  name,
  subs,
  entries,
}: {
  href: string;
  color: string;
  icon?: string;
  name: string;
  subs?: number;
  entries?: number;
}) {
  const t = useT();
  return (
    <Link
      href={href}
      prefetch={false}
      className="flex min-h-[112px] flex-col gap-1 rounded-2xl border-2 border-[#111] p-3 text-[#111] shadow-[4px_4px_0_#111] transition-transform active:translate-x-[3px] active:translate-y-[3px] active:shadow-[1px_1px_0_#111]"
      style={{ background: color }}
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-xl border-2 border-[#111] bg-white">
        {icon ? <SymbolIcon name={icon} size={18} style={{ color: "#111" }} /> : null}
      </span>
      <b className="mt-auto break-words text-[16px] font-black leading-tight">{name}</b>
      {subs !== undefined && (
        <span className="text-[11.5px] font-bold">
          {t("brut.subsShort", { subs, entries: entries ?? 0 })}
        </span>
      )}
    </Link>
  );
}

/** Altta tek ana eylem — sarı, kalın çerçeveli, sayfanın altına yapışık */
export function BrutCta({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <div className="sticky bottom-3 z-20 mt-4">
      <button
        type="button"
        onClick={onClick}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border-2 border-[#111] bg-[#ffd23f] text-[16px] font-black text-[#111] shadow-[4px_4px_0_#111] transition-transform active:translate-x-[3px] active:translate-y-[3px] active:shadow-[1px_1px_0_#111]"
      >
        <Plus className="h-5 w-5" strokeWidth={3} />
        {label}
      </button>
    </div>
  );
}

/** Boş bölüm kartı — kesik çerçeveli, kısa açıklama, isteğe bağlı eylem */
export function BrutEmpty({
  title,
  hint,
  action,
  onAction,
}: {
  title: string;
  hint?: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-[#111] bg-white/60 px-4 py-5 text-center text-[#111]">
      <b className="text-[14px] font-black">{title}</b>
      {hint && <span className="text-[12px] font-semibold opacity-70">{hint}</span>}
      {action && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-1 flex h-9 items-center gap-1.5 rounded-xl border-2 border-[#111] bg-[#ffd23f] px-3 text-[13px] font-black shadow-[2px_2px_0_#111] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
        >
          <Plus className="h-4 w-4" strokeWidth={3} />
          {action}
        </button>
      )}
    </div>
  );
}

/**
 * Yapı → Kategoriler — ana sayfanın blok dili (bkz. SummaryBlock): her
 * kategori bir blok. Üstte kategorinin renginde ad hücresi (beyaz karoda
 * simgesi, adı, altında alt kategori · girdi sayısı; dokununca kategorinin
 * sayfası), yanında yeşil + Alt kategori karosu, altında beyaz hücrede
 * analizdeki yer ağacının dallanması — kategorinin renginde kılavuz çizgisi,
 * 1. kat kalın, derinler ince; karolar hep kategori renginin açık tonu. Her
 * satır kendi alt kategori sayfasına gider.
 *
 * Önceki hali "B2 · Sırt Şeridi" (Kartlı Dal denemelerinden seçilmişti):
 * solda kategorinin renginde dik şeritli, gölgeli beyaz kart.
 *
 * Derin ve kalabalık yapılar (bkz. "Derin Yapı Testi"): girinti MAX_INDENT
 * katta durur, daha derin satırlarda adın önünde kat numarası çıkar — 15. kattan
 * sonra adın yeri kalmıyor, sayı kartın dışına taşıyordu. Bir dalda SHOW_FIRST'ten
 * fazla kardeş varsa ilki görünür, altında "Tümünü göster (n)" satırı.
 */
type TreeLine =
  | { kind: "sub"; sub: SubCategory; depth: number }
  | { kind: "more"; key: string; depth: number; total: number; open: boolean };

const MAX_INDENT = 5;
const SHOW_FIRST = 8;

export function BrutCategoryTree({
  categories,
  subs,
  counts,
  onAddSub,
}: {
  categories: Category[];
  subs: SubCategory[];
  counts?: Map<string, number>;
  /** + Alt kategori karosu — o kategoriye yeni alt kategori */
  onAddSub: (category: Category) => void;
}) {
  const t = useT();
  const subTotals = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of subs) m.set(s.categoryId, (m.get(s.categoryId) ?? 0) + 1);
    return m;
  }, [subs]);

  return (
    <div className="flex flex-col gap-4 pb-6 pt-1">
      {categories.map((cat) => {
        const n = subTotals.get(cat.id) ?? 0;
        return (
          <div key={cat.id} data-cat-block={cat.id}>
          <SummaryBlock
            leadHref={routes.structureCategory(cat.id)}
            lead={{
              kind: "thing",
              color: cat.color,
              icon: cat.icon,
              title: cat.name,
              hint: t("brut.subsAndEntries", { subs: n, entries: counts?.get(`c:${cat.id}`) ?? 0 }),
            }}
            action={<SummaryTile color="#7ae582" icon={Plus} label={t("structure.addSub")} onClick={() => onAddSub(cat)} />}
            stats={[]}
          >
            {n > 0 ? (
              <div data-subs-cell="" className="bg-white px-1.5 py-2">
                <BrutSubRows category={cat} subs={subs} counts={counts} />
              </div>
            ) : (
              <p className="bg-white px-3.5 py-3 text-[12.5px] font-semibold leading-snug text-[#111]/65">
                {t("struct.subs.empty")}
              </p>
            )}
          </SummaryBlock>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Bir kategorinin (ya da bir alt kategorinin altındaki) hiyerarşisi — kılavuz
 * çizgili, küçük simgeli ince satırlar. Yapı → Kategoriler kartlarında ve alt
 * kategori sayfasının Alt kategoriler bölümünde aynı biçim.
 */
export function BrutSubRows({
  category: cat,
  subs,
  counts,
  rootId,
}: {
  category: Category;
  subs: SubCategory[];
  counts?: Map<string, number>;
  /** Verilirse yalnız bu alt kategorinin altı çizilir */
  rootId?: string;
}) {
  const t = useT();
  // Tümü açılmış kalabalık dallar — "kategoriId/üstId"
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const toggleBranch = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // Düzleştirilmiş ağaç; kalabalık dalın gizlenen kardeşleri alt ağaçlarıyla birlikte düşer
  const rows = useMemo(() => {
    const kids = new Map<string, SubCategory[]>();
    for (const s of subs) {
      if (s.categoryId !== cat.id) continue;
      const k = s.parentId ?? "";
      kids.set(k, [...(kids.get(k) ?? []), s]);
    }
    const acc: TreeLine[] = [];
    const walk = (parentId: string | undefined, depth: number) => {
      const key = `${cat.id}/${parentId ?? ""}`;
      const list = (kids.get(parentId ?? "") ?? []).sort((a, b) => a.order - b.order);
      const crowded = list.length > SHOW_FIRST;
      const open = expanded.has(key);
      const shown = crowded && !open ? list.slice(0, SHOW_FIRST) : list;
      for (const s of shown) {
        acc.push({ kind: "sub", sub: s, depth });
        walk(s.id, depth + 1);
      }
      if (crowded) acc.push({ kind: "more", key, depth, total: list.length, open });
    };
    walk(rootId, 1);
    return acc;
  }, [cat.id, subs, expanded, rootId]);

  const pill = (n: number) => (
    <span
      className={cn(
        "ml-auto shrink-0 rounded-full border-[1.5px] border-[#111]/20 px-2 py-px text-[11px] font-extrabold tabular-nums text-[#111]/70",
        n === 0 && "opacity-40"
      )}
    >
      {n}
    </span>
  );
  const tint = (color: string, pct: number) => `color-mix(in srgb, ${color} ${pct}%, white)`;

  return (
    <>
      {rows.map((line) => {
        const { depth } = line;
        const indent = 15 + (Math.min(depth, MAX_INDENT) - 1) * 16;
        // Kılavuz çizgisi — kategorinin renginde
        const guide = (
          <span
            className="w-[2px] shrink-0 rounded-full"
            style={{ background: depth === 1 ? cat.color : tint(cat.color, 50) }}
          />
        );
        if (line.kind === "more") {
          return (
            <div key={`more:${line.key}`} className="flex" style={{ paddingLeft: indent }}>
              {guide}
              <button
                type="button"
                onClick={() => toggleBranch(line.key)}
                aria-expanded={line.open}
                className="ml-2 flex min-h-[32px] min-w-0 flex-1 items-center gap-2 rounded-[10px] px-2 py-1 text-left text-[12.5px] font-extrabold text-[#111]/70 hover:bg-[#111]/5 active:bg-[#111]/10"
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-[1.5px] border-dashed border-[#111]/50">
                  <ChevronDown className={cn("h-3.5 w-3.5", line.open && "rotate-180")} strokeWidth={3} />
                </span>
                {line.open ? t("brut.showLess") : t("brut.showAll", { n: line.total })}
              </button>
            </div>
          );
        }
        const { sub } = line;
        const icon = sub.icon ?? cat.icon;
        return (
          <div key={sub.id} className="flex" style={{ paddingLeft: indent }}>
            {guide}
            <Link
              href={routes.structureSub(cat.id, sub.id)}
              prefetch={false}
              className={cn(
                "ml-2 flex min-h-[32px] min-w-0 flex-1 items-center gap-2.5 rounded-[10px] px-2 py-1 text-[13.5px] text-[#111] hover:bg-[#111]/5 active:bg-[#111]/10",
                depth === 1 ? "font-bold" : "font-medium"
              )}
            >
              <span
                className={cn(
                  "flex shrink-0 items-center justify-center border-[1.5px] border-[#111]",
                  depth === 1 ? "h-6 w-6 rounded-[7px]" : "h-5 w-5 rounded-md"
                )}
                style={{ background: tint(cat.color, 55) }}
              >
                {icon && <SymbolIcon name={icon} size={depth === 1 ? 13 : 11} style={{ color: "#111" }} />}
              </span>
              {/* Girinti durduktan sonra derinliği kat numarası söylüyor */}
              {depth > MAX_INDENT && (
                <span
                  aria-label={t("brut.level", { n: depth })}
                  title={t("brut.level", { n: depth })}
                  className="-mr-1 shrink-0 rounded-[5px] bg-[#111] px-1 font-mono text-[10px] font-extrabold leading-[16px] text-[#FFF4DC]"
                >
                  {depth}
                </span>
              )}
              <SmartText text={sub.name} className="min-w-0 flex-1" />
              {pill(counts?.get(sub.id) ?? 0)}
            </Link>
          </div>
        );
      })}
    </>
  );
}
