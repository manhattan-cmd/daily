"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronDown, Plus, Square } from "lucide-react";
import { SymbolIcon } from "@/lib/icons";
import { useSkin, isBlockSkin } from "@/lib/skin";
import type { StructureSummary } from "@/lib/db/queries";
import type { Category, SubCategory } from "@/types";
import { routes } from "@/lib/routes";
import { SmartText } from "@/components/ui/smart-text";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { SummaryBlock, SummaryEmpty, SummaryTile, type SummaryStat } from "@/components/ui/summary-block";
import { blockInk, fillStyle } from "@/lib/fill";

/**
 * BRÜTAL YAPI SAYFALARI — yalnız Brütal tema seçiliyken (deneme).
 *
 * Yapı ekranları için 21 yönlü öneri sayfasındaki "P · Brütal" yerleşimi:
 * kategoriler düz renkli, kalın çerçeveli kartlar; kategori ve alt kategori
 * sayfasının tepesinde renkli büyük bir kart ve özet kutuları; altta tek
 * ana eylem. Kalemin adı, sayıları, Analiz · Düzenle · Sil sayfa başında
 * (bkz. StructureHead). Diğer temalarda bu parçalar hiç çizilmez.
 */
export function useIsBrutal(): boolean {
  return isBlockSkin(useSkin());
}

const fmt = (n: number) => n.toLocaleString("tr-TR", { maximumFractionDigits: 0 });

/** Kalemin sayıları — girdi · bu ay · son girdi (kategori, alt kategori
 *  sayfalarının başı ve özet bloğu); yüklenirken boş */
export function summaryStats(summary: StructureSummary | undefined, t: ReturnType<typeof useT>): SummaryStat[] {
  return summary
    ? [
        { label: t("brut.entries"), value: fmt(summary.entries), color: "#8ea6ff" },
        { label: t("brut.thisMonth"), value: fmt(summary.month), color: "#7ae582" },
        // Son girdiler bölümünün turuncusu
        { label: t("brut.lastEntry"), ...lastEntry(summary.lastAt, t), color: "#ffb38a" },
      ]
    : [];
}

/**
 * Kategori / alt kategori sayfasının Alt kategoriler bölümü — ana sayfanın
 * blok dili (bkz. SummaryBlock): solda pembe "ALT KATEGORİLER · 6 alt
 * kategori" (Kategorilerin'in rengi — yapının zinciri), yanında yeşil Alt
 * kategori ekle karosu (eskiden ağacın altında kesik çerçeveli soluk satır),
 * altında ağaç beyaz hücrede (bkz. BrutSubRows). Hiç yoksa yalnız "0 alt
 * kategori" ve ekle karosu — eskiden altında ne işe yaradığını anlatan bir
 * cümle vardı, kullanıcıya göre gereksizdi. Sayı bu kalemin altındaki bütün
 * dallar.
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
      compact
      lead={{
        kind: "count",
        color: "#ff9ecd",
        glyph: Square,
        overline: t("structure.subcategories"),
        value: total === undefined ? "–" : String(total),
        unit: t("struct.subs.unit"),
        hint: total ? t("struct.subs.hint") : undefined,
      }}
      action={total ? <SummaryTile compact color="#7ae582" icon={Plus} label={t("entry.addSub")} onClick={onAdd} /> : undefined}
      stats={[]}
    >
      {subs && total ? (
        <SubsCell>
          <BrutSubRows category={category} subs={subs} counts={counts} rootId={rootId} />
        </SubsCell>
      ) : total === 0 ? (
        <SummaryEmpty text={t("brut.noSubs")} action={{ label: t("action.create"), onClick: onAdd }} />
      ) : null}
    </SummaryBlock>
  );
}

/** Son girdi kaç gün önce — bugün, dün, "3 gün önce"; hiç yoksa – */
export function lastEntry(at: number | undefined, t: ReturnType<typeof useT>): { value: string; unit?: string } {
  if (at === undefined) return { value: "–" };
  const day = (ms: number) => {
    const d = new Date(ms);
    return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000;
  };
  const n = Math.max(0, Math.round(day(Date.now()) - day(at)));
  if (n === 0) return { value: t("brut.lastToday") };
  if (n === 1) return { value: t("brut.lastYesterday") };
  return { value: fmt(n), unit: t("brut.daysAgo") };
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
      className="flex min-h-[112px] flex-col gap-1 rounded-2xl border-2 border-line p-3 text-ink shadow-[4px_4px_0_var(--shade)] transition-transform active:translate-x-[3px] active:translate-y-[3px] active:shadow-[1px_1px_0_var(--shade)]"
      style={fillStyle(color)}
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-xl border-2 border-line bg-paper">
        {icon ? <SymbolIcon name={icon} size={18} style={{ color: blockInk(color) }} /> : null}
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
        className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border-2 border-line bg-fill-[#ffd23f] text-[16px] font-black text-ink shadow-[4px_4px_0_var(--shade)] transition-transform active:translate-x-[3px] active:translate-y-[3px] active:shadow-[1px_1px_0_var(--shade)]"
      >
        <Plus className="h-5 w-5" strokeWidth={3} />
        {label}
      </button>
    </div>
  );
}

/**
 * Yapı → Kategoriler — ana sayfanın blok dili (bkz. SummaryBlock): her
 * kategori bir blok. Üstte kategorinin renginde ad hücresi (beyaz karoda
 * simgesi, adı, altında alt kategori · girdi sayısı; dokununca kategorinin
 * sayfası), yanında yeşil + Alt kategori karosu, altında beyaz hücrede
 * alt kategorilerin dalları (bkz. BrutSubRows). Her satır kendi alt kategori
 * sayfasına gider.
 *
 * Önceki hali "B2 · Sırt Şeridi" (Kartlı Dal denemelerinden seçilmişti):
 * solda kategorinin renginde dik şeritli, gölgeli beyaz kart.
 */
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
          <SummaryBlock
            key={cat.id}
            leadHref={routes.structureCategory(cat.id)}
            compact
            lead={{
              kind: "thing",
              color: cat.color,
              icon: cat.icon,
              title: cat.name,
              hint: t("brut.subsAndEntries", { subs: n, entries: counts?.get(`c:${cat.id}`) ?? 0 }),
            }}
            action={n > 0 ? <SummaryTile compact color="#7ae582" icon={Plus} label={t("structure.addSub")} onClick={() => onAddSub(cat)} /> : undefined}
            stats={[]}
          >
            {/* Alt kategorisi yoksa boş pencere: yazı ve ufak Oluştur */}
            {n > 0 ? (
              <SubsCell>
                <BrutSubRows category={cat} subs={subs} counts={counts} />
              </SubsCell>
            ) : (
              <SummaryEmpty text={t("brut.noSubs")} action={{ label: t("action.create"), onClick: () => onAddSub(cat) }} />
            )}
          </SummaryBlock>
        );
      })}
    </div>
  );
}

/** Dalların beyaz hücresi — 1. kat karoları başın simge karosuyla aynı
 *  hizadan başlıyor (bkz. BrutSubRows) */
function SubsCell({ children }: { children: ReactNode }) {
  return (
    <div data-subs-cell="" className="bg-paper px-2 py-2">
      {children}
    </div>
  );
}

/**
 * Bir kategorinin (ya da bir alt kategorinin altındaki) dalları. Yapı →
 * Kategoriler bloklarında ve kategori / alt kategori sayfasının Alt
 * kategoriler bölümünde aynı biçim.
 *
 *  - 1. kat hücrenin solundan başlar; karosu kategorinin dolgusunda, adı kalın.
 *    Kat grupları arasında 4 px boşluk.
 *  - Alt katlar üst katın karosunun ortasından inen çizgiye kıvrık bir dirsekle
 *    (├ / └) bağlanır; çizgi karonun altından çıkar, son kardeşte biter.
 *    Karolar kategori renginin açık tonu, adlar normal kalınlıkta.
 *  - Girinti MAX_INDENT katta durur; daha derin satırlar o hizada kalır, adın
 *    önünde kat numarası çıkar (bkz. "Derin Yapı Testi": 15. kattan sonra adın
 *    yeri kalmıyordu).
 *  - Bir dalda SHOW_FIRST'ten fazla kardeş varsa ilki görünür, son dirsekte
 *    "Tümünü göster (n)".
 *
 * Önceki hali (2026-10 → 2026-11-25): her satırın solunda kendi katının
 * hizasında dik kılavuz çizgisi; 1. kat bile 15 px girinti + çizgi + 8 px
 * boşlukla başlıyor, adlar bloğun kenarından ~67 px içeride kalıyordu.
 * Kullanıcı dalların daha soldan başlamasını istedi (2026-11-26).
 */
type TreeLine =
  | { kind: "sub"; sub: SubCategory; depth: number; rails: boolean[]; last: boolean; kids: boolean }
  | { kind: "more"; key: string; depth: number; rails: boolean[]; last: true; kids: false; total: number; open: boolean };

const MAX_INDENT = 5;
const SHOW_FIRST = 8;
/** Bağlantının sol iç boşluğu ve karo ölçüleri (1. kat / derin) */
const PAD = 4;
const iconSize = (depth: number) => (depth === 1 ? 26 : 22);
/** j. katın altındaki dal sütunu: genişliği ve çizginin yeri (karonun ortası) */
const railW = (j: number) => (j === 1 ? 24 : 22);
const railX = (j: number) => PAD + iconSize(j) / 2 - 1;

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

  // Düzleştirilmiş ağaç; kalabalık dalın gizlenen kardeşleri alt ağaçlarıyla
  // birlikte düşer. rails[j]: (j+1). sütunun dik çizgisi bu satırdan geçiyor mu
  const rows = useMemo(() => {
    const kids = new Map<string, SubCategory[]>();
    for (const s of subs) {
      if (s.categoryId !== cat.id) continue;
      const k = s.parentId ?? "";
      kids.set(k, [...(kids.get(k) ?? []), s]);
    }
    const acc: TreeLine[] = [];
    const walk = (parentId: string | undefined, depth: number, rails: boolean[]) => {
      const key = `${cat.id}/${parentId ?? ""}`;
      const list = (kids.get(parentId ?? "") ?? []).sort((a, b) => a.order - b.order);
      const crowded = list.length > SHOW_FIRST;
      const open = expanded.has(key);
      const shown = crowded && !open ? list.slice(0, SHOW_FIRST) : list;
      shown.forEach((s, i) => {
        const last = !crowded && i === shown.length - 1;
        const at = acc.push({ kind: "sub", sub: s, depth, rails, last, kids: false }) - 1;
        const before = acc.length;
        walk(s.id, depth + 1, depth === 1 ? [] : [...rails, !last]);
        if (acc.length > before) (acc[at] as { kids: boolean }).kids = true;
      });
      if (crowded) acc.push({ kind: "more", key, depth, rails, last: true, kids: false, total: list.length, open });
    };
    walk(rootId, 1, []);
    return acc;
  }, [cat.id, subs, expanded, rootId]);

  const pill = (n: number) => (
    <span
      className={cn(
        "ml-auto shrink-0 rounded-full border-[1.5px] border-ink/20 px-2 py-px text-[11px] font-extrabold tabular-nums text-ink/70",
        n === 0 && "opacity-40"
      )}
    >
      {n}
    </span>
  );
  const tint = (color: string, pct: number) => `color-mix(in srgb, ${color} calc(${pct}% * var(--fill-scale)), var(--paper))`;
  const ink = cat.color;

  /** Satırın solundaki dal sütunları: geçen çizgiler ve kendi dirseği */
  const railsFor = (line: TreeLine) => {
    const { depth } = line;
    if (depth === 1) return null;
    const deep = depth > MAX_INDENT;
    const cols = Math.min(depth - 1, MAX_INDENT - 1);
    return Array.from({ length: cols }, (_, i) => {
      const j = i + 1;
      const x = railX(j);
      const elbow = !deep && j === cols;
      return (
        <span key={j} aria-hidden className="relative shrink-0 self-stretch" style={{ width: railW(j) }}>
          {elbow ? (
            <>
              <span
                className="absolute top-0 rounded-bl-[8px] border-b-2 border-l-2"
                style={{ left: x, height: "calc(50% + 1px)", width: railW(j) + PAD - x, borderColor: ink }}
              />
              {/* Kardeşi varsa çizgi kesintisiz iner, dirsek ondan ayrılır */}
              {!line.last && <span className="absolute inset-y-0 w-[2px]" style={{ left: x, background: ink }} />}
            </>
          ) : (
            line.rails[i] && <span className="absolute inset-y-0 w-[2px]" style={{ left: x, background: ink }} />
          )}
        </span>
      );
    });
  };
  /** Karonun altından inen çizgi — altında görünen dal varsa (derinde girinti
   *  durduğu için yok) */
  const stem = (line: TreeLine) => {
    if (!line.kids || line.depth >= MAX_INDENT) return null;
    let left = PAD + iconSize(line.depth) / 2 - 1;
    for (let j = 1; j < line.depth; j++) left += railW(j);
    return (
      <span
        aria-hidden
        className="absolute bottom-0 w-[2px]"
        style={{ left, top: `calc(50% + ${iconSize(line.depth) / 2}px)`, background: ink }}
      />
    );
  };

  return (
    <>
      {rows.map((line, i) => {
        const { depth } = line;
        const top = depth === 1 && i > 0;
        if (line.kind === "more") {
          return (
            <div key={`more:${line.key}`} className={cn("relative flex", top && "mt-1")}>
              {railsFor(line)}
              <button
                type="button"
                onClick={() => toggleBranch(line.key)}
                aria-expanded={line.open}
                className="flex min-h-[32px] min-w-0 flex-1 items-center gap-2 rounded-[10px] py-1 pl-1 pr-2 text-left text-[12.5px] font-extrabold text-ink/70 hover:bg-ink/5 active:bg-ink/10"
              >
                <span
                  className="flex shrink-0 items-center justify-center rounded-md border-[1.5px] border-dashed border-ink/50"
                  style={{ width: iconSize(depth), height: iconSize(depth) }}
                >
                  <ChevronDown className={cn("h-3.5 w-3.5", line.open && "rotate-180")} strokeWidth={3} />
                </span>
                {line.open ? t("brut.showLess") : t("brut.showAll", { n: line.total })}
              </button>
            </div>
          );
        }
        const { sub } = line;
        const icon = sub.icon ?? cat.icon;
        const first = depth === 1;
        return (
          <div key={sub.id} data-sub-row={depth} className={cn("relative flex", top && "mt-1")}>
            {railsFor(line)}
            {stem(line)}
            <Link
              href={routes.structureSub(cat.id, sub.id)}
              prefetch={false}
              className={cn(
                "flex min-w-0 flex-1 items-center gap-2.5 rounded-[10px] py-1 pl-1 pr-1.5 text-ink hover:bg-ink/5 active:bg-ink/10",
                first ? "min-h-[36px] text-[14px] font-extrabold" : "min-h-[32px] text-[13.5px] font-medium"
              )}
            >
              <span
                className={cn(
                  "flex shrink-0 items-center justify-center border-[1.5px] border-line",
                  first ? "h-[26px] w-[26px] rounded-[8px]" : "h-[22px] w-[22px] rounded-[7px]"
                )}
                style={first ? fillStyle(cat.color) : { background: tint(cat.color, 40) }}
              >
                {icon && <SymbolIcon name={icon} size={first ? 14 : 12} style={{ color: blockInk(cat.color) }} />}
              </span>
              {/* Girinti durduktan sonra derinliği kat numarası söylüyor */}
              {depth > MAX_INDENT && (
                <span
                  aria-label={t("brut.level", { n: depth })}
                  title={t("brut.level", { n: depth })}
                  className="-mr-1 shrink-0 rounded-[5px] bg-well px-1 font-mono text-[10px] font-extrabold leading-[16px] text-[#FFF4DC]"
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
