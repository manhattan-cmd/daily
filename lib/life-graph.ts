/**
 * Hayat haritası grafiği — notlar ve girdiler düğüm, kullanıcının notlarda
 * kendi kurduğu bağlar (kelime→girdi, öbek→not) kenar. Kenarlar YEREL ve
 * deterministik: hiçbir çıkarım yok, tümü kullanıcının örgüsü. [[app-vision]]
 */

export type LifeNode = {
  id: string;
  kind: "note" | "entry";
  label: string;
  color?: string;
  /** YYYY-MM-DD — gezinme ve etiket için */
  date?: string;
};

export type LifeEdge = { a: string; b: string; anchor: string };

export type LifeGraph = { nodes: LifeNode[]; edges: LifeEdge[] };

/**
 * Kuvvet-yönlü yerleşim — kenarlar düğümleri yaklaştırır, itme dağıtır.
 * Deterministik (sabit tohum), animasyonsuz: tek seferde hesaplanır.
 */
export function layoutGraph(
  graph: LifeGraph,
  iterations = 240
): Map<string, { x: number; y: number }> {
  const { nodes, edges } = graph;
  const pos = new Map<string, { x: number; y: number; vx: number; vy: number }>();
  const n = nodes.length;
  const R = Math.max(120, n * 20);

  nodes.forEach((node, i) => {
    const a = (i / Math.max(n, 1)) * Math.PI * 2;
    pos.set(node.id, { x: Math.cos(a) * R, y: Math.sin(a) * R, vx: 0, vy: 0 });
  });

  const kRep = R * R * 0.9;
  const kGrav = 0.015;
  const damp = 0.82;

  for (let it = 0; it < iterations; it++) {
    for (let i = 0; i < n; i++) {
      const pi = pos.get(nodes[i].id)!;
      for (let j = i + 1; j < n; j++) {
        const pj = pos.get(nodes[j].id)!;
        let dx = pi.x - pj.x;
        let dy = pi.y - pj.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 1) {
          d2 = 1;
          dx = i - j || 1;
          dy = 1;
        }
        const f = kRep / d2;
        const d = Math.sqrt(d2);
        const fx = (dx / d) * f;
        const fy = (dy / d) * f;
        pi.vx += fx;
        pi.vy += fy;
        pj.vx -= fx;
        pj.vy -= fy;
      }
    }
    for (const e of edges) {
      const pa = pos.get(e.a);
      const pb = pos.get(e.b);
      if (!pa || !pb) continue;
      const dx = pb.x - pa.x;
      const dy = pb.y - pa.y;
      const d = Math.hypot(dx, dy) || 1;
      const f = d * 0.025;
      const fx = (dx / d) * f;
      const fy = (dy / d) * f;
      pa.vx += fx;
      pa.vy += fy;
      pb.vx -= fx;
      pb.vy -= fy;
    }
    for (const node of nodes) {
      const p = pos.get(node.id)!;
      p.vx -= p.x * kGrav;
      p.vy -= p.y * kGrav;
      p.vx *= damp;
      p.vy *= damp;
      p.x += Math.max(-30, Math.min(30, p.vx));
      p.y += Math.max(-30, Math.min(30, p.vy));
    }
  }

  const out = new Map<string, { x: number; y: number }>();
  for (const [k, v] of pos) out.set(k, { x: v.x, y: v.y });
  return out;
}
