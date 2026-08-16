"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ChevronRight,
  Folder,
  FolderOpen,
  FolderPlus,
  Layers,
  Plus,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { getEntryCountsBySubcategory } from "@/lib/db/queries";
import { MEASURE_KIND_META } from "@/lib/measure-kinds";
import { SubCategoryForm } from "@/components/structure/subcategory-form";
import { CategoryForm } from "@/components/structure/category-form";
import { HScroll } from "@/components/ui/h-scroll";
import { SymbolIcon } from "@/lib/icons";
import { usageIntensity, usageRate, usageSince } from "@/lib/usage";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import type { Category, Mod, SubCategory } from "@/types";

export type NetGroup = {
  category: Category;
  topSubs: SubCategory[];
  allSubs: SubCategory[];
};

/** Odak — id tabanlı, veri güncellemesine dayanıklı */
type Focus =
  | null
  | { type: "cat"; cat: Category }
  | { type: "sub"; sub: SubCategory };

type FocusRef =
  | null
  | { type: "cat"; id: string }
  | { type: "sub"; id: string };

type Node =
  | { kind: "cat"; cat: Category }
  | { kind: "sub"; sub: SubCategory };

const NO_COUNTS: ReadonlyMap<string, number> = new Map();

/** Bu sayıdan sonra arama kutusu çıkıyor */
const SEARCH_FROM = 10;
/** Bu sayıdan sonra A–Z bölümlere ayrılıyor */
const SECTIONS_FROM = 14;

/** Türkçe duyarlı bölüm başlığı — ada göre A–Z gruplaması */
function sectionKeyOf(name: string): string {
  const ch = name.trim().charAt(0).toLocaleUpperCase("tr");
  return /\p{L}/u.test(ch) ? ch : "#";
}
const norm = (s: string) => s.toLocaleLowerCase("tr").trim();

/** 0–1 → iki haneli onaltılık alfa */
const hexA = (v: number) =>
  Math.round(Math.max(0, Math.min(1, v)) * 255)
    .toString(16)
    .padStart(2, "0");

type Row = {
  node: Node;
  id: string;
  name: string;
  icon?: string;
  color: string;
  /** Kaç alt kalemi var */
  kids: number;
  /** 0–1 kullanım yoğunluğu (son 30 gün, alt ağaç dahil) */
  use: number;
};

/**
 * Girdi eklerken "nereye" sorusunun cevabı — aranabilir, kademeli bir liste.
 *
 * Bir süre burada bir sinir ağı vardı: kategoriler daireler, aralarında ışıyan
 * bağlar, sürüklenip yakınlaştırılan bir tuval. Harita olarak güzeldi ama
 * girdi eklemek SERİ bir iş — "koştum" demek için haritada gezinmek istemiyor
 * insan. Ağ Yapı > Harita'ya taşındı; burada kalan şey en kısa yol: dokun, in,
 * ekle.
 */
export function EntryPicker({
  groups,
  onSubSelect,
  onCategorySelect,
  onQuickAdd,
  onQuickAddCategory,
  onClose,
}: {
  groups: NetGroup[] | undefined;
  onSubSelect: (sub: SubCategory) => void;
  onCategorySelect: (category: Category) => void;
  /** Formu açmadan kaydet — "koştum" demek için detay şart değil */
  onQuickAdd: (sub: SubCategory) => void;
  onQuickAddCategory: (category: Category) => void;
  onClose: () => void;
}) {
  const t = useT();
  const [focus, setFocus] = useState<FocusRef>(null);
  const [addSub, setAddSub] = useState<{
    categoryId: string;
    parentId?: string;
  } | null>(null);
  const [addCatOpen, setAddCatOpen] = useState(false);
  // Bir kaleme varınca açılan ekle modülü — hızlı kayıt mı, detaylı mı
  const [commitOpen, setCommitOpen] = useState(false);
  const [query, setQuery] = useState("");

  const categories = useMemo(
    () => (groups ?? []).map((g) => g.category),
    [groups]
  );
  const visibleSubs = useMemo(
    () =>
      (groups ?? []).flatMap((g) => g.allSubs).filter((s) => !s.isCategoryRoot),
    [groups]
  );
  const childrenMap = useMemo(() => {
    const m = new Map<string, SubCategory[]>();
    for (const s of visibleSubs) {
      if (!s.parentId) continue;
      const arr = m.get(s.parentId) ?? [];
      arr.push(s);
      m.set(s.parentId, arr);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.order - b.order);
    return m;
  }, [visibleSubs]);
  const subById = useMemo(
    () => new Map(visibleSubs.map((s) => [s.id, s])),
    [visibleSubs]
  );
  const catById = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories]
  );
  const topSubsByCat = useMemo(
    () => new Map((groups ?? []).map((g) => [g.category.id, g.topSubs])),
    [groups]
  );

  // Sayım son 30 güne bakıyor (lib/usage): "sık kullanılanlar" şu anki
  // hayatı göstermeli, arşivi değil.
  const entryCounts =
    useLiveQuery(() => getEntryCountsBySubcategory(usageSince()), []) ??
    NO_COUNTS;

  const subtreeCounts = useMemo(() => {
    const all = (groups ?? []).flatMap((g) => g.allSubs);
    const kids = new Map<string, SubCategory[]>();
    for (const s of all) {
      if (!s.parentId) continue;
      const arr = kids.get(s.parentId) ?? [];
      arr.push(s);
      kids.set(s.parentId, arr);
    }
    const totals = new Map<string, number>();
    const walk = (s: SubCategory): number => {
      const cached = totals.get(s.id);
      if (cached !== undefined) return cached;
      totals.set(s.id, 0); // döngüye karşı koruma
      let sum = entryCounts.get(s.id) ?? 0;
      for (const k of kids.get(s.id) ?? []) sum += walk(k);
      totals.set(s.id, sum);
      return sum;
    };
    for (const s of all) walk(s);
    return totals;
  }, [groups, entryCounts]);

  const catCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const g of groups ?? []) {
      m.set(
        g.category.id,
        g.allSubs.reduce((n, s) => n + (entryCounts.get(s.id) ?? 0), 0)
      );
    }
    return m;
  }, [groups, entryCounts]);

  const focusObj: Focus = useMemo(() => {
    if (focus == null) return null;
    if (focus.type === "cat") {
      const c = catById.get(focus.id);
      return c ? { type: "cat", cat: c } : null;
    }
    const s = subById.get(focus.id);
    return s ? { type: "sub", sub: s } : null;
  }, [focus, catById, subById]);

  const centerColor =
    focusObj == null
      ? "#818cf8"
      : focusObj.type === "cat"
        ? focusObj.cat.color
        : catById.get(focusObj.sub.categoryId)?.color ?? "#818cf8";

  const nodes: Node[] = useMemo(() => {
    if (focusObj == null)
      return categories.map((cat) => ({ kind: "cat", cat }));
    if (focusObj.type === "cat")
      return (topSubsByCat.get(focusObj.cat.id) ?? []).map((sub) => ({
        kind: "sub",
        sub,
      }));
    return (childrenMap.get(focusObj.sub.id) ?? []).map((sub) => ({
      kind: "sub",
      sub,
    }));
  }, [focusObj, categories, topSubsByCat, childrenMap]);

  /** Odaktaki kalemde ölçülen özellikler — ekle modülü bunları gösteriyor */
  const modsByTarget = useLiveQuery(async () => {
    const [atts, mods] = await Promise.all([
      db.categoryModifiers.toArray(),
      db.mods.toArray(),
    ]);
    const modById = new Map(mods.map((m) => [m.id, m]));
    const map = new Map<string, Mod[]>();
    for (const a of atts.sort((x, y) => x.order - y.order)) {
      const m = a.modId ? modById.get(a.modId) : undefined;
      if (!m) continue;
      const arr = map.get(a.targetId) ?? [];
      if (!arr.some((x) => x.id === m.id)) arr.push(m);
      map.set(a.targetId, arr);
    }
    return map;
  }, []);

  const rows: Row[] = useMemo(
    () =>
      nodes.map((node) => {
        const isCat = node.kind === "cat";
        const weight = isCat
          ? catCounts.get(node.cat.id) ?? 0
          : subtreeCounts.get(node.sub.id) ?? 0;
        return {
          node,
          id: isCat ? node.cat.id : node.sub.id,
          name: isCat ? node.cat.name : node.sub.name,
          icon: isCat ? node.cat.icon : node.sub.icon,
          color: isCat ? node.cat.color : centerColor,
          kids: isCat
            ? topSubsByCat.get(node.cat.id)?.length ?? 0
            : childrenMap.get(node.sub.id)?.length ?? 0,
          use: usageIntensity(usageRate(weight)),
        };
      }),
    [nodes, centerColor, topSubsByCat, childrenMap, subtreeCounts, catCounts]
  );

  const q = norm(query);
  const filtered = q ? rows.filter((r) => norm(r.name).includes(q)) : rows;

  /**
   * Sık kullanılanlar — uzun listede aşağıda kalanlara kısayol. Yalnız liste
   * A–Z'ye bölünecek kadar uzunken çıkıyor: kısa listede aynı kalem hem
   * yukarıda hem aşağıda görünüyor ve tekrar hataya benziyor. Aramada gizli,
   * hiç kullanılmamışlar girmiyor.
   */
  const frequent = useMemo(() => {
    if (q || rows.length < SECTIONS_FROM) return [];
    return rows
      .filter((r) => r.use > 0)
      .sort((a, b) => b.use - a.use)
      .slice(0, 4);
  }, [rows, q]);

  const sections = useMemo(() => {
    if (q || filtered.length < SECTIONS_FROM)
      return [{ key: "", items: filtered }];
    const m = new Map<string, Row[]>();
    for (const r of filtered) {
      const k = sectionKeyOf(r.name);
      const arr = m.get(k) ?? [];
      arr.push(r);
      m.set(k, arr);
    }
    return [...m.entries()]
      .sort((a, b) =>
        a[0] === "#" ? 1 : b[0] === "#" ? -1 : a[0].localeCompare(b[0], "en")
      )
      .map(([key, items]) => ({
        key,
        items: items.sort((x, y) => x.name.localeCompare(y.name, "en")),
      }));
  }, [filtered, q]);

  const trail = useMemo(() => {
    const list: { label: string; focus: FocusRef }[] = [
      { label: t("structure.categories"), focus: null },
    ];
    if (focusObj == null) return list;
    if (focusObj.type === "cat") {
      list.push({
        label: focusObj.cat.name,
        focus: { type: "cat", id: focusObj.cat.id },
      });
      return list;
    }
    const chain: SubCategory[] = [];
    let cur: SubCategory | undefined = focusObj.sub;
    while (cur) {
      chain.unshift(cur);
      cur = cur.parentId ? subById.get(cur.parentId) : undefined;
    }
    const cat = catById.get(focusObj.sub.categoryId);
    if (cat) list.push({ label: cat.name, focus: { type: "cat", id: cat.id } });
    for (const s of chain)
      list.push({ label: s.name, focus: { type: "sub", id: s.id } });
    return list;
  }, [focusObj, subById, catById, t]);

  function drill(node: Node) {
    setQuery("");
    setFocus(
      node.kind === "cat"
        ? { type: "cat", id: node.cat.id }
        : { type: "sub", id: node.sub.id }
    );
  }
  function commitQuick() {
    if (focusObj == null) return;
    setCommitOpen(false);
    if (focusObj.type === "cat") onQuickAddCategory(focusObj.cat);
    else onQuickAdd(focusObj.sub);
  }
  function commitDetailed() {
    if (focusObj == null) return;
    setCommitOpen(false);
    if (focusObj.type === "cat") onCategorySelect(focusObj.cat);
    else onSubSelect(focusObj.sub);
  }
  function openAddSub() {
    if (focusObj == null) return;
    if (focusObj.type === "cat") setAddSub({ categoryId: focusObj.cat.id });
    else
      setAddSub({
        categoryId: focusObj.sub.categoryId,
        parentId: focusObj.sub.id,
      });
  }

  const focusName =
    focusObj == null
      ? t("structure.categories")
      : focusObj.type === "cat"
        ? focusObj.cat.name
        : focusObj.sub.name;
  const focusIcon =
    focusObj == null
      ? undefined
      : focusObj.type === "cat"
        ? focusObj.cat.icon
        : focusObj.sub.icon;
  const focusMods =
    focusObj == null
      ? []
      : modsByTarget?.get(
          focusObj.type === "cat" ? focusObj.cat.id : focusObj.sub.id
        ) ?? [];
  const structureHref =
    focusObj == null
      ? ""
      : focusObj.type === "cat"
        ? `/structure/${focusObj.cat.id}`
        : `/structure/${focusObj.sub.categoryId}/${focusObj.sub.id}`;

  return (
    <div className="relative flex min-h-0 flex-col">
      {/* Yol izi — nerede olduğun ve geri dönüş. Ata basamaklar düz metin,
          bulunulan yer kaleminin renginde bir çip. Kökte yazılmıyor: tek
          basamaklı bir yol iz değil, sheet başlığının tekrarı. */}
      {focusObj != null && (
      <div className="shrink-0 px-4 pb-2">
        <HScroll className="items-center gap-0.5" followEnd={focusName}>
          {trail.map((tr, i) => {
            const last = i === trail.length - 1;
            return (
              <span key={i} className="flex shrink-0 items-center">
                {i > 0 && (
                  <ChevronRight className="mx-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
                )}
                <button
                  onClick={() => {
                    setQuery("");
                    setFocus(tr.focus);
                  }}
                  aria-current={last ? "page" : undefined}
                  className={cn(
                    "max-w-[150px] shrink-0 truncate rounded-md px-2 py-1 text-[13px] transition-colors",
                    last
                      ? "font-semibold text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  style={last ? { background: `${centerColor}1f` } : undefined}
                >
                  {tr.label}
                </button>
              </span>
            );
          })}
        </HScroll>
      </div>
      )}

      {/* Sabit üst bölüm: asli eylem, kısayollar ve arama listeyle birlikte
          kaymamalı — uzun listede aşağı inince arama kutusu kayboluyordu ve
          kullanıcı onu geri getirmek için başa dönüyordu. */}
      <div className="flex shrink-0 flex-col gap-3 px-4 pb-3">
        {/* Buraya ekle — sayfanın asli eylemi. Kökte yok: kategorinin
            kendisine girdi diye bir kavram yok. */}
        {focusObj != null && (
          <button
            onClick={() => setCommitOpen(true)}
            className="flex shrink-0 items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors active:opacity-80"
            style={{
              background: `${centerColor}14`,
              boxShadow: `inset 0 0 0 1px ${centerColor}33`,
            }}
          >
            <Tile color={centerColor} icon={focusIcon} fallback={FolderOpen} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-semibold leading-tight">
                {focusName}
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {t("tree.addRecordHere")}
              </span>
            </span>
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white"
              style={{ backgroundColor: centerColor }}
            >
              <Plus className="h-4 w-4" strokeWidth={2.5} />
            </span>
          </button>
        )}

        {/* Eylemler — sakin metin düğmeleri, asli eylemle yarışmıyorlar */}
        <div className="flex shrink-0 items-center gap-2">
          {focusObj == null ? (
            <QuietButton icon={Plus} onClick={() => setAddCatOpen(true)}>
              {t("tree.newCategory")}
            </QuietButton>
          ) : (
            <>
              <QuietButton icon={FolderPlus} onClick={openAddSub}>
                {t("tree.createSubcategory")}
              </QuietButton>
              <QuietButton icon={Layers} href={structureHref} onClick={onClose}>
                {focusName}
              </QuietButton>
            </>
          )}
        </div>

        {rows.length >= SEARCH_FROM && (
          <div className="relative shrink-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("action.search")}
              className="h-10 w-full rounded-xl border border-white/8 bg-white/[0.03] pl-9 pr-3 text-sm placeholder:text-muted-foreground/50 focus:border-white/15 focus:outline-none"
            />
          </div>
        )}
      </div>

      {/* Kayan bölüm: yalnız liste */}
      <div className="flex min-h-0 flex-col gap-3 overflow-y-auto overscroll-contain px-4 pb-6">
        {frequent.length > 0 && (
          <Section label={t("entry.frequent")} icon={Sparkles}>
            {frequent.map((r) => (
              <PickRow key={`f${r.id}`} row={r} onOpen={drill} />
            ))}
          </Section>
        )}

        {filtered.length === 0 ? (
          <p className="px-1 py-8 text-center text-sm text-muted-foreground">
            {t("entry.noMatch")}
          </p>
        ) : (
          sections.map((sec) => (
            <Section key={sec.key} label={sec.key}>
              {sec.items.map((r) => (
                <PickRow key={r.id} row={r} onOpen={drill} />
              ))}
            </Section>
          ))
        )}

        {focusObj == null && rows.length === 0 && (
          <p className="px-1 py-8 text-center text-sm text-muted-foreground">
            {t("tree.noCategoriesYet")}
          </p>
        )}
      </div>

      {/* ── Ekle modülü ────────────────────────────────────────────────
          Asli eylem TEK ve belirgin: "Ekle". Ölçmek isteyen "Detay ekle"ye
          gidiyor — orada değerler, özellik ekleme ve yeni özellik yaratma
          birlikte duruyor. */}
      {commitOpen && focusObj != null && (
        <>
          <div
            className="absolute inset-0 z-30 bg-black/50"
            onClick={() => setCommitOpen(false)}
          />
          <div className="animate-in absolute inset-x-0 bottom-0 z-40 rounded-t-2xl border-t border-white/10 bg-background px-5 pb-6 pt-4">
            <div className="mb-4 flex items-center gap-3">
              <Tile color={centerColor} icon={focusIcon} fallback={FolderOpen} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-base font-semibold leading-tight">
                  {focusName}
                </div>
                <div className="mt-0.5 truncate text-xs text-muted-foreground">
                  {focusMods.length > 0
                    ? focusMods.map((m) => m.name).join(" · ")
                    : t("entry.noFeaturesYet")}
                </div>
              </div>
              <button
                onClick={() => setCommitOpen(false)}
                aria-label={t("action.close")}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/6 text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {focusMods.length > 0 && (
              <div className="mb-4 flex flex-wrap gap-1.5">
                {focusMods.map((m) => {
                  const Icon = MEASURE_KIND_META[m.valueType ?? "number"].icon;
                  return (
                    <span
                      key={m.id}
                      className="flex items-center gap-1.5 rounded-lg border border-white/8 px-2 py-1 text-[11px] text-muted-foreground"
                    >
                      <Icon className="h-3 w-3" style={{ color: centerColor }} />
                      {m.name}
                      {m.unit ? (
                        <span className="text-muted-foreground/50">{m.unit}</span>
                      ) : null}
                    </span>
                  );
                })}
              </div>
            )}

            <button
              onClick={commitQuick}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl text-[15px] font-semibold text-white transition-opacity active:opacity-85"
              style={{ backgroundColor: centerColor }}
            >
              <Plus className="h-4 w-4" strokeWidth={2.5} />
              {t("entry.addNow")}
            </button>
            <button
              onClick={commitDetailed}
              className="mt-2 flex h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-white/8 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {t("entry.addWithDetail")}
            </button>
          </div>
        </>
      )}

      <SubCategoryForm
        open={addSub !== null}
        onOpenChange={(o) => {
          if (!o) setAddSub(null);
        }}
        categoryId={addSub?.categoryId ?? ""}
        parentSubcategoryId={addSub?.parentId}
        categoryName={addSub ? catById.get(addSub.categoryId)?.name : undefined}
      />
      <CategoryForm open={addCatOpen} onOpenChange={setAddCatOpen} />
    </div>
  );
}

/**
 * Kalemin karosu. Yapı sayfalarındaki karo dışa ışıma yapıyor; burada o
 * ışıma yok — liste uzun ve her satırda bir hale varken sayfa uzay
 * boşluğuna dönüyordu. Kalan şey rengin kendisi: hafif bir zemin, saç
 * teli kalınlığında bir çeper.
 */
function Tile({
  color,
  icon,
  fallback: Fallback = Folder,
  dim = false,
}: {
  color: string;
  icon?: string;
  fallback?: typeof Folder;
  /** Hiç kullanılmamış kalem — karo geri çekilir */
  dim?: boolean;
}) {
  return (
    <span
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px]"
      style={{
        background: `${color}${hexA(dim ? 0.1 : 0.16)}`,
        boxShadow: `inset 0 0 0 1px ${color}${hexA(dim ? 0.18 : 0.3)}`,
      }}
    >
      {icon ? (
        <SymbolIcon name={icon} size={19} style={{ color, opacity: dim ? 0.7 : 1 }} />
      ) : (
        <Fallback
          style={{ color, width: 19, height: 19, opacity: dim ? 0.7 : 1 }}
          strokeWidth={1.75}
        />
      )}
    </span>
  );
}

/** Bölüm — başlık dışarıda, satırlar tek bir yüzeyde */
function Section({
  label,
  icon: Icon,
  children,
}: {
  label: string;
  icon?: typeof Sparkles;
  children: React.ReactNode;
}) {
  return (
    <div className="shrink-0">
      {label && (
        <div className="mb-1.5 flex items-center gap-1.5 px-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/60">
          {Icon && <Icon className="h-3 w-3" />}
          {label}
        </div>
      )}
      <div className="overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.015]">
        {children}
      </div>
    </div>
  );
}

/**
 * Liste satırı. Kullanım sıklığı ışımayla değil TONLA anlatılıyor:
 * uğranmayan kalem geri çekiliyor, uğranılan tam renginde duruyor. Aynı
 * bilgi, sakin bir dille.
 */
function PickRow({ row: r, onOpen }: { row: Row; onOpen: (node: Node) => void }) {
  const t = useT();
  const dim = r.use === 0;
  return (
    <button
      onClick={() => onOpen(r.node)}
      className="flex w-full items-center gap-3 border-t border-white/[0.06] px-3 py-2.5 text-left transition-colors first:border-t-0 hover:bg-white/[0.04] active:bg-white/[0.06]"
    >
      <Tile
        color={r.color}
        icon={r.icon}
        fallback={r.kids > 0 ? FolderOpen : Folder}
        dim={dim}
      />
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block truncate text-[15px] leading-tight",
            dim ? "font-medium text-foreground/60" : "font-medium text-foreground"
          )}
        >
          {r.name}
        </span>
        {r.kids > 0 && (
          <span className="mt-0.5 block text-xs text-muted-foreground/70">
            {t("tree.subItemCount", { count: r.kids })}
          </span>
        )}
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/40" />
    </button>
  );
}

/** Sakin eylem düğmesi — bağlantı ya da düğme olarak */
function QuietButton({
  icon: Icon,
  children,
  onClick,
  href,
}: {
  icon: typeof Plus;
  children: React.ReactNode;
  onClick: () => void;
  href?: string;
}) {
  const cls =
    "flex min-w-0 items-center gap-1.5 rounded-lg border border-white/8 px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground active:bg-white/5";
  const body = (
    <>
      <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
      <span className="truncate">{children}</span>
    </>
  );
  // prefetch açıkça: sheet içindeki bağlantıda görünürlük tabanlı varsayılan
  // önden çekme tetiklenmiyor ve tıklamada bekleme oluyordu
  return href ? (
    <Link href={href} prefetch onClick={onClick} className={cls}>
      {body}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={cls}>
      {body}
    </button>
  );
}
