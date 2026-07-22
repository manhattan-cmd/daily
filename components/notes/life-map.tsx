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
import { layoutGraph, type LifeGraph, type LifeNode } from "@/lib/life-graph";
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

/**
 * Hayat haritası — notlar (mor, defter) ve girdiler (kategori renginde, halka)
 * düğüm; kullanıcının kendi kurduğu bağlar kenar. Düğüm boyutu bağ sayısıyla
 * büyür; kontrol panelinden filtre/arama; bir düğüme "Yerelleştir" ile onun
 * komşuluğuna (derinlik ayarlı) odaklanılır.
 */
export function LifeMap({ graph }: { graph: LifeGraph }) {
  // Filtre & odak durumu
  const [search, setSearch] = useState("");
  const [showNotes, setShowNotes] = useState(true);
  const [showEntries, setShowEntries] = useState(true);
  const [hideOrphans, setHideOrphans] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [depth, setDepth] = useState(1);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Filtrelenmiş grafik (yerleşim öncesi)
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

  const positions = useMemo(() => layoutGraph(filtered), [filtered]);
  const nodeById = useMemo(
    () => new Map(filtered.nodes.map((n) => [n.id, n])),
    [filtered.nodes]
  );

  // Bağ sayısı (degree) — düğüm boyutu için
  const degree = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of filtered.edges) {
      m.set(e.a, (m.get(e.a) ?? 0) + 1);
      m.set(e.b, (m.get(e.b) ?? 0) + 1);
    }
    return m;
  }, [filtered.edges]);

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

  const extent = useMemo(() => {
    let max = 120;
    for (const p of positions.values())
      max = Math.max(max, Math.abs(p.x), Math.abs(p.y));
    return max + 80;
  }, [positions]);

  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState({ x: 0, y: 0, zoom: 1 });
  const [fitted, setFitted] = useState(false);

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

  // Filtre/odak değişince yeniden sığdır
  useEffect(() => setFitted(false), [filtered]);

  useEffect(() => {
    if (fitted || !size.w || !size.h) return;
    const zoom = Math.min(size.w, size.h) / (extent * 2);
    setView({ x: 0, y: 0, zoom: Math.min(Math.max(zoom, 0.3), 1.4) });
    setFitted(true);
  }, [size, extent, fitted]);

  const clampZoom = (z: number) => Math.min(Math.max(z, 0.25), 3);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
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
    pointers.current.delete(e.pointerId);
    pinchDist.current = 0;
  }, []);

  const onWheel = useCallback((e: React.WheelEvent) => {
    setView((v) => ({
      ...v,
      zoom: clampZoom(v.zoom * Math.exp(-e.deltaY * 0.0012)),
    }));
  }, []);

  const neighbors = useMemo(() => {
    if (!selectedId) return null;
    const set = new Set<string>([selectedId]);
    for (const l of linksByNode.get(selectedId) ?? []) set.add(l.otherId);
    return set;
  }, [selectedId, linksByNode]);

  const dimNode = (id: string) => (neighbors ? !neighbors.has(id) : false);
  const dimEdge = (a: string, b: string) =>
    neighbors ? !(neighbors.has(a) && neighbors.has(b)) : false;

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

  const world = extent * 2;

  function nodeSize(node: LifeNode): number {
    const d = degree.get(node.id) ?? 0;
    return (node.kind === "note" ? 30 : 24) + Math.min(18, d * 4);
  }

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden touch-none select-none"
      style={{
        backgroundImage:
          "radial-gradient(circle at center, color-mix(in srgb, var(--foreground) 6%, transparent) 1px, transparent 1px)",
        backgroundSize: "26px 26px",
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={onWheel}
      onClick={() => {
        if (!moved.current) setSelectedId(null);
      }}
    >
      <div
        className="absolute left-1/2 top-1/2"
        style={{
          transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`,
        }}
      >
        <svg
          className="absolute overflow-visible"
          style={{ left: -extent, top: -extent }}
          width={world}
          height={world}
          viewBox={`${-extent} ${-extent} ${world} ${world}`}
        >
          {filtered.edges.map((e, i) => {
            const a = positions.get(e.a);
            const b = positions.get(e.b);
            if (!a || !b) return null;
            const dim = dimEdge(e.a, e.b);
            return (
              <line
                key={i}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="#a78bfa"
                strokeWidth={1.6}
                strokeLinecap="round"
                className="transition-opacity duration-300"
                opacity={dim ? 0.06 : 0.5}
              />
            );
          })}
        </svg>

        {filtered.nodes.map((node) => {
          const p = positions.get(node.id);
          if (!p) return null;
          const color = node.color ?? (node.kind === "note" ? "#818cf8" : "#64748b");
          const isSel = selectedId === node.id;
          const isNote = node.kind === "note";
          const sz = nodeSize(node);
          return (
            <button
              key={node.id}
              className={cn(
                "absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1 transition-opacity duration-300",
                dimNode(node.id) && "opacity-20"
              )}
              style={{ left: p.x, top: p.y }}
              onClick={(e) => {
                e.stopPropagation();
                if (!moved.current)
                  setSelectedId((cur) => (cur === node.id ? null : node.id));
              }}
            >
              <span
                className={cn(
                  "flex items-center justify-center border-2 bg-background shadow-lg transition-shadow",
                  isNote ? "rounded-full" : "rounded-md",
                  isSel && "ring-2 ring-offset-2 ring-offset-background"
                )}
                style={{
                  width: sz,
                  height: sz,
                  borderColor: color,
                  backgroundColor: `${color}22`,
                  ...(isSel
                    ? ({ "--tw-ring-color": color } as React.CSSProperties)
                    : {}),
                }}
              >
                {isNote ? (
                  <NotebookPen className="h-4 w-4" style={{ color }} />
                ) : (
                  <span
                    className="h-2.5 w-2.5 rounded-sm"
                    style={{ backgroundColor: color }}
                  />
                )}
              </span>
              <span className="max-w-24 truncate text-[9px] font-medium leading-none text-foreground/80">
                {node.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Kontroller — filtre / arama */}
      <div
        className="absolute left-3 top-3 z-10"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => setControlsOpen((v) => !v)}
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-full border border-border shadow-md backdrop-blur transition-colors",
            controlsOpen ? "bg-primary/15 text-primary" : "bg-card/85 text-muted-foreground"
          )}
          aria-label="Filtreler"
        >
          <SlidersHorizontal className="h-4 w-4" />
        </button>
        {controlsOpen && (
          <div className="mt-2 w-56 rounded-2xl border border-border bg-card/95 p-3 shadow-xl backdrop-blur">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Ara…"
              className="mb-2 h-8 w-full rounded-lg border border-border bg-input px-2.5 text-xs outline-none placeholder:text-muted-foreground/50"
            />
            <div className="flex flex-wrap gap-1.5">
              <Toggle on={showNotes} onClick={() => setShowNotes((v) => !v)} color="#818cf8">
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
          </div>
        )}
      </div>

      {/* Seçim kartı — bağlar ve dayandıkları kelime/öbek */}
      {selected && (
        <div className="absolute inset-x-3 bottom-3 z-20 max-h-[52%] overflow-y-auto rounded-2xl border border-border bg-card/95 shadow-xl backdrop-blur-sm">
          <div className="sticky top-0 flex items-center gap-2 border-b border-border/60 bg-card/95 px-4 py-3 backdrop-blur-sm">
            <span
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center border",
                selected.node.kind === "note" ? "rounded-full" : "rounded-md"
              )}
              style={{
                borderColor: `${selected.node.color ?? "#64748b"}66`,
                backgroundColor: `${selected.node.color ?? "#64748b"}1f`,
              }}
            >
              {selected.node.kind === "note" ? (
                <NotebookPen
                  className="h-4 w-4"
                  style={{ color: selected.node.color ?? "#818cf8" }}
                />
              ) : (
                <span
                  className="h-2.5 w-2.5 rounded-sm"
                  style={{ backgroundColor: selected.node.color ?? "#64748b" }}
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
                setFocusId((cur) => (cur === selected.node.id ? null : selected.node.id));
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
