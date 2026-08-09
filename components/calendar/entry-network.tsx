"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronRight,
  Folder,
  FolderOpen,
  FolderPlus,
  Layers,
  List,
  Network,
  PenLine,
  Plus,
  Search,
  Sparkles,
} from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  getEntryCountsBySubcategory,
  reorderCategories,
  reorderSubcategories,
} from "@/lib/db/queries";
import { CategoryTileCore } from "@/components/structure/category-tile";
import { SubCategoryForm } from "@/components/structure/subcategory-form";
import { CategoryForm } from "@/components/structure/category-form";
import { HScroll } from "@/components/ui/h-scroll";
import { OptionsMenu } from "@/components/forms/form-options";
import { CanvasViewport } from "@/components/calendar/canvas-viewport";
import { hexCorners, hexLayout, HEX_CLIP } from "@/lib/hex";
import { CategoryIcon, CATEGORY_ICON_MAP } from "@/lib/category-icons";
import { cn } from "@/lib/utils";
import { useT, type MessageKey } from "@/lib/i18n";
import type { Category, SubCategory } from "@/types";

export type NetGroup = {
  category: Category;
  topSubs: SubCategory[];
  allSubs: SubCategory[];
};

/** Odak — id tabanlı (sheet'te tutulur; form→geri odağı korur, veri güncellemesine dayanıklı) */
export type NetFocus =
  | null
  | { type: "cat"; id: string }
  | { type: "sub"; id: string };

type Focus =
  | null
  | { type: "cat"; cat: Category }
  | { type: "sub"; sub: SubCategory };

type Node =
  | { kind: "cat"; cat: Category }
  | { kind: "sub"; sub: SubCategory };

/** Yerleşim — düğüm sayısına göre otomatik seçilir, kullanıcı değiştirebilir */
type Layout = "poly" | "list";

/** Sayım gelmeden önceki sabit boş harita — memo'ları her render'da bozmasın */
const NO_COUNTS: ReadonlyMap<string, number> = new Map();

/** Tuval genişliği (px) */
const MAX_POLY = 300;
/** Altıgen hücrenin merkezden köşesine uzaklığı (px) */
const HEX_SIZE = 46;
/** Bu sayıdan sonra çokgen okunmaz oluyor, liste devralır */
const LIST_FROM = 17;

function autoLayout(n: number): Layout {
  return n >= LIST_FROM ? "list" : "poly";
}

/** Eski kayıtlarda "spiral" olabilir — çokgene düşer */
function normalizeLayout(v: unknown): Layout | undefined {
  if (v === "list") return "list";
  if (v === "poly" || v === "spiral") return "poly";
  return undefined;
}

/** Etiketler anahtar; çözümleme render sırasında (modül düzeyinde kanca yok) */
const LAYOUT_OPTIONS: {
  key: Layout;
  icon: typeof Network;
  labelKey: MessageKey;
}[] = [
  { key: "poly", icon: Network, labelKey: "tree.networkView" },
  { key: "list", icon: List, labelKey: "tree.listView" },
];

/** Kullanıcının sayfa bazlı görünüm tercihi (localStorage) */
const LS_LAYOUT = "entrynet-layout";
const focusKeyOf = (f: NetFocus) => (f == null ? "root" : `${f.type}:${f.id}`);

/** Türkçe duyarlı bölüm başlığı — ada göre A–Z gruplaması */
function sectionKeyOf(name: string): string {
  const ch = name.trim().charAt(0).toLocaleUpperCase("tr");
  return /\p{L}/u.test(ch) ? ch : "#";
}
const norm = (s: string) => s.toLocaleLowerCase("tr").trim();

/**
 * Girdi ekleme v2 — ağ tabanlı gezinme. Kök: ana kategoriler ağ olarak. Bir
 * düğüme dokun → onun "sayfası": ortada kendisi, çevresinde çocukları.
 * Yerleşim düğüm sayısına göre kendiliğinden değişir: çokgen ağ → aranabilir
 * A–Z liste. Sağ üstteki düğmeyle elle de seçilebilir. Çokgende düğümler
 * basılı tutulup sürüklenerek yeniden sıralanır; tuval sürüklenip
 * yakınlaştırılabilir (CanvasViewport).
 * Sayfa menüsü: Girdi ekle · Alt kategori aç · Yapı sayfası.
 */
export function EntryNetwork({
  groups,
  onSubSelect,
  onCategorySelect,
  onClose,
}: {
  groups: NetGroup[] | undefined;
  onSubSelect: (sub: SubCategory) => void;
  onCategorySelect: (category: Category) => void;
  onClose: () => void;
}) {
  const t = useT();
  // Nerede olduğumuz burada tutulur; sheet'in bilmesi gereken bir şey değil
  const [focus, onFocusChange] = useState<NetFocus>(null);
  const router = useRouter();
  const [addSub, setAddSub] = useState<{
    categoryId: string;
    parentId?: string;
  } | null>(null);
  const [addCatOpen, setAddCatOpen] = useState(false);

  // Sürükleme: basılı tut → serbest taşı → bırakınca en yakın yuvaya oturur
  const [drag, setDrag] = useState<{ id: string; kind: "cat" | "sub" } | null>(
    null
  );
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const posRef = useRef<{ x: number; y: number } | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);

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

  // ─── Sık kullanım ───────────────────────────────────────────────────────────
  // Bir düğümün "ağırlığı" kendi girdileri + tüm torunlarınınki. Parlaklık,
  // aynı sayfadaki en çok kullanılan kardeşe göre orandır: kalabalık
  // sayfalarda bile en sık kullanılan net biçimde öne çıksın.
  const entryCounts =
    useLiveQuery(() => getEntryCountsBySubcategory(), []) ?? NO_COUNTS;

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

  // Kategori ağırlığı: gizli kök dahil tüm altlarının girdileri
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

  // ─── Yerleşim seçimi ───────────────────────────────────────────────────────
  const [overrides, setOverrides] = useState<Record<string, Layout>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const raw = JSON.parse(localStorage.getItem(LS_LAYOUT) ?? "{}");
      const out: Record<string, Layout> = {};
      for (const [k, v] of Object.entries(raw)) {
        const norm = normalizeLayout(v);
        if (norm) out[k] = norm;
      }
      return out;
    } catch {
      return {}; // tercih okunamadıysa otomatik yerleşimle devam
    }
  });
  const focusKey = focusKeyOf(focus);
  const layout: Layout = overrides[focusKey] ?? autoLayout(nodes.length);
  function setLayout(next: Layout) {
    setOverrides((prev) => {
      const merged = { ...prev, [focusKey]: next };
      try {
        localStorage.setItem(LS_LAYOUT, JSON.stringify(merged));
      } catch {
        /* kalıcı yazılamazsa oturum boyunca geçerli */
      }
      return merged;
    });
  }

  const dense = false;
  const maxSize = MAX_POLY;
  // Tuval, sığdığı gerçek genişlikte ölçülür — konumlar 1:1 ekran pikseli
  const [box, setBox] = useState(maxSize);
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      if (e.contentRect.width > 0) setBox(e.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [layout, maxSize]);
  const pad = dense ? 26 : 30;

  // Altıgen yuva düzeni — kural lib/hex.ts'te, testle sabit
  const hex = useMemo(
    () => hexLayout(layout === "list" ? 0 : nodes.length, HEX_SIZE),
    [nodes.length, layout]
  );
  const positions = hex.nodes;
  const centerPos = hex.center;

  const nodeId = (node: Node) => (node.kind === "cat" ? node.cat.id : node.sub.id);
  const nodeWeight = (node: Node) =>
    node.kind === "cat"
      ? catCounts.get(node.cat.id) ?? 0
      : subtreeCounts.get(node.sub.id) ?? 0;
  const maxWeight = nodes.reduce((m, n) => Math.max(m, nodeWeight(n)), 0);
  /** 0–1: bu sayfanın en çok kullanılan düğümüne göre oran */
  const glowOf = (node: Node) =>
    maxWeight > 0 ? nodeWeight(node) / maxWeight : 0;
  // Sürüklenen düğüm anlık parmak konumunda gösterilir (ışın da takip eder)
  const effPositions = positions.map((p, i) => {
    if (drag && dragPos && drag.id === nodeId(nodes[i])) return dragPos;
    return { x: p.x, y: p.y };
  });
  // Sürüklerken en yakın yuva (oturacağı yer) — vurgulanır
  const targetSlot = useMemo(() => {
    if (!drag || !dragPos) return -1;
    let best = -1;
    let bestD = Infinity;
    positions.forEach((p, i) => {
      const d = (p.x - dragPos.x) ** 2 + (p.y - dragPos.y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  }, [drag, dragPos, positions]);

  const trail = useMemo(() => {
    const t: { label: string; focus: NetFocus }[] = [
      { label: "Categories", focus: null },
    ];
    if (focusObj == null) return t;
    if (focusObj.type === "cat") {
      t.push({
        label: focusObj.cat.name,
        focus: { type: "cat", id: focusObj.cat.id },
      });
      return t;
    }
    const chain: SubCategory[] = [];
    let cur: SubCategory | undefined = focusObj.sub;
    while (cur) {
      chain.unshift(cur);
      cur = cur.parentId ? subById.get(cur.parentId) : undefined;
    }
    const cat = catById.get(focusObj.sub.categoryId);
    if (cat) t.push({ label: cat.name, focus: { type: "cat", id: cat.id } });
    for (const s of chain)
      t.push({ label: s.name, focus: { type: "sub", id: s.id } });
    return t;
  }, [focusObj, subById, catById]);

  // Sürükleme pencere olayları
  useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = Math.max(pad, Math.min(box - pad, e.clientX - rect.left));
      const y = Math.max(pad, Math.min(box - pad, e.clientY - rect.top));
      const np = { x, y };
      posRef.current = np;
      setDragPos(np);
    };
    const onUp = async () => {
      const p = posRef.current;
      const d = drag;
      setDrag(null);
      setDragPos(null);
      posRef.current = null;
      if (!d || !p) return;
      const idOf = (nd: Node) => (nd.kind === "cat" ? nd.cat.id : nd.sub.id);
      const from = nodes.findIndex((nd) => idOf(nd) === d.id);
      if (from < 0) return;
      // En yakın yuva
      let to = from;
      let bestD = Infinity;
      positions.forEach((slot, i) => {
        const dist = (slot.x - p.x) ** 2 + (slot.y - p.y) ** 2;
        if (dist < bestD) {
          bestD = dist;
          to = i;
        }
      });
      if (to === from) return;
      // Yer değiştir (dragged ↔ hedef yuvadaki) → order olarak kaydet
      const ids = nodes.map(idOf);
      [ids[from], ids[to]] = [ids[to], ids[from]];
      if (d.kind === "cat") await reorderCategories(ids);
      else await reorderSubcategories(ids);
    };
    const prevent = (e: TouchEvent) => e.preventDefault();
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("touchmove", prevent, { passive: false });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("touchmove", prevent);
    };
  }, [drag, nodes, positions, box, pad]);

  function startDrag(node: Node, p: { x: number; y: number }) {
    setDrag({ id: nodeId(node), kind: node.kind });
    setDragPos(p);
    posRef.current = p;
    navigator.vibrate?.(12);
  }
  function drill(node: Node) {
    onFocusChange(
      node.kind === "cat"
        ? { type: "cat", id: node.cat.id }
        : { type: "sub", id: node.sub.id }
    );
  }
  function addEntryHere() {
    if (focusObj == null) return;
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
  function goStructure() {
    if (focusObj == null) return;
    const path =
      focusObj.type === "cat"
        ? `/structure/${focusObj.cat.id}`
        : `/structure/${focusObj.sub.categoryId}/${focusObj.sub.id}`;
    onClose();
    router.push(path);
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
  const hasNodes = nodes.length > 0;

  // Liste satırları — ad, renk, çocuk sayısı
  const rows = useMemo(
    () =>
      nodes.map((node) => {
        const isCat = node.kind === "cat";
        return {
          node,
          id: nodeId(node),
          name: isCat ? node.cat.name : node.sub.name,
          icon: isCat ? node.cat.icon : node.sub.icon,
          color: isCat ? node.cat.color : centerColor,
          kids: isCat
            ? topSubsByCat.get(node.cat.id)?.length ?? 0
            : childrenMap.get(node.sub.id)?.length ?? 0,
          glow: glowOf(node),
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nodes, centerColor, topSubsByCat, childrenMap, maxWeight, subtreeCounts, catCounts]
  );

  return (
    <div className="flex flex-col">
      {/* Breadcrumb + görünüm seçici + sayfa menüsü */}
      <div className="mb-2 flex items-center gap-1">
        <HScroll wrapperClassName="min-w-0 flex-1" className="items-center">
          {trail.map((t, i) => (
            <span key={i} className="flex shrink-0 items-center">
              {i > 0 && (
                <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/40" />
              )}
              <button
                onClick={() => onFocusChange(t.focus)}
                className={cn(
                  "max-w-[120px] truncate rounded px-1.5 py-0.5 text-xs transition-colors",
                  i === trail.length - 1
                    ? "font-semibold text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t.label}
              </button>
            </span>
          ))}
        </HScroll>

        {/* Görünüm — kalabalıklaşmaya başlayan sayfalarda çıkar */}
        {nodes.length >= 6 && (
          <div className="flex shrink-0 items-center gap-0.5 rounded-full bg-white/6 p-0.5">
            {LAYOUT_OPTIONS.map(({ key, icon: Icon, labelKey }) => (
              <button
                key={key}
                onClick={() => setLayout(key)}
                aria-label={t(labelKey)}
                aria-pressed={layout === key}
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full transition-colors",
                  layout === key
                    ? "bg-white/15 text-foreground"
                    : "text-muted-foreground/50 hover:text-foreground"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            ))}
          </div>
        )}

        {focusObj != null ? (
          <OptionsMenu
            header={
              <div className="flex items-center gap-2.5">
                <CategoryTileCore
                  color={centerColor}
                  icon={focusIcon}
                  fallback={FolderOpen}
                  size="sm"
                />
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">
                    {focusName}
                  </div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground/60">
                    {focusObj.type === "cat" ? "kategori" : "alt kategori"}
                  </div>
                </div>
              </div>
            }
            items={[
              {
                key: "add-entry",
                icon: PenLine,
                title: t("tree.addEntry"),
                subtitle: t("tree.addRecordHere"),
                emphasis: true,
                onSelect: addEntryHere,
              },
              {
                key: "add-sub",
                icon: FolderPlus,
                title: t("tree.createSubcategory"),
                subtitle: t("tree.newSubcategoryInside"),
                onSelect: openAddSub,
              },
              {
                key: "structure",
                icon: Layers,
                title: t("tree.structurePage"),
                subtitle: "Edit / move / delete",
                onSelect: goStructure,
              },
            ]}
          />
        ) : (
          <button
            onClick={() => setAddCatOpen(true)}
            aria-label={t("tree.newCategory")}
            className="flex h-7 items-center gap-1 rounded-full bg-white/8 px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-white/12 hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
            {t("tree.newCategory")}
          </button>
        )}
      </div>

      {layout === "list" ? (
        <NodeList
          rows={rows}
          center={
            focusObj == null
              ? null
              : { name: focusName, icon: focusIcon, color: centerColor }
          }
          onAddHere={addEntryHere}
          onOpen={drill}
        />
      ) : (
        <>
          {/* Ağ — sürüklenip yakınlaştırılabilen küçük bir pencere */}
          <CanvasViewport width={hex.width} height={hex.height} resetKey={focusKey}>
          <div
            key={focusKey}
            className="relative animate-zoom-in"
            style={{ width: hex.width, height: hex.height }}
          >
            <svg
              className="pointer-events-none absolute inset-0"
              viewBox={`0 0 ${hex.width} ${hex.height}`}
              width={hex.width}
              height={hex.height}
            >
              {/* Merkez göz — kökte "Kategoriler", içeride bulunulan kalem.
                  Çevredekilerden parlak durur ki nerede olunduğu belli olsun. */}
              <polygon
                points={hexCorners(centerPos.x, centerPos.y, HEX_SIZE - 1)}
                fill={`${centerColor}26`}
                stroke={`${centerColor}80`}
                strokeWidth={2}
              />
              {positions.map((p, i) => (
                <polygon
                  key={i}
                  points={hexCorners(p.x, p.y, HEX_SIZE - 1)}
                  fill={`${centerColor}0b`}
                  stroke={`${centerColor}30`}
                  strokeWidth={1.25}
                />
              ))}
              {drag &&
                effPositions.map((p, i) =>
                  drag.id === nodeId(nodes[i]) ? (
                    <line
                      key={`d${i}`}
                      x1={positions[i].x}
                      y1={positions[i].y}
                      x2={p.x}
                      y2={p.y}
                      stroke={`${centerColor}40`}
                      strokeWidth={1.5}
                      strokeDasharray="4 4"
                    />
                  ) : null
                )}
              {/* Sürüklerken oturacağı yuva vurgusu */}
              {drag && targetSlot >= 0 && positions[targetSlot] && (
                <polygon
                  points={hexCorners(
                    positions[targetSlot].x,
                    positions[targetSlot].y,
                    HEX_SIZE - 1
                  )}
                  fill="none"
                  stroke={centerColor}
                  strokeWidth={2}
                  strokeDasharray="5 4"
                />
              )}
            </svg>

            {/* Merkez göz — nerede olduğun. Çevredekilerden parlak durur
                ve dokununca buraya kayıt açılır. Eskiden kare karoydu:
                altıgenin içinde kare durmak şekil dilini bozuyordu. */}
            {focusObj == null && (
              // Kökte tıklanacak bir şey yok — kategori köküne kayıt diye bir
              // kavram yok. Yalnız nerede olduğunu söyleyen etiket.
              <span
                aria-hidden
                className="absolute z-10 flex items-center justify-center"
                style={{
                  left: centerPos.x,
                  top: centerPos.y,
                  width: HEX_SIZE * 2,
                  height: HEX_SIZE * Math.sqrt(3),
                  transform: "translate(-50%,-50%)",
                }}
              >
                <span
                  className="flex h-full w-full flex-col items-center justify-center gap-0.5 px-2"
                  style={{
                    clipPath: HEX_CLIP,
                    background: `linear-gradient(150deg, ${centerColor}7a, ${centerColor}2e)`,
                  }}
                >
                  <Layers className="h-5 w-5 text-white" strokeWidth={1.75} />
                  <span className="line-clamp-2 w-full text-center text-[10px] font-semibold leading-tight text-white">
                    {t("structure.categories")}
                  </span>
                </span>
              </span>
            )}

            {focusObj != null && (
              <button
                onClick={addEntryHere}
                data-net-node=""
                aria-label={`${focusName} · ${t("tree.addRecordHere")}`}
                className="absolute z-10 flex items-center justify-center"
                style={{
                  left: centerPos.x,
                  top: centerPos.y,
                  width: HEX_SIZE * 2,
                  height: HEX_SIZE * Math.sqrt(3),
                  transform: "translate(-50%,-50%)",
                }}
              >
                <span
                  className="flex h-full w-full flex-col items-center justify-center gap-0.5 px-2"
                  style={{
                    clipPath: HEX_CLIP,
                    background: `linear-gradient(150deg, ${centerColor}7a, ${centerColor}2e)`,
                  }}
                >
                  <CategoryIconOrFallback
                    color="#fff"
                    icon={focusIcon}
                    hasKids={hasNodes}
                  />
                  <span className="line-clamp-2 w-full text-center text-[10px] font-semibold leading-tight text-white">
                    {focusName}
                  </span>
                </span>
                {/* Buraya kayıt işareti */}
                <span
                  className="pointer-events-none absolute -bottom-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-background text-white"
                  style={{ backgroundColor: centerColor }}
                >
                  <Plus className="h-3 w-3" strokeWidth={2.75} />
                </span>
              </button>
            )}

            {/* Çevre düğümler — dokun: gir · basılı tut: sürükle */}
            {nodes.map((node, i) => {
              const p = effPositions[i];
              if (!p) return null;
              const isCat = node.kind === "cat";
              const id = nodeId(node);
              const hasKids =
                !isCat && (childrenMap.get(node.sub.id)?.length ?? 0) > 0;
              return (
                <NetNode
                  key={id}
                  x={p.x}
                  y={p.y}
                  color={isCat ? node.cat.color : centerColor}
                  icon={isCat ? node.cat.icon : node.sub.icon}
                  name={isCat ? node.cat.name : node.sub.name}
                  hasKids={hasKids}
                  glow={glowOf(node)}
                  isDragging={drag?.id === id}
                  onTap={() => drill(node)}
                  onDragStart={() => startDrag(node, p)}
                />
              );
            })}

            {focusObj == null && !hasNodes && (
              <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-muted-foreground">
                Henüz kategori yok. Sağ üstten ekle.
              </p>
            )}
          </div>
          </CanvasViewport>
        </>
      )}

      {/* Alt kategori aç */}
      <SubCategoryForm
        open={addSub !== null}
        onOpenChange={(o) => {
          if (!o) setAddSub(null);
        }}
        categoryId={addSub?.categoryId ?? ""}
        parentSubcategoryId={addSub?.parentId}
        categoryName={addSub ? catById.get(addSub.categoryId)?.name : undefined}
      />

      {/* Yeni kategori (kök) */}
      <CategoryForm open={addCatOpen} onOpenChange={setAddCatOpen} />
    </div>
  );
}

type Row = {
  node: Node;
  id: string;
  name: string;
  icon?: string;
  color: string;
  kids: number;
  /** 0–1: sayfadaki en sık kullanılana göre oran */
  glow: number;
};

/**
 * Liste görünümü — çok kalabalık sayfalarda ağ okunmaz hale geldiğinde.
 * Üstte "buraya ekle" bandı, altında aramalı ve A–Z bölümlere ayrılmış satırlar.
 */
function NodeList({
  rows,
  center,
  onAddHere,
  onOpen,
}: {
  rows: Row[];
  center: { name: string; icon?: string; color: string } | null;
  onAddHere: () => void;
  onOpen: (node: Node) => void;
}) {
  const t = useT();
  const [q, setQ] = useState("");
  const query = norm(q);
  const filtered = query
    ? rows.filter((r) => norm(r.name).includes(query))
    : rows;

  /**
   * En çok kullanılan birkaç satır — liste uzunken A–Z'de aşağıda kalanlara
   * kısayol. Aramada gizlenir; hiç kullanılmamışlar girmez.
   */
  const frequent = useMemo(() => {
    if (query || rows.length < 8) return [];
    return rows
      .filter((r) => r.glow > 0)
      .sort((a, b) => b.glow - a.glow)
      .slice(0, 5);
  }, [rows, query]);

  // Aramada düz liste, normalde baş harfe göre bölümler
  const sections = useMemo(() => {
    if (query) return [{ key: "", items: filtered }];
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
  }, [filtered, query]);

  return (
    <div className="flex flex-col gap-2">
      {center && (
        <button
          onClick={onAddHere}
          className="flex items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition-colors active:scale-[0.99]"
          style={{
            borderColor: `${center.color}45`,
            background: `${center.color}12`,
          }}
        >
          <CategoryTileCore
            color={center.color}
            icon={center.icon}
            fallback={FolderOpen}
            size="sm"
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">
              {center.name}
            </span>
            <span className="block text-[10px] text-muted-foreground">
              Buraya girdi ekle
            </span>
          </span>
          <span
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white"
            style={{ backgroundColor: center.color }}
          >
            <Plus className="h-4 w-4" strokeWidth={2.75} />
          </span>
        </button>
      )}

      {rows.length >= 10 && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("action.search")}
            className="h-9 w-full rounded-xl border border-border bg-input pl-9 pr-3 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      )}

      {/* Sık kullanılanlar — A–Z'de aşağıda kalanlara kısayol. Aramada gizli;
          öğeler alfabetik listede de kalır (alfabe eksik görünmesin) */}
      {frequent.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-primary/20 bg-primary/[0.04]">
          <div className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-primary/70">
            <Sparkles className="h-3 w-3" />
            Sık kullanılanlar
          </div>
          {frequent.map((r) => (
            <ListRow key={r.id} row={r} onOpen={onOpen} />
          ))}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-white/8 bg-white/[0.02]">
        {filtered.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            Eşleşen bir şey yok.
          </p>
        ) : (
          sections.map((sec) => (
            <div key={sec.key}>
              {sec.key && (
                <div className="sticky top-0 z-10 bg-card/95 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 backdrop-blur">
                  {sec.key}
                </div>
              )}
              {sec.items.map((r) => (
                <ListRow key={r.id} row={r} onOpen={onOpen} />
              ))}
            </div>
          ))
        )}
      </div>

      <p className="text-center text-[11px] leading-snug text-muted-foreground/70">
        Tap: go inside · reorder from the Structure page
      </p>
    </div>
  );
}

/** Liste satırı — kullanım sıklığına göre karo parlar, ad belirginleşir */
function ListRow({ row: r, onOpen }: { row: Row; onOpen: (node: Node) => void }) {
  return (
    <button
      onClick={() => onOpen(r.node)}
      className="flex w-full items-center gap-3 border-t border-white/5 px-3 py-2 text-left transition-colors first:border-t-0 hover:bg-white/5 active:bg-white/[0.07]"
    >
      <CategoryTileCore
        color={r.color}
        icon={r.icon}
        fallback={r.kids > 0 ? FolderOpen : Folder}
        size="sm"
        glow={r.glow}
      />
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-sm",
          r.glow > 0.5
            ? "font-semibold text-foreground"
            : r.glow > 0.15
              ? "font-medium text-foreground/85"
              : "font-medium text-muted-foreground"
        )}
      >
        {r.name}
      </span>
      {r.kids > 0 && (
        <span className="shrink-0 rounded-full bg-white/8 px-1.5 py-0.5 text-[10px] text-muted-foreground">
          {r.kids}
        </span>
      )}
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/40" />
    </button>
  );
}

/**
 * Ağ düğümü — dokun: içine gir; basılı tut (350ms): sürükleyerek yerini değiştir.
 * Erken hareket sürüklemeyi başlatmaz (dokunuş gibi kalır).
 * dense: sarmalda karolar küçülür, etiket tek satıra sığar.
 */
function NetNode({
  x,
  y,
  color,
  icon,
  name,
  hasKids,
  glow,
  isDragging,
  onTap,
  onDragStart,
}: {
  x: number;
  y: number;
  color: string;
  icon?: string;
  name: string;
  hasKids: boolean;
  /** 0–1: sayfadaki en sık kullanılana göre oran */
  glow: number;
  isDragging: boolean;
  onTap: () => void;
  onDragStart: () => void;
}) {
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const downPos = useRef<{ x: number; y: number } | null>(null);
  const started = useRef(false);
  const clearHold = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
  };

  return (
    <button
      onClick={() => {
        if (started.current) {
          started.current = false;
          return;
        }
        onTap();
      }}
      onPointerDown={(e) => {
        downPos.current = { x: e.clientX, y: e.clientY };
        started.current = false;
        clearHold();
        holdTimer.current = setTimeout(() => {
          started.current = true;
          onDragStart();
        }, 350);
      }}
      onPointerMove={(e) => {
        if (!downPos.current || started.current) return;
        if (
          Math.abs(e.clientX - downPos.current.x) > 8 ||
          Math.abs(e.clientY - downPos.current.y) > 8
        )
          clearHold();
      }}
      onPointerUp={clearHold}
      onPointerCancel={clearHold}
      onContextMenu={(e) => e.preventDefault()}
      data-net-node=""
      className={cn(
        "absolute flex select-none items-center justify-center transition-transform",
        isDragging ? "z-20 scale-110" : "z-0"
      )}
      style={{
        left: x,
        top: y,
        width: HEX_SIZE * 2,
        height: HEX_SIZE * Math.sqrt(3),
        transform: "translate(-50%,-50%)",
      }}
    >
      {/* Ad hücrenin İÇİNDE: gözler birbirine değdiği için dışarıdaki etiket
          komşusunun üstüne biniyordu */}
      <span
        className="flex h-full w-full flex-col items-center justify-center gap-0.5 px-2"
        style={{
          clipPath: HEX_CLIP,
          background: `linear-gradient(150deg, ${color}${Math.round(0x26 + 0x3a * glow)
            .toString(16)
            .padStart(2, "0")}, ${color}0d)`,
          outline: isDragging ? `2px solid ${color}` : undefined,
        }}
      >
        <CategoryIconOrFallback
          color={color}
          icon={icon}
          hasKids={hasKids}
        />
        <span
          className={cn(
            "line-clamp-2 w-full text-center text-[9px] leading-tight",
            glow > 0.5
              ? "font-semibold text-foreground"
              : glow > 0.15
                ? "font-medium text-foreground/80"
                : "font-medium text-muted-foreground"
          )}
        >
          {name}
        </span>
      </span>
      {hasKids && (
        <span
          className="pointer-events-none absolute right-3 top-2 h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: color }}
        />
      )}
    </button>
  );
}

/** Hücrenin içindeki ikon — kare çerçeve yok, altıgenin kendisi çerçeve */
function CategoryIconOrFallback({
  color,
  icon,
  hasKids,
}: {
  color: string;
  icon?: string;
  hasKids: boolean;
}) {
  const isLucide = !!icon && icon in CATEGORY_ICON_MAP;
  if (isLucide)
    return <CategoryIcon name={icon} className="h-5 w-5" style={{ color }} />;
  if (icon) return <span className="text-lg leading-none">{icon}</span>;
  const Fallback = hasKids ? FolderOpen : Folder;
  return <Fallback className="h-5 w-5" style={{ color }} strokeWidth={1.75} />;
}
