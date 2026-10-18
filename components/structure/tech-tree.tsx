"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ExternalLink, Locate, Minus, Play, Plus, Settings2, Waypoints, X } from "lucide-react";
import type { MapGroup } from "@/components/structure/neural-map";
import { useMapGraph, type GNode } from "@/components/structure/graph-view";
import { layoutCity, ROOT, type Pin } from "@/components/structure/city-layout";
import { useT } from "@/lib/i18n";
import { routes } from "@/lib/routes";
import { useSkin } from "@/lib/skin";
import { cn } from "@/lib/utils";

/**
 * Harita — merkezden dört yana yayılan bir devre şehri.
 *
 * Ortada ROUTINE; ondan dört yöne birer ana cadde çıkıyor, kategoriler
 * caddelerin iki yanına blok blok diziliyor. Kalabalık kalem bir çip gibi
 * mahallesinin ortasında duruyor, çocukları dört yanında; az çocuklu kalem
 * çocuklarını tek kenarından tarak gibi açıyor. Hangisinin seçileceği, kategorilerin
 * caddelere dağılışı ve izlerin şeritleri city-layout.ts'te.
 *
 * Bütün izler yatay, dikey ya da 45° ve hiçbiri kesişmiyor. Kullanılan kalemin
 * izi kalın ve koyu, kullanılmayanın ince ve soluk. Bir kaleme dokununca
 * merkezden ona gelen yol ve çocukları yanıyor, gerisi soluyor.
 */

const GRID = 40;
const MIN_K = 0.2;
const MAX_K = 3;
const NO_LOCAL = null as { id: string; depth: number } | null;

type Pt = [number, number];
type Trace = { from: string; to: string; path: Path2D };

/** "#rrggbb" ile zemini karıştır (t = rengin payı) — tuval color-mix bilmiyor */
function mixHex(hex: string, base: string, t: number): string {
  const p = (c: string) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(c.trim());
    if (!m) return null;
    const n = parseInt(m[1], 16);
    return [n >> 16, (n >> 8) & 255, n & 255];
  };
  const a = p(hex);
  const b = p(base);
  if (!a || !b) return hex;
  const c = a.map((v, i) => Math.round(v * t + b[i] * (1 - t)));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

const toPath = (pts: Pt[]) => new Path2D(pts.map(([x, y], i) => `${i ? "L" : "M"}${x} ${y}`).join(""));

/** Kart kenarındaki bacak ya da pad: kenardan dışa doğru küçük bir dikdörtgen */
function lug(ctx: CanvasRenderingContext2D, { p: [x, y], d: [dx, dy] }: Pin, long: number, thick: number) {
  if (dx) ctx.fillRect(dx > 0 ? x - 1 : x - long + 1, y - thick / 2, long, thick);
  else ctx.fillRect(x - thick / 2, dy > 0 ? y - 1 : y - long + 1, thick, long);
}

export function TechTree({ groups, layoutSwitch }: { groups: MapGroup[]; layoutSwitch?: ReactNode }) {
  const t = useT();
  const router = useRouter();
  const brutal = useSkin() === "brutal";
  const data = useMapGraph(groups);

  const [panel, setPanel] = useState(false);
  const [query, setQuery] = useState("");
  const [unused, setUnused] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [local, setLocal] = useState(NO_LOCAL);
  const [reveal, setReveal] = useState<number | null>(null);

  // ─── Şehir: görünen kalemler ve yerleşim ──────────────────────────────────
  const tree = useMemo(() => {
    const kidsOf = new Map<string, string[]>();
    const parentOf = new Map<string, string>();
    for (const l of data.links) {
      if (l.feat) continue;
      (kidsOf.get(l.s) ?? kidsOf.set(l.s, []).get(l.s)!).push(l.t);
      parentOf.set(l.t, l.s);
    }
    const shown = reveal == null ? null : new Set(data.order.slice(0, reveal));
    const ok = new Set<string>();
    // data.nodes ağaç sırasında (önce üst kalem) — üstü görünmeyen çocuk da görünmüyor
    for (const n of data.nodes) {
      if (n.kind === "mod") continue;
      if (!unused && n.kind !== "cat" && n.count === 0) continue;
      if (shown && !shown.has(n.id)) continue;
      if (n.kind === "sub" && (!n.parent || !ok.has(n.parent))) continue;
      ok.add(n.id);
    }
    let roots: string[];
    if (local && ok.has(local.id)) {
      // Dal: kökten bu kaleme giden yol + altında `depth` kuşak
      const keep = new Set<string>();
      for (let p: string | undefined = local.id; p; p = parentOf.get(p)) keep.add(p);
      let front = [local.id];
      for (let d = 0; d < local.depth; d++) {
        const next: string[] = [];
        for (const id of front)
          for (const k of kidsOf.get(id) ?? []) {
            if (!ok.has(k)) continue;
            keep.add(k);
            next.push(k);
          }
        front = next;
      }
      for (const id of [...ok]) if (!keep.has(id)) ok.delete(id);
      let top = local.id;
      while (parentOf.get(top) && ok.has(parentOf.get(top)!)) top = parentOf.get(top)!;
      roots = [top];
    } else roots = data.nodes.filter((n) => n.kind === "cat" && ok.has(n.id)).map((n) => n.id);
    const withRoot = !local;
    const city = layoutCity({
      roots,
      withRoot,
      kids: (id) => (kidsOf.get(id) ?? []).filter((k) => ok.has(k)),
      isCat: (id) => data.byId.get(id)?.kind === "cat",
    });
    const cards = city.cards;
    const traces: Trace[] = city.traces.map((t) => ({ from: t.from, to: t.to, path: toPath(t.pts) }));

    // Kalemin kendi (miras olmayan) özellikleri — kartta küçük daireler
    const feats = new Map<string, string[]>();
    for (const l of data.links)
      if (l.feat && cards.has(l.s)) (feats.get(l.s) ?? feats.set(l.s, []).get(l.s)!).push(data.byId.get(l.t)?.color ?? "#888");
    const { x0, y0, x1, y1 } = city.bounds;
    const center: Pt = withRoot ? [0, 0] : [(x0 + x1) / 2, (y0 + y1) / 2];
    return { cards, traces, parentOf, feats, bounds: { x0, y0, x1, y1 }, center, withRoot, byId: data.byId };
  }, [data, unused, local, reveal]);

  // ─── Çizim ────────────────────────────────────────────────────────────────
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cam = useRef({ x: 0, y: 0, k: 1 });
  const size = useRef({ w: 0, h: 0 });
  const dirty = useRef(true);
  const treeRef = useRef(tree);
  const live = useRef({ query, selected, hover: null as string | null, brutal });
  const touched = useRef(false);

  /** Açılış görünümü: merkez ortada, okunur bir ölçekte */
  const home = () => {
    const { w } = size.current;
    if (!w) return;
    const T = treeRef.current;
    // Şehir genişse merkez ve ilk halka görünsün, adlar okunur kalsın
    const k = Math.max(0.6, Math.min(T.withRoot ? 0.75 : 1, w / (T.bounds.x1 - T.bounds.x0)));
    cam.current = { k, x: T.center[0], y: T.center[1] };
    dirty.current = true;
  };

  useEffect(() => {
    treeRef.current = tree;
    if (!touched.current) home();
    dirty.current = true;
  }, [tree]);
  useEffect(() => {
    Object.assign(live.current, { query, selected, brutal });
    dirty.current = true;
  }, [query, selected, brutal]);
  // Dala geçince / dönünce baştan
  useEffect(() => {
    touched.current = false;
    home();
  }, [local]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const css = getComputedStyle(document.documentElement);
    const font = getComputedStyle(document.body).fontFamily;
    const colors = () => ({
      fg: css.getPropertyValue("--foreground").trim() || "#fafafa",
      bg: css.getPropertyValue("--background").trim() || "#09090b",
      accent: css.getPropertyValue("--primary").trim() || "#6366f1",
    });
    let C = colors();
    let lastSkin = live.current.brutal;
    let raf = 0;

    const draw = () => {
      if (lastSkin !== live.current.brutal) {
        C = colors();
        lastSkin = live.current.brutal;
      }
      const L = live.current;
      const B = L.brutal;
      const T = treeRef.current;
      const { w, h } = size.current;
      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const { x: cx, y: cy, k } = cam.current;
      ctx.translate(w / 2, h / 2);
      ctx.scale(k, k);
      ctx.translate(-cx, -cy);

      // Şehir ızgarası — kartın altındaki silik kılavuz
      const vx0 = cx - w / 2 / k;
      const vx1 = cx + w / 2 / k;
      const vy0 = cy - h / 2 / k;
      const vy1 = cy + h / 2 / k;
      ctx.globalAlpha = B ? 0.07 : 0.05;
      ctx.strokeStyle = C.fg;
      ctx.lineWidth = 1 / k;
      ctx.beginPath();
      for (let x = Math.floor(vx0 / GRID) * GRID; x <= vx1; x += GRID) {
        ctx.moveTo(x, vy0);
        ctx.lineTo(x, vy1);
      }
      for (let y = Math.floor(vy0 / GRID) * GRID; y <= vy1; y += GRID) {
        ctx.moveTo(vx0, y);
        ctx.lineTo(vx1, y);
      }
      ctx.stroke();

      // Yanan zincir: odaktaki kalem, merkezden ona gelen yol, çocukları
      const focus = L.hover ?? L.selected;
      const lit = new Set<string>();
      if (focus && T.cards.has(focus)) {
        for (let p: string | undefined = focus; p; p = T.parentOf.get(p)) lit.add(p);
        if (T.withRoot) lit.add(ROOT);
        for (const kd of T.cards.get(focus)!.kids) lit.add(kd);
      }
      const q = L.query.trim().toLocaleLowerCase("tr");
      const match = (id: string) => !q || (T.byId.get(id)?.label ?? "").toLocaleLowerCase("tr").includes(q);
      const dimCard = (id: string) => (focus ? !lit.has(id) : !match(id));

      // İzler
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      for (const tr of T.traces) {
        const u = T.byId.get(tr.to)?.usage ?? 1;
        const on = lit.has(tr.from) && lit.has(tr.to);
        const used = u > 0.12;
        ctx.globalAlpha = focus ? (on ? 1 : 0.1) : q ? 0.15 : used ? 0.85 : 0.25;
        ctx.strokeStyle = on ? (B ? "#111" : C.accent) : C.fg;
        ctx.lineWidth = (on ? 2.2 : used ? 1.4 : 1) + (used ? 2 * u : 0);
        ctx.stroke(tr.path);
      }

      // Kartlar
      ctx.textBaseline = "middle";
      for (const c of T.cards.values()) {
        const x = c.cx - c.w / 2;
        const top = c.cy - c.h / 2;
        const dim = dimCard(c.id);
        ctx.globalAlpha = dim ? 0.25 : 1;
        ctx.fillStyle = C.fg;
        if (c.id === ROOT) {
          // kökün bacakları: caddelerin çıktığı her nokta
          for (const pin of c.pins) lug(ctx, pin, 5, 3);
          if (B) {
            ctx.fillStyle = "#111";
            ctx.beginPath();
            ctx.roundRect(x + 3, top + 3, c.w, c.h, 7);
            ctx.fill();
          }
          ctx.fillStyle = B ? "#111" : C.accent;
          ctx.beginPath();
          ctx.roundRect(x, top, c.w, c.h, 7);
          ctx.fill();
          ctx.fillStyle = B ? "#ffd23f" : "#fff";
          ctx.font = `900 13px ${font}`;
          ctx.textAlign = "center";
          ctx.fillText("ROUTINE", c.cx, c.cy);
          continue;
        }
        // bacaklar (dış kenar) ve pad (iç kenar)
        for (const pin of c.pins) lug(ctx, pin, 5, 3);
        if (c.pad) lug(ctx, c.pad, 5, 5);
        const n = T.byId.get(c.id) as GNode;
        const cat = n.kind === "cat";
        const u = n.usage;
        const sel = c.id === L.selected;
        if (B) {
          ctx.fillStyle = "#111";
          ctx.beginPath();
          ctx.roundRect(x + 2.5, top + 2.5, c.w, c.h, 5);
          ctx.fill();
        }
        ctx.fillStyle = B
          ? mixHex(n.color, "#ffffff", cat ? 0.35 + 0.65 * u : 0.15 + 0.6 * u)
          : mixHex(n.color, C.bg, cat ? 0.3 + 0.25 * u : 0.12 + 0.22 * u);
        ctx.beginPath();
        ctx.roundRect(x, top, c.w, c.h, 5);
        ctx.fill();
        ctx.lineWidth = sel ? 2.4 : B ? 1.8 : 1;
        ctx.strokeStyle = sel ? (B ? "#111" : C.accent) : B ? "#111" : mixHex(n.color, C.bg, 0.35 + 0.5 * u);
        ctx.stroke();
        // iç kenarda renk şeridi — kullanım kadar dolu
        ctx.globalAlpha = (dim ? 0.25 : 1) * (0.35 + 0.65 * u);
        ctx.fillStyle = n.color;
        ctx.beginPath();
        ctx.roundRect(c.sx > 0 ? x + 3 : x + c.w - 7, top + 3, 4, c.h - 6, 2);
        ctx.fill();
        ctx.globalAlpha = dim ? 0.25 : 1;
        // özellik daireleri — dış kenara yakın üst köşede
        const fs = (T.feats.get(c.id) ?? []).slice(0, 3);
        fs.forEach((col, i) => {
          ctx.fillStyle = col;
          ctx.beginPath();
          ctx.arc(c.sx > 0 ? x + c.w - 8 - i * 9 : x + 8 + i * 9, top + 8, 3, 0, Math.PI * 2);
          ctx.fill();
          if (B) {
            ctx.lineWidth = 1;
            ctx.strokeStyle = "#111";
            ctx.stroke();
          }
        });
        // ad — şeritten başlayarak
        ctx.fillStyle = C.fg;
        ctx.font = `${cat ? 800 : 650} ${cat ? 12 : 10.5}px ${font}`;
        ctx.textAlign = c.sx > 0 ? "left" : "right";
        const maxW = c.w - 16 - fs.length * 9;
        let s = n.label;
        if (ctx.measureText(s).width > maxW) {
          while (s.length > 1 && ctx.measureText(s + "…").width > maxW) s = s.slice(0, -1);
          s += "…";
        }
        ctx.globalAlpha = (dim ? 0.25 : 1) * (cat || u > 0.12 ? 1 : 0.6);
        ctx.fillText(s, c.sx > 0 ? x + 12 : x + c.w - 12, c.cy + (fs.length && c.h < 32 ? 2 : 0));
      }
      ctx.globalAlpha = 1;
    };

    const loop = () => {
      if (dirty.current) {
        draw();
        dirty.current = false;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      const dpr = window.devicePixelRatio || 1;
      size.current = { w: width, h: height };
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      if (!touched.current) home();
      dirty.current = true;
    });
    ro.observe(wrapRef.current!);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
     
  }, []);

  // ─── Dokunma, kaydırma, yakınlaştırma ─────────────────────────────────────
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<
    | null
    | { mode: "pan"; sx: number; sy: number; cx: number; cy: number; moved: boolean; id: string | null }
    | { mode: "pinch"; d0: number; k0: number; wx: number; wy: number }
  >(null);
  const pt = (e: { clientX: number; clientY: number }) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const toWorld = (sx: number, sy: number) => {
    const { w, h } = size.current;
    const c = cam.current;
    return { x: (sx - w / 2) / c.k + c.x, y: (sy - h / 2) / c.k + c.y };
  };
  const hit = (sx: number, sy: number) => {
    const p = toWorld(sx, sy);
    for (const c of treeRef.current.cards.values())
      if (c.id !== ROOT && Math.abs(p.x - c.cx) <= c.w / 2 + 4 && Math.abs(p.y - c.cy) <= c.h / 2 + 4) return c.id;
    return null;
  };
  /** Şehir pencereden kaçmasın — kenarından en çok 60px taşar */
  const clamp = () => {
    const { w, h } = size.current;
    const c = cam.current;
    const { x0, y0, x1, y1 } = treeRef.current.bounds;
    const hw = w / 2 / c.k;
    const hh = h / 2 / c.k;
    const lim = (v: number, lo: number, hi: number) => (lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v)));
    c.x = lim(c.x, x0 + hw - 60, x1 - hw + 60);
    c.y = lim(c.y, y0 + hh - 60, y1 - hh + 60);
  };

  const onDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = pt(e);
    pointers.current.set(e.pointerId, p);
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const mid = toWorld((a.x + b.x) / 2, (a.y + b.y) / 2);
      gesture.current = { mode: "pinch", d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, k0: cam.current.k, wx: mid.x, wy: mid.y };
      return;
    }
    gesture.current = { mode: "pan", sx: p.x, sy: p.y, cx: cam.current.x, cy: cam.current.y, moved: false, id: hit(p.x, p.y) };
  };
  const onMove = (e: React.PointerEvent) => {
    const p = pt(e);
    if (!pointers.current.has(e.pointerId)) {
      if (e.pointerType === "mouse") {
        const hv = hit(p.x, p.y);
        if (hv !== live.current.hover) {
          live.current.hover = hv;
          dirty.current = true;
        }
      }
      return;
    }
    pointers.current.set(e.pointerId, p);
    const g = gesture.current;
    if (!g) return;
    if (g.mode === "pinch") {
      if (pointers.current.size !== 2) return;
      const [a, b] = [...pointers.current.values()];
      const k = Math.max(MIN_K, Math.min(MAX_K, g.k0 * (Math.hypot(a.x - b.x, a.y - b.y) / g.d0)));
      const { w, h } = size.current;
      cam.current = { k, x: g.wx - ((a.x + b.x) / 2 - w / 2) / k, y: g.wy - ((a.y + b.y) / 2 - h / 2) / k };
      clamp();
      touched.current = true;
      dirty.current = true;
      return;
    }
    if (!g.moved && Math.hypot(p.x - g.sx, p.y - g.sy) < 6) return;
    g.moved = true;
    touched.current = true;
    cam.current.x = g.cx - (p.x - g.sx) / cam.current.k;
    cam.current.y = g.cy - (p.y - g.sy) / cam.current.k;
    clamp();
    dirty.current = true;
  };
  const onUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (pointers.current.size > 0) {
      const [r] = [...pointers.current.values()];
      gesture.current = { mode: "pan", sx: r.x, sy: r.y, cx: cam.current.x, cy: cam.current.y, moved: true, id: null };
      return;
    }
    gesture.current = null;
    if (g?.mode === "pan" && !g.moved) setSelected((s) => (g.id == null ? null : s === g.id ? null : g.id));
  };
  const onWheel = (e: React.WheelEvent) => {
    const p = pt(e);
    const before = toWorld(p.x, p.y);
    // Tekerlek yakınlaştırır (şehir her yöne açık); kaydırmak sürüklemekle
    cam.current.k = Math.max(MIN_K, Math.min(MAX_K, cam.current.k * Math.exp(-e.deltaY * 0.0015)));
    const after = toWorld(p.x, p.y);
    cam.current.x += before.x - after.x;
    cam.current.y += before.y - after.y;
    clamp();
    touched.current = true;
    dirty.current = true;
  };

  // ─── Canlandır ────────────────────────────────────────────────────────────
  const animate = () => {
    setPanel(false);
    setSelected(null);
    setLocal(null);
    touched.current = false;
    setReveal(0);
  };
  useEffect(() => {
    if (reveal == null) return;
    const total = data.order.length;
    const step = Math.max(1, Math.round(total / 60));
    const id = setTimeout(() => setReveal((r) => (r == null || r + step > total ? null : r + step)), 60);
    return () => clearTimeout(id);
  }, [reveal, data.order.length]);

  // ─── Seçim kartı ──────────────────────────────────────────────────────────
  const sel = selected ? data.byId.get(selected) : undefined;
  const openSel = () => {
    if (!sel) return;
    if (sel.kind === "cat") router.push(routes.structureCategory(sel.id));
    else router.push(routes.structureSub(sel.catId!, sel.id));
  };
  const kids = sel ? tree.cards.get(sel.id)?.kids.length ?? 0 : 0;

  const box = brutal
    ? "rounded-xl border-2 border-[#111] bg-white text-[#111] shadow-[3px_3px_0_#111]"
    : "rounded-2xl border border-border bg-card/95 text-foreground shadow-lg backdrop-blur";
  const iconBtn = brutal
    ? "flex h-9 w-9 items-center justify-center rounded-lg border-2 border-[#111] bg-white text-[#111] shadow-[2px_2px_0_#111]"
    : "flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card/90 text-muted-foreground backdrop-blur hover:text-foreground";

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div ref={wrapRef} className="relative min-h-0 flex-1 overflow-hidden">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 touch-none select-none"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onPointerLeave={() => {
            if (live.current.hover) {
              live.current.hover = null;
              dirty.current = true;
            }
          }}
          onWheel={onWheel}
          role="img"
          aria-label={t("graph.aria")}
        />
      </div>

      {local && (
        <div className="absolute left-3 top-2 flex items-center gap-2">
          <button className={cn(iconBtn, "w-auto gap-1.5 px-2.5 text-xs font-bold")} onClick={() => setLocal(null)}>
            <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.5} />
            {t("graph.global")}
          </button>
          <div className={cn(box, "flex items-center gap-1 px-1.5 py-1 text-xs font-bold")}>
            <button aria-label="-" className="p-1" onClick={() => setLocal({ ...local, depth: Math.max(1, local.depth - 1) })}>
              <Minus className="h-3.5 w-3.5" strokeWidth={2.5} />
            </button>
            <span className="tabular-nums">
              {t("graph.depth")} {local.depth}
            </span>
            <button aria-label="+" className="p-1" onClick={() => setLocal({ ...local, depth: Math.min(4, local.depth + 1) })}>
              <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
            </button>
          </div>
        </div>
      )}

      <div className="absolute right-3 top-2 flex flex-col gap-2">
        <button className={iconBtn} aria-label={t("graph.settings")} onClick={() => setPanel((v) => !v)}>
          {panel ? <X className="h-4 w-4" strokeWidth={2.5} /> : <Settings2 className="h-4 w-4" strokeWidth={2.5} />}
        </button>
        <button
          className={iconBtn}
          aria-label={t("graph.fit")}
          onClick={() => {
            touched.current = false;
            home();
          }}
        >
          <Locate className="h-4 w-4" strokeWidth={2.5} />
        </button>
      </div>

      {panel && (
        <div className={cn(box, "absolute right-3 top-24 z-10 w-[248px] p-3 text-xs")}>
          {layoutSwitch}
          <div className="mb-1.5 text-[10px] font-black uppercase tracking-wider opacity-60">{t("graph.filters")}</div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("graph.search")}
            className={cn(
              "mb-2 w-full px-2 py-1.5 text-xs outline-none",
              brutal ? "rounded-md border-2 border-[#111] bg-white" : "rounded-lg border border-border bg-background"
            )}
          />
          <button onClick={() => setUnused(!unused)} className="mb-2 flex w-full items-center justify-between py-1 font-semibold">
            {t("graph.unused")}
            <span
              className={cn(
                "rounded px-1.5 py-0.5 text-[10px] font-black",
                unused ? (brutal ? "bg-[#3a5bff] text-white" : "bg-primary text-primary-foreground") : "opacity-50"
              )}
            >
              {unused ? "✓" : "—"}
            </span>
          </button>
          <button
            onClick={animate}
            className={cn(
              "mb-2 flex w-full items-center justify-center gap-1.5 py-1.5 font-bold",
              brutal ? "rounded-md border-2 border-[#111] bg-[#ffd23f]" : "rounded-lg bg-primary text-primary-foreground"
            )}
          >
            <Play className="h-3.5 w-3.5" strokeWidth={2.5} />
            {t("graph.animate")}
          </button>
          <p className="leading-snug opacity-70">{t("graph.treeLegend")}</p>
        </div>
      )}

      {sel && !panel && (
        <div className={cn(box, "absolute bottom-10 left-3 right-3 flex items-center gap-3 px-3 py-2.5")}>
          <span className={cn("h-3.5 w-3.5 shrink-0 rounded-[4px]", brutal && "border-[1.5px] border-[#111]")} style={{ background: sel.color }} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-extrabold">{sel.label}</div>
            <div className="truncate text-[11px] opacity-70">
              {[sel.kind === "cat" ? t("graph.kindCat") : t("graph.kindSub"), ...sel.path].join(" › ")} ·{" "}
              {t("entry.subCount", { n: kids })} · {t("graph.entries30", { n: sel.count })}
            </div>
          </div>
          <button
            className={cn(iconBtn, "shrink-0")}
            aria-label={t("graph.branch")}
            title={t("graph.branch")}
            onClick={() => setLocal({ id: sel.id, depth: local?.depth ?? 2 })}
          >
            <Waypoints className="h-4 w-4" strokeWidth={2.5} />
          </button>
          <button className={cn(iconBtn, "shrink-0")} aria-label={t("graph.open")} title={t("graph.open")} onClick={openSel}>
            <ExternalLink className="h-4 w-4" strokeWidth={2.5} />
          </button>
        </div>
      )}
    </div>
  );
}
