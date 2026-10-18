"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import {
  ArrowLeft,
  ExternalLink,
  Locate,
  Minus,
  Play,
  Plus,
  RotateCcw,
  Settings2,
  Waypoints,
  X,
} from "lucide-react";
import { db } from "@/lib/db";
import { getEntryCountsBySubcategory } from "@/lib/db/queries";
import type { MapGroup } from "@/components/structure/neural-map";
import { usageIntensity, usageRate, usageSince } from "@/lib/usage";
import { modColor } from "@/lib/mod-color";
import { useT } from "@/lib/i18n";
import { routes } from "@/lib/routes";
import { useSkin } from "@/lib/skin";
import { cn } from "@/lib/utils";

/**
 * Harita — Obsidian'ın grafik görünümü gibi.
 *
 * Obsidian'da daireler notlar, çizgiler bağlantılar; yerleşimi bir kuvvet
 * benzetimi yapıyor (bağlar yay gibi çekiyor, düğümler birbirini itiyor,
 * merkez kuvveti hepsini bir arada tutuyor). Biz de aynısını yapıyoruz,
 * yalnız düğümler yapının kendisi: kategori, alt kategori ve özellik.
 * Şekil dili uygulamanınki — kare kalem, daire özellik.
 *
 * Obsidian'dan alınanlar:
 * - Düğümün boyu bağ sayısıyla büyüyor (çok bağlı = iri)
 * - Dokununca (masaüstünde üstüne gelince) düğüm ve komşuları öne çıkıyor,
 *   gerisi soluyor
 * - Adlar yakınlaştıkça beliriyor ("yazı solma eşiği")
 * - Yerel grafik: seçili düğümün çevresi, derinlik 1–3
 * - Ayarlar: filtreler (arama, özellikler, kullanılmayanlar), görünüm
 *   (yazı solma, düğüm boyu, bağ kalınlığı, canlandır), kuvvetler
 * - Canlandır: düğümler oluşturulma sırasıyla beliriyor
 *
 * Bizden: Obsidian renkleri elle kurulan gruplarla veriyor; burada her dal
 * kendi kategorisinin renginde. Soluk düğüm son 30 günde kullanılmayan.
 * Özellik bağları kesikli ve yalnız kalemin KENDİ özelliğine çiziliyor —
 * kategoriden miras inen özellik her alt kalemde tekrar bağlanmıyor.
 */

type Kind = "cat" | "sub" | "mod";
type GNode = {
  id: string;
  kind: Kind;
  label: string;
  color: string;
  /** Yapı sayfasına gitmek için */
  catId?: string;
  /** Ağaçtaki üst kalem (kategori ya da alt kategori); konum tohumu */
  parent?: string;
  /** Son 30 günde girdi (alt ağaç dahil) */
  count: number;
  usage: number;
  createdAt: number;
  /** Ad yolu — seçim kartında */
  path: string[];
};
type GLink = { s: string; t: string; feat: boolean };
type Body = { x: number; y: number; vx: number; vy: number; fx?: number; fy?: number };
type Settings = {
  feats: boolean;
  unused: boolean;
  fade: number;
  size: number;
  thick: number;
  center: number;
  repel: number;
  link: number;
  dist: number;
};
type Local = { id: string; depth: number } | null;

const DEFAULTS: Settings = {
  feats: true,
  unused: true,
  fade: 0.5,
  size: 1,
  thick: 1,
  center: 0.5,
  repel: 10,
  link: 1,
  dist: 50,
};
const STORE_KEY = "routine:graph-settings";
const NO_COUNTS: ReadonlyMap<string, number> = new Map();
const MIN_K = 0.15;
const MAX_K = 4;

/** Kimlikten kararlı bir 0–1 sayı — tohum konumları her açılışta aynı */
function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 100000) / 100000;
}

function loadSettings(): Settings {
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {}
  return DEFAULTS;
}

export function GraphView({ groups }: { groups: MapGroup[] }) {
  const t = useT();
  const router = useRouter();
  const brutal = useSkin() === "brutal";

  // Harita yalnız veri geldikten sonra (istemcide) çiziliyor — localStorage hazır
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const patch = (p: Partial<Settings>) =>
    setSettings((s) => {
      const n = { ...s, ...p };
      try {
        window.localStorage.setItem(STORE_KEY, JSON.stringify(n));
      } catch {}
      return n;
    });
  const [panel, setPanel] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [local, setLocal] = useState<Local>(null);
  /** Canlandırma: kaç düğüm göründü (null = hepsi) */
  const [reveal, setReveal] = useState<number | null>(null);

  const entryCounts =
    useLiveQuery(() => getEntryCountsBySubcategory(usageSince()), []) ?? NO_COUNTS;
  const featData = useLiveQuery(async () => {
    const [mods, links] = await Promise.all([
      db.mods.toArray(),
      db.categoryModifiers.toArray(),
    ]);
    return { mods, links };
  }, []);

  // ─── Veri: düğümler ve bağlar ─────────────────────────────────────────────
  const data = useMemo(() => {
    const nodes: GNode[] = [];
    const links: GLink[] = [];
    const byId = new Map<string, GNode>();
    /** Gizli kök alt kategori → kategorisi (girdiler ve özellikler oraya da bağlanıyor) */
    const rootOf = new Map<string, string>();
    const parentOf = new Map<string, string>();

    for (const g of groups) {
      const cat = g.category;
      const subs = g.allSubs.filter((s) => !s.isCategoryRoot);
      for (const s of g.allSubs) if (s.isCategoryRoot) rootOf.set(s.id, cat.id);
      const kids = new Map<string, typeof subs>();
      for (const s of subs) {
        const p = s.parentId && !rootOf.has(s.parentId) ? s.parentId : cat.id;
        parentOf.set(s.id, p);
        const arr = kids.get(p) ?? [];
        arr.push(s);
        kids.set(p, arr);
      }
      const total = (id: string): number =>
        (entryCounts.get(id) ?? 0) + (kids.get(id) ?? []).reduce((a, k) => a + total(k.id), 0);
      const rootOwn = g.allSubs
        .filter((s) => s.isCategoryRoot)
        .reduce((a, s) => a + (entryCounts.get(s.id) ?? 0), 0);
      const catCount = rootOwn + (kids.get(cat.id) ?? []).reduce((a, k) => a + total(k.id), 0);
      const cn: GNode = {
        id: cat.id,
        kind: "cat",
        label: cat.name,
        color: cat.color,
        catId: cat.id,
        count: catCount,
        usage: usageIntensity(usageRate(catCount)),
        createdAt: cat.createdAt,
        path: [],
      };
      nodes.push(cn);
      byId.set(cn.id, cn);
      const walk = (pid: string, path: string[]) => {
        for (const s of (kids.get(pid) ?? []).sort((a, b) => a.order - b.order)) {
          const c = total(s.id);
          const n: GNode = {
            id: s.id,
            kind: "sub",
            label: s.name,
            color: cat.color,
            catId: cat.id,
            parent: pid,
            count: c,
            usage: usageIntensity(usageRate(c)),
            createdAt: s.createdAt,
            path,
          };
          nodes.push(n);
          byId.set(n.id, n);
          links.push({ s: pid, t: s.id, feat: false });
          walk(s.id, [...path, s.name]);
        }
      };
      walk(cat.id, [cat.name]);
    }

    if (featData) {
      const modById = new Map(featData.mods.map((m) => [m.id, m]));
      const own = new Map<string, Set<string>>();
      for (const l of featData.links) {
        if (!l.modId || !modById.has(l.modId)) continue;
        const target = rootOf.get(l.targetId) ?? l.targetId;
        if (!byId.has(target)) continue;
        const set = own.get(target) ?? new Set();
        set.add(l.modId);
        own.set(target, set);
      }
      // Ataların birinde zaten olan özellik miras — yeniden bağlanmıyor
      const inherited = (id: string, m: string) => {
        for (let p = parentOf.get(id); p; p = parentOf.get(p)) if (own.get(p)?.has(m)) return true;
        return false;
      };
      const used = new Map<string, number>();
      for (const [target, set] of own) {
        for (const m of set) {
          if (inherited(target, m)) continue;
          links.push({ s: target, t: `mod:${m}`, feat: true });
          used.set(m, Math.max(used.get(m) ?? 0, byId.get(target)!.count));
        }
      }
      for (const [m, c] of used) {
        const mod = modById.get(m)!;
        const n: GNode = {
          id: `mod:${m}`,
          kind: "mod",
          label: mod.name,
          color: modColor(mod),
          count: c,
          usage: usageIntensity(usageRate(c)),
          createdAt: mod.createdAt,
          path: [],
        };
        nodes.push(n);
        byId.set(n.id, n);
      }
    }
    const order = [...nodes].sort((a, b) => a.createdAt - b.createdAt).map((n) => n.id);
    return { nodes, links, byId, order };
  }, [groups, entryCounts, featData]);

  // ─── Görünen grafik: filtreler, yerel grafik, canlandırma ─────────────────
  const visible = useMemo(() => {
    let nodes = data.nodes.filter(
      (n) =>
        (settings.feats || n.kind !== "mod") &&
        (settings.unused || n.kind === "cat" || n.count > 0)
    );
    if (reveal != null) {
      const shown = new Set(data.order.slice(0, reveal));
      nodes = nodes.filter((n) => shown.has(n.id));
    }
    let ids = new Set(nodes.map((n) => n.id));
    let links = data.links.filter((l) => ids.has(l.s) && ids.has(l.t));
    // Bağı kalmayan özellik düğümü gösterilmiyor
    const linked = new Set(links.flatMap((l) => [l.s, l.t]));
    nodes = nodes.filter((n) => n.kind !== "mod" || linked.has(n.id));
    if (local && ids.has(local.id)) {
      const adj = new Map<string, string[]>();
      for (const l of links) {
        (adj.get(l.s) ?? adj.set(l.s, []).get(l.s)!).push(l.t);
        (adj.get(l.t) ?? adj.set(l.t, []).get(l.t)!).push(l.s);
      }
      const keep = new Set([local.id]);
      let front = [local.id];
      for (let d = 0; d < local.depth; d++) {
        const next: string[] = [];
        for (const id of front)
          for (const k of adj.get(id) ?? []) {
            if (keep.has(k)) continue;
            keep.add(k);
            next.push(k);
          }
        front = next;
      }
      nodes = nodes.filter((n) => keep.has(n.id));
    }
    ids = new Set(nodes.map((n) => n.id));
    links = links.filter((l) => ids.has(l.s) && ids.has(l.t));
    const deg = new Map<string, number>();
    for (const l of links) {
      deg.set(l.s, (deg.get(l.s) ?? 0) + 1);
      deg.set(l.t, (deg.get(l.t) ?? 0) + 1);
    }
    return { nodes, links, deg };
  }, [data, settings.feats, settings.unused, local, reveal]);

  // ─── Benzetim ve çizim (çizim döngüsü React dışında, ref'lerle) ──────────
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bodies = useRef(new Map<string, Body>());
  const vis = useRef(visible);
  const cam = useRef({ x: 0, y: 0, k: 1 });
  /** Sığdırmanın hedefi — kamera oraya yumuşakça kayıyor; elle oynanınca bırakıyor */
  const camGoal = useRef<{ x: number; y: number; k: number } | null>(null);
  /** Benzetim oturunca bir kez daha sığdır */
  const fitPending = useRef(true);
  const size = useRef({ w: 0, h: 0 });
  const sim = useRef({ alpha: 1, target: 0 });
  const dirty = useRef(true);
  const touched = useRef(false);
  const live = useRef({ settings, query, selected, hover: null as string | null, brutal });
  useEffect(() => {
    Object.assign(live.current, { settings, query, selected, brutal });
    dirty.current = true;
    sim.current.alpha = Math.max(sim.current.alpha, 0.3);
  }, [settings, query, selected, brutal]);

  const radius = (n: GNode, deg: number) => {
    const s = live.current.settings.size;
    const r =
      n.kind === "cat"
        ? 7 + 1.1 * Math.sqrt(deg)
        : n.kind === "mod"
          ? 4.5 + 0.9 * Math.sqrt(deg)
          : 3.4 + 0.9 * Math.sqrt(deg);
    return r * s;
  };

  function tick() {
    const { nodes, links, deg } = vis.current;
    const S = live.current.settings;
    const a = sim.current.alpha;
    const bs = nodes.map((n) => bodies.current.get(n.id)!);
    const str = -S.repel * 14;
    for (let i = 0; i < bs.length; i++) {
      const bi = bs[i];
      for (let j = i + 1; j < bs.length; j++) {
        const bj = bs[j];
        let dx = bj.x - bi.x;
        let dy = bj.y - bi.y;
        let d2 = dx * dx + dy * dy;
        if (d2 > 250000) continue;
        if (d2 < 1) {
          dx = Math.random() - 0.5;
          dy = Math.random() - 0.5;
          d2 = 1;
        }
        const f = (str * a) / d2;
        bi.vx += dx * f;
        bi.vy += dy * f;
        bj.vx -= dx * f;
        bj.vy -= dy * f;
      }
    }
    for (const l of links) {
      const s = bodies.current.get(l.s)!;
      const tb = bodies.current.get(l.t)!;
      const ds = deg.get(l.s) ?? 1;
      const dt = deg.get(l.t) ?? 1;
      const dx = tb.x + tb.vx - s.x - s.vx;
      const dy = tb.y + tb.vy - s.y - s.vy;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const want = S.dist * (l.feat ? 1.8 : 1);
      const k = ((len - want) / len) * a * S.link * (1 / Math.min(ds, dt));
      const bias = ds / (ds + dt);
      tb.vx -= dx * k * bias;
      tb.vy -= dy * k * bias;
      s.vx += dx * k * (1 - bias);
      s.vy += dy * k * (1 - bias);
    }
    const cs = S.center * 0.06 * a;
    for (const b of bs) {
      if (b.fx != null && b.fy != null) {
        b.x = b.fx;
        b.y = b.fy;
        b.vx = b.vy = 0;
        continue;
      }
      b.vx -= b.x * cs;
      b.vy -= b.y * cs;
      b.vx *= 0.6;
      b.vy *= 0.6;
      b.x += b.vx;
      b.y += b.vy;
    }
    sim.current.alpha += (sim.current.target - a) * 0.0228;
  }

  /** Bütün görünen düğümleri pencereye sığdır */
  function fit(instant = true) {
    const { nodes } = vis.current;
    const { w, h } = size.current;
    if (!nodes.length || !w) return;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const n of nodes) {
      const b = bodies.current.get(n.id)!;
      x0 = Math.min(x0, b.x);
      y0 = Math.min(y0, b.y);
      x1 = Math.max(x1, b.x);
      y1 = Math.max(y1, b.y);
    }
    const pad = 28;
    const k = Math.min(1.6, (w - pad * 2) / Math.max(1, x1 - x0), (h - pad * 2) / Math.max(1, y1 - y0));
    const goal = { x: (x0 + x1) / 2, y: (y0 + y1) / 2, k: Math.max(MIN_K, k) };
    if (instant) cam.current = goal;
    else camGoal.current = goal;
    dirty.current = true;
  }

  // Görünen grafik değişince: yeni düğümlere tohum konum, benzetimi ısıt
  const prevLocal = useRef<Local>(null);
  useEffect(() => {
    vis.current = visible;
    const B = bodies.current;
    const fresh = B.size === 0;
    const pending = visible.nodes.filter((n) => !B.has(n.id));
    const cats = visible.nodes.filter((n) => n.kind === "cat");
    for (let guard = 0; pending.length && guard < 50; guard++) {
      for (let i = pending.length - 1; i >= 0; i--) {
        const n = pending[i];
        const a = hash01(n.id) * Math.PI * 2;
        let p: { x: number; y: number } | undefined;
        if (n.kind === "cat") {
          const ci = cats.indexOf(n);
          const ang = (ci / Math.max(1, cats.length)) * Math.PI * 2;
          p = { x: Math.cos(ang) * 160, y: Math.sin(ang) * 160 };
        } else if (n.kind === "mod") p = { x: Math.cos(a) * 40, y: Math.sin(a) * 40 };
        else if (n.parent && B.has(n.parent)) {
          const pb = B.get(n.parent)!;
          p = { x: pb.x + Math.cos(a) * 26, y: pb.y + Math.sin(a) * 26 };
        } else if (n.parent && !visible.nodes.some((m) => m.id === n.parent))
          p = { x: Math.cos(a) * 120, y: Math.sin(a) * 120 };
        if (!p) continue;
        B.set(n.id, { ...p, vx: 0, vy: 0 });
        pending.splice(i, 1);
      }
    }
    for (const n of pending) B.set(n.id, { x: 0, y: 0, vx: 0, vy: 0 });
    const localChanged = prevLocal.current?.id !== local?.id || prevLocal.current?.depth !== local?.depth;
    prevLocal.current = local;
    if (fresh || localChanged) {
      // Açılışta / yerel grafiğe geçince önce sessizce otur, sonra sığdır
      sim.current.alpha = 1;
      for (let i = 0; i < (fresh ? 260 : 140); i++) tick();
      sim.current.alpha = 0.25;
      if (!touched.current || localChanged) fit();
      fitPending.current = true;
    } else sim.current.alpha = Math.max(sim.current.alpha, reveal != null ? 0.5 : 0.35);
    dirty.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Çizim döngüsü
  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    let raf = 0;
    const css = getComputedStyle(document.documentElement);
    const font = getComputedStyle(document.body).fontFamily;
    const colors = () => ({
      fg: css.getPropertyValue("--foreground").trim() || "#fafafa",
      bg: css.getPropertyValue("--background").trim() || "#09090b",
      accent: css.getPropertyValue("--primary").trim() || "#6366f1",
    });
    let C = colors();
    let lastSkin = live.current.brutal;

    const draw = () => {
      if (lastSkin !== live.current.brutal) {
        C = colors();
        lastSkin = live.current.brutal;
      }
      const { w, h } = size.current;
      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const { x: cx, y: cy, k } = cam.current;
      ctx.translate(w / 2, h / 2);
      ctx.scale(k, k);
      ctx.translate(-cx, -cy);
      const { nodes, links, deg } = vis.current;
      const L = live.current;
      const S = L.settings;
      const focus = L.hover ?? L.selected;
      const near = new Set<string>();
      if (focus) {
        near.add(focus);
        for (const l of links) {
          if (l.s === focus) near.add(l.t);
          if (l.t === focus) near.add(l.s);
        }
      }
      const q = L.query.trim().toLocaleLowerCase("tr");
      const match = (n: GNode) => !q || n.label.toLocaleLowerCase("tr").includes(q);
      const dim = (n: GNode) => (focus && !near.has(n.id)) || !match(n);

      // Bağlar
      const lw = (S.thick * 1.1) / Math.sqrt(k);
      ctx.lineCap = "round";
      for (const l of links) {
        const a = bodies.current.get(l.s)!;
        const b = bodies.current.get(l.t)!;
        const hot = focus && (l.s === focus || l.t === focus);
        ctx.globalAlpha = focus ? (hot ? 0.9 : 0.06) : q ? 0.12 : l.feat ? 0.22 : 0.32;
        ctx.strokeStyle = hot ? (L.brutal ? "#111" : C.accent) : C.fg;
        ctx.lineWidth = hot ? lw * 1.6 : lw;
        ctx.setLineDash(l.feat ? [3 / k, 3 / k] : []);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      ctx.setLineDash([]);

      // Düğümler
      for (const n of nodes) {
        const b = bodies.current.get(n.id)!;
        const r = radius(n, deg.get(n.id) ?? 0);
        const base = n.kind === "cat" ? 0.8 + 0.2 * n.usage : 0.35 + 0.65 * n.usage;
        ctx.globalAlpha = dim(n) ? 0.12 : base;
        ctx.fillStyle = n.color;
        ctx.beginPath();
        if (n.kind === "mod") ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
        else ctx.roundRect(b.x - r, b.y - r, r * 2, r * 2, r * (n.kind === "cat" ? 0.32 : 0.4));
        ctx.fill();
        if (L.brutal) {
          ctx.lineWidth = (n.kind === "cat" ? 1.8 : 1.2) / Math.sqrt(k);
          ctx.strokeStyle = "#111";
          ctx.stroke();
        }
        if (n.id === focus) {
          ctx.globalAlpha = 1;
          ctx.lineWidth = 2 / k;
          ctx.strokeStyle = L.brutal ? "#111" : C.accent;
          ctx.beginPath();
          if (n.kind === "mod") ctx.arc(b.x, b.y, r + 3 / k + 1, 0, Math.PI * 2);
          else ctx.roundRect(b.x - r - 3, b.y - r - 3, r * 2 + 6, r * 2 + 6, r * 0.5);
          ctx.stroke();
        }
      }

      // Adlar — yakınlaştıkça beliriyor (yazı solma eşiği)
      const th = 0.3 + S.fade;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.lineJoin = "round";
      for (const n of nodes) {
        const b = bodies.current.get(n.id)!;
        const r = radius(n, deg.get(n.id) ?? 0);
        const big = n.kind === "cat";
        const t0 = big ? th * 0.35 : th;
        let a = Math.max(0, Math.min(1, (k - t0) / 0.3));
        if (focus) a = near.has(n.id) ? 1 : a * 0.12;
        else if (q) a = match(n) ? 1 : a * 0.12;
        if (a < 0.02) continue;
        const fs = big ? 12 : 9.5;
        // Ekrandaki boy yakınlaştıkça biraz büyüyor, uzaklaşınca biraz küçülüyor
        const px = (fs * Math.max(0.75, Math.min(1.3, k))) / k;
        ctx.font = `${big ? 800 : 600} ${px}px ${font}`;
        ctx.globalAlpha = a;
        ctx.lineWidth = 3 / k;
        ctx.strokeStyle = C.bg;
        ctx.strokeText(n.label, b.x, b.y + r + 2);
        ctx.fillStyle = C.fg;
        ctx.fillText(n.label, b.x, b.y + r + 2);
      }
      ctx.globalAlpha = 1;
    };

    const loop = () => {
      const s = sim.current;
      let moved = false;
      if (s.alpha > 0.004 || s.target > 0) {
        tick();
        moved = true;
      }
      // Yerleşim oturunca son bir sığdırma (kullanıcı oynamadıysa)
      if (fitPending.current && s.alpha < 0.05) {
        fitPending.current = false;
        if (!touched.current) fit(false);
      }
      const g = camGoal.current;
      if (g) {
        const c = cam.current;
        c.x += (g.x - c.x) * 0.15;
        c.y += (g.y - c.y) * 0.15;
        c.k += (g.k - c.k) * 0.15;
        if (Math.abs(g.k - c.k) < 0.002 && Math.abs(g.x - c.x) < 0.5 && Math.abs(g.y - c.y) < 0.5) camGoal.current = null;
        moved = true;
      }
      if (moved || dirty.current) {
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
      if (!touched.current) fit();
      dirty.current = true;
    });
    ro.observe(wrapRef.current!);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
     
  }, []);

  // ─── Dokunma, sürükleme, yakınlaştırma ────────────────────────────────────
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<
    | null
    | { mode: "node"; id: string; sx: number; sy: number; moved: boolean }
    | { mode: "pan"; sx: number; sy: number; cx: number; cy: number; moved: boolean }
    | { mode: "pinch"; d0: number; k0: number; wx: number; wy: number }
  >(null);

  const toWorld = (sx: number, sy: number) => {
    const { w, h } = size.current;
    const c = cam.current;
    return { x: (sx - w / 2) / c.k + c.x, y: (sy - h / 2) / c.k + c.y };
  };
  const local01 = (e: { clientX: number; clientY: number }) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const hit = (sx: number, sy: number): string | null => {
    const { nodes, deg } = vis.current;
    const c = cam.current;
    const { w, h } = size.current;
    let best: string | null = null;
    let bd = Infinity;
    for (const n of nodes) {
      const b = bodies.current.get(n.id)!;
      const px = (b.x - c.x) * c.k + w / 2;
      const py = (b.y - c.y) * c.k + h / 2;
      const d = Math.hypot(px - sx, py - sy);
      const reach = radius(n, deg.get(n.id) ?? 0) * c.k + 10;
      if (d < reach && d < bd) {
        bd = d;
        best = n.id;
      }
    }
    return best;
  };
  const zoomAt = (sx: number, sy: number, k: number) => {
    const before = toWorld(sx, sy);
    cam.current.k = Math.max(MIN_K, Math.min(MAX_K, k));
    const after = toWorld(sx, sy);
    cam.current.x += before.x - after.x;
    cam.current.y += before.y - after.y;
    touched.current = true;
    camGoal.current = null;
    dirty.current = true;
  };

  const onDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = local01(e);
    pointers.current.set(e.pointerId, p);
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const mid = toWorld((a.x + b.x) / 2, (a.y + b.y) / 2);
      gesture.current = { mode: "pinch", d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, k0: cam.current.k, wx: mid.x, wy: mid.y };
      return;
    }
    const id = hit(p.x, p.y);
    gesture.current = id
      ? { mode: "node", id, sx: p.x, sy: p.y, moved: false }
      : { mode: "pan", sx: p.x, sy: p.y, cx: cam.current.x, cy: cam.current.y, moved: false };
  };
  const onMove = (e: React.PointerEvent) => {
    const p = local01(e);
    if (!pointers.current.has(e.pointerId)) {
      if (e.pointerType === "mouse") {
        const h = hit(p.x, p.y);
        if (h !== live.current.hover) {
          live.current.hover = h;
          dirty.current = true;
        }
      }
      return;
    }
    pointers.current.set(e.pointerId, p);
    const g = gesture.current;
    if (!g) return;
    if (g.mode === "pinch" && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const k = Math.max(MIN_K, Math.min(MAX_K, g.k0 * (d / g.d0)));
      const { w, h } = size.current;
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      cam.current = { k, x: g.wx - (mx - w / 2) / k, y: g.wy - (my - h / 2) / k };
      touched.current = true;
      camGoal.current = null;
      dirty.current = true;
      return;
    }
    if (g.mode === "pinch") return;
    const far = Math.hypot(p.x - g.sx, p.y - g.sy) > 6;
    if (!g.moved && !far) return;
    g.moved = true;
    touched.current = true;
    camGoal.current = null;
    if (g.mode === "node") {
      const b = bodies.current.get(g.id);
      if (!b) return;
      const wpt = toWorld(p.x, p.y);
      b.fx = wpt.x;
      b.fy = wpt.y;
      sim.current.target = 0.3;
      sim.current.alpha = Math.max(sim.current.alpha, 0.3);
    } else {
      cam.current.x = g.cx - (p.x - g.sx) / cam.current.k;
      cam.current.y = g.cy - (p.y - g.sy) / cam.current.k;
      dirty.current = true;
    }
  };
  const onUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (pointers.current.size > 0) {
      // Sıkıştırmadan bir parmak kalktı: kalan parmak kaydırsın
      const [rest] = [...pointers.current.values()];
      gesture.current = { mode: "pan", sx: rest.x, sy: rest.y, cx: cam.current.x, cy: cam.current.y, moved: true };
      return;
    }
    gesture.current = null;
    if (!g || g.mode === "pinch") return;
    if (g.mode === "node") {
      const b = bodies.current.get(g.id);
      if (b) {
        b.fx = undefined;
        b.fy = undefined;
      }
      sim.current.target = 0;
      if (!g.moved) setSelected((s) => (s === g.id ? null : g.id));
    } else if (!g.moved) setSelected(null);
  };
  const onWheel = (e: React.WheelEvent) => {
    const p = local01(e);
    zoomAt(p.x, p.y, cam.current.k * Math.exp(-e.deltaY * 0.0015));
  };

  // ─── Canlandır ────────────────────────────────────────────────────────────
  const animate = () => {
    setPanel(false);
    setSelected(null);
    bodies.current.clear();
    touched.current = false;
    setReveal(0);
  };
  useEffect(() => {
    if (reveal == null) return;
    const total = data.order.length;
    const step = Math.max(1, Math.round(total / 70));
    const id = setTimeout(
      () => setReveal((r) => (r == null || r + step > total ? null : r + step)),
      55
    );
    return () => clearTimeout(id);
  }, [reveal, data.order.length]);
  // Canlandırma bitince sığdır
  useEffect(() => {
    if (reveal == null && !touched.current) fitPending.current = true;
     
  }, [reveal]);

  // ─── Seçim kartı ──────────────────────────────────────────────────────────
  const sel = selected ? data.byId.get(selected) : undefined;
  const selDeg = sel ? visible.deg.get(sel.id) ?? 0 : 0;
  const openSel = () => {
    if (!sel) return;
    if (sel.kind === "cat") router.push(routes.structureCategory(sel.id));
    else if (sel.kind === "sub") router.push(routes.structureSub(sel.catId!, sel.id));
    else router.push("/structure/mods");
  };
  const kindLabel = (k: Kind) =>
    k === "cat" ? t("graph.kindCat") : k === "sub" ? t("graph.kindSub") : t("graph.kindMod");

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
          aria-label={t("graph.aria")}
          role="img"
        />
      </div>

      {/* Sol üst: yerel grafikte geri dönüş ve derinlik */}
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
            <button aria-label="+" className="p-1" onClick={() => setLocal({ ...local, depth: Math.min(3, local.depth + 1) })}>
              <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
            </button>
          </div>
        </div>
      )}

      {/* Sağ üst: ayarlar ve sığdır */}
      <div className="absolute right-3 top-2 flex flex-col gap-2">
        <button className={iconBtn} aria-label={t("graph.settings")} onClick={() => setPanel((v) => !v)}>
          {panel ? <X className="h-4 w-4" strokeWidth={2.5} /> : <Settings2 className="h-4 w-4" strokeWidth={2.5} />}
        </button>
        <button
          className={iconBtn}
          aria-label={t("graph.fit")}
          onClick={() => {
            touched.current = false;
            fit(false);
          }}
        >
          <Locate className="h-4 w-4" strokeWidth={2.5} />
        </button>
      </div>

      {panel && (
        <div className={cn(box, "absolute right-3 top-24 z-10 max-h-[calc(100%-8.5rem)] w-[248px] overflow-y-auto p-3 text-xs")}>
          <Section title={t("graph.filters")}>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("graph.search")}
              className={cn(
                "mb-2 w-full px-2 py-1.5 text-xs outline-none",
                brutal ? "rounded-md border-2 border-[#111] bg-white" : "rounded-lg border border-border bg-background"
              )}
            />
            <Toggle label={t("graph.features")} on={settings.feats} set={(v) => patch({ feats: v })} brutal={brutal} />
            <Toggle label={t("graph.unused")} on={settings.unused} set={(v) => patch({ unused: v })} brutal={brutal} />
          </Section>
          <Section title={t("graph.display")}>
            <Slider label={t("graph.textFade")} v={settings.fade} min={0} max={1} step={0.05} set={(v) => patch({ fade: v })} />
            <Slider label={t("graph.nodeSize")} v={settings.size} min={0.5} max={2} step={0.05} set={(v) => patch({ size: v })} />
            <Slider label={t("graph.linkThickness")} v={settings.thick} min={0.3} max={3} step={0.1} set={(v) => patch({ thick: v })} />
            <button
              onClick={animate}
              className={cn(
                "mt-1 flex w-full items-center justify-center gap-1.5 py-1.5 font-bold",
                brutal ? "rounded-md border-2 border-[#111] bg-[#ffd23f]" : "rounded-lg bg-primary text-primary-foreground"
              )}
            >
              <Play className="h-3.5 w-3.5" strokeWidth={2.5} />
              {t("graph.animate")}
            </button>
          </Section>
          <Section title={t("graph.forces")}>
            <Slider label={t("graph.center")} v={settings.center} min={0} max={1} step={0.05} set={(v) => patch({ center: v })} />
            <Slider label={t("graph.repel")} v={settings.repel} min={0} max={20} step={0.5} set={(v) => patch({ repel: v })} />
            <Slider label={t("graph.linkForce")} v={settings.link} min={0} max={1} step={0.05} set={(v) => patch({ link: v })} />
            <Slider label={t("graph.linkDistance")} v={settings.dist} min={20} max={200} step={5} set={(v) => patch({ dist: v })} />
          </Section>
          <p className="mb-2 leading-snug opacity-70">{t("graph.legend")}</p>
          <button
            onClick={() => patch(DEFAULTS)}
            className="flex items-center gap-1.5 font-bold opacity-80 hover:opacity-100"
          >
            <RotateCcw className="h-3.5 w-3.5" strokeWidth={2.5} />
            {t("graph.reset")}
          </button>
        </div>
      )}

      {/* Seçim kartı — alt menünün ortadaki düğmesinin üstünde */}
      {sel && !panel && (
        <div className={cn(box, "absolute bottom-10 left-3 right-3 flex items-center gap-3 px-3 py-2.5")}>
          <span
            className={cn("h-3.5 w-3.5 shrink-0", sel.kind === "mod" ? "rounded-full" : "rounded-[4px]", brutal && "border-[1.5px] border-[#111]")}
            style={{ background: sel.color }}
          />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-extrabold">{sel.label}</div>
            <div className="truncate text-[11px] opacity-70">
              {[kindLabel(sel.kind), ...sel.path].join(" › ")} · {t("graph.links", { n: selDeg })} ·{" "}
              {t("graph.entries30", { n: sel.count })}
            </div>
          </div>
          <button
            className={cn(iconBtn, "shrink-0")}
            aria-label={t("graph.local")}
            title={t("graph.local")}
            onClick={() => setLocal({ id: sel.id, depth: local?.depth ?? 1 })}
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

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mb-3">
      <div className="mb-1.5 text-[10px] font-black uppercase tracking-wider opacity-60">{title}</div>
      {children}
    </div>
  );
}

function Toggle({ label, on, set, brutal }: { label: string; on: boolean; set: (v: boolean) => void; brutal: boolean }) {
  return (
    <button onClick={() => set(!on)} className="flex w-full items-center justify-between py-1 font-semibold">
      {label}
      <span
        className={cn(
          "relative h-4 w-7 rounded-full transition-colors",
          brutal ? "border-[1.5px] border-[#111]" : "",
          on ? (brutal ? "bg-[#3a5bff]" : "bg-primary") : brutal ? "bg-white" : "bg-muted"
        )}
      >
        <span
          className={cn(
            "absolute top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full transition-all",
            brutal ? "bg-[#111]" : "bg-white",
            on ? "left-[14px]" : "left-[2px]"
          )}
        />
      </span>
    </button>
  );
}

function Slider({
  label,
  v,
  min,
  max,
  step,
  set,
}: {
  label: string;
  v: number;
  min: number;
  max: number;
  step: number;
  set: (v: number) => void;
}) {
  return (
    <label className="block py-1 font-semibold">
      {label}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={v}
        onChange={(e) => set(+e.target.value)}
        className="mt-1 block w-full accent-current"
      />
    </label>
  );
}
