"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ExternalLink, Locate, Minus, Play, Plus, Settings2, Waypoints, X } from "lucide-react";
import type { MapGroup } from "@/components/structure/neural-map";
import { useMapGraph, type GNode } from "@/components/structure/graph-view";
import { useLiveQuery } from "dexie-react-hooks";
import { layoutCity, ROOT, type CityCard, type Pin } from "@/components/structure/city-layout";
import { db } from "@/lib/db";
import { usageSince } from "@/lib/usage";
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
 * Görünüm — gece şehri, neon brütal çipler. Harita temadan bağımsız hep gece:
 * izler ve kablolar karanlıkta ışıyor. Çip ölçüleri city-layout CHIPS'te.
 */
const NIGHT = "#07080f";
const BODY = "#11131b";
const LEG = "#8a90a0";
const LEG_DIM = "#4b5060";
/** Akışın hızı (px/sn) */
const FLOW_SPEED = 38;
/** İz kalınlığı: son 30 gündeki kullanım */
const traceW = (u: number) => 1.2 + 4.8 * u;

type Pt = [number, number];
type Trace = { from: string; to: string; pts: Pt[]; path: Path2D; vias: Pt[] };

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

/** Bir çoklu çizgiye d kadar paralel (sol normal yönünde, köşelerde gönye) */
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
  return out;
}

/** Halkaların kartın kenarından içeri uzaklığı (ilki) */
const RING0 = 3.4;

/**
 * Kartın içinde kenardan `dep` içeride dolanan halka: kenardaki kablo uçlarını
 * halkaya bağlayan kısa saplar + bütün uçları kapsayan en kısa yay (uçlar
 * arasındaki en büyük boşluk atlanıyor). Tek uç varsa kablo orada bitiyor.
 */
function ring(c: CityCard, ends: { p: Pt; d: Pt }[], dep: number): { path: Path2D; end: Pt | null } {
  const x0 = c.cx - c.w / 2 + dep;
  const x1 = c.cx + c.w / 2 - dep;
  const y0 = c.cy - c.h / 2 + dep;
  const y1 = c.cy + c.h / 2 - dep;
  const W = x1 - x0;
  const H = y1 - y0;
  const P = 2 * (W + H);
  const cl = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
  // çevre üzerindeki konum: sol üst köşeden saat yönünde
  const at = (s: number): Pt => {
    s = ((s % P) + P) % P;
    if (s <= W) return [x0 + s, y0];
    if ((s -= W) <= H) return [x1, y0 + s];
    if ((s -= H) <= W) return [x1 - s, y1];
    return [x0, y1 - (s - W)];
  };
  let d = "";
  const ss: number[] = [];
  let last: Pt | null = null;
  for (const { p, d: [dx, dy] } of ends) {
    const q: Pt =
      dy < 0 ? [cl(p[0], x0, x1), y0] : dx > 0 ? [x1, cl(p[1], y0, y1)] : dy > 0 ? [cl(p[0], x0, x1), y1] : [x0, cl(p[1], y0, y1)];
    const s = dy < 0 ? q[0] - x0 : dx > 0 ? W + q[1] - y0 : dy > 0 ? W + H + x1 - q[0] : 2 * W + H + y1 - q[1];
    d += `M${p[0]} ${p[1]}L${q[0]} ${q[1]}`;
    ss.push(s);
    last = q;
  }
  if (ss.length < 2) return { path: new Path2D(d), end: last };
  const o = ss.sort((a, b) => a - b);
  let gi = o.length - 1;
  let gmax = o[0] + P - o[o.length - 1];
  for (let i = 0; i < o.length - 1; i++)
    if (o[i + 1] - o[i] > gmax) {
      gmax = o[i + 1] - o[i];
      gi = i;
    }
  const start = o[(gi + 1) % o.length];
  const end = start + P - gmax;
  const a0 = at(start);
  d += `M${a0[0]} ${a0[1]}`;
  for (let lap = 0; lap < 2; lap++)
    for (const cs of [W, W + H, 2 * W + H, P]) {
      const v = cs + lap * P;
      if (v > start && v < end) d += `L${at(v).join(" ")}`;
    }
  d += `L${at(end).join(" ")}`;
  return { path: new Path2D(d), end: null };
}

/** Via: izin 45° kırıldığı her yerde (pahın ortası) */
const vias = (pts: Pt[]): Pt[] =>
  pts.slice(1).flatMap((q, i): Pt[] => {
    const p = pts[i];
    return Math.abs(q[0] - p[0]) > 0.5 && Math.abs(q[1] - p[1]) > 0.5 ? [[(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]] : [];
  });

const NO_USED = new Map<string, Set<string>>();

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
  const [flow, setFlow] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [local, setLocal] = useState(NO_LOCAL);
  const [reveal, setReveal] = useState<number | null>(null);

  // Son 30 günde hangi kalemde hangi özelliğe değer girildi — karttaki
  // özellik dairesi dolu ya da halka
  const rootOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of groups) for (const s of g.allSubs) if (s.isCategoryRoot) m.set(s.id, g.category.id);
    return m;
  }, [groups]);
  const featUsed =
    useLiveQuery(async () => {
      const subOf = new Map<string, string>();
      await db.entries
        .where("occurredAt")
        .aboveOrEqual(usageSince())
        .each((e) => subOf.set(e.id, rootOf.get(e.subcategoryId) ?? e.subcategoryId));
      const out = new Map<string, Set<string>>();
      if (!subOf.size) return out;
      await db.entryValues
        .where("entryId")
        .anyOf([...subOf.keys()])
        .each((v) => {
          if (!v.modId) return;
          const id = subOf.get(v.entryId)!;
          (out.get(id) ?? out.set(id, new Set()).get(id)!).add(v.modId);
        });
      return out;
    }, [rootOf]) ?? NO_USED;

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
    const traces: Trace[] = city.traces.map((t) => ({ from: t.from, to: t.to, pts: t.pts, path: toPath(t.pts), vias: vias(t.pts) }));

    // Kalemin yapıdaki özellikleri — kartta üst kenarda renkli bacak, altta
    // daire (son 30 günde değer girildiyse dolu, girilmediyse halka)
    const feats = new Map<string, { color: string; used: boolean }[]>();
    for (const l of data.links)
      if (l.feat && cards.has(l.s)) {
        const used = featUsed.get(l.s)?.has(l.t.slice(4)) ?? false;
        (feats.get(l.s) ?? feats.set(l.s, []).get(l.s)!).push({ color: data.byId.get(l.t)?.color ?? "#888", used });
      }
    for (const fl of feats.values()) fl.sort((a, b) => Number(b.used) - Number(a.used));

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
    // Kablo uçları kartın kenarında: kart başına özellik → [kenar noktası, dışa yön]
    const ends = new Map<string, Map<string, { p: Pt; d: Pt }[]>>();
    const addEnd = (card: string, f: string, p: Pt, d: Pt) => {
      const m = ends.get(card) ?? ends.set(card, new Map()).get(card)!;
      (m.get(f) ?? m.set(f, []).get(f)!).push({ p, d });
    };
    const cableList: { f: string; color: string; from: string; to: string; path: Path2D; pts: Pt[]; k: number }[] = [];
    for (const tr of city.traces) {
      const fl = onEdge.get(tr.from + ">" + tr.to);
      if (!fl) continue;
      const a = cards.get(tr.from)!;
      const b = cards.get(tr.to)!;
      const pinA = a.pins.find((p) => Math.hypot(p.p[0] - tr.pts[0][0], p.p[1] - tr.pts[0][1]) < 0.5);
      fl.sort((x, y) => rank.get(x)! - rank.get(y)!).forEach((f, k) => {
        const d = ((k >> 1) + 1) * CABLE_GAP * (k % 2 ? -1 : 1);
        const pts = offsetLine(tr.pts, d);
        cableList.push({ f, color: data.byId.get(f)?.color ?? "#888", from: tr.from, to: tr.to, path: toPath(pts), pts, k });
        if (pinA) addEnd(tr.from, f, pts[0], pinA.d);
        if (b.pad) addEnd(tr.to, f, pts[pts.length - 1], b.pad.d);
      });
    }
    // Kartın içinde, kenarına paralel halkalar: kablo kenardan girip halkada
    // kartın çevresini dolanıyor ve çıkacağı bacağın kablosuna bağlanıyor —
    // akım çipin kenarından geçiyormuş gibi. Her özelliğin kendi halkası var;
    // çok kalemde olan dışta.
    const rings: { f: string; color: string; card: string; path: Path2D; end: Pt | null }[] = [];
    for (const [id, m] of ends) {
      const c = cards.get(id)!;
      const fl = [...m.keys()].sort((x, y) => rank.get(x)! - rank.get(y)!);
      const room = Math.min(c.w, c.h) / 2 - (id === ROOT ? 13 : 7) - RING0;
      const gap = fl.length > 1 ? Math.min(CABLE_GAP, room / (fl.length - 1)) : 0;
      fl.forEach((f, k) => rings.push({ f, color: data.byId.get(f)?.color ?? "#888", card: id, ...ring(c, m.get(f)!, RING0 + k * gap) }));
    }
    // Akış: her izin kökten uzaklığı — ışık iz iz kesintisiz aksın
    const flow = new Map<Trace, { cum: number[]; len: number; d0: number }>();
    const dist = new Map<string, number>([[ROOT, 0]]);
    const byFrom = new Map<string, Trace[]>();
    for (const tr of traces) (byFrom.get(tr.from) ?? byFrom.set(tr.from, []).get(tr.from)!).push(tr);
    const stack = withRoot ? [ROOT] : [...roots];
    while (stack.length) {
      const id = stack.pop()!;
      const d0 = dist.get(id) ?? 0;
      for (const tr of byFrom.get(id) ?? []) {
        const cum = [0];
        for (let i = 1; i < tr.pts.length; i++)
          cum.push(cum[i - 1] + Math.hypot(tr.pts[i][0] - tr.pts[i - 1][0], tr.pts[i][1] - tr.pts[i - 1][1]));
        const len = cum[cum.length - 1];
        flow.set(tr, { cum, len, d0 });
        const kc = cards.get(tr.to)!;
        dist.set(tr.to, d0 + len + Math.min(kc.w, kc.h) / 2);
        stack.push(tr.to);
      }
    }
    // Kabloların akışı: her kablo kendi izinin kökten uzaklığıyla — ışık
    // izden kabloya kesintisiz geçsin; noktalar kablonun (özelliğin) renginde
    const trOf = new Map(traces.map((tr) => [tr.from + ">" + tr.to, tr]));
    const cableFlow = new Map<string, { pts: Pt[]; cum: number[]; len: number; d0: number; color: string; f: string; k: number }[]>();
    for (const cb of cableList) {
      const key = cb.from + ">" + cb.to;
      const g = flow.get(trOf.get(key)!);
      if (!g) continue;
      const cum = [0];
      for (let i = 1; i < cb.pts.length; i++)
        cum.push(cum[i - 1] + Math.hypot(cb.pts[i][0] - cb.pts[i - 1][0], cb.pts[i][1] - cb.pts[i - 1][1]));
      (cableFlow.get(key) ?? cableFlow.set(key, []).get(key)!).push({
        pts: cb.pts, cum, len: cum[cum.length - 1], d0: g.d0, color: cb.color, f: cb.f, k: cb.k,
      });
    }
    const { x0, y0, x1, y1 } = city.bounds;
    const center: Pt = withRoot ? [0, 0] : [(x0 + x1) / 2, (y0 + y1) / 2];
    return { cards, traces, parentOf, feats, featIds, cables: cableList, rings, flow, cableFlow, bounds: { x0, y0, x1, y1 }, center, withRoot, byId: data.byId };
  }, [data, unused, local, reveal, featUsed]);

  // ─── Çizim ────────────────────────────────────────────────────────────────
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cam = useRef({ x: 0, y: 0, k: 1 });
  const size = useRef({ w: 0, h: 0 });
  const dirty = useRef(true);
  const treeRef = useRef(tree);
  const live = useRef({ query, selected, hover: null as string | null, cables, flow });
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
    Object.assign(live.current, { query, selected, cables, flow });
    dirty.current = true;
  }, [query, selected, cables, flow]);
  // Dala geçince / dönünce baştan
  useEffect(() => {
    touched.current = false;
    home();
  }, [local]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const font = getComputedStyle(document.body).fontFamily;
    const motion = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;

    const draw = () => {
      const L = live.current;
      const T = treeRef.current;
      const { w, h } = size.current;
      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const { x: cx, y: cy, k } = cam.current;
      ctx.translate(w / 2, h / 2);
      ctx.scale(k, k);
      ctx.translate(-cx, -cy);

      // Gece zemini, silik şehir ızgarası, merkezde meydan ışığı
      const vx0 = cx - w / 2 / k;
      const vx1 = cx + w / 2 / k;
      const vy0 = cy - h / 2 / k;
      const vy1 = cy + h / 2 / k;
      ctx.fillStyle = NIGHT;
      ctx.fillRect(vx0, vy0, vx1 - vx0, vy1 - vy0);
      ctx.globalAlpha = 0.09;
      ctx.strokeStyle = "#5a6eaa";
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
      ctx.globalAlpha = 1;
      if (T.withRoot) {
        const g = ctx.createRadialGradient(0, 0, 10, 0, 0, 300);
        g.addColorStop(0, "rgba(255,200,80,0.16)");
        g.addColorStop(1, "rgba(255,200,80,0)");
        ctx.fillStyle = g;
        ctx.fillRect(-320, -320, 640, 640);
      }

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
      const dimTrace = (tr: Trace) => (focus ? !(lit.has(tr.from) && lit.has(tr.to)) : !match(tr.to));
      const usage = (id: string) => T.byId.get(id)?.usage ?? 0;

      // İzler: kategori renginde ışıyan bakır; kalınlık = son 30 gündeki
      // kullanım; 45° kırıldığı yerde via
      ctx.lineJoin = "miter";
      ctx.lineCap = "butt";
      ctx.miterLimit = 3;
      for (const tr of T.traces) {
        const col = T.byId.get(tr.to)?.color ?? "#888";
        const a = dimTrace(tr) ? 0.16 : 1;
        const tw = traceW(usage(tr.to));
        ctx.strokeStyle = col;
        ctx.globalAlpha = a * 0.18;
        ctx.lineWidth = tw + 7;
        ctx.stroke(tr.path);
        ctx.globalAlpha = a;
        const body = mixHex(col, NIGHT, 0.65);
        ctx.strokeStyle = body;
        ctx.lineWidth = tw;
        ctx.stroke(tr.path);
        ctx.strokeStyle = mixHex(col, "#ffffff", 0.5);
        ctx.lineWidth = Math.max(0.6, tw * 0.28);
        ctx.stroke(tr.path);
        const r = Math.max(2.2, tw * 0.75);
        for (const [vx, vy] of tr.vias) {
          ctx.fillStyle = body;
          ctx.beginPath();
          ctx.arc(vx, vy, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = NIGHT;
          ctx.beginPath();
          ctx.arc(vx, vy, r * 0.42, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Özellik kabloları — yumuşak hale + ince parlak tel. Odaktaki kalemin
      // özellikleri varsa o özelliklerin hatları bütün haritada parlıyor.
      const fset = focus ? new Set(T.featIds.get(focus) ?? []) : null;
      const cableOn = (f: string, a: string, b: string) =>
        !focus ? !q : fset!.size ? fset!.has(f) : lit.has(a) && lit.has(b);
      const wire = (path: Path2D, color: string, o: boolean, halo: number) => {
        if (!o && focus) return;
        if (o) {
          ctx.globalAlpha = focus ? 0.5 : 0.22;
          ctx.strokeStyle = color;
          ctx.lineWidth = halo;
          ctx.stroke(path);
        }
        ctx.globalAlpha = o ? (focus ? 1 : 0.75) : 0.08;
        ctx.strokeStyle = mixHex(color, "#ffffff", 0.55);
        ctx.lineWidth = focus && fset!.size ? 1.4 : 0.9;
        ctx.stroke(path);
      };
      ctx.globalCompositeOperation = "lighter";
      if (L.cables) for (const cb of T.cables) wire(cb.path, cb.color, cableOn(cb.f, cb.from, cb.to), 3.2);

      // Akış: ışık merkezden dışa akıyor; yol ne kadar kullanılıyorsa o kadar
      // sık. Kablolar açıkken noktalar kabloların üstünde, her biri kendi
      // özelliğinin renginde; kablosuz yolda izin üstünde kalemin renginde.
      if (L.flow && motion) {
        const now = performance.now() / 1000;
        const dots = (pts: Pt[], cum: number[], len: number, d0: number, gap: number, r: number, color: string) => {
          ctx.fillStyle = color;
          let i = 1;
          for (let d = (((now * FLOW_SPEED - d0) % gap) + gap) % gap; d < len; d += gap) {
            while (i < cum.length - 1 && cum[i] < d) i++;
            const f = (d - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
            const [ax, ay] = pts[i - 1];
            const [bx, by] = pts[i];
            const px = ax + (bx - ax) * f;
            const py = ay + (by - ay) * f;
            ctx.globalAlpha = 0.14;
            ctx.beginPath();
            ctx.arc(px, py, r * 2.2, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 0.85;
            ctx.beginPath();
            ctx.arc(px, py, r, 0, Math.PI * 2);
            ctx.fill();
          }
        };
        for (const tr of T.traces) {
          const u = usage(tr.to);
          const g = T.flow.get(tr);
          if (u < 0.05 || !g || dimTrace(tr)) continue;
          const gap = 170 - 110 * u;
          const cbs = L.cables ? T.cableFlow.get(tr.from + ">" + tr.to) : undefined;
          if (cbs?.length) {
            // Kablolar ince — noktalar da ince; yan yana kablolar aynı anda
            // değil, birbirinin arasından aksın
            // Parlak tel üstünde "lighter" rengi beyaza yakıyor — nokta
            // kendi renginde düz boyanır
            ctx.globalCompositeOperation = "source-over";
            for (const cb of cbs) {
              if (!cableOn(cb.f, tr.from, tr.to)) continue;
              dots(cb.pts, cb.cum, cb.len, cb.d0 + (cb.k * gap) / (cbs.length + 1), gap, 1.7, cb.color);
            }
            ctx.globalCompositeOperation = "lighter";
            continue;
          }
          dots(tr.pts, g.cum, g.len, g.d0, gap, 1.4 + traceW(u) * 0.35, mixHex(T.byId.get(tr.to)?.color ?? "#888", "#ffffff", 0.45));
        }
      }
      ctx.globalCompositeOperation = "source-over";

      // Kartlar — neon brütal çip: koyu gövde, kategori renginde kalın çerçeve
      // ve sert gölge, iki uzun kenarında bacaklar (üsttekilerin ilkleri özellik
      // renginde), yanda kullanım ışığı, altta özellik daireleri
      ctx.textBaseline = "middle";
      for (const c of T.cards.values()) {
        const x = c.cx - c.w / 2;
        const top = c.cy - c.h / 2;
        const A = dimCard(c.id) ? 0.22 : 1;
        ctx.globalAlpha = A;
        if (c.id === ROOT) {
          ctx.fillStyle = "#ffd23f";
          ctx.fillRect(x + 5, top + 5, c.w, c.h);
          for (const pin of c.pins) lug(ctx, pin, 5, 3);
          ctx.fillStyle = "#101010";
          ctx.fillRect(x, top, c.w, c.h);
          ctx.strokeStyle = "#ffd23f";
          ctx.lineWidth = 2.5;
          ctx.strokeRect(x, top, c.w, c.h);
          ctx.shadowColor = "#ffb800";
          ctx.shadowBlur = 14;
          ctx.fillStyle = "#ffe08a";
          ctx.font = `900 18px ${font}`;
          ctx.textAlign = "center";
          ctx.fillText("ROUTINE", c.cx, c.cy + 1);
          ctx.shadowBlur = 0;
          continue;
        }
        const n = T.byId.get(c.id) as GNode;
        const big = c.level === 0;
        const u = n.usage;
        const sel = c.id === L.selected;
        const fl = T.feats.get(c.id) ?? [];
        ctx.fillStyle = mixHex(n.color, "#000000", 0.65);
        ctx.fillRect(x + 4, top + 4, c.w, c.h);
        // gerçek bacaklar ve giriş padı
        ctx.fillStyle = LEG;
        for (const pin of c.pins) lug(ctx, pin, 5, 3);
        if (c.pad) lug(ctx, c.pad, 5, 5);
        // süs bacaklar — gerçek bacağın olduğu yer boş kalıyor
        const busy = (dy: number, px: number) =>
          [...c.pins, c.pad].some((p) => p && p.d[1] === dy && Math.abs(p.p[0] - px) < 5);
        let fi = 0;
        for (let px = x + 8; px < x + c.w - 6; px += 7) {
          if (!busy(-1, px + 1.5)) {
            const f = fl[fi];
            if (f) fi++;
            ctx.fillStyle = f ? f.color : LEG_DIM;
            ctx.fillRect(px, top - 3, 3, 3);
          }
          if (!busy(1, px + 1.5)) {
            ctx.fillStyle = LEG_DIM;
            ctx.fillRect(px, top + c.h, 3, 3);
          }
        }
        ctx.fillStyle = big ? mixHex(n.color, BODY, 0.28) : BODY;
        ctx.fillRect(x, top, c.w, c.h);
        ctx.strokeStyle = sel ? "#ffffff" : n.color;
        ctx.lineWidth = sel ? 3 : big ? 2.5 : 1.8;
        ctx.strokeRect(x, top, c.w, c.h);
        // kullanım ışığı: beş dilim, son 30 gün
        const lx = c.sx > 0 ? x + c.w - 8 : x + 4;
        const sh = (c.h - 10) / 5;
        const on = Math.ceil(u * 5);
        for (let i = 0; i < 5; i++) {
          ctx.fillStyle = i < on ? mixHex(n.color, "#ffffff", 0.65) : "#262a36";
          ctx.fillRect(lx, top + c.h - 5 - (i + 1) * sh + 1, 4, sh - 1.5);
        }
        // ad — iç kenardan başlıyor
        const tx = c.sx > 0 ? x + 8 : x + c.w - 8;
        ctx.textAlign = c.sx > 0 ? "left" : "right";
        ctx.font = `${big ? 850 : c.level === 1 ? 700 : 650} ${big ? 13 : c.level === 1 ? 11 : 10}px ${font}`;
        const maxW = c.w - 22;
        let s = n.label;
        if (ctx.measureText(s).width > maxW) {
          while (s.length > 1 && ctx.measureText(s + "…").width > maxW) s = s.slice(0, -1);
          s += "…";
        }
        ctx.fillStyle = big ? mixHex(n.color, "#ffffff", 0.3) : "#eef0f6";
        ctx.globalAlpha = A * (big || u > 0.12 ? 1 : 0.6);
        ctx.fillText(s, tx, big ? top + 16 : c.cy - (fl.length ? 4 : 0));
        ctx.globalAlpha = A;
        // özellik daireleri: dolu = son 30 günde değer girilmiş, halka = bağlı ama boş
        fl.slice(0, 7).forEach((f, i) => {
          ctx.beginPath();
          ctx.arc(c.sx > 0 ? tx + 3 + i * 9 : tx - 3 - i * 9, top + c.h - 7, 3, 0, Math.PI * 2);
          if (f.used) {
            ctx.fillStyle = f.color;
            ctx.fill();
          } else {
            ctx.strokeStyle = f.color;
            ctx.lineWidth = 1.2;
            ctx.stroke();
          }
        });
      }

      // Kablo kartın kenarından devam ediyor: girdiği yerden kartın içindeki
      // halkasına geçip çıkacağı bacağa kadar kenar boyunca dolanıyor
      if (L.cables) {
        ctx.globalCompositeOperation = "lighter";
        for (const r of T.rings) {
          const o = !focus ? !q : fset!.size ? fset!.has(r.f) : lit.has(r.card);
          wire(r.path, r.color, o, 2.4);
          if (r.end && o) {
            ctx.fillStyle = mixHex(r.color, "#ffffff", 0.55);
            ctx.beginPath();
            ctx.arc(r.end[0], r.end[1], 1.5, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.globalCompositeOperation = "source-over";
      }
      ctx.globalAlpha = 1;
    };

    const loop = () => {
      if (dirty.current || (live.current.flow && motion && !document.hidden)) {
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
          <button onClick={() => setFlow(!flow)} className="mb-2 flex w-full items-center justify-between py-1 font-semibold">
            {t("graph.flow")}
            <span
              className={cn(
                "rounded px-1.5 py-0.5 text-[10px] font-black",
                flow ? (brutal ? "bg-[#3a5bff] text-white" : "bg-primary text-primary-foreground") : "opacity-50"
              )}
            >
              {flow ? "✓" : "—"}
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
