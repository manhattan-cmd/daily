"use client";

import { useMemo, useRef, useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ChevronRight, NotebookPen, Sparkles, X } from "lucide-react";
import {
  layoutNotesGraph,
  noteNodes,
  type NotesGraph,
} from "@/lib/notes-graph";
import type { Note, NoteConnection, NoteTag } from "@/types";
import { cn } from "@/lib/utils";

const MONTHS_TR = [
  "Oca", "Şub", "Mar", "Nis", "May", "Haz",
  "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara",
];
function shortDate(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  return `${d} ${MONTHS_TR[m - 1]}`;
}

/**
 * Not haritası — her not bir düğüm, yapay zekânın kurduğu içgörülü bağlar
 * kenar. Bağ kalınlığı güce göre; düğüme dokununca bağlı notlar vurgulanır ve
 * altta bağların NEDENİNİ açıklayan içgörüler listelenir.
 */
export function NotesMap({
  notes,
  tags,
  connections,
}: {
  notes: Note[];
  tags: NoteTag[];
  connections: NoteConnection[];
}) {
  const tagById = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags]);

  const graph: NotesGraph = useMemo(() => {
    const nodes = noteNodes(notes, tagById);
    const ids = new Set(nodes.map((n) => n.id));
    const edges = connections
      .filter((c) => ids.has(c.aId) && ids.has(c.bId))
      .map((c) => ({ a: c.aId, b: c.bId, strength: c.strength }));
    return { nodes, edges };
  }, [notes, tagById, connections]);

  const positions = useMemo(() => layoutNotesGraph(graph), [graph]);
  const titleById = useMemo(
    () => new Map(graph.nodes.map((n) => [n.id, n])),
    [graph.nodes]
  );

  // Düğüm → bağları (içgörüyle)
  const linksByNode = useMemo(() => {
    const m = new Map<
      string,
      { otherId: string; strength: number; insight: string }[]
    >();
    for (const c of connections) {
      if (!titleById.has(c.aId) || !titleById.has(c.bId)) continue;
      (m.get(c.aId) ?? m.set(c.aId, []).get(c.aId)!).push({
        otherId: c.bId,
        strength: c.strength,
        insight: c.insight,
      });
      (m.get(c.bId) ?? m.set(c.bId, []).get(c.bId)!).push({
        otherId: c.aId,
        strength: c.strength,
        insight: c.insight,
      });
    }
    for (const list of m.values()) list.sort((a, b) => b.strength - a.strength);
    return m;
  }, [connections, titleById]);

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
  const [selectedId, setSelectedId] = useState<string | null>(null);

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

  useEffect(() => setFitted(false), [graph]);

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
    const node = titleById.get(selectedId);
    if (!node) return null;
    const links = (linksByNode.get(selectedId) ?? []).map((l) => ({
      ...l,
      other: titleById.get(l.otherId),
    }));
    return { node, links };
  }, [selectedId, titleById, linksByNode]);

  const world = extent * 2;
  const maxStrength = useMemo(
    () => Math.max(0.001, ...graph.edges.map((e) => e.strength)),
    [graph.edges]
  );

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
          {graph.edges.map((e) => {
            const a = positions.get(e.a);
            const b = positions.get(e.b);
            if (!a || !b) return null;
            const rel = e.strength / maxStrength;
            const dim = dimEdge(e.a, e.b);
            return (
              <line
                key={`${e.a}-${e.b}`}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="#a78bfa"
                strokeWidth={0.8 + rel * 3}
                strokeLinecap="round"
                className="transition-opacity duration-300"
                opacity={dim ? 0.05 : 0.2 + rel * 0.55}
              />
            );
          })}
        </svg>

        {graph.nodes.map((node) => {
          const p = positions.get(node.id);
          if (!p) return null;
          const color = node.color ?? "#64748b";
          const isSel = selectedId === node.id;
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
                  "flex h-9 w-9 items-center justify-center rounded-full border-2 bg-background shadow-lg transition-shadow",
                  isSel && "ring-2 ring-offset-2 ring-offset-background"
                )}
                style={{
                  borderColor: color,
                  backgroundColor: `${color}22`,
                  ...(isSel
                    ? ({ "--tw-ring-color": color } as React.CSSProperties)
                    : {}),
                }}
              >
                <NotebookPen className="h-4 w-4" style={{ color }} />
              </span>
              <span className="max-w-24 truncate text-[9px] font-medium leading-none text-foreground/80">
                {node.title}
              </span>
            </button>
          );
        })}
      </div>

      {/* Seçim kartı — bağlar ve içgörüleri */}
      {selected && (
        <div className="absolute inset-x-3 bottom-3 z-20 max-h-[52%] overflow-y-auto rounded-2xl border border-border bg-card/95 shadow-xl backdrop-blur-sm">
          <div className="sticky top-0 flex items-center gap-2 border-b border-border/60 bg-card/95 px-4 py-3 backdrop-blur-sm">
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border"
              style={{
                borderColor: `${selected.node.color ?? "#64748b"}66`,
                backgroundColor: `${selected.node.color ?? "#64748b"}1f`,
              }}
            >
              <NotebookPen
                className="h-4 w-4"
                style={{ color: selected.node.color ?? "#94a3b8" }}
              />
            </span>
            <Link
              href={`/notes/${selected.node.id}`}
              className="min-w-0 flex-1"
            >
              <span className="block truncate text-sm font-medium">
                {selected.node.title}
              </span>
              <span className="block text-[11px] text-muted-foreground">
                {shortDate(selected.node.date)} ·{" "}
                {selected.links.length > 0
                  ? `${selected.links.length} bağ`
                  : "bağ yok"}
              </span>
            </Link>
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
              Bu notun henüz bağı yok.
            </p>
          ) : (
            <ul className="divide-y divide-border/50">
              {selected.links.map((l) => (
                <li key={l.otherId}>
                  <Link
                    href={`/notes/${l.otherId}`}
                    className="flex gap-2.5 px-4 py-3 transition-colors hover:bg-white/5"
                  >
                    <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/70" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-xs font-medium">
                          {l.other?.title ?? "Not"}
                        </span>
                        <span className="shrink-0 text-[10px] text-muted-foreground/60">
                          {l.other ? shortDate(l.other.date) : ""}
                        </span>
                      </span>
                      <span className="mt-0.5 block text-[11px] leading-relaxed text-muted-foreground">
                        {l.insight}
                      </span>
                    </span>
                    <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
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
