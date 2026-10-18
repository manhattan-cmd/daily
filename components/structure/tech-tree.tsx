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

/**
 * Kademe başına çip görünümü (ölçüler city-layout CHIPS'te): kategori büyük ve
 * kendi renginde dolu, alt kategori orta boy renk şeritli, alt kalemler küçük ve
 * sade. Dolgu [taban, kullanım payı]: son 30 günde kullanıldıkça koyulaşıyor.
 */
const CHIP_STYLE = [
  { radius: 7, shadow: 3.5, border: 2.2, fill: [0.7, 0.3], fillDark: [0.45, 0.3], strip: 0, dot: 2.2, text: 12, weight: 800, size: 13 },
  { radius: 5, shadow: 2.5, border: 1.8, fill: [0.2, 0.6], fillDark: [0.14, 0.26], strip: 5, dot: 0, text: 13, weight: 750, size: 11 },
  { radius: 4, shadow: 1.8, border: 1.4, fill: [0.1, 0.5], fillDark: [0.08, 0.2], strip: 3, dot: 0, text: 11, weight: 650, size: 10 },
];

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

/** Özellik kablolarının izden uzaklık adımı */
const CABLE_GAP = 1.7;

/**
 * Bir çoklu çizgiye d kadar paralel (sol normal yönünde, köşelerde gönye).
 * Uçlar kartın altına doğru biraz uzuyor — kablo kartın içinden geçiyormuş gibi.
 */
function offsetLine(raw: Pt[], d: number): Pt[] {
  const pts = raw.filter((q, i) => !i || Math.hypot(q[0] - raw[i - 1][0], q[1] - raw[i - 1][1]) > 0.01);
  if (pts.length < 2) return pts;
  const n = pts.slice(1).map((q, i): Pt => {
    const dx = q[0] - pts[i][0];
    const dy = q[1] - pts[i][1];
    const l = Math.hypot(dx, dy);
    return [-dy / l, dx / l];
  });
  const out: Pt[] = pts.map((q, i) => {
    if (i === 0) return [q[0] + d * n[0][0], q[1] + d * n[0][1]];
    if (i === pts.length - 1) return [q[0] + d * n[i - 1][0], q[1] + d * n[i - 1][1]];
    const mx = n[i - 1][0] + n[i][0];
    const my = n[i - 1][1] + n[i][1];
    const ml = Math.hypot(mx, my) || 1;
    const k = d / ((mx / ml) * n[i][0] + (my / ml) * n[i][1]);
    return [q[0] + (mx / ml) * k, q[1] + (my / ml) * k];
  });
  const ext = (a: Pt, b: Pt): Pt => {
    const l = Math.hypot(a[0] - b[0], a[1] - b[1]) || 1;
    return [a[0] + ((a[0] - b[0]) / l) * 4, a[1] + ((a[1] - b[1]) / l) * 4];
  };
  out[0] = ext(out[0], out[1]);
  out[out.length - 1] = ext(out[out.length - 1], out[out.length - 2]);
  return out;
}

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
  const [cables, setCables] = useState(true);
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

    // Kalemin yapıdaki özellikleri — kartta küçük daireler
    const feats = new Map<string, string[]>();
    for (const l of data.links)
      if (l.feat && cards.has(l.s)) (feats.get(l.s) ?? feats.set(l.s, []).get(l.s)!).push(data.byId.get(l.t)?.color ?? "#888");

    // Özellik hatları: merkezden, kendi özelliği olan her kaleme o özelliğin
    // renginde ince bir kablo — ağacın izlerinin yanında, onlara paralel. Aynı
    // özelliği taşıyan kalemlerin hatları ortak yolda ve merkezde buluşuyor.
    const holders = new Map<string, string[]>();
    const featIds = new Map<string, string[]>();
    for (const l of data.links)
      if (l.feat && cards.has(l.s)) {
        (holders.get(l.t) ?? holders.set(l.t, []).get(l.t)!).push(l.s);
        (featIds.get(l.s) ?? featIds.set(l.s, []).get(l.s)!).push(l.t);
      }
    // her izde kablolar hep aynı sırada: çok kalemde olan özellik ize en yakın
    const rank = new Map(
      [...holders.keys()]
        .sort((a, b) => holders.get(b)!.length - holders.get(a)!.length || a.localeCompare(b))
        .map((f, i) => [f, i])
    );
    const onEdge = new Map<string, string[]>();
    for (const [f, hs] of holders)
      for (const h of hs)
        for (let c = h; ; ) {
          const p = parentOf.get(c);
          const par = p && cards.has(p) ? p : !p && withRoot ? ROOT : null;
          if (!par) break;
          const key = par + ">" + c;
          const list = onEdge.get(key) ?? onEdge.set(key, []).get(key)!;
          if (list.includes(f)) break; // yolun gerisi zaten işaretli
          list.push(f);
          if (par === ROOT) break;
          c = par;
        }
    const cableList: { f: string; color: string; from: string; to: string; path: Path2D }[] = [];
    for (const tr of city.traces) {
      const fl = onEdge.get(tr.from + ">" + tr.to);
      if (!fl) continue;
      fl.sort((a, b) => rank.get(a)! - rank.get(b)!).forEach((f, k) => {
        const d = ((k >> 1) + 1) * CABLE_GAP * (k % 2 ? -1 : 1);
        cableList.push({ f, color: data.byId.get(f)?.color ?? "#888", from: tr.from, to: tr.to, path: toPath(offsetLine(tr.pts, d)) });
      });
    }
    const { x0, y0, x1, y1 } = city.bounds;
    const center: Pt = withRoot ? [0, 0] : [(x0 + x1) / 2, (y0 + y1) / 2];
    return { cards, traces, parentOf, feats, featIds, cables: cableList, bounds: { x0, y0, x1, y1 }, center, withRoot, byId: data.byId };
  }, [data, unused, local, reveal]);

  // ─── Çizim ────────────────────────────────────────────────────────────────
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cam = useRef({ x: 0, y: 0, k: 1 });
  const size = useRef({ w: 0, h: 0 });
  const dirty = useRef(true);
  const treeRef = useRef(tree);
  const live = useRef({ query, selected, hover: null as string | null, brutal, cables });
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
    Object.assign(live.current, { query, selected, brutal, cables });
    dirty.current = true;
  }, [query, selected, brutal, cables]);
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

      // Özellik kabloları — önce yumuşak bir hale, üstüne ince parlak tel. Odaktaki
      // kalemin özellikleri varsa o özelliklerin hatları bütün haritada parlıyor.
      if (L.cables && T.cables.length) {
        const fset = focus ? new Set(T.featIds.get(focus) ?? []) : null;
        const on = (cb: (typeof T.cables)[number]) =>
          !focus ? !q : fset!.size ? fset!.has(cb.f) : lit.has(cb.from) && lit.has(cb.to);
        for (const pass of [0, 1])
          for (const cb of T.cables) {
            const o = on(cb);
            ctx.strokeStyle = pass ? (B ? cb.color : mixHex(cb.color, "#ffffff", 0.75)) : cb.color;
            ctx.globalAlpha = pass ? (o ? 1 : 0.1) : o ? (B ? 0.22 : 0.35) : 0;
            ctx.lineWidth = pass ? (fset?.size && o ? 1.5 : 1) : 3.4;
            if (ctx.globalAlpha > 0) ctx.stroke(cb.path);
          }
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
          ctx.font = `900 16px ${font}`;
          ctx.textAlign = "center";
          ctx.fillText("ROUTINE", c.cx, c.cy);
          continue;
        }
        // bacaklar (dış kenar) ve pad (iç kenar)
        for (const pin of c.pins) lug(ctx, pin, 5, 3);
        if (c.pad) lug(ctx, c.pad, 5, 5);
        const n = T.byId.get(c.id) as GNode;
        const S = CHIP_STYLE[Math.min(c.level, CHIP_STYLE.length - 1)];
        const u = n.usage;
        const sel = c.id === L.selected;
        const r = S.radius;
        if (B) {
          ctx.fillStyle = "#111";
          ctx.beginPath();
          ctx.roundRect(x + S.shadow, top + S.shadow, c.w, c.h, r);
          ctx.fill();
        }
        ctx.fillStyle = mixHex(n.color, B ? "#ffffff" : C.bg, B ? S.fill[0] + S.fill[1] * u : S.fillDark[0] + S.fillDark[1] * u);
        ctx.beginPath();
        ctx.roundRect(x, top, c.w, c.h, r);
        ctx.fill();
        ctx.lineWidth = sel ? S.border + 0.8 : B ? S.border : S.border * 0.6;
        ctx.strokeStyle = sel ? (B ? "#111" : C.accent) : B ? "#111" : mixHex(n.color, C.bg, 0.35 + 0.5 * u);
        ctx.stroke();
        // iç kenarda renk şeridi — kullanım kadar dolu (kategori zaten renkli)
        if (S.strip) {
          ctx.globalAlpha = (dim ? 0.25 : 1) * (0.35 + 0.65 * u);
          ctx.fillStyle = n.color;
          ctx.beginPath();
          ctx.roundRect(c.sx > 0 ? x + 3 : x + c.w - 3 - S.strip, top + 3, S.strip, c.h - 6, 2);
          ctx.fill();
          ctx.globalAlpha = dim ? 0.25 : 1;
        }
        // birinci bacak işareti — çipin iç üst köşesinde küçük daire
        if (S.dot) {
          ctx.fillStyle = C.fg;
          ctx.globalAlpha = (dim ? 0.25 : 1) * 0.45;
          ctx.beginPath();
          ctx.arc(c.sx > 0 ? x + S.text - 1 : x + c.w - S.text + 1, top + 7, S.dot, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = dim ? 0.25 : 1;
        }
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
        // ad — şeritten sonra başlıyor
        ctx.fillStyle = C.fg;
        ctx.font = `${S.weight} ${S.size}px ${font}`;
        ctx.textAlign = c.sx > 0 ? "left" : "right";
        const maxW = c.w - S.text - 8 - fs.length * 9;
        let s = n.label;
        if (ctx.measureText(s).width > maxW) {
          while (s.length > 1 && ctx.measureText(s + "…").width > maxW) s = s.slice(0, -1);
          s += "…";
        }
        ctx.globalAlpha = (dim ? 0.25 : 1) * (c.level === 0 || u > 0.12 ? 1 : 0.6);
        ctx.fillText(s, c.sx > 0 ? x + S.text : x + c.w - S.text, c.cy + (fs.length && c.h < 34 ? 2 : 0));
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
          <button onClick={() => setCables(!cables)} className="mb-2 flex w-full items-center justify-between py-1 font-semibold">
            {t("graph.featLines")}
            <span
              className={cn(
                "rounded px-1.5 py-0.5 text-[10px] font-black",
                cables ? (brutal ? "bg-[#3a5bff] text-white" : "bg-primary text-primary-foreground") : "opacity-50"
              )}
            >
              {cables ? "✓" : "—"}
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
