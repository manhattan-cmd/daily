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
  MoreHorizontal,
  Network,
  Orbit,
  PenLine,
  Plus,
  Search,
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
import { cn } from "@/lib/utils";
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
type Layout = "poly" | "spiral" | "list";

/** Sayım gelmeden önceki sabit boş harita — memo'ları her render'da bozmasın */
const NO_COUNTS: ReadonlyMap<string, number> = new Map();

/** Tuval genişliği (px) — sarmal daha geniş alan ister */
const MAX_POLY = 300;
const MAX_SPIRAL = 340;
/** Otomatik geçiş eşikleri: 9'dan itibaren sarmal, 17'den itibaren liste */
const SPIRAL_FROM = 9;
const LIST_FROM = 17;

function autoLayout(n: number): Layout {
  if (n >= LIST_FROM) return "list";
  if (n >= SPIRAL_FROM) return "spiral";
  return "poly";
}

const LAYOUT_OPTIONS: { key: Layout; icon: typeof Network; label: string }[] = [
  { key: "poly", icon: Network, label: "Ağ görünümü" },
  { key: "spiral", icon: Orbit, label: "Sarmal görünüm" },
  { key: "list", icon: List, label: "Liste görünümü" },
];

/** Kullanıcının sayfa bazlı görünüm tercihi (localStorage) */
const LS_LAYOUT = "entrynet-layout";
const focusKeyOf = (f: NetFocus) => (f == null ? "root" : `${f.type}:${f.id}`);

/** Çokgen köşe açısı (ekran koordinatı) — 2 sağ/sol, 3 üçgen, 4 kare... */
function angleFor(i: number, n: number): number {
  if (n === 1) return Math.PI / 2;
  const deg = -90 + 180 / n + (i * 360) / n;
  return (deg * Math.PI) / 180;
}

/** Çokgen köşeleri — az sayıda düğüm için temiz ve okunur */
function polyPositions(n: number, C: number) {
  const R = C * (n <= 4 ? 0.69 : Math.min(0.85, 0.55 + n * 0.045));
  return Array.from({ length: n }, (_, i) => {
    const a = angleFor(i, n);
    return { x: C + R * Math.cos(a), y: C + R * Math.sin(a) };
  });
}

/**
 * Arşimet sarmalı: r = r0 + b·θ. Düğümler yay uzunluğuna göre eşit aralıklı
 * dizilir, böylece merkeze yakın kısımda sıkışma olmaz. Tur sayısı düğüm
 * sayısıyla artar — halkalar arası boşluk karo+etiket yüksekliğinin (~48px)
 * altına inmesin diye 1.8 turda sınırlanır. r0, merkez karonun etiketiyle
 * çakışmayacak kadar dışarıdan başlar.
 */
function spiralParams(n: number, C: number) {
  const r0 = C * 0.34;
  const r1 = C * 0.87;
  const TH = Math.min(1.8, 0.85 + n * 0.07) * Math.PI * 2;
  const b = (r1 - r0) / TH;
  return { r0, TH, b, S: r0 * TH + (b * TH * TH) / 2 };
}

function spiralPositions(n: number, C: number) {
  const { r0, b, S } = spiralParams(n, C);
  return Array.from({ length: n }, (_, i) => {
    const s = n === 1 ? 0 : (S * i) / (n - 1);
    // s = r0·θ + b·θ²/2  →  θ (yay uzunluğundan açıyı çöz)
    const th = (-r0 + Math.sqrt(r0 * r0 + 2 * b * s)) / b;
    const r = r0 + b * th;
    const a = -Math.PI / 2 + th;
    return { x: C + r * Math.cos(a), y: C + r * Math.sin(a) };
  });
}

/** Türkçe duyarlı bölüm başlığı — ada göre A–Z gruplaması */
function sectionKeyOf(name: string): string {
  const ch = name.trim().charAt(0).toLocaleUpperCase("tr");
  return /\p{L}/u.test(ch) ? ch : "#";
}
const norm = (s: string) => s.toLocaleLowerCase("tr").trim();

/**
 * Girdi ekleme v2 — ağ tabanlı gezinme. Kök: ana kategoriler ağ olarak. Bir
 * düğüme dokun → onun "sayfası": ortada kendisi, çevresinde çocukları.
 * Yerleşim düğüm sayısına göre kendiliğinden değişir: çokgen ağ → sarmal →
 * aranabilir A–Z liste. Sağ üstteki üçlü düğmeyle elle de seçilebilir.
 * Ağ/sarmalda düğümler basılı tutulup sürüklenerek yeniden sıralanır.
 * Sayfa menüsü: Girdi ekle · Alt kategori aç · Yapı sayfası.
 */
export function EntryNetwork({
  groups,
  focus,
  onFocusChange,
  onSubSelect,
  onCategorySelect,
  onClose,
}: {
  groups: NetGroup[] | undefined;
  focus: NetFocus;
  onFocusChange: (focus: NetFocus) => void;
  onSubSelect: (sub: SubCategory) => void;
  onCategorySelect: (category: Category) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
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
      return JSON.parse(localStorage.getItem(LS_LAYOUT) ?? "{}");
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

  const dense = layout === "spiral";
  const maxSize = dense ? MAX_SPIRAL : MAX_POLY;
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
  const half = box / 2;
  const pad = dense ? 26 : 30;

  const positions = useMemo(() => {
    const n = nodes.length;
    if (n === 0 || layout === "list") return [];
    return dense ? spiralPositions(n, half) : polyPositions(n, half);
  }, [nodes.length, layout, dense, half]);

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
      { label: "Kategoriler", focus: null },
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
    setMenuOpen(false);
    if (focusObj == null) return;
    if (focusObj.type === "cat") setAddSub({ categoryId: focusObj.cat.id });
    else
      setAddSub({
        categoryId: focusObj.sub.categoryId,
        parentId: focusObj.sub.id,
      });
  }
  function goStructure() {
    setMenuOpen(false);
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
      ? "Kategoriler"
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
  // Çokgen daima sabit köşelerden (temiz kalır); ışınlar sürükleneni takip eder
  const polyPoints = positions.map((p) => `${p.x},${p.y}`).join(" ");
  const spiralPath = useMemo(() => {
    if (!dense || nodes.length === 0) return "";
    const { r0, b, TH } = spiralParams(nodes.length, half);
    const pts: string[] = [];
    const STEPS = 96;
    // Merkezin arkasından çıkıp son düğümün biraz ötesinde biter
    const from = -0.6;
    const to = TH + 0.4;
    for (let k = 0; k <= STEPS; k++) {
      const th = from + ((to - from) * k) / STEPS;
      const r = Math.max(4, r0 + b * th);
      const a = -Math.PI / 2 + th;
      pts.push(
        `${(half + r * Math.cos(a)).toFixed(1)},${(half + r * Math.sin(a)).toFixed(1)}`
      );
    }
    return `M ${pts.join(" L ")}`;
  }, [dense, nodes.length, half]);

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
            {LAYOUT_OPTIONS.map(({ key, icon: Icon, label }) => (
              <button
                key={key}
                onClick={() => setLayout(key)}
                aria-label={label}
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
          <div className="relative shrink-0">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Sayfa menüsü"
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full transition-colors",
                menuOpen
                  ? "bg-primary/20 text-primary"
                  : "bg-white/8 text-muted-foreground hover:bg-white/12 hover:text-foreground"
              )}
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
            {menuOpen && (
              <>
                {/* Arka planı karart */}
                <div
                  className="fixed inset-0 z-30 bg-black/55 backdrop-blur-[1px]"
                  onClick={() => setMenuOpen(false)}
                />
                <div className="absolute right-0 top-9 z-40 w-60 overflow-hidden rounded-2xl border border-white/10 bg-card shadow-2xl">
                  {/* Bağlam başlığı — hangi sayfadayız */}
                  <div className="flex items-center gap-2.5 border-b border-border bg-white/[0.03] px-3 py-2.5">
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

                  <MenuItem
                    icon={<PenLine className="h-4 w-4 text-primary" />}
                    title="Girdi ekle"
                    subtitle="Bu sayfaya kayıt ekle"
                    onClick={() => {
                      setMenuOpen(false);
                      addEntryHere();
                    }}
                  />
                  <MenuItem
                    icon={<FolderPlus className="h-4 w-4 text-muted-foreground" />}
                    title="Alt kategori aç"
                    subtitle="İçine yeni alt kategori"
                    onClick={openAddSub}
                  />
                  <MenuItem
                    icon={<Layers className="h-4 w-4 text-muted-foreground" />}
                    title="Yapı sayfası"
                    subtitle="Düzenle / taşı / sil"
                    onClick={goStructure}
                  />
                </div>
              </>
            )}
          </div>
        ) : (
          <button
            onClick={() => setAddCatOpen(true)}
            aria-label="Yeni kategori"
            className="flex h-7 items-center gap-1 rounded-full bg-white/8 px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-white/12 hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
            Kategori
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
          {/* Ağ tuvali */}
          <div
            ref={canvasRef}
            className="relative mx-auto touch-none"
            style={{ width: maxSize, maxWidth: "100%", aspectRatio: "1 / 1" }}
          >
            <svg
              className="pointer-events-none absolute inset-0"
              viewBox={`0 0 ${box} ${box}`}
              width="100%"
              height="100%"
            >
              {dense ? (
                <>
                  <path
                    d={spiralPath}
                    fill="none"
                    stroke={`${centerColor}45`}
                    strokeWidth={1.5}
                    strokeLinecap="round"
                  />
                  {/* Düğümü sarmala bağlayan kısa iz — sürüklerken takip eder */}
                  {drag &&
                    effPositions.map((p, i) =>
                      drag.id === nodeId(nodes[i]) ? (
                        <line
                          key={i}
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
                </>
              ) : (
                <>
                  {focusObj != null &&
                    effPositions.map((p, i) => (
                      <line
                        key={i}
                        x1={half}
                        y1={half}
                        x2={p.x}
                        y2={p.y}
                        stroke={`${centerColor}40`}
                        strokeWidth={1.5}
                      />
                    ))}
                  {focusObj == null && effPositions.length === 2 && (
                    <line
                      x1={effPositions[0].x}
                      y1={effPositions[0].y}
                      x2={effPositions[1].x}
                      y2={effPositions[1].y}
                      stroke={`${centerColor}45`}
                      strokeWidth={1.5}
                    />
                  )}
                  {positions.length >= 3 && (
                    <polygon
                      points={polyPoints}
                      fill={`${centerColor}0f`}
                      stroke={`${centerColor}50`}
                      strokeWidth={1.5}
                    />
                  )}
                </>
              )}
              {/* Sürüklerken oturacağı yuva vurgusu */}
              {drag && targetSlot >= 0 && positions[targetSlot] && (
                <circle
                  cx={positions[targetSlot].x}
                  cy={positions[targetSlot].y}
                  r={dense ? 24 : 30}
                  fill="none"
                  stroke={centerColor}
                  strokeWidth={2}
                  strokeDasharray="5 4"
                />
              )}
            </svg>

            {/* Merkez düğüm — dokun: buraya ekle */}
            {focusObj != null && (
              <button
                onClick={addEntryHere}
                aria-label={`${focusName} · buraya ekle`}
                className="absolute z-10 flex flex-col items-center gap-1"
                style={{
                  left: half,
                  top: half,
                  transform: "translate(-50%,-50%)",
                }}
              >
                <span className="relative">
                  {/* Sarmalda merkez bir tık küçülür — en içteki düğüme yer açar */}
                  <CategoryTileCore
                    color={centerColor}
                    icon={focusIcon}
                    fallback={FolderOpen}
                    size={dense ? "md" : "lg"}
                  />
                  <span
                    className={cn(
                      "absolute -bottom-1 -right-1 flex items-center justify-center rounded-full border-2 border-background text-white",
                      dense ? "h-5 w-5" : "h-6 w-6"
                    )}
                    style={{ backgroundColor: centerColor }}
                  >
                    <Plus
                      className={dense ? "h-3 w-3" : "h-3.5 w-3.5"}
                      strokeWidth={2.75}
                    />
                  </span>
                </span>
                <span className="max-w-[104px] truncate text-center text-xs font-semibold">
                  {focusName}
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
                  dense={dense}
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

          {/* İpucu */}
          {focusObj != null ? (
            <p className="mt-1 text-center text-[11px] leading-snug text-muted-foreground/70">
              {hasNodes
                ? "Dokun: içine gir · ortadaki: buraya ekle · basılı tutup sürükle: taşı"
                : "Bu bir uç — ortadakine dokun ya da menüden “Girdi ekle”."}
            </p>
          ) : (
            hasNodes && (
              <p className="mt-1 text-center text-[11px] leading-snug text-muted-foreground/70">
                Dokun: içine gir · basılı tutup sürükle: yerini değiştir
              </p>
            )
          )}
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

function MenuItem({
  icon,
  title,
  subtitle,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 border-t border-border/60 px-3 py-2.5 text-left transition-colors first:border-t-0 hover:bg-white/5 active:bg-white/[0.07]"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/5">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-[11px] text-muted-foreground">
          {subtitle}
        </span>
      </span>
    </button>
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
  const [q, setQ] = useState("");
  const query = norm(q);
  const filtered = query
    ? rows.filter((r) => norm(r.name).includes(query))
    : rows;

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
        a[0] === "#" ? 1 : b[0] === "#" ? -1 : a[0].localeCompare(b[0], "tr")
      )
      .map(([key, items]) => ({
        key,
        items: items.sort((x, y) => x.name.localeCompare(y.name, "tr")),
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
            placeholder="Ara..."
            className="h-9 w-full rounded-xl border border-border bg-input pl-9 pr-3 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring"
          />
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
                <button
                  key={r.id}
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
              ))}
            </div>
          ))
        )}
      </div>

      <p className="text-center text-[11px] leading-snug text-muted-foreground/70">
        Dokun: içine gir · sıralamayı yapı sayfasından değiştir
      </p>
    </div>
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
  dense,
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
  dense: boolean;
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
      className={cn(
        "absolute flex select-none flex-col items-center gap-0.5 transition-transform",
        isDragging ? "z-20 scale-110" : "z-0"
      )}
      style={{ left: x, top: y, transform: "translate(-50%,-50%)" }}
    >
      <span className="relative">
        <span
          className="block rounded-xl"
          style={
            isDragging
              ? { outline: `2px solid ${color}`, outlineOffset: "2px" }
              : undefined
          }
        >
          <CategoryTileCore
            color={color}
            icon={icon}
            fallback={hasKids ? FolderOpen : Folder}
            size={dense ? "sm" : "md"}
            glow={glow}
          />
        </span>
        {hasKids && (
          <span
            className={cn(
              "absolute -bottom-1 -right-1 rounded-full border-2 border-background",
              dense ? "h-3 w-3" : "h-3.5 w-3.5"
            )}
            style={{ backgroundColor: color }}
          />
        )}
      </span>
      <span
        className={cn(
          "truncate text-center leading-tight",
          dense ? "max-w-[64px] text-[9px]" : "max-w-[80px] text-[10px]",
          glow > 0.5
            ? "font-semibold text-foreground"
            : glow > 0.15
              ? "font-medium text-foreground/75"
              : "font-medium text-muted-foreground"
        )}
      >
        {name}
      </span>
    </button>
  );
}
