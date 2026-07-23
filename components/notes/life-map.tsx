"use client";

import { useMemo, useRef, useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  ChevronRight,
  Crosshair,
  Link2,
  NotebookPen,
  SlidersHorizontal,
  X,
} from "lucide-react";
import type { LifeGraph, LifeNode } from "@/lib/life-graph";
import { cn } from "@/lib/utils";

const MONTHS_TR = [
  "Oca", "Şub", "Mar", "Nis", "May", "Haz",
  "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara",
];
function shortDate(date?: string): string {
  if (!date) return "";
  const [, m, d] = date.split("-").map(Number);
  return `${d} ${MONTHS_TR[m - 1]}`;
}
function nodeHref(node: LifeNode): string {
  return node.kind === "note"
    ? `/notes/${node.id}`
    : `/calendar/${node.date ?? ""}`;
}
const norm = (s: string) => s.toLocaleLowerCase("tr-TR");

const NOTE_COLOR = "#a78bfa";
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

type SimNode = { x: number; y: number; vx: number; vy: number };

/**
 * Hayat haritası — Obsidian tarzı: düğümler minik noktalar (boyut = bağ
 * sayısı), etiketler yakınlaşınca belirir, canlı kuvvet simülasyonu düğümleri
 * organik biçimde oturtur; düğümler sürüklenebilir. Kuvvetler panelinden
 * itme / bağ uzunluğu / merkez çekimi / metin solması ayarlanır. Kenarlar
 * kullanıcının kendi kurduğu bağlardır. [[app-vision]]
 */
export function LifeMap({ graph }: { graph: LifeGraph }) {
  // Filtre & odak
  const [search, setSearch] = useState("");
  const [showNotes, setShowNotes] = useState(true);
  const [showEntries, setShowEntries] = useState(true);
  const [hideOrphans, setHideOrphans] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [depth, setDepth] = useState(1);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);

  // Kuvvetler (Obsidian: repel / link distance / center / text fade)
  const [repel, setRepel] = useState(1);
  const [linkDist, setLinkDist] = useState(70);
  const [centerF, setCenterF] = useState(1);
  const [textFade, setTextFade] = useState(1);

  // Filtrelenmiş grafik
  const filtered = useMemo<LifeGraph>(() => {
    let nodes = graph.nodes.filter((n) =>
      n.kind === "note" ? showNotes : showEntries
    );
    if (search.trim()) {
      const q = norm(search);
      nodes = nodes.filter((n) => norm(n.label).includes(q));
    }
    let ids = new Set(nodes.map((n) => n.id));
    let edges = graph.edges.filter((e) => ids.has(e.a) && ids.has(e.b));

    if (focusId && ids.has(focusId)) {
      const keep = new Set<string>([focusId]);
      let frontier = new Set<string>([focusId]);
      for (let d = 0; d < depth; d++) {
        const next = new Set<string>();
        for (const e of edges) {
          if (frontier.has(e.a) && !keep.has(e.b)) {
            keep.add(e.b);
            next.add(e.b);
          }
          if (frontier.has(e.b) && !keep.has(e.a)) {
            keep.add(e.a);
            next.add(e.a);
          }
        }
        frontier = next;
      }
      nodes = nodes.filter((n) => keep.has(n.id));
      ids = new Set(nodes.map((n) => n.id));
      edges = edges.filter((e) => ids.has(e.a) && ids.has(e.b));
    }

    if (hideOrphans) {
      const deg = new Map<string, number>();
      for (const e of edges) {
        deg.set(e.a, (deg.get(e.a) ?? 0) + 1);
        deg.set(e.b, (deg.get(e.b) ?? 0) + 1);
      }
      nodes = nodes.filter((n) => (deg.get(n.id) ?? 0) > 0);
      ids = new Set(nodes.map((n) => n.id));
      edges = edges.filter((e) => ids.has(e.a) && ids.has(e.b));
    }

    return { nodes, edges };
  }, [graph, showNotes, showEntries, search, focusId, depth, hideOrphans]);

  const degree = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of filtered.edges) {
      m.set(e.a, (m.get(e.a) ?? 0) + 1);
      m.set(e.b, (m.get(e.b) ?? 0) + 1);
    }
    return m;
  }, [filtered.edges]);

  const nodeById = useMemo(
    () => new Map(filtered.nodes.map((n) => [n.id, n])),
    [filtered.nodes]
  );

  const linksByNode = useMemo(() => {
    const m = new Map<string, { otherId: string; anchor: string }[]>();
    const push = (from: string, otherId: string, anchor: string) => {
      const list = m.get(from) ?? [];
      list.push({ otherId, anchor });
      m.set(from, list);
    };
    for (const e of filtered.edges) {
      if (!nodeById.has(e.a) || !nodeById.has(e.b)) continue;
      push(e.a, e.b, e.anchor);
      push(e.b, e.a, e.anchor);
    }
    return m;
  }, [filtered.edges, nodeById]);

  // ── Canlı simülasyon ──────────────────────────────────────────────────────
  const sim = useRef(new Map<string, SimNode>());
  const alpha = useRef(1);
  const dragId = useRef<string | null>(null);
  const [, setTick] = useState(0);

  // Yeni düğümlere altın açı sarmalında başlangıç konumu; kalanlar yerinde kalır
  useEffect(() => {
    const seen = new Set<string>();
    filtered.nodes.forEach((n, i) => {
      seen.add(n.id);
      if (!sim.current.has(n.id)) {
        const r = 24 + 14 * Math.sqrt(i + 1);
        const a = i * GOLDEN;
        sim.current.set(n.id, {
          x: Math.cos(a) * r,
          y: Math.sin(a) * r,
          vx: 0,
          vy: 0,
        });
      }
    });
    for (const id of [...sim.current.keys()])
      if (!seen.has(id)) sim.current.delete(id);
    alpha.current = 1;
  }, [filtered.nodes]);

  // Kuvvet ayarı değişince yeniden ısın
  useEffect(() => {
    alpha.current = Math.max(alpha.current, 0.5);
  }, [repel, linkDist, centerF]);

  useEffect(() => {
    let raf = 0;
    const step = () => {
      if (alpha.current > 0.004) {
        const nodes = filtered.nodes;
        const kRep = 900 * repel;
        // İtme — tüm çiftler
        for (let i = 0; i < nodes.length; i++) {
          const a = sim.current.get(nodes[i].id);
          if (!a) continue;
          for (let j = i + 1; j < nodes.length; j++) {
            const b = sim.current.get(nodes[j].id);
            if (!b) continue;
            let dx = a.x - b.x;
            let dy = a.y - b.y;
            let d2 = dx * dx + dy * dy;
            if (d2 < 1) {
              d2 = 1;
              dx = (i - j) % 2 ? 1 : -1;
              dy = 0.5;
            }
            if (d2 > 90000) continue;
            const d = Math.sqrt(d2);
            const f = (kRep / d2) * alpha.current;
            const fx = (dx / d) * f;
            const fy = (dy / d) * f;
            a.vx += fx;
            a.vy += fy;
            b.vx -= fx;
            b.vy -= fy;
          }
        }
        // Bağ yayları
        for (const e of filtered.edges) {
          const a = sim.current.get(e.a);
          const b = sim.current.get(e.b);
          if (!a || !b) continue;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const d = Math.hypot(dx, dy) || 1;
          const f = (d - linkDist) * 0.06 * alpha.current;
          const fx = (dx / d) * f;
          const fy = (dy / d) * f;
          a.vx += fx;
          a.vy += fy;
          b.vx -= fx;
          b.vy -= fy;
        }
        // Merkez çekimi + entegrasyon
        for (const n of nodes) {
          const p = sim.current.get(n.id);
          if (!p) continue;
          if (dragId.current === n.id) {
            p.vx = 0;
            p.vy = 0;
            continue;
          }
          p.vx -= p.x * 0.012 * centerF * alpha.current;
          p.vy -= p.y * 0.012 * centerF * alpha.current;
          p.vx *= 0.6;
          p.vy *= 0.6;
          p.x += Math.max(-20, Math.min(20, p.vx));
          p.y += Math.max(-20, Math.min(20, p.vy));
        }
        alpha.current *= 0.978;
        setTick((t) => t + 1);
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [filtered, repel, linkDist, centerF]);

  // ── Pan / zoom ────────────────────────────────────────────────────────────
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState({ x: 0, y: 0, zoom: 1 });

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchDist = useRef(0);
  const moved = useRef(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() =>
      setSize({ w: el.clientWidth, h: el.clientHeight })
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const clampZoom = (z: number) => Math.min(Math.max(z, 0.2), 4);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [p1, p2] = [...pointers.current.values()];
      pinchDist.current = Math.hypot(p1.x - p2.x, p1.y - p2.y);
    }
    moved.current = false;
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const cur = { x: e.clientX, y: e.clientY };
    pointers.current.set(e.pointerId, cur);
    if (dragId.current) return; // düğüm sürükleniyor — pan yapma
    if (pointers.current.size === 1) {
      const dx = cur.x - prev.x;
      const dy = cur.y - prev.y;
      if (Math.abs(dx) + Math.abs(dy) > 2) moved.current = true;
      setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
    } else if (pointers.current.size === 2) {
      moved.current = true;
      const [p1, p2] = [...pointers.current.values()];
      const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
      if (pinchDist.current > 0) {
        const ratio = dist / pinchDist.current;
        setView((v) => ({ ...v, zoom: clampZoom(v.zoom * ratio) }));
      }
      pinchDist.current = dist;
    }
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    // Boş alanda tek dokunuş (sürükleme/pinch değil) → seçimi kapat
    const wasTap = pointers.current.size === 1 && !moved.current;
    pointers.current.delete(e.pointerId);
    pinchDist.current = 0;
    if (wasTap) setSelectedId(null);
  }, []);

  const onWheel = useCallback((e: React.WheelEvent) => {
    setView((v) => ({
      ...v,
      zoom: clampZoom(v.zoom * Math.exp(-e.deltaY * 0.0012)),
    }));
  }, []);

  // ── Düğüm sürükleme / seçim ───────────────────────────────────────────────
  const dragLast = useRef({ x: 0, y: 0 });
  const dragStart = useRef({ x: 0, y: 0 });

  function onNodeDown(e: React.PointerEvent, id: string) {
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    dragId.current = id;
    dragStart.current = { x: e.clientX, y: e.clientY };
    dragLast.current = { x: e.clientX, y: e.clientY };
    moved.current = false;
  }
  function onNodeMove(e: React.PointerEvent) {
    if (!dragId.current) return;
    // Sürükleme, basılan noktadan toplam mesafeyle belirlenir (tık titremesi seçimi bozmasın)
    if (
      Math.hypot(
        e.clientX - dragStart.current.x,
        e.clientY - dragStart.current.y
      ) > 6
    ) {
      moved.current = true;
    }
    const dx = (e.clientX - dragLast.current.x) / view.zoom;
    const dy = (e.clientY - dragLast.current.y) / view.zoom;
    dragLast.current = { x: e.clientX, y: e.clientY };
    if (!moved.current) return; // henüz tık — düğümü oynatma
    const p = sim.current.get(dragId.current);
    if (p) {
      p.x += dx;
      p.y += dy;
      alpha.current = Math.max(alpha.current, 0.3);
      setTick((t) => t + 1);
    }
  }
  function onNodeUp(e: React.PointerEvent, id: string) {
    const wasDrag = moved.current;
    (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
    dragId.current = null;
    if (!wasDrag) {
      e.stopPropagation();
      setSelectedId((cur) => (cur === id ? null : id));
    }
  }

  // ── Vurgu / seçim ─────────────────────────────────────────────────────────
  const neighbors = useMemo(() => {
    if (!selectedId) return null;
    const set = new Set<string>([selectedId]);
    for (const l of linksByNode.get(selectedId) ?? []) set.add(l.otherId);
    return set;
  }, [selectedId, linksByNode]);

  const selected = useMemo(() => {
    if (!selectedId) return null;
    const node = nodeById.get(selectedId);
    if (!node) return null;
    const links = (linksByNode.get(selectedId) ?? []).map((l) => ({
      ...l,
      other: nodeById.get(l.otherId),
    }));
    return { node, links };
  }, [selectedId, nodeById, linksByNode]);

  function radius(id: string, kind: LifeNode["kind"]): number {
    const d = degree.get(id) ?? 0;
    return (kind === "note" ? 4.5 : 3.6) + Math.min(8, d * 1.3);
  }

  // Metin solması — Obsidian: yakınlaştıkça etiketler belirir
  const labelOpacity = Math.max(
    0,
    Math.min(1, (view.zoom - 0.55 / textFade) / (0.6 / textFade))
  );

  const zoomK = `translate(${size.w / 2 + view.x}, ${size.h / 2 + view.y}) scale(${view.zoom})`;

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden touch-none select-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={onWheel}
    >
      <svg width={size.w} height={size.h} className="absolute inset-0">
        <g transform={zoomK}>
          {/* Kenarlar */}
          {filtered.edges.map((e, i) => {
            const a = sim.current.get(e.a);
            const b = sim.current.get(e.b);
            if (!a || !b) return null;
            const active =
              neighbors && neighbors.has(e.a) && neighbors.has(e.b);
            const dim = neighbors && !active;
            return (
              <line
                key={i}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={active ? "#a78bfa" : "#8b8b98"}
                strokeWidth={active ? 1.6 : 1}
                opacity={dim ? 0.04 : active ? 0.75 : 0.28}
              />
            );
          })}

          {/* Düğümler — noktalar */}
          {filtered.nodes.map((n) => {
            const p = sim.current.get(n.id);
            if (!p) return null;
            const color = n.color ?? (n.kind === "note" ? NOTE_COLOR : "#94a3b8");
            const r = radius(n.id, n.kind);
            const isSel = selectedId === n.id;
            const isHover = hoverId === n.id;
            const dim = neighbors ? !neighbors.has(n.id) : false;
            const showLabel =
              isSel || isHover || (neighbors?.has(n.id) ?? false)
                ? 1
                : labelOpacity * (dim ? 0 : 1);
            return (
              <g key={n.id} opacity={dim ? 0.15 : 1}>
                {isSel && (
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={r + 4}
                    fill="none"
                    stroke={color}
                    strokeWidth={1.2}
                    opacity={0.7}
                  />
                )}
                {/* Görünen nokta — etkileşim büyük görünmez alanda */}
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={r}
                  fill={color}
                  opacity={isSel || isHover ? 1 : 0.88}
                  className="pointer-events-none"
                />
                {/* Kolay dokunmak için geniş şeffaf isabet alanı */}
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={Math.max(r + 8, 14)}
                  fill="transparent"
                  style={{ cursor: "pointer", touchAction: "none" }}
                  onPointerDown={(e) => onNodeDown(e, n.id)}
                  onPointerMove={onNodeMove}
                  onPointerUp={(e) => onNodeUp(e, n.id)}
                  onPointerCancel={() => {
                    dragId.current = null;
                  }}
                  onClick={(e) => e.stopPropagation()}
                  onPointerEnter={() => setHoverId(n.id)}
                  onPointerLeave={() => setHoverId((h) => (h === n.id ? null : h))}
                />
                {showLabel > 0.02 && (
                  <text
                    x={p.x}
                    y={p.y + r + 9}
                    textAnchor="middle"
                    fontSize={8}
                    fill="currentColor"
                    className="pointer-events-none text-foreground/80"
                    opacity={showLabel}
                  >
                    {n.label.length > 22 ? n.label.slice(0, 21) + "…" : n.label}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      {/* Kontroller — filtreler + kuvvetler */}
      <div
        className="absolute left-3 top-3 z-10"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => setControlsOpen((v) => !v)}
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-full border border-border shadow-md backdrop-blur transition-colors",
            controlsOpen
              ? "bg-primary/15 text-primary"
              : "bg-card/85 text-muted-foreground"
          )}
          aria-label="Harita ayarları"
        >
          <SlidersHorizontal className="h-4 w-4" />
        </button>
        {controlsOpen && (
          <div className="mt-2 w-60 rounded-2xl border border-border bg-card/95 p-3 shadow-xl backdrop-blur">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Ara…"
              className="mb-2 h-8 w-full rounded-lg border border-border bg-input px-2.5 text-xs outline-none placeholder:text-muted-foreground/50"
            />
            <div className="flex flex-wrap gap-1.5">
              <Toggle on={showNotes} onClick={() => setShowNotes((v) => !v)} color={NOTE_COLOR}>
                Notlar
              </Toggle>
              <Toggle on={showEntries} onClick={() => setShowEntries((v) => !v)} color="#f97316">
                Girdiler
              </Toggle>
              <Toggle on={hideOrphans} onClick={() => setHideOrphans((v) => !v)}>
                Yetimleri gizle
              </Toggle>
            </div>
            {focusId && (
              <div className="mt-2 flex items-center gap-1.5 border-t border-border/60 pt-2">
                <span className="text-[11px] text-muted-foreground">Derinlik</span>
                {[1, 2].map((d) => (
                  <button
                    key={d}
                    onClick={() => setDepth(d)}
                    className={cn(
                      "h-6 w-6 rounded-md border text-[11px] font-medium",
                      depth === d
                        ? "border-primary bg-primary/15 text-primary"
                        : "border-border text-muted-foreground"
                    )}
                  >
                    {d}
                  </button>
                ))}
                <button
                  onClick={() => setFocusId(null)}
                  className="ml-auto text-[11px] font-medium text-muted-foreground hover:text-foreground"
                >
                  Tümü
                </button>
              </div>
            )}
            {/* Kuvvetler — Obsidian'daki gibi */}
            <div className="mt-2 flex flex-col gap-1.5 border-t border-border/60 pt-2">
              <Slider label="İtme kuvveti" min={0.2} max={3} step={0.1} value={repel} onChange={setRepel} />
              <Slider label="Bağ uzunluğu" min={30} max={160} step={5} value={linkDist} onChange={setLinkDist} />
              <Slider label="Merkez kuvveti" min={0} max={3} step={0.1} value={centerF} onChange={setCenterF} />
              <Slider label="Metin görünürlüğü" min={0.4} max={2} step={0.1} value={textFade} onChange={setTextFade} />
            </div>
          </div>
        )}
      </div>

      {/* Seçim kartı */}
      {selected && (
        <div className="absolute inset-x-3 bottom-3 z-20 max-h-[52%] overflow-y-auto rounded-2xl border border-border bg-card/95 shadow-xl backdrop-blur-sm">
          <div className="sticky top-0 flex items-center gap-2 border-b border-border/60 bg-card/95 px-4 py-3 backdrop-blur-sm">
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
              style={{
                backgroundColor: `${selected.node.color ?? (selected.node.kind === "note" ? NOTE_COLOR : "#94a3b8")}22`,
              }}
            >
              {selected.node.kind === "note" ? (
                <NotebookPen
                  className="h-4 w-4"
                  style={{ color: selected.node.color ?? NOTE_COLOR }}
                />
              ) : (
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: selected.node.color ?? "#94a3b8" }}
                />
              )}
            </span>
            <Link href={nodeHref(selected.node)} className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">
                {selected.node.label}
              </span>
              <span className="block text-[11px] text-muted-foreground">
                {selected.node.kind === "note" ? "Not" : "Girdi"}
                {selected.node.date ? ` · ${shortDate(selected.node.date)}` : ""}
                {" · "}
                {selected.links.length > 0
                  ? `${selected.links.length} bağ`
                  : "bağ yok"}
              </span>
            </Link>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setFocusId((cur) =>
                  cur === selected.node.id ? null : selected.node.id
                );
                setControlsOpen(true);
              }}
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors",
                focusId === selected.node.id
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
              aria-label="Yerelleştir"
              title="Bu düğümün komşuluğuna odaklan"
            >
              <Crosshair className="h-4 w-4" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setSelectedId(null);
              }}
              className="rounded-full p-1 text-muted-foreground/70 hover:text-foreground"
              aria-label="Kapat"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {selected.links.length === 0 ? (
            <p className="px-4 py-4 text-xs text-muted-foreground">
              Bu düğümün henüz bağı yok.
            </p>
          ) : (
            <ul className="divide-y divide-border/50">
              {selected.links.map((l, i) => (
                <li key={i}>
                  <Link
                    href={l.other ? nodeHref(l.other) : "#"}
                    className="flex items-center gap-2.5 px-4 py-3 transition-colors hover:bg-white/5"
                  >
                    {l.other?.kind === "entry" ? (
                      <Link2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    ) : (
                      <NotebookPen className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium">
                        {l.other?.label ?? "?"}
                      </span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        &bdquo;{l.anchor}&rdquo; üzerinden
                      </span>
                    </span>
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function Toggle({
  on,
  onClick,
  color,
  children,
}: {
  on: boolean;
  onClick: () => void;
  color?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
        on
          ? "border-primary/40 bg-primary/10 text-foreground"
          : "border-border text-muted-foreground/60 line-through"
      )}
    >
      {color && (
        <span
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: on ? color : "currentColor" }}
        />
      )}
      {children}
    </button>
  );
}

function Slider({
  label,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex items-center gap-2">
      <span className="w-24 shrink-0 text-[11px] text-muted-foreground">
        {label}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1 w-full cursor-pointer accent-[#a78bfa]"
      />
    </label>
  );
}
