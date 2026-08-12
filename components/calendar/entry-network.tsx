"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import {
  ChevronRight,
  Folder,
  FolderOpen,
  FolderPlus,
  Layers,
  List,
  Network,
  Plus,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import {
  getEntryCountsBySubcategory,
  reorderCategories,
  reorderSubcategories,
} from "@/lib/db/queries";
import { MEASURE_KIND_META } from "@/lib/measure-kinds";
import { CategoryTileCore } from "@/components/structure/category-tile";
import { SubCategoryForm } from "@/components/structure/subcategory-form";
import { CategoryForm } from "@/components/structure/category-form";
import { HScroll } from "@/components/ui/h-scroll";
import { CanvasViewport } from "@/components/calendar/canvas-viewport";
import { hexCorners, hexLayout, HEX_CLIP } from "@/lib/hex";
import { neuronLayout } from "@/lib/neuron";
import { SymbolIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { useT, type MessageKey } from "@/lib/i18n";
import type { Category, Mod, SubCategory } from "@/types";

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
type Layout = "neuron" | "poly" | "list";

/** Sayım gelmeden önceki sabit boş harita — memo'ları her render'da bozmasın */
const NO_COUNTS: ReadonlyMap<string, number> = new Map();

/** Altıgen hücrenin merkezden köşesine uzaklığı (px) */
const HEX_SIZE = 46;
/** Nöronda çocuksuz bir çekirdeğin yarıçapı (px) */
const NEURON_BASE = 22;
/** Bu sayıdan sonra çokgen okunmaz oluyor, liste devralır */
const LIST_FROM = 17;

function autoLayout(n: number): Layout {
  return n >= LIST_FROM ? "list" : "neuron";
}

/** Eski kayıtlarda "spiral" olabilir — çokgene düşer */
function normalizeLayout(v: unknown): Layout | undefined {
  if (v === "list") return "list";
  if (v === "neuron") return "neuron";
  if (v === "poly" || v === "spiral") return "poly";
  return undefined;
}

/** Etiketler anahtar; çözümleme render sırasında (modül düzeyinde kanca yok) */
const LAYOUT_OPTIONS: {
  key: Layout;
  icon: typeof Network;
  labelKey: MessageKey;
}[] = [
  { key: "neuron", icon: Sparkles, labelKey: "tree.neuronView" },
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

/** 0–1 → iki haneli onaltılık alfa; "#rrggbb" + bu = saydam renk */
const hexA = (v: number) =>
  Math.round(Math.max(0, Math.min(1, v)) * 255)
    .toString(16)
    .padStart(2, "0");

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
  // Nerede olduğumuz burada tutulur; sheet'in bilmesi gereken bir şey değil
  const [focus, onFocusChange] = useState<NetFocus>(null);
  const [addSub, setAddSub] = useState<{
    categoryId: string;
    parentId?: string;
  } | null>(null);
  const [addCatOpen, setAddCatOpen] = useState(false);
  // Yaprağa varınca açılan ekle modülü — hızlı kayıt mı, detaylı mı
  const [commitOpen, setCommitOpen] = useState(false);

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

  /**
   * Kalem → ona bağlı özellikler. Altıgenlerin altındaki noktalar bundan
   * çıkıyor: kullanıcı daha içeri girmeden "burada ölçülen şeyler var"ı
   * görüyor. Atamalar zaten alt ağaca yayıldığı için (attachMod) hedefin
   * kendi kaydına bakmak yetiyor.
   */
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
  const modsOf = (id: string): Mod[] => modsByTarget?.get(id) ?? [];

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
  const pad = dense ? 26 : 30;

  // Altıgen yuva düzeni — kural lib/hex.ts'te, testle sabit
  const hex = useMemo(
    () => hexLayout(layout === "list" ? 0 : nodes.length, HEX_SIZE),
    [nodes.length, layout]
  );

  /** Bir düğümün KENDİ çocuk sayısı — nöronda çekirdek boyu bundan çıkar */
  const childCountOf = (node: Node) =>
    node.kind === "cat"
      ? (topSubsByCat.get(node.cat.id) ?? []).length
      : (childrenMap.get(node.sub.id) ?? []).length;

  // Nöron düzeni — kural lib/neuron.ts'te, testle sabit
  const childCounts = nodes.map(childCountOf);
  const childCountsKey = childCounts.join(",");
  const neuron = useMemo(
    () => neuronLayout(layout === "neuron" ? childCounts : [], NEURON_BASE),
    // childCounts her render'da yeni dizi; içeriği anahtar olarak kullanılıyor
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [childCountsKey, layout]
  );

  const isNeuron = layout === "neuron";
  const view = isNeuron ? neuron : hex;
  const positions = view.nodes;
  const centerPos = view.center;

  /** Merkez gövdenin kutusu — nöronda daire, petekte altıgen */
  const coreBox = isNeuron
    ? { width: neuron.coreR * 2, height: neuron.coreR * 2 }
    : { width: HEX_SIZE * 2, height: HEX_SIZE * Math.sqrt(3) };
  const coreSkin: CSSProperties = isNeuron
    ? {
        borderRadius: "9999px",
        background: `radial-gradient(circle at 32% 26%, ${centerColor}a8, ${centerColor}33)`,
        boxShadow: `inset 0 0 0 1.5px ${centerColor}99, 0 0 26px ${centerColor}55`,
      }
    : {
        clipPath: HEX_CLIP,
        background: `linear-gradient(150deg, ${centerColor}7a, ${centerColor}2e)`,
      };
  const coreIconSize = isNeuron
    ? Math.round(Math.min(26, Math.max(16, neuron.coreR * 0.5)))
    : 20;

  const nodeId = (node: Node) => (node.kind === "cat" ? node.cat.id : node.sub.id);
  /** Kategoriler kendi renginde; alt kalemler bulundukları dalın renginde */
  const colorOf = (node: Node) =>
    node.kind === "cat" ? node.cat.color : centerColor;
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
      if (!rect || !rect.width) return;
      // Yuva konumları etkin düzenin koordinat uzayında (view.width×view.height);
      // tuval ayrıca CanvasViewport tarafından ölçekleniyor. Ölçeği elemanın
      // kendi genişliğinden okuyoruz: rect.width = view.width × scale.
      const scale = rect.width / view.width;
      const x = Math.max(pad, Math.min(view.width - pad, (e.clientX - rect.left) / scale));
      const y = Math.max(pad, Math.min(view.height - pad, (e.clientY - rect.top) / scale));
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
  }, [drag, nodes, positions, view.width, view.height, pad]);

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
  /** Merkeze dokunmak doğrudan forma atlamıyor; önce ekle modülü açılıyor */
  function addEntryHere() {
    if (focusObj != null) setCommitOpen(true);
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
  /** Bulunulan kalemin yapı sayfası — düğme Link olduğu için önden çekilir */
  const structureHref =
    focusObj == null
      ? ""
      : focusObj.type === "cat"
        ? `/structure/${focusObj.cat.id}`
        : `/structure/${focusObj.sub.categoryId}/${focusObj.sub.id}`;

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
  /** Odaktaki kalemde ölçülen özellikler — ekle modülü bunları gösteriyor */
  const focusMods =
    focusObj == null
      ? []
      : modsOf(focusObj.type === "cat" ? focusObj.cat.id : focusObj.sub.id);
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
    // Tam pencerede ağ kutuyu doldursun diye zincir boyunca yükseklik akıyor
    <div className="relative flex min-h-0 flex-1 flex-col">
      {/* Yol + eylemler.
          Yol artık düz metin değil: her basamak kendi rengini taşıyan bir çip,
          bulunulan yer dolu, ataları soluk. Uzun ağaçta yatay kaydırılır.
          Eylemler menüden çıkıp görünür düğmelere döndü — alt kategori açmak
          ve yapı sayfasına gitmek menünün arkasında kalınca bulunmuyordu. */}
      <div className="mb-3 flex flex-col gap-2">
        <div className="flex items-center gap-1.5">
          <HScroll
            wrapperClassName="min-w-0 flex-1"
            className="items-center gap-1"
            followEnd={focusKey}
          >
            {trail.map((tr, i) => {
              const last = i === trail.length - 1;
              return (
                <span key={i} className="flex shrink-0 items-center gap-1">
                  {i > 0 && (
                    <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/30" />
                  )}
                  <button
                    onClick={() => onFocusChange(tr.focus)}
                    aria-current={last ? "page" : undefined}
                    className={cn(
                      "flex max-w-[130px] shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition-colors",
                      last
                        ? "font-semibold text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                    style={
                      last
                        ? {
                            background: `${centerColor}22`,
                            boxShadow: `inset 0 0 0 1px ${centerColor}66`,
                          }
                        : { background: "rgba(255,255,255,0.05)" }
                    }
                  >
                    {last && (
                      <span
                        className="h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ backgroundColor: centerColor }}
                      />
                    )}
                    <span className="truncate">{tr.label}</span>
                  </button>
                </span>
              );
            })}
          </HScroll>

          {/* Görünüm — her sayfada durur. Eskiden yalnız 6+ düğümde çıkıyordu
              ama seçenek sayfadan sayfaya kaybolunca kullanıcı onu arıyordu;
              liste tercihi kişisel, kalabalığa bağlı değil. */}
          {hasNodes && (
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
        </div>

        {/* Eylem şeridi */}
        <div className="flex items-center gap-1.5">
          {focusObj == null ? (
            <ActionButton
              icon={Plus}
              label={t("tree.newCategory")}
              color={centerColor}
              onClick={() => setAddCatOpen(true)}
              primary
            />
          ) : (
            <>
              <ActionButton
                icon={FolderPlus}
                label={t("tree.createSubcategory")}
                color={centerColor}
                onClick={openAddSub}
                primary
              />
              {/* Bulunulan kalemin yapı sayfası — düzenle/taşı/sil oraya ait.
                  router.push yerine Link: dokunulduğunda sayfa çoktan çekilmiş
                  oluyor, eskiden tıklayıp beklemek gerekiyordu. */}
              <ActionButton
                icon={Layers}
                label={focusName}
                color={centerColor}
                href={structureHref}
                onClick={onClose}
              />
            </>
          )}
        </div>
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
          <CanvasViewport width={view.width} height={view.height} resetKey={focusKey}>
          <div
            key={focusKey}
            ref={canvasRef}
            className="relative animate-zoom-in"
            style={{ width: view.width, height: view.height }}
          >
            <svg
              className="pointer-events-none absolute inset-0"
              viewBox={`0 0 ${view.width} ${view.height}`}
              width={view.width}
              height={view.height}
            >
              {isNeuron ? (
                // Dendritler — gövdeden çekirdeğe. Sık kullanılan dal daha
                // parlak: yol da ışıyınca "nereye çok gidiyorum" tek bakışta
                // okunuyor.
                neuron.nodes.map((n, i) => (
                  <path
                    key={i}
                    d={n.path}
                    fill="none"
                    stroke={`${colorOf(nodes[i])}${hexA(0.32 + 0.55 * glowOf(nodes[i]))}`}
                    strokeWidth={n.width}
                    strokeLinecap="round"
                  />
                ))
              ) : (
                <>
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
                </>
              )}
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
              {drag &&
                targetSlot >= 0 &&
                positions[targetSlot] &&
                (isNeuron ? (
                  <circle
                    cx={positions[targetSlot].x}
                    cy={positions[targetSlot].y}
                    r={neuron.nodes[targetSlot].r + 3}
                    fill="none"
                    stroke={centerColor}
                    strokeWidth={2}
                    strokeDasharray="5 4"
                  />
                ) : (
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
                ))}
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
                  ...coreBox,
                  transform: "translate(-50%,-50%)",
                }}
              >
                <span
                  className="flex h-full w-full flex-col items-center justify-center gap-0.5 px-1.5"
                  style={coreSkin}
                >
                  <Layers
                    className="text-white"
                    style={{ width: coreIconSize, height: coreIconSize }}
                    strokeWidth={1.75}
                  />
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
                  ...coreBox,
                  transform: "translate(-50%,-50%)",
                }}
              >
                <span
                  className="flex h-full w-full flex-col items-center justify-center gap-0.5 px-1.5"
                  style={coreSkin}
                >
                  <CategoryIconOrFallback
                    color="#fff"
                    icon={focusIcon}
                    hasKids={hasNodes}
                    size={coreIconSize}
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
              const common = {
                x: p.x,
                y: p.y,
                color: colorOf(node),
                icon: isCat ? node.cat.icon : node.sub.icon,
                name: isCat ? node.cat.name : node.sub.name,
                mods: modsOf(id),
                glow: glowOf(node),
                isDragging: drag?.id === id,
                onTap: () => drill(node),
                onDragStart: () => startDrag(node, p),
              };
              return isNeuron ? (
                <NeuronCell key={id} {...common} r={neuron.nodes[i].r} />
              ) : (
                <NetNode key={id} {...common} hasKids={hasKids} />
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

      {/* ── Ekle modülü ────────────────────────────────────────────────
          Merkez altıgene dokununca açılır. Asli eylem TEK ve belirgin:
          "Ekle". Ölçmek isteyen "Detay ekle"ye gidiyor — orada değerler,
          özellik ekleme ve yeni özellik yaratma birlikte duruyor, kullanıcı
          uygulamanın mantığını oradan öğreniyor. */}
      {commitOpen && focusObj != null && (
        <>
          <div
            className="absolute inset-0 z-30 bg-black/50 backdrop-blur-[1px]"
            onClick={() => setCommitOpen(false)}
          />
          <div className="animate-in absolute inset-x-0 bottom-0 z-40 rounded-t-3xl border-t border-white/10 bg-background px-5 pb-6 pt-4">
            <div className="mb-4 flex items-center gap-3">
              <span
                className="flex h-11 w-11 shrink-0 items-center justify-center"
                style={{
                  clipPath: HEX_CLIP,
                  background: `linear-gradient(150deg, ${centerColor}9e, ${centerColor}3a)`,
                }}
              >
                <SymbolIcon name={focusIcon} size={20} style={{ color: "#fff" }} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-base font-semibold leading-tight">
                  {focusName}
                </div>
                <div className="text-[11px] leading-tight text-muted-foreground">
                  {focusMods.length > 0
                    ? focusMods.map((m) => m.name).join(" · ")
                    : t("entry.noFeaturesYet")}
                </div>
              </div>
              <button
                onClick={() => setCommitOpen(false)}
                aria-label={t("action.close")}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/8 text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Ölçülen şeyler — dokunulmadan da görünsün ki "sadece aktiviteyi
                değil, ona ait özellikleri de tutuyorum" fark edilsin */}
            {focusMods.length > 0 && (
              <div className="mb-4 flex flex-wrap gap-1.5">
                {focusMods.map((m) => {
                  const Icon = MEASURE_KIND_META[m.valueType ?? "number"].icon;
                  return (
                    <span
                      key={m.id}
                      className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-2 py-1 text-[11px] text-muted-foreground"
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
              className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-[15px] font-semibold text-white transition-transform active:scale-[0.98]"
              style={{
                background: `linear-gradient(150deg, ${centerColor}, ${centerColor}c4)`,
                boxShadow: `0 6px 20px -10px ${centerColor}`,
              }}
            >
              <Plus className="h-4 w-4" strokeWidth={2.75} />
              {t("entry.addNow")}
            </button>
            <button
              onClick={commitDetailed}
              className="mt-2 flex h-10 w-full items-center justify-center gap-1.5 rounded-2xl border border-border bg-card text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {t("entry.addWithDetail")}
            </button>
          </div>
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
        {t("tree.listHint")}
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
/**
 * Dokun/basılı tut ayrımı — iki görünüm de aynı davranışı paylaşıyor:
 * dokunuş içeri girer, 350ms basılı tutmak sürüklemeyi başlatır, erken
 * hareket sürüklemeyi iptal eder (kaydırmaya benzemesin).
 */
function useHold(onTap: () => void, onDragStart: () => void) {
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const downPos = useRef<{ x: number; y: number } | null>(null);
  const started = useRef(false);
  const clearHold = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
  };
  return {
    onClick: () => {
      if (started.current) {
        started.current = false;
        return;
      }
      onTap();
    },
    onPointerDown: (e: React.PointerEvent) => {
      downPos.current = { x: e.clientX, y: e.clientY };
      started.current = false;
      clearHold();
      holdTimer.current = setTimeout(() => {
        started.current = true;
        onDragStart();
      }, 350);
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (!downPos.current || started.current) return;
      if (
        Math.abs(e.clientX - downPos.current.x) > 8 ||
        Math.abs(e.clientY - downPos.current.y) > 8
      )
        clearHold();
    },
    onPointerUp: clearHold,
    onPointerCancel: clearHold,
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  };
}

function NetNode({
  x,
  y,
  color,
  icon,
  name,
  hasKids,
  mods,
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
  /** Bu kalemde ölçülen özellikler — adın altında nokta olarak çıkar */
  mods: Mod[];
  /** 0–1: sayfadaki en sık kullanılana göre oran */
  glow: number;
  isDragging: boolean;
  onTap: () => void;
  onDragStart: () => void;
}) {
  const hold = useHold(onTap, onDragStart);

  return (
    <button
      {...hold}
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
        {/* Ölçülen özellikler — kalemin içine girmeden görünür. İleride kovan
            haritasında ortak özellikler bu noktalardan ışık yollarıyla
            birbirine bağlanacak; şimdiden aynı dil kuruluyor. */}
        <span className="flex h-1.5 items-center gap-[3px]">
          {mods.slice(0, 5).map((m) => (
            <span
              key={m.id}
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: color, opacity: 0.85 }}
            />
          ))}
          {mods.length > 5 && (
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: color, opacity: 0.35 }}
            />
          )}
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

/**
 * Nöron hücresi — çekirdek + adı.
 *
 * Altıgenden iki farkı var: BOY kendi alt kalemlerinin sayısını, PARLAKLIK
 * ise kullanım sıklığını söylüyor. Yani sayfaya bakan kişi "buranın altı
 * kalabalık" ile "burayı sık kullanıyorum"u aynı anda ama karıştırmadan
 * görüyor. Ölçülen özellikler çekirdeğin üst kavisinde sinaps gibi duruyor —
 * ileride kovan haritasında ortak özellikler bu noktalardan bağlanacak.
 */
function NeuronCell({
  x,
  y,
  r,
  color,
  icon,
  name,
  mods,
  glow,
  isDragging,
  onTap,
  onDragStart,
}: {
  x: number;
  y: number;
  /** Çekirdek yarıçapı — çocuk sayısından gelir (lib/neuron.ts) */
  r: number;
  color: string;
  icon?: string;
  name: string;
  mods: Mod[];
  /** 0–1: sayfadaki en sık kullanılana göre oran */
  glow: number;
  isDragging: boolean;
  onTap: () => void;
  onDragStart: () => void;
}) {
  const hold = useHold(onTap, onDragStart);
  const dots = mods.slice(0, 5);
  // Sinapslar üst kavise yayılır; alt taraf ada ayrılmış
  const step = dots.length > 1 ? 70 / (dots.length - 1) : 0;
  const from = dots.length > 1 ? -125 : -90;

  return (
    <button
      {...hold}
      data-net-node=""
      className={cn(
        "absolute select-none transition-transform",
        isDragging ? "z-20 scale-110" : "z-0"
      )}
      style={{
        left: x,
        top: y,
        width: r * 2,
        height: r * 2,
        transform: "translate(-50%,-50%)",
      }}
    >
      <span
        className="relative flex h-full w-full items-center justify-center rounded-full"
        style={{
          background: `radial-gradient(circle at 32% 26%, ${color}${hexA(0.34 + 0.46 * glow)}, ${color}${hexA(0.08 + 0.16 * glow)})`,
          boxShadow: `inset 0 0 0 1px ${color}${hexA(0.3 + 0.5 * glow)}, 0 0 ${Math.round(5 + 20 * glow)}px ${color}${hexA(0.1 + 0.35 * glow)}`,
          outline: isDragging ? `2px solid ${color}` : undefined,
        }}
      >
        <CategoryIconOrFallback
          color={color}
          icon={icon}
          hasKids={false}
          size={Math.round(Math.min(28, Math.max(16, r * 0.72)))}
        />
        {dots.map((m, i) => {
          const rad = ((from + i * step) * Math.PI) / 180;
          return (
            <span
              key={m.id}
              className="absolute h-[5px] w-[5px] rounded-full"
              style={{
                left: r + Math.cos(rad) * r,
                top: r + Math.sin(rad) * r,
                transform: "translate(-50%,-50%)",
                backgroundColor: color,
                boxShadow: `0 0 4px ${color}`,
              }}
            />
          );
        })}
      </span>
      {/* Ad çekirdeğin altında — daireyi ada göre şişirmek boy dilini
          (boy = çocuk sayısı) bozardı */}
      <span
        className={cn(
          "pointer-events-none absolute left-1/2 top-full line-clamp-2 w-[84px] -translate-x-1/2 pt-1 text-center text-[9px] leading-tight",
          glow > 0.5
            ? "font-semibold text-foreground"
            : glow > 0.15
              ? "font-medium text-foreground/80"
              : "font-medium text-muted-foreground"
        )}
      >
        {name}
      </span>
    </button>
  );
}

/** Hücrenin içindeki ikon — kare çerçeve yok, altıgenin kendisi çerçeve */
function CategoryIconOrFallback({
  color,
  icon,
  hasKids,
  size = 20,
}: {
  color: string;
  icon?: string;
  hasKids: boolean;
  /** Nöronda çekirdek boyu değişken — ikon onunla ölçekleniyor */
  size?: number;
}) {
  if (icon) return <SymbolIcon name={icon} size={size} style={{ color }} />;
  const Fallback = hasKids ? FolderOpen : Folder;
  return (
    <Fallback
      style={{ color, width: size, height: size }}
      strokeWidth={1.75}
    />
  );
}

/**
 * Başlıktaki eylem düğmesi. `primary` olan kalemin renginde dolu durur —
 * asıl eylem odur; ikincisi çerçeveli ve sakin. Eskiden ikisi de "…" menüsünün
 * arkasındaydı ve kullanıcı alt kategori açmayı bulamıyordu.
 */
function ActionButton({
  icon: Icon,
  label,
  color,
  onClick,
  href,
  primary,
}: {
  icon: typeof Plus;
  label: string;
  color: string;
  onClick: () => void;
  /** Verilirse Link olarak çizilir — Next rotayı önden çeker, dokunuş anında
   *  bekleme olmaz. Düğme olarak kalırsa gezinme tıklamadan sonra başlıyor. */
  href?: string;
  primary?: boolean;
}) {
  const cls = cn(
        "flex min-w-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-all active:scale-[0.97]",
        primary ? "text-white" : "text-muted-foreground hover:text-foreground"
  );
  const style = primary
    ? {
        background: `linear-gradient(135deg, ${color}, ${color}bb)`,
        boxShadow: `0 3px 10px ${color}38`,
      }
    : {
        background: `${color}12`,
        boxShadow: `inset 0 0 0 1px ${color}40`,
      };
  const body = (
    <>
      <Icon className="h-3 w-3 shrink-0" strokeWidth={2.25} />
      <span className="truncate">{label}</span>
    </>
  );
  if (href) {
    return (
      // prefetch acıkça: sheet içinde açılan bağlantıda görünürlük tabanlı
      // varsayılan önden çekme tetiklenmiyordu, tıklamada 8 istek gidiyordu
      <Link href={href} prefetch onClick={onClick} className={cls} style={style}>
        {body}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cls} style={style}>
      {body}
    </button>
  );
}
