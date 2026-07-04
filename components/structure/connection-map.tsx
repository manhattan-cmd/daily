"use client";

import { useMemo, useRef, useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { CategoryIcon, CATEGORY_ICON_MAP } from "@/lib/category-icons";
import { cn } from "@/lib/utils";

export type MapSub = { id: string; name: string; icon?: string };

export type MapCategory = {
  id: string;
  name: string;
  color: string;
  icon?: string;
  subs: MapSub[];
};

/** Kategori çifti arasında ortak mod bağlantısı */
export type MapConnection = { a: string; b: string; labels: string[] };

/** Aynı isimli alt kategoriler arası paralel bağlantı (sub id'leri) */
export type MapParallel = { a: string; b: string };

export type ConnectionMapProps = {
  categories: MapCategory[];
  connections: MapConnection[];
  parallels: MapParallel[];
};

type NodePos = { x: number; y: number };

const DEG = Math.PI / 180;

function buildLayout(categories: MapCategory[]) {
  const n = categories.length;
  const ringR = n <= 2 ? 130 : Math.max(120, (n * 170) / (2 * Math.PI));
  const catPos = new Map<string, NodePos>();
  const subPos = new Map<string, NodePos>();
  const subCat = new Map<string, MapCategory>();

  categories.forEach((cat, i) => {
    const angle = -90 * DEG + (i * 360 * DEG) / Math.max(n, 1);
    const cx = Math.cos(angle) * (n === 1 ? 0 : ringR);
    const cy = Math.sin(angle) * (n === 1 ? 0 : ringR);
    catPos.set(cat.id, { x: cx, y: cy });

    const count = cat.subs.length;
    const spread = Math.min(150, Math.max(0, count - 1) * 26) * DEG;
    const outward = n === 1 ? -90 * DEG : angle;
    cat.subs.forEach((sub, j) => {
      const a =
        count === 1
          ? outward
          : outward - spread / 2 + (j * spread) / (count - 1);
      const dist = 82 + (j % 2) * 26; // stagger alternate rings against label overlap
      subPos.set(sub.id, {
        x: cx + Math.cos(a) * dist,
        y: cy + Math.sin(a) * dist,
      });
      subCat.set(sub.id, cat);
    });
  });

  const extent = ringR + 82 + 26 + 60;
  return { catPos, subPos, subCat, extent };
}

function quad(a: NodePos, b: NodePos, pull: NodePos): string {
  return `M ${a.x} ${a.y} Q ${pull.x} ${pull.y} ${b.x} ${b.y}`;
}

/** İç merkeze doğru çekilen yay — kategori↔kategori */
function innerArc(a: NodePos, b: NodePos): string {
  return quad(a, b, { x: ((a.x + b.x) / 2) * 0.45, y: ((a.y + b.y) / 2) * 0.45 });
}

/** Hafif dışa bombeli yay — alt kategori↔alt kategori */
function outerArc(a: NodePos, b: NodePos): string {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy) || 1;
  return quad(a, b, { x: mx - (dy / d) * d * 0.18, y: my + (dx / d) * d * 0.18 });
}

export default function ConnectionMap({
  categories,
  connections,
  parallels,
}: ConnectionMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState({ x: 0, y: 0, zoom: 1 });
  const [fitted, setFitted] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchDist = useRef(0);
  const moved = useRef(false);

  const { catPos, subPos, subCat, extent } = useMemo(
    () => buildLayout(categories),
    [categories]
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // İlk açılışta haritayı ekrana sığdır
  useEffect(() => {
    if (fitted || !size.w || !size.h) return;
    const zoom = Math.min(size.w, size.h) / (extent * 2);
    setView({ x: 0, y: 0, zoom: Math.min(Math.max(zoom, 0.35), 1.4) });
    setFitted(true);
  }, [size, extent, fitted]);

  const clampZoom = (z: number) => Math.min(Math.max(z, 0.3), 3);

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
    setView((v) => ({ ...v, zoom: clampZoom(v.zoom * Math.exp(-e.deltaY * 0.0012)) }));
  }, []);

  // Seçili düğüme bağlı düğüm/kenar kümesi — geri kalanı soluklaştırılır
  const highlight = useMemo(() => {
    if (!selectedId) return null;
    const nodes = new Set<string>([selectedId]);
    const cat = categories.find((c) => c.id === selectedId);
    if (cat) {
      for (const s of cat.subs) nodes.add(s.id);
      for (const c of connections) {
        if (c.a === selectedId) nodes.add(c.b);
        if (c.b === selectedId) nodes.add(c.a);
      }
      // Alt kategorilerinin paralel eşleri de vurgulansın
      for (const p of parallels) {
        if (nodes.has(p.a)) nodes.add(p.b);
        if (nodes.has(p.b)) nodes.add(p.a);
      }
    } else {
      const parent = subCat.get(selectedId);
      if (parent) nodes.add(parent.id);
    }
    for (const p of parallels) {
      if (p.a === selectedId) nodes.add(p.b);
      if (p.b === selectedId) nodes.add(p.a);
    }
    return nodes;
  }, [selectedId, categories, connections, parallels, subCat]);

  const dimNode = (id: string) => (highlight ? !highlight.has(id) : false);
  const dimEdge = (a: string, b: string) =>
    highlight ? !(highlight.has(a) && highlight.has(b)) : false;

  const selected = useMemo(() => {
    if (!selectedId) return null;
    const cat = categories.find((c) => c.id === selectedId);
    if (cat) {
      const shared = connections.filter(
        (c) => c.a === selectedId || c.b === selectedId
      );
      return {
        name: cat.name,
        color: cat.color,
        kind: "Kategori",
        href: `/structure/${cat.id}`,
        note:
          shared.length > 0
            ? `Ortak mod: ${[...new Set(shared.flatMap((s) => s.labels))].join(", ")}`
            : null,
      };
    }
    const parent = subCat.get(selectedId);
    const sub = parent?.subs.find((s) => s.id === selectedId);
    if (!parent || !sub) return null;
    const isParallel = parallels.some(
      (p) => p.a === selectedId || p.b === selectedId
    );
    return {
      name: sub.name,
      color: parent.color,
      kind: `${parent.name} · Alt kategori`,
      href: `/structure/${parent.id}/${sub.id}`,
      note: isParallel ? "Paralel bağlantısı var" : null,
    };
  }, [selectedId, categories, connections, parallels, subCat]);

  function selectNode(id: string) {
    if (moved.current) return;
    setSelectedId((cur) => (cur === id ? null : id));
  }

  const world = extent * 2;

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
      onClick={() => { if (!moved.current) setSelectedId(null); }}
    >
      {/* Dünya — merkezde 0×0 nokta, pan+zoom transformu burada */}
      <div
        className="absolute left-1/2 top-1/2"
        style={{
          transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`,
        }}
      >
        {/* Kenarlar */}
        <svg
          className="absolute overflow-visible"
          style={{ left: -extent, top: -extent }}
          width={world}
          height={world}
          viewBox={`${-extent} ${-extent} ${world} ${world}`}
        >
          {/* Kategori → alt kategori */}
          {categories.map((cat) =>
            cat.subs.map((sub) => {
              const a = catPos.get(cat.id)!;
              const b = subPos.get(sub.id)!;
              return (
                <line
                  key={`cs-${sub.id}`}
                  x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                  stroke={cat.color}
                  strokeWidth={1}
                  className="transition-opacity duration-300"
                  opacity={dimEdge(cat.id, sub.id) ? 0.06 : 0.35}
                />
              );
            })
          )}

          {/* Ortak mod — kategori ↔ kategori */}
          {connections.map((c) => {
            const a = catPos.get(c.a);
            const b = catPos.get(c.b);
            if (!a || !b) return null;
            return (
              <path
                key={`mod-${c.a}-${c.b}`}
                d={innerArc(a, b)}
                fill="none"
                stroke="currentColor"
                strokeWidth={1}
                strokeDasharray="4 5"
                className="text-muted-foreground transition-opacity duration-300"
                opacity={dimEdge(c.a, c.b) ? 0.06 : 0.45}
              />
            );
          })}

          {/* Paralel — alt kategori ↔ alt kategori */}
          {parallels.map((p) => {
            const a = subPos.get(p.a);
            const b = subPos.get(p.b);
            if (!a || !b) return null;
            return (
              <path
                key={`par-${p.a}-${p.b}`}
                d={outerArc(a, b)}
                fill="none"
                stroke="#a78bfa"
                strokeWidth={1.4}
                className={cn(
                  "transition-opacity duration-300",
                  !dimEdge(p.a, p.b) && "animate-pulse"
                )}
                opacity={dimEdge(p.a, p.b) ? 0.06 : 0.75}
              />
            );
          })}
        </svg>

        {/* Ortak mod etiketleri — yalnızca uçlarından biri seçiliyken */}
        {selectedId &&
          connections
            .filter((c) => c.a === selectedId || c.b === selectedId)
            .map((c) => {
              const a = catPos.get(c.a);
              const b = catPos.get(c.b);
              if (!a || !b) return null;
              const mx = ((a.x + b.x) / 2) * 0.7;
              const my = ((a.y + b.y) / 2) * 0.7;
              return (
                <div
                  key={`lbl-${c.a}-${c.b}`}
                  className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-border bg-card/90 px-2 py-0.5 text-[9px] text-muted-foreground whitespace-nowrap pointer-events-none"
                  style={{ left: mx, top: my }}
                >
                  {c.labels.join(", ")}
                </div>
              );
            })}

        {/* Alt kategori düğümleri */}
        {categories.map((cat) =>
          cat.subs.map((sub) => {
            const pos = subPos.get(sub.id)!;
            const isLucide = !!sub.icon && sub.icon in CATEGORY_ICON_MAP;
            return (
              <button
                key={sub.id}
                className={cn(
                  "absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1 transition-opacity duration-300",
                  dimNode(sub.id) && "opacity-15"
                )}
                style={{ left: pos.x, top: pos.y }}
                onClick={(e) => { e.stopPropagation(); selectNode(sub.id); }}
              >
                <span
                  className="flex h-5 w-5 items-center justify-center rounded-full border"
                  style={{
                    backgroundColor: `${cat.color}1a`,
                    borderColor: `${cat.color}55`,
                  }}
                >
                  {isLucide ? (
                    <CategoryIcon
                      name={sub.icon}
                      className="h-2.5 w-2.5"
                      style={{ color: cat.color }}
                    />
                  ) : sub.icon ? (
                    <span className="text-[9px] leading-none">{sub.icon}</span>
                  ) : (
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: cat.color }}
                    />
                  )}
                </span>
                <span className="max-w-24 truncate text-[9px] leading-none text-muted-foreground">
                  {sub.name}
                </span>
              </button>
            );
          })
        )}

        {/* Kategori düğümleri */}
        {categories.map((cat) => {
          const pos = catPos.get(cat.id)!;
          return (
            <button
              key={cat.id}
              className={cn(
                "absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1.5 transition-opacity duration-300",
                dimNode(cat.id) && "opacity-15"
              )}
              style={{ left: pos.x, top: pos.y }}
              onClick={(e) => { e.stopPropagation(); selectNode(cat.id); }}
            >
              <span
                className={cn(
                  "flex h-12 w-12 items-center justify-center rounded-full border-2 bg-background shadow-lg transition-shadow",
                  selectedId === cat.id && "ring-2 ring-offset-2 ring-offset-background"
                )}
                style={{
                  borderColor: cat.color,
                  backgroundColor: `${cat.color}22`,
                  ...(selectedId === cat.id
                    ? ({ "--tw-ring-color": cat.color } as React.CSSProperties)
                    : {}),
                }}
              >
                {cat.icon && cat.icon in CATEGORY_ICON_MAP ? (
                  <CategoryIcon
                    name={cat.icon}
                    className="h-5 w-5"
                    style={{ color: cat.color }}
                  />
                ) : (
                  <span
                    className="text-sm font-semibold"
                    style={{ color: cat.color }}
                  >
                    {cat.name.charAt(0).toLocaleUpperCase("tr-TR")}
                  </span>
                )}
              </span>
              <span className="max-w-28 truncate text-[11px] font-medium leading-none">
                {cat.name}
              </span>
            </button>
          );
        })}
      </div>

      {/* Seçim kartı */}
      {selected && (
        <div className="absolute inset-x-4 bottom-4 z-20">
          <Link
            href={selected.href}
            className="flex items-center gap-3 rounded-2xl border border-border bg-card/95 backdrop-blur-sm px-4 py-3 shadow-xl"
          >
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: selected.color }}
            />
            <span className="flex-1 min-w-0">
              <span className="block truncate text-sm font-medium">
                {selected.name}
              </span>
              <span className="block truncate text-[11px] text-muted-foreground">
                {selected.note ?? selected.kind}
              </span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </Link>
        </div>
      )}
    </div>
  );
}
