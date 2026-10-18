"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ExternalLink, Locate, Minus, Play, Plus, Settings2, Waypoints, X } from "lucide-react";
import type { MapGroup } from "@/components/structure/neural-map";
import { useMapGraph, type GNode } from "@/components/structure/graph-view";
import { useT } from "@/lib/i18n";
import { routes } from "@/lib/routes";
import { useSkin } from "@/lib/skin";
import { cn } from "@/lib/utils";

/**
 * Harita — oyunlardaki teknoloji ağacı gibi, çizgileri devre kartı gibi.
 *
 * Teknoloji ağacının mantığı: soldan sağa kademeler. En solda ROUTINE, sonra
 * kategoriler, sonra alt kategoriler, sonra onların alt kalemleri — her kuşak
 * bir sütun (oyunlardaki "çağ" sütunları gibi, başlıklı ve hafif şeritli).
 * Her yaprak bir satır, üst kalem çocuklarının ortasında; ağaç aşağı ve sağa
 * uzuyor, parmakla geziliyor.
 *
 * Devre kartının mantığı: bağlar yalnız yatay, dikey ve 45°. Her bağ üst
 * kalemin sağ kenarındaki kendi bacağından çıkıyor, çocuğun sol kenarındaki
 * pad'e oturuyor. İzler iç içe şeritlerde ilerliyor, birbirini kesmiyor.
 * Kullanılan kalemin izi koyu ve kalın, kullanılmayanın ince ve soluk.
 *
 * Bir kaleme dokununca onun kökten gelen yolu ve çocukları yanıyor (oyunlarda
 * bir teknolojinin önkoşul zinciri gibi), gerisi soluyor.
 */

const M = 16;
const TOP = 52;
const ROOT_W = 86;
const CW = 116;
const GAP = 52;
const ROW = 40;
const CAT_GAP = 18;
const PIN = 6;
const CHAMF = 6;
const MIN_K = 0.25;
const MAX_K = 3;
const NO_LOCAL = null as { id: string; depth: number } | null;
const ROOT = "__root";

type Card = { id: string; x: number; y: number; w: number; h: number; d: number; kids: string[]; pins: number[] };

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

/**
 * Bir gövdenin sağ kenarındaki bacaklardan çocuklarının pad'ine izler —
 * yatay, 45°, dikey, 45°, yatay. Şeritler iç içe: yukarı gidenlerde en
 * üstteki, aşağı gidenlerde en alttaki gövdeye en yakın; hiçbiri kesişmiyor.
 */
function fanOut(px: number, ends: { py: number; cy: number }[], inner: number): string[] {
  const gap = inner - px;
  const lane = ends.map(() => 0);
  const idx = ends.map((_, i) => i);
  const up = idx.filter((i) => ends[i].cy < ends[i].py - 2 * CHAMF);
  const down = idx.filter((i) => ends[i].cy > ends[i].py + 2 * CHAMF).reverse();
  for (const g of [up, down]) {
    const step = g.length > 1 ? Math.min(5, (gap - 2 * CHAMF - 12) / (g.length - 1)) : 0;
    g.forEach((i, k) => (lane[i] = CHAMF + 4 + k * step));
  }
  return ends.map(({ py, cy }, i) => {
    if (!lane[i]) return `M${px} ${py}H${px + 10}L${inner - 10} ${cy}H${inner}`;
    const lx = px + lane[i];
    const sy = Math.sign(cy - py);
    return `M${px} ${py}H${lx - CHAMF}L${lx} ${py + sy * CHAMF}V${cy - sy * CHAMF}L${lx + CHAMF} ${cy}H${inner}`;
  });
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

  // ─── Ağaç: görünen kalemler ve yerleşim ───────────────────────────────────
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

    const cards = new Map<string, Card>();
    const withRoot = !local;
    const colX = (d: number) => (withRoot ? M + ROOT_W + GAP + d * (CW + GAP) : M + d * (CW + GAP));
    let cursor = TOP;
    let maxD = 0;
    const place = (id: string, d: number): number => {
      const n = data.byId.get(id)!;
      const kids = (kidsOf.get(id) ?? []).filter((k) => ok.has(k));
      maxD = Math.max(maxD, d);
      let y: number;
      if (!kids.length) {
        y = cursor + ROW / 2;
        cursor += ROW;
      } else {
        const ys = kids.map((k) => place(k, d + 1));
        y = (ys[0] + ys[ys.length - 1]) / 2;
      }
      const base = n.kind === "cat" ? 34 : 28;
      const h = Math.max(base, 12 + (kids.length - 1) * PIN);
      const pins = kids.map((_, i) => y + (i - (kids.length - 1) / 2) * PIN);
      cards.set(id, { id, x: colX(d), y, w: CW, h, d, kids, pins });
      return y;
    };
    const rootYs: number[] = [];
    roots.forEach((r, i) => {
      if (i) cursor += CAT_GAP;
      rootYs.push(place(r, 0));
    });
    if (withRoot && roots.length) {
      // Kök ağacın başında (ilk kategorinin hizasında) — açılışta görünsün
      const h = Math.max(44, 12 + (roots.length - 1) * PIN);
      const y = Math.max(rootYs[0], TOP + h / 2);
      cards.set(ROOT, {
        id: ROOT,
        x: M,
        y,
        w: ROOT_W,
        h,
        d: -1,
        kids: roots,
        pins: roots.map((_, i) => y + (i - (roots.length - 1) / 2) * PIN),
      });
    }
    // İzler
    const traces: { from: string; to: string; path: Path2D }[] = [];
    for (const c of cards.values()) {
      if (!c.kids.length) continue;
      const ends = c.kids.map((k, i) => ({ py: c.pins[i], cy: cards.get(k)!.y }));
      const inner = cards.get(c.kids[0])!.x;
      fanOut(c.x + c.w, ends, inner).forEach((d, i) => traces.push({ from: c.id, to: c.kids[i], path: new Path2D(d) }));
    }
    // Kalemin kendi (miras olmayan) özellikleri — kartta küçük daireler
    const feats = new Map<string, string[]>();
    for (const l of data.links)
      if (l.feat && cards.has(l.s)) (feats.get(l.s) ?? feats.set(l.s, []).get(l.s)!).push(data.byId.get(l.t)?.color ?? "#888");
    const width = colX(maxD) + CW + M;
    const height = cursor + 70;
    const cols = Array.from({ length: maxD + 1 }, (_, d) => colX(d));
    return { cards, traces, parentOf, feats, width, height, cols, withRoot, byId: data.byId };
  }, [data, unused, local, reveal]);

  // ─── Çizim ────────────────────────────────────────────────────────────────
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cam = useRef({ x: 0, y: 0, k: 1 });
  const size = useRef({ w: 0, h: 0 });
  const dirty = useRef(true);
  const treeRef = useRef(tree);
  const live = useRef({ query, selected, hover: null as string | null, brutal });

  /** Açılış görünümü: sol üst köşe, genişliğe göre ölçek */
  const home = () => {
    const { w, h } = size.current;
    if (!w) return;
    const T = treeRef.current;
    const k = Math.max(0.6, Math.min(1, w / T.width));
    cam.current = { k, x: (w / 2) / k, y: (h / 2) / k };
    dirty.current = true;
  };
  const touched = useRef(false);

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

      // Yanan zincir: odaktaki kalem, kökten ona gelen yol, çocukları
      const focus = L.hover ?? L.selected;
      const lit = new Set<string>();
      if (focus && T.cards.has(focus)) {
        for (let p: string | undefined = focus; p; p = T.parentOf.get(p)) lit.add(p);
        if (T.withRoot) lit.add(ROOT);
        for (const kd of T.cards.get(focus)!.kids) lit.add(kd);
      }
      const q = L.query.trim().toLocaleLowerCase("tr");
      const match = (id: string) =>
        !q || (T.byId.get(id)?.label ?? "").toLocaleLowerCase("tr").includes(q);
      const dimCard = (id: string) => (focus ? !lit.has(id) : !match(id));

      // Kuşak sütunları — hafif şeritler ve başlıklar
      const heads = [t("graph.colCat"), t("graph.colSub"), t("graph.colSub2"), t("graph.colSub3")];
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      T.cols.forEach((x, d) => {
        ctx.globalAlpha = d % 2 ? 0.035 : 0.06;
        ctx.fillStyle = C.fg;
        ctx.fillRect(x - GAP / 2, 0, CW + GAP, T.height);
        ctx.globalAlpha = 0.5;
        ctx.font = `800 9px ${font}`;
        ctx.fillText((heads[d] ?? `${t("graph.colSub3")} ${d - 2}`).toLocaleUpperCase("tr"), x, 24);
      });

      // İzler
      const usageOf = (id: string) => T.byId.get(id)?.usage ?? 1;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      for (const tr of T.traces) {
        const u = tr.to === ROOT ? 1 : usageOf(tr.to);
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
        const top = c.y - c.h / 2;
        const dim = dimCard(c.id);
        ctx.globalAlpha = dim ? 0.25 : 1;
        // bacaklar (sağ kenar) ve pad (sol kenar)
        ctx.fillStyle = C.fg;
        for (const py of c.pins) ctx.fillRect(c.x + c.w - 1, py - 1.5, 5, 3);
        if (c.id !== ROOT) ctx.fillRect(c.x - 4, c.y - 2.5, 5, 5);
        if (c.id === ROOT) {
          if (B) {
            ctx.fillStyle = "#111";
            ctx.beginPath();
            ctx.roundRect(c.x + 3, top + 3, c.w, c.h, 6);
            ctx.fill();
          }
          ctx.fillStyle = B ? "#111" : C.accent;
          ctx.beginPath();
          ctx.roundRect(c.x, top, c.w, c.h, 6);
          ctx.fill();
          ctx.fillStyle = B ? "#ffd23f" : "#fff";
          ctx.font = `900 12px ${font}`;
          ctx.textAlign = "center";
          ctx.fillText("ROUTINE", c.x + c.w / 2, c.y);
          continue;
        }
        const n = T.byId.get(c.id) as GNode;
        const cat = n.kind === "cat";
        const u = n.usage;
        const sel = c.id === L.selected;
        if (B) {
          ctx.fillStyle = "#111";
          ctx.beginPath();
          ctx.roundRect(c.x + 2.5, top + 2.5, c.w, c.h, 5);
          ctx.fill();
        }
        ctx.fillStyle = B
          ? mixHex(n.color, "#ffffff", cat ? 0.35 + 0.65 * u : 0.15 + 0.6 * u)
          : mixHex(n.color, C.bg, cat ? 0.3 + 0.25 * u : 0.12 + 0.22 * u);
        ctx.beginPath();
        ctx.roundRect(c.x, top, c.w, c.h, 5);
        ctx.fill();
        ctx.lineWidth = sel ? 2.4 : B ? 1.8 : 1;
        ctx.strokeStyle = sel ? (B ? "#111" : C.accent) : B ? "#111" : mixHex(n.color, C.bg, 0.35 + 0.5 * u);
        ctx.stroke();
        // sol renk şeridi — kullanım kadar dolu
        ctx.globalAlpha = (dim ? 0.25 : 1) * (0.35 + 0.65 * u);
        ctx.fillStyle = n.color;
        ctx.beginPath();
        ctx.roundRect(c.x + 3, top + 3, 4, c.h - 6, 2);
        ctx.fill();
        ctx.globalAlpha = dim ? 0.25 : 1;
        // özellik daireleri
        const fs = (T.feats.get(c.id) ?? []).slice(0, 3);
        fs.forEach((col, i) => {
          ctx.fillStyle = col;
          ctx.beginPath();
          ctx.arc(c.x + c.w - 8 - i * 9, top + 8, 3, 0, Math.PI * 2);
          ctx.fill();
          if (B) {
            ctx.lineWidth = 1;
            ctx.strokeStyle = "#111";
            ctx.stroke();
          }
        });
        // ad
        ctx.fillStyle = C.fg;
        ctx.font = `${cat ? 800 : 650} ${cat ? 12 : 10.5}px ${font}`;
        ctx.textAlign = "left";
        const maxW = c.w - 16 - fs.length * 9;
        let s = n.label;
        if (ctx.measureText(s).width > maxW) {
          while (s.length > 1 && ctx.measureText(s + "…").width > maxW) s = s.slice(0, -1);
          s += "…";
        }
        ctx.globalAlpha = (dim ? 0.25 : 1) * (cat || u > 0.12 ? 1 : 0.6);
        ctx.fillText(s, c.x + 12, c.y + (fs.length && c.h < 32 ? 2 : 0));
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      if (c.id !== ROOT && p.x >= c.x - 4 && p.x <= c.x + c.w + 4 && Math.abs(p.y - c.y) <= c.h / 2 + 4) return c.id;
    return null;
  };
  /** Ağaç pencereden kaçmasın */
  const clamp = () => {
    const { w, h } = size.current;
    const c = cam.current;
    const T = treeRef.current;
    const hw = w / 2 / c.k;
    const hh = h / 2 / c.k;
    // Ağaç pencereden darsa ortada, genişse kenarından en çok 40px taşar
    const lim = (v: number, lo: number, hi: number) => (lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v)));
    c.x = lim(c.x, hw - 40, T.width - hw + 40);
    c.y = lim(c.y, hh - 40, T.height - hh + 40);
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
    // Tekerlek kaydırır (ağaç uzun), ctrl + tekerlek / trackpad sıkıştırma yakınlaştırır
    if (e.ctrlKey) {
      cam.current.k = Math.max(MIN_K, Math.min(MAX_K, cam.current.k * Math.exp(-e.deltaY * 0.0015)));
      const after = toWorld(p.x, p.y);
      cam.current.x += before.x - after.x;
      cam.current.y += before.y - after.y;
    } else {
      cam.current.x += e.deltaX / cam.current.k;
      cam.current.y += e.deltaY / cam.current.k;
    }
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
        <div className="absolute left-3 top-9 flex items-center gap-2">
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
            <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-black", unused ? (brutal ? "bg-[#3a5bff] text-white" : "bg-primary text-primary-foreground") : "opacity-50")}>
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
