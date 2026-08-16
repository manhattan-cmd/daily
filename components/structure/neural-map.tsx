"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { ChevronRight, Layers } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  getEntryCountsBySubcategory,
  reorderCategories,
  reorderSubcategories,
} from "@/lib/db/queries";
import { HScroll } from "@/components/ui/h-scroll";
import { CanvasViewport } from "@/components/calendar/canvas-viewport";
import { graphLayout, type GraphSeed, type LabelSide } from "@/lib/graph";
import { SymbolIcon } from "@/lib/icons";
import { usageIntensity, usageRate, usageSince } from "@/lib/usage";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import type { Category, SubCategory } from "@/types";

export type MapGroup = {
  category: Category;
  topSubs: SubCategory[];
  allSubs: SubCategory[];
};

/** Odak — id tabanlı, veri güncellemesine dayanıklı */
type MapFocus =
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

/**
 * Haritadaki bir düğümün kimliği. Çizim bunu okuyor; yerleşim (lib/graph.ts)
 * yalnız ağacın şeklini biliyor, adı rengi kullanımı burada duruyor.
 */
type GraphMeta = {
  name: string;
  icon?: string;
  color: string;
  /** Ham kullanım (son 30 gündeki girdi sayısı, alt ağaç dahil) */
  weight: number;
  node: Node;
};

/** Sayım gelmeden önceki sabit boş harita — memo'ları her render'da bozmasın */
const NO_COUNTS: ReadonlyMap<string, number> = new Map();

/**
 * Bir bağın "yaşıyor" sayıldığı en düşük yoğunluk. Bunun üstündekiler
 * çevresine ışıma alıyor; altındakiler yalnız ince iz. Ölçü mutlak: ayda bir
 * uğranan dal 0.17 civarında (lib/usage).
 */
const LINK_LIT = 0.12;

const focusKeyOf = (f: MapFocus) => (f == null ? "root" : `${f.type}:${f.id}`);
const noop = () => {};

/**
 * Rengi ton çemberinde kaydır — aynı ailenin komşu tonları.
 */
function shiftHue(hex: string, deg: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const num = parseInt(m[1], 16);
  const r = (num >> 16) / 255;
  const g = ((num >> 8) & 255) / 255;
  const b = (num & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
  }
  h = (h * 60 + deg + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const mm = l - c / 2;
  const [rr, gg, bb] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  const hx = (v: number) =>
    Math.round((v + mm) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${hx(rr)}${hx(gg)}${hx(bb)}`;
}

/** 0–1 → iki haneli onaltılık alfa; "#rrggbb" + bu = saydam renk */
const hexA = (v: number) =>
  Math.round(Math.max(0, Math.min(1, v)) * 255)
    .toString(16)
    .padStart(2, "0");

/**
 * Hayat haritası — yapının sinir ağı.
 *
 * Ortada bulunulan yer, çevresinde ona bağlı olan her şey. Bir düğüme
 * dokununca merkez o oluyor ve aynı resim onun ağacı için yeniden kuruluyor.
 * Kalabalıkta harita kendiliğinden takımadaya dönüşüyor: her dal sınırı olan
 * bir ülke, adı sınırının dışında, sınırın içi tek dokunuş (lib/graph.ts).
 *
 * Parlaklık kullanım: son 30 günde çok gidilen yol ışıyor, bırakılmış dal
 * sönük bir iz olarak duruyor. Harita şu anki hayatı gösteriyor, arşivi değil.
 *
 * Bu ağ bir süre girdi ekleme akışında yaşadı ve oraya ağır geldi: kayıt
 * eklemek seri bir iş, harita ise bakılacak bir şey. Yeri burası.
 */
export function NeuralMap({ groups }: { groups: MapGroup[] | undefined }) {
  const t = useT();
  const [focus, setFocus] = useState<MapFocus>(null);

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

  // Sayım SON 30 GÜNE bakıyor (lib/usage): bıraktığın bir alışkanlık haritada
  // parlak kalmasın, yeni edindiğin sönük durmasın.
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

  /**
   * Dalın kendi tonu. Kökte her kategorinin rengi kendinin; bir kategorinin
   * içine girildiğinde alt kalemlerin kendi rengi olmadığı için dalın
   * renginden komşu tonlar türetiliyor. Adım 18°, toplam yayılım ±14° ile
   * ±36° arasında: iki çocukluda ayırt ediliyor, on iki çocukluda aile
   * dağılmıyor.
   */
  const branchTint = (i: number, n: number) => {
    if (n <= 1) return centerColor;
    const spread = Math.max(28, Math.min(72, 18 * (n - 1)));
    return shiftHue(centerColor, (i / (n - 1) - 0.5) * spread);
  };

  const nodeId = (node: Node) =>
    node.kind === "cat" ? node.cat.id : node.sub.id;

  // ─── Şekil ve kimlik ayrı ─────────────────────────────────────────────────
  // Yerleşimin bildiği tek şey ŞEKİL. Renk ve kullanım ayrı durmalı: sayım
  // canlı sorgudan geliyor ve tazelendiğinde ağacın yeniden yerleşmesi için
  // bir sebep yok.
  const shape = useMemo<GraphSeed>(() => {
    const subSeed = (s: SubCategory): GraphSeed => ({
      id: s.id,
      kind: "sub",
      label: s.name,
      children: (childrenMap.get(s.id) ?? []).map(subSeed),
    });
    const children: GraphSeed[] =
      focusObj == null
        ? categories.map((c) => ({
            id: c.id,
            kind: "cat" as const,
            label: c.name,
            children: (topSubsByCat.get(c.id) ?? []).map(subSeed),
          }))
        : (focusObj.type === "cat"
            ? topSubsByCat.get(focusObj.cat.id) ?? []
            : childrenMap.get(focusObj.sub.id) ?? []
          ).map(subSeed);
    return { id: "__core", kind: "root", children };
  }, [focusObj, categories, topSubsByCat, childrenMap]);

  const meta = useMemo(() => {
    const m = new Map<string, GraphMeta>();
    const walkSub = (s: SubCategory, color: string) => {
      m.set(s.id, {
        name: s.name,
        icon: s.icon,
        color,
        weight: subtreeCounts.get(s.id) ?? 0,
        node: { kind: "sub", sub: s },
      });
      for (const k of childrenMap.get(s.id) ?? []) walkSub(k, color);
    };
    if (focusObj == null) {
      for (const c of categories) {
        m.set(c.id, {
          name: c.name,
          icon: c.icon,
          color: c.color,
          weight: catCounts.get(c.id) ?? 0,
          node: { kind: "cat", cat: c },
        });
        for (const s of topSubsByCat.get(c.id) ?? []) walkSub(s, c.color);
      }
    } else {
      const kids =
        focusObj.type === "cat"
          ? topSubsByCat.get(focusObj.cat.id) ?? []
          : childrenMap.get(focusObj.sub.id) ?? [];
      kids.forEach((s, i) => walkSub(s, branchTint(i, kids.length)));
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    focusObj,
    categories,
    topSubsByCat,
    childrenMap,
    centerColor,
    subtreeCounts,
    catCounts,
  ]);

  const graph = useMemo(() => graphLayout(shape), [shape]);

  /**
   * Işık yoğunluğu (0–1): girdi sayısı önce GÜNLÜK RİTME çevriliyor, sonra
   * logaritmik bir eğriden geçiyor (lib/usage). Ölçü mutlak — komşusunun ne
   * yaptığına bağlı değil.
   */
  const metaGlow = (m?: GraphMeta) => usageIntensity(usageRate(m?.weight ?? 0));

  /** Çizilecek bağlar — yol, renk, kalınlık, parlaklık bir kez hesaplanıyor */
  const links = useMemo(
    () =>
      graph.edges.map((e) => {
        const m = meta.get(e.id);
        const glow = usageIntensity(usageRate(m?.weight ?? 0));
        return {
          id: e.id,
          d: e.path,
          color: m?.color ?? centerColor,
          w: e.width * (0.9 + 0.5 * glow),
          glow,
        };
      }),
    [graph, meta, centerColor]
  );

  /** Küçük ülke üstte: kırpılmış kabuklar değse bile dokunulabilir kalsın */
  const islandsByArea = useMemo(
    () => [...graph.islands].sort((a, b) => b.count - a.count),
    [graph]
  );

  const positions = useMemo(
    () => nodes.map((n) => graph.byId.get(nodeId(n)) ?? graph.center),
    [nodes, graph]
  );
  const centerPos = graph.center;
  const pad = 30;

  const effPositions = positions.map((p, i) => {
    if (drag && dragPos && drag.id === nodeId(nodes[i])) return dragPos;
    return { x: p.x, y: p.y };
  });
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

  const focusKey = focusKeyOf(focus);

  const trail = useMemo(() => {
    const list: { label: string; focus: MapFocus }[] = [
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

  // Sürükleme pencere olayları
  useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect || !rect.width) return;
      // Yuva konumları tuvalin kendi koordinat uzayında; tuval ayrıca
      // CanvasViewport tarafından ölçekleniyor. Ölçeği elemanın genişliğinden
      // okuyoruz: rect.width = graph.width × scale.
      const scale = rect.width / graph.width;
      const x = Math.max(
        pad,
        Math.min(graph.width - pad, (e.clientX - rect.left) / scale)
      );
      const y = Math.max(
        pad,
        Math.min(graph.height - pad, (e.clientY - rect.top) / scale)
      );
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
  }, [drag, nodes, positions, graph.width, graph.height, pad]);

  function startDrag(node: Node, p: { x: number; y: number }) {
    setDrag({ id: nodeId(node), kind: node.kind });
    setDragPos(p);
    posRef.current = p;
    navigator.vibrate?.(12);
  }
  function drill(node: Node) {
    setFocus(
      node.kind === "cat"
        ? { type: "cat", id: node.cat.id }
        : { type: "sub", id: node.sub.id }
    );
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
  /** Bulunulan yerin yapı sayfası — merkez ona götürüyor */
  const structureHref =
    focusObj == null
      ? ""
      : focusObj.type === "cat"
        ? `/structure/${focusObj.cat.id}`
        : `/structure/${focusObj.sub.categoryId}/${focusObj.sub.id}`;

  const coreBox = { width: graph.coreR * 2, height: graph.coreR * 2 };
  const coreSkin: CSSProperties = {
    borderRadius: "9999px",
    background: [
      "radial-gradient(circle at 32% 24%, rgba(255,255,255,0.3), rgba(255,255,255,0) 54%)",
      `linear-gradient(155deg, ${centerColor}d0, ${centerColor}55)`,
    ].join(", "),
    boxShadow: [
      `inset 0 0 0 1.5px ${centerColor}cc`,
      `0 0 30px ${centerColor}55`,
    ].join(", "),
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {/* Yol izi — nerede olduğun ve geri dönüş. Kökte yazılmıyor: tek
          basamaklı bir yol iz değil, sayfa başlığının tekrarı. */}
      {focusObj != null && (
      <div className="mb-2 px-4">
        <HScroll className="items-center gap-1" followEnd={focusKey}>
          {trail.map((tr, i) => {
            const last = i === trail.length - 1;
            return (
              <span key={i} className="flex shrink-0 items-center gap-1">
                {i > 0 && (
                  <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/30" />
                )}
                <button
                  onClick={() => setFocus(tr.focus)}
                  aria-current={last ? "page" : undefined}
                  className={cn(
                    "flex max-w-[140px] shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition-colors",
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
      </div>
      )}

      <CanvasViewport
        width={graph.width}
        height={graph.height}
        resetKey={focusKey}
      >
        <div
          key={focusKey}
          ref={canvasRef}
          className="relative animate-zoom-in"
          style={{ width: graph.width, height: graph.height }}
        >
          <svg
            className="pointer-events-none absolute inset-0"
            viewBox={`0 0 ${graph.width} ${graph.height}`}
            width={graph.width}
            height={graph.height}
          >
            {/* Adacık sınırları — bağların ALTINDA. Sınırın içi tek bir
                hedef: kalabalık haritada nokta nokta dokunmak imkânsız,
                alan olarak dokunmak kolay. */}
            {islandsByArea.map((isl) => {
              const color = meta.get(isl.id)?.color ?? centerColor;
              const g = metaGlow(meta.get(isl.id));
              return (
                <path
                  key={`isl${isl.id}`}
                  d={isl.path}
                  fill={`${color}${hexA(0.05 + 0.05 * g)}`}
                  stroke={`${color}${hexA(0.22 + 0.3 * g)}`}
                  strokeWidth={1.25}
                  strokeLinejoin="round"
                  className="cursor-pointer"
                  // Tuval, üstünde düğüm OLMAYAN yerde işaretçiyi yakalıyor
                  // ve yakalanan işaretçide `click` sınıra hiç ulaşmıyor.
                  data-net-node=""
                  style={{ pointerEvents: "auto" }}
                  onClick={() => {
                    const n = meta.get(isl.id)?.node;
                    if (n) drill(n);
                  }}
                />
              );
            })}

            {/* Bağlar — kılcal iz. Anlam kalınlıkta değil PARLAKLIKTA:
                sönük hat yapının kendisi, parlak hat gerçekten kullanılan
                yol. Işıma katmanı yalnız yaşayan hatlarda. */}
            <g className="link-breathe" fill="none" strokeLinecap="round">
              {links.map((l) =>
                l.glow > LINK_LIT ? (
                  <path
                    key={`h${l.id}`}
                    d={l.d}
                    stroke={`${l.color}${hexA(0.05 + 0.17 * l.glow)}`}
                    strokeWidth={l.w * 3.4}
                  />
                ) : null
              )}
              {links.map((l) => (
                <path
                  key={l.id}
                  d={l.d}
                  stroke={`${l.color}${hexA(0.2 + 0.62 * l.glow)}`}
                  strokeWidth={l.w}
                />
              ))}
            </g>

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
            {drag && targetSlot >= 0 && positions[targetSlot] && (
              <circle
                cx={positions[targetSlot].x}
                cy={positions[targetSlot].y}
                r={(graph.byId.get(nodeId(nodes[targetSlot]))?.r ?? 12) + 4}
                fill="none"
                stroke={centerColor}
                strokeWidth={2}
                strokeDasharray="5 4"
              />
            )}
          </svg>

          {/* Merkez — nerede olduğun. Dokunmak bulunulan yerin yapı
              sayfasına götürüyor; kökte gidilecek bir yer yok. */}
          {focusObj == null ? (
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
                className="flex h-full w-full items-center justify-center"
                style={coreSkin}
              >
                <Layers className="h-[18px] w-[18px] text-white" strokeWidth={1.75} />
              </span>
              <CoreLabel>{t("structure.categories")}</CoreLabel>
            </span>
          ) : (
            <Link
              href={structureHref}
              prefetch
              data-net-node=""
              aria-label={focusName}
              className="absolute z-10 flex items-center justify-center"
              style={{
                left: centerPos.x,
                top: centerPos.y,
                ...coreBox,
                transform: "translate(-50%,-50%)",
              }}
            >
              <span
                className="flex h-full w-full items-center justify-center"
                style={coreSkin}
              >
                {focusIcon ? (
                  <SymbolIcon name={focusIcon} size={18} style={{ color: "#fff" }} />
                ) : (
                  <Layers className="h-[18px] w-[18px] text-white" strokeWidth={1.75} />
                )}
              </span>
              <CoreLabel>{focusName}</CoreLabel>
            </Link>
          )}

          {/* Düğümler — dokun: gir · basılı tut: sırayı değiştir */}
          {graph.nodes.map((g) => {
            const m = meta.get(g.id);
            if (!m) return null;
            const dragging = drag?.id === g.id;
            const p = dragging && dragPos ? dragPos : g;
            return (
              <GraphCell
                key={g.id}
                x={p.x}
                y={p.y}
                r={g.r}
                side={g.label}
                gap={g.labelGap}
                bigLabel={g.labelBig}
                color={m.color}
                icon={m.icon}
                name={m.name}
                glow={metaGlow(m)}
                showLabel={g.labelled}
                isDragging={dragging}
                // Takımadada dokunulan şey düğüm değil ADACIK; içerideki
                // noktalar birer süs.
                onTap={
                  graph.archipelago && g.depth > 1
                    ? undefined
                    : () => drill(m.node)
                }
                onDragStart={
                  g.depth === 1 && !graph.archipelago
                    ? () => startDrag(m.node, g)
                    : undefined
                }
              />
            );
          })}

          {/* Adacık adları — sınırın dışında, adacığın boyuyla orantılı */}
          {graph.islands.map((isl) => {
            const m = meta.get(isl.id);
            if (!m) return null;
            const g = metaGlow(m);
            return (
              <span
                key={`isll${isl.id}`}
                aria-hidden
                className="pointer-events-none absolute whitespace-nowrap text-center font-semibold leading-none"
                style={{
                  left: isl.labelAt.x,
                  top: isl.labelAt.y,
                  transform: "translate(-50%,-50%)",
                  fontSize: isl.fontSize,
                  color: `rgba(255,255,255,${(0.55 + 0.4 * g).toFixed(2)})`,
                  textShadow: `0 ${isl.fontSize * 0.06}px ${isl.fontSize * 0.25}px rgba(0,0,0,0.95)`,
                }}
              >
                {m.name}
              </span>
            );
          })}
        </div>
      </CanvasViewport>
    </div>
  );
}

/**
 * Dokun/basılı tut ayrımı: dokunuş içeri girer, 350ms basılı tutmak
 * sürüklemeyi başlatır, erken hareket sürüklemeyi iptal eder.
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

/** Adın diskin neresine yazılacağı — yanı yerleşim seçiyor (lib/graph.ts) */
function labelPlacement(r: number, side: LabelSide, gap: number): CSSProperties {
  const off = r + 4 + gap;
  const c = r * 0.71 + 4 + gap;
  switch (side) {
    case "right":
      return { left: `calc(50% + ${off}px)`, top: "50%", transform: "translateY(-50%)", textAlign: "left" };
    case "left":
      return { right: `calc(50% + ${off}px)`, top: "50%", transform: "translateY(-50%)", textAlign: "right" };
    case "bottom":
      return { left: "50%", top: `calc(50% + ${off}px)`, transform: "translateX(-50%)", textAlign: "center" };
    case "top":
      return { left: "50%", bottom: `calc(50% + ${off}px)`, transform: "translateX(-50%)", textAlign: "center" };
    case "br":
      return { left: `calc(50% + ${c}px)`, top: `calc(50% + ${c}px)`, textAlign: "left" };
    case "bl":
      return { right: `calc(50% + ${c}px)`, top: `calc(50% + ${c}px)`, textAlign: "right" };
    case "tr":
      return { left: `calc(50% + ${c}px)`, bottom: `calc(50% + ${c}px)`, textAlign: "left" };
    default:
      return { right: `calc(50% + ${c}px)`, bottom: `calc(50% + ${c}px)`, textAlign: "right" };
  }
}

/** Merkez gövdenin adı — diskin hemen altında, kırpılmadan */
function CoreLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="pointer-events-none absolute left-1/2 top-full w-[104px] -translate-x-1/2 pt-1.5 text-center text-[11px] font-semibold leading-tight text-foreground">
      {children}
    </span>
  );
}

/**
 * Harita düğümü — yuvarlak bir gövde ve (yeri varsa) adı. Boy kademeyi,
 * parlaklık kullanım sıklığını söylüyor.
 */
function GraphCell({
  x,
  y,
  r,
  side,
  gap,
  bigLabel,
  color,
  icon,
  name,
  glow,
  showLabel,
  isDragging,
  onTap,
  onDragStart,
}: {
  x: number;
  y: number;
  r: number;
  side: LabelSide;
  gap: number;
  /** Ad iri mi yazılıyor — kararı yerleşim veriyor */
  bigLabel: boolean;
  color: string;
  icon?: string;
  name: string;
  /** 0–1 kullanım yoğunluğu */
  glow: number;
  showLabel: boolean;
  isDragging: boolean;
  /** Verilmezse düğüm süs: takımadada içerideki noktalar dokunulmuyor */
  onTap?: () => void;
  onDragStart?: () => void;
}) {
  const hold = useHold(onTap ?? noop, onDragStart ?? noop);
  const hit = onTap ? Math.max(r * 2, 30) : r * 2;
  const skin = (
    <span
      className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
      style={{
        width: r * 2,
        height: r * 2,
        background: [
          `radial-gradient(circle at 32% 24%, rgba(255,255,255,${(0.2 + 0.12 * glow).toFixed(2)}), rgba(255,255,255,0) 54%)`,
          `linear-gradient(155deg, ${color}${hexA(0.52 + 0.38 * glow)}, ${color}${hexA(0.16 + 0.2 * glow)})`,
        ].join(", "),
        boxShadow: [
          `inset 0 0 0 1.25px ${color}${hexA(0.5 + 0.45 * glow)}`,
          `0 0 ${Math.round(6 + 18 * glow)}px ${color}${hexA(0.1 + 0.38 * glow)}`,
        ].join(", "),
        outline: isDragging ? `2px solid ${color}` : undefined,
      }}
    />
  );
  const label = showLabel ? (
    <span
      className={cn(
        "pointer-events-none absolute line-clamp-2 leading-tight",
        // Ölçüler lib/graph.ts'teki labelBox ile AYNI olmalı
        bigLabel
          ? "w-[78px] text-[10.5px] font-semibold"
          : "w-[68px] text-[9px] font-medium",
        glow > 0.5
          ? "text-foreground"
          : glow > 0.15
            ? "text-foreground/80"
            : "text-muted-foreground"
      )}
      style={{
        ...labelPlacement(r, side, gap),
        textShadow: "0 1px 4px rgba(0,0,0,0.95), 0 0 2px rgba(0,0,0,0.9)",
      }}
    >
      {name}
    </span>
  ) : null;
  const glyph =
    r >= 9 && icon ? (
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <SymbolIcon name={icon} size={Math.round(r * 1.3)} style={{ color: "#fff" }} />
      </span>
    ) : null;
  const box: CSSProperties = {
    left: x,
    top: y,
    width: hit,
    height: hit,
    transform: "translate(-50%,-50%)",
  };

  // Dokunulmayan düğüm olayları da GEÇİRMELİ: takımadada asıl hedef altta
  // duran adacık sınırı ve içerisi bu noktalarla dolu.
  if (!onTap)
    return (
      <span
        role="img"
        aria-label={name}
        title={name}
        className="pointer-events-none absolute z-0"
        style={box}
      >
        {skin}
        {label}
      </span>
    );

  return (
    <button
      {...(onDragStart ? hold : { onClick: onTap })}
      data-net-node=""
      title={name}
      className={cn(
        "absolute select-none transition-transform",
        isDragging ? "z-20 scale-110" : "z-10"
      )}
      style={box}
    >
      {skin}
      {glyph}
      {label}
    </button>
  );
}
