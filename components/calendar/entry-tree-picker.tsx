"use client";

import { Fragment, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Layers, LayoutList, MoreHorizontal, Search, X } from "lucide-react";
import { SymbolIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { routes } from "@/lib/routes";
import type { Category, SubCategory } from "@/types";
import { loadUsageCounts, USAGE_COUNTS_KEY, useCachedLiveQuery } from "@/lib/db/live-cache";
import { SummaryBlock, SummaryEmpty, SummaryTile } from "@/components/ui/summary-block";
import { useEmbedded } from "@/components/ui/sheet-frame";
import { setEntryLayout, type NetGroup } from "@/components/calendar/entry-picker";

const NO_COUNTS: ReadonlyMap<string, number> = new Map();
/** Girinti bu katta durur; daha derinde adın önünde kat numarası (Yapı'daki ağaç gibi) */
const MAX_INDENT = 5;
/** Bir dalda bundan fazla kardeş varsa ilkleri görünür, altında "Tümünü göster" */
const SHOW_FIRST = 8;

const norm = (s: string) => s.toLocaleLowerCase("tr").trim();
const tint = (color: string, pct: number) => `color-mix(in srgb, ${color} ${pct}%, white)`;

type Line =
  | { kind: "sub"; sub: SubCategory; depth: number }
  | { kind: "more"; key: string; depth: number; total: number; open: boolean };

/**
 * GİRDİ SEÇİCİ (Brütal, raf düzeni) — "nereye kayıt?" sorusunun cevabı
 * Yapı'nın kategori ağacıyla aynı haritada: her kategori bir blok (kendi
 * renginde ince baş), içinde dallanmış ağacı — kılavuz çizgisi, 1. kat
 * kalın, derinler ince. Bloklar KAPALI başlar (yalnız başlar, kısa liste);
 * başa dokununca açılır. HER SATIR BİR YER: dokununca oraya girdi; altı
 * olan dal da (alt kalemleri hemen altında görünür, ayrıca açmak
 * gerekmiyor). Kategorinin kendisine girdi açık ağacın ilk satırından
 * (yalnız adı ve simgesi); alt kategorisi olmayan kategoride baştan.
 *
 * Arama ağacı yerinde süzer: eşleşen bloklar açık, eşleşen kalemler üst
 * dallarıyla birlikte kalır, eşleşen kısım vurgulu — "Su" Faturalar'ın
 * altında mı Beslenme'nin mi, yolu okunur. Kategorinin adı eşleşirse
 * bütün ağacı.
 *
 * Burada yapı kurulmaz (kategori / alt kategori yaratma yok): bloğun sarı
 * karosu kategorinin Yapı sayfasına götürür. Satırdaki sayı son 30 günün
 * girdisi (sık kullanılanı ağacın içinde gösterir). Kategori başları ince
 * (42 px), ad ortada; üstte kategori şeridi vardı, kalktı.
 *
 * Eskiden: üstte Hızlı ekle, altta her kategorinin kalemleri dörtlü karo
 * rafında; dal karosuna basınca altı satırın altında açılıyor, dalın
 * kendisine kayıt "X genel" hapıyla. Hızlı ekle ayrı bir sayfa olacak.
 */
export function EntryTreePicker({
  groups,
  onPick,
  onPickCategory,
  onClose,
}: {
  groups: NetGroup[] | undefined;
  onPick: (sub: SubCategory) => void;
  onPickCategory: (category: Category) => void;
  onClose: () => void;
}) {
  const t = useT();
  const router = useRouter();
  const embedded = useEmbedded();
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  // Bloklar kapalı başlar; aramada eşleşenler açık başlar (kapatılabilir)
  const [openCats, setOpenCats] = useState<ReadonlySet<string>>(() => new Set());
  const [searchClosed, setSearchClosed] = useState<ReadonlySet<string>>(() => new Set());
  // Önce pencere kapanır: kategori sayfasının kendi Girdi ekle'sinden aynı
  // sayfaya gidince yalnız kapanmış olur
  const goStructure = (href: string) => {
    onClose();
    router.push(href);
  };

  const counts = useCachedLiveQuery(USAGE_COUNTS_KEY, loadUsageCounts) ?? NO_COUNTS;
  const categories = useMemo(() => (groups ?? []).map((g) => g.category), [groups]);
  const subs = useMemo(
    () => (groups ?? []).flatMap((g) => g.allSubs).filter((s) => !s.isCategoryRoot),
    [groups]
  );
  const subById = useMemo(() => new Map(subs.map((s) => [s.id, s])), [subs]);

  /** Arama: görünecek kalemler (eşleşenler ve üst dalları); null = arama yok */
  const q = norm(query);
  const visible = useMemo(() => {
    if (!q) return null;
    const keep = new Set<string>();
    const catHit = new Set(categories.filter((c) => norm(c.name).includes(q)).map((c) => c.id));
    for (const s of subs) {
      if (!catHit.has(s.categoryId) && !norm(s.name).includes(q)) continue;
      for (let cur: SubCategory | undefined = s; cur; cur = cur.parentId ? subById.get(cur.parentId) : undefined)
        keep.add(cur.id);
    }
    return { keep, catHit };
  }, [q, categories, subs, subById]);

  const shown = visible
    ? categories.filter((c) => visible.catHit.has(c.id) || subs.some((s) => s.categoryId === c.id && visible.keep.has(s.id)))
    : categories;

  const isOpen = (id: string) => (visible ? !searchClosed.has(id) : openCats.has(id));
  const toggle = (id: string) => {
    const flip = (prev: ReadonlySet<string>) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    };
    if (visible) setSearchClosed(flip);
    else setOpenCats(flip);
  };

  const square =
    "flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[11px] border-2 bg-white text-[#111] shadow-[2px_2px_0_#111] active:translate-x-px active:translate-y-px active:shadow-none";

  // Sayfa zemini (bkz. PageSheet): krem döşemenin önünde beyaz yüzey — kalın
  // çerçeve, üst köşeleri yuvarlak, iki yanda 10 px döşeme; arama sabit,
  // altındaki liste zeminin içinde kayar
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        data-page-sheet=""
        className="mx-2.5 mt-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-t-[20px] border-2 border-b-0 bg-white"
        style={{ borderColor: "#111" }}
      >
        {/* Arama ve işlemler — sabit */}
        <div className="shrink-0 px-1.5 pb-3 pt-3">
          <div className="flex items-center gap-2">
            <label
              className="flex h-[38px] min-w-0 flex-1 items-center gap-2 rounded-[11px] border-2 bg-white px-2.5 shadow-[2px_2px_0_#111]"
              style={{ borderColor: "#111" }}
            >
              <Search className="h-4 w-4 shrink-0 text-[#111]/55" strokeWidth={2.5} />
              <input
                data-pick-search=""
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSearchClosed(new Set());
                }}
                placeholder={t("pick.search")}
                aria-label={t("entry.searchAll")}
                className="h-full min-w-0 flex-1 bg-transparent text-[14px] font-semibold text-[#111] placeholder:font-medium placeholder:text-[#111]/45 focus:outline-none"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label={t("action.close")}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#111] text-white"
                >
                  <X className="h-3.5 w-3.5" strokeWidth={3} />
                </button>
              )}
            </label>
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              aria-label={t("entry.moreActions")}
              aria-expanded={menuOpen}
              className={square}
              style={{ borderColor: "#111" }}
            >
              <MoreHorizontal className="h-[18px] w-[18px]" strokeWidth={2.5} />
            </button>
            {/* Tek başına pencerede (kategori sayfasının Girdi ekle'si) kapatma burada;
                Ekle ekranında şeritte */}
            {!embedded && (
              <button type="button" onClick={onClose} aria-label={t("action.close")} className={square} style={{ borderColor: "#111" }}>
                <X className="h-[18px] w-[18px]" strokeWidth={2.75} />
              </button>
            )}
          </div>
        </div>

        <div
          data-pick-list=""
          className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-1.5 pt-1"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 28px)" }}
        >
          {groups && categories.length === 0 ? (
            <SummaryBlock compact lead={{ kind: "title", overline: "", title: t("structure.categories"), color: "#ffd23f" }} stats={[]}>
              <SummaryEmpty
                text={t("structure.empty.title")}
                action={{ label: t("pick.goStructure"), onClick: () => goStructure("/structure") }}
              />
            </SummaryBlock>
          ) : visible && shown.length === 0 ? (
            <SummaryBlock compact lead={{ kind: "title", overline: "", title: t("pick.searchTitle"), color: "#ffd23f", glyph: Search }} stats={[]}>
              <SummaryEmpty text={t("pick.noMatch", { q: query.trim() })} />
            </SummaryBlock>
          ) : (
            <div className="flex flex-col gap-2.5">
              {shown.map((cat) => {
                const own = subs.filter((s) => s.categoryId === cat.id);
                const items = own.length;
                const open = items > 0 && isOpen(cat.id);
                // Aramada yalnız kalemi eşleşen kategoride gövde satırı gizli
                const direct = !visible || visible.catHit.has(cat.id);
                return (
                  <div key={cat.id} data-pick-cat={cat.id}>
                    {/* Baş bloğu açıp kapatır; alt kategorisi yoksa açacak bir şey
                        yok — doğrudan kategoriye girdi */}
                    <SummaryBlock
                      compact
                      onLead={items > 0 ? () => toggle(cat.id) : () => onPickCategory(cat)}
                      leadLabel={items > 0 ? undefined : t("pick.addTo", { name: cat.name })}
                      leadExpanded={items > 0 ? open : undefined}
                      leadCentered
                      dense
                      lead={{
                        kind: "thing",
                        color: cat.color,
                        icon: cat.icon,
                        title: cat.name,
                      }}
                      action={
                        <SummaryTile
                          compact
                          dense
                          color="#ffd23f"
                          icon={Layers}
                          label={t("pick.openInStructure", { name: cat.name })}
                          onClick={() => goStructure(routes.structureCategory(cat.id))}
                        />
                      }
                      stats={[]}
                    >
                      {open && (
                        <div data-pick-tree="" className="bg-white px-1.5 py-2">
                          {direct && (
                            <DirectRow cat={cat} label={t("pick.addTo", { name: cat.name })} onClick={() => onPickCategory(cat)} />
                          )}
                          <PickRows
                            cat={cat}
                            subs={own}
                            counts={counts}
                            keep={visible ? visible.keep : null}
                            showAll={!!visible && !visible.catHit.has(cat.id)}
                            query={visible && !visible.catHit.has(cat.id) ? q : ""}
                            onRow={onPick}
                          />
                        </div>
                      )}
                    </SummaryBlock>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ⋯ — görünüm işlemleri, aynı yüzeyde küçük bir menü */}
      {menuOpen && (
        <>
          <div className="absolute inset-0 z-30" onClick={() => setMenuOpen(false)} />
          <div
            className="animate-in fade-in zoom-in-95 absolute right-[18px] top-[70px] z-40 flex min-w-[230px] flex-col overflow-hidden rounded-[14px] border-2 bg-white p-1 text-[#111] shadow-[3px_3px_0_#111]"
            style={{ borderColor: "#111" }}
          >
            <MenuRow
              icon={<LayoutList className="h-4 w-4" strokeWidth={2.5} />}
              label={t("entry.layoutToRay")}
              onClick={() => {
                setMenuOpen(false);
                setEntryLayout("ray");
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}

function MenuRow({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[42px] items-center gap-2.5 rounded-[10px] px-2.5 text-left text-[13.5px] font-bold hover:bg-[#111]/5 active:bg-[#111]/10"
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] border-[1.5px] bg-[#fff4dc]" style={{ borderColor: "#111" }}>
        {icon}
      </span>
      {label}
    </button>
  );
}

/** Açık ağacın ilk satırı — gövde: kategorinin kendisine girdi (kayıtta
 *  "genel"); yalnız adı ve simgesi, dalların üstünde */
function DirectRow({ cat, label, onClick }: { cat: Category; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      data-pick-direct=""
      onClick={onClick}
      aria-label={label}
      className="mb-0.5 flex min-h-[36px] w-full items-center gap-2.5 rounded-[10px] px-2 py-1 text-left text-[14px] font-extrabold text-[#111] hover:bg-[#111]/5 active:bg-[#111]/10"
    >
      <span
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] border-[1.5px] border-[#111]"
        style={{ background: cat.color }}
      >
        {cat.icon && <SymbolIcon name={cat.icon} size={13} style={{ color: "#111" }} />}
      </span>
      <span className="min-w-0 flex-1 break-words leading-tight">{cat.name}</span>
    </button>
  );
}

/** Adın içinde aramayla eşleşen kısım vurgulu */
function Highlight({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>;
  const i = norm(text).indexOf(q);
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded-[3px] bg-[#ffd23f] px-px text-[#111]">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

/**
 * Bir kategorinin ağacı — Yapı'daki satırların (bkz. BrutSubRows) girdi
 * seçicideki karşılığı: satır bağlantı değil düğme, sağdaki sayı son 30
 * günün girdisi.
 */
function PickRows({
  cat,
  subs,
  counts,
  keep,
  showAll,
  query,
  onRow,
}: {
  cat: Category;
  subs: SubCategory[];
  counts: ReadonlyMap<string, number>;
  /** Aramada görünecek kalemler; null = hepsi */
  keep: Set<string> | null;
  /** Aramada kalabalık dallar kısaltılmaz */
  showAll: boolean;
  query: string;
  onRow: (s: SubCategory) => void;
}) {
  const t = useT();
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const toggleBranch = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const rows = useMemo(() => {
    const kids = new Map<string, SubCategory[]>();
    for (const s of subs) {
      if (keep && !keep.has(s.id)) continue;
      const k = s.parentId ?? "";
      kids.set(k, [...(kids.get(k) ?? []), s]);
    }
    const acc: Line[] = [];
    const walk = (parentId: string | undefined, depth: number) => {
      const key = parentId ?? "";
      const list = (kids.get(key) ?? []).sort((a, b) => a.order - b.order);
      const crowded = !showAll && !keep && list.length > SHOW_FIRST;
      const open = expanded.has(key);
      const shownList = crowded && !open ? list.slice(0, SHOW_FIRST) : list;
      for (const s of shownList) {
        acc.push({ kind: "sub", sub: s, depth });
        walk(s.id, depth + 1);
      }
      if (crowded) acc.push({ kind: "more", key, depth, total: list.length, open });
    };
    walk(undefined, 1);
    return acc;
  }, [subs, keep, showAll, expanded]);

  return (
    <>
      {rows.map((line) => {
        const { depth } = line;
        const indent = 15 + (Math.min(depth, MAX_INDENT) - 1) * 16;
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
                className="ml-2 flex min-h-[34px] min-w-0 flex-1 items-center gap-2 rounded-[10px] px-2 py-1 text-left text-[12.5px] font-extrabold text-[#111]/70 hover:bg-[#111]/5 active:bg-[#111]/10"
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
        const n = counts.get(sub.id) ?? 0;
        return (
          <Fragment key={sub.id}>
            <div className="flex" style={{ paddingLeft: indent }}>
              {guide}
              <button
                type="button"
                data-pick-row={sub.id}
                onClick={() => onRow(sub)}
                className={cn(
                  "ml-2 flex min-h-[36px] min-w-0 flex-1 items-center gap-2.5 rounded-[10px] px-2 py-1 text-left text-[14px] text-[#111] hover:bg-[#111]/5 active:bg-[#111]/10",
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
                {depth > MAX_INDENT && (
                  <span
                    aria-label={t("brut.level", { n: depth })}
                    className="-mr-1 shrink-0 rounded-[5px] bg-[#111] px-1 font-mono text-[10px] font-extrabold leading-[16px] text-[#FFF4DC]"
                  >
                    {depth}
                  </span>
                )}
                <span className="min-w-0 flex-1 break-words leading-tight">
                  <Highlight text={sub.name} q={query} />
                </span>
                {n > 0 && (
                  <span
                    title={t("pick.recent", { n })}
                    className="ml-auto shrink-0 rounded-full border-[1.5px] border-[#111]/20 px-2 py-px font-mono text-[11px] font-bold tabular-nums text-[#111]/70"
                  >
                    {n}
                  </span>
                )}
              </button>
            </div>
          </Fragment>
        );
      })}
    </>
  );
}
