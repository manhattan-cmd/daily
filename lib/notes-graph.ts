import type { Note, NoteTag } from "@/types";

/**
 * Not bağlantı grafiği — her not bir düğüm, ortak örüntüler kenar.
 *
 * Bu ilk sürüm tamamen YEREL ve deterministik: bağlantı gücü iki sinyalin
 * ağırlıklı toplamı —
 *   1) Etiket örtüşmesi (Düşünce/His/Hatırlatma... paylaşımı) — nadir etiketler
 *      daha çok ağırlık taşır (idf).
 *   2) Sözcüksel benzerlik (paylaşılan anlamlı sözcükler, tf-idf kosinüs).
 *
 * GELECEK: anlamsal örüntü (aynı düşünce kalıbı, aynhis, aynı planlama) dil
 * modeliyle çıkarılıp `semantic` sinyali olarak bu toplama eklenecek — arayüz
 * ve düzen aynı kalır, yalnızca `strengthBetween` zenginleşir. [[app-vision]]
 */

export type NoteNode = {
  id: string;
  title: string;
  date: string;
  /** baskın etiketin rengi (yoksa nötr) */
  color?: string;
  tagIds: string[];
};

export type NoteEdge = { a: string; b: string; strength: number; shared: string[] };

export type NotesGraph = { nodes: NoteNode[]; edges: NoteEdge[] };

// Türkçe durak sözcükleri — sinyal taşımayan yüksek frekanslılar
const STOPWORDS = new Set([
  "ve", "ya", "veya", "ama", "fakat", "ki", "de", "da", "ta", "te", "bir",
  "bu", "şu", "o", "çok", "daha", "en", "gibi", "için", "ile", "ise", "hem",
  "ne", "her", "bazı", "hiç", "hep", "şey", "kadar", "sonra", "önce", "ben",
  "sen", "biz", "siz", "onlar", "beni", "seni", "bana", "sana", "ona", "bunu",
  "şunu", "olan", "olarak", "oldu", "olur", "değil", "yok", "var", "mi", "mı",
  "mu", "mü", "ki̇", "diye", "yani", "işte", "hâlâ", "hala", "artık", "biraz",
  "belki", "ancak", "çünkü", "eğer", "göre", "beri", "dolayı", "üzere",
  "bugün", "dün", "yarın", "şimdi",
]);

const norm = (s: string) => s.toLocaleLowerCase("tr-TR");

function tokenize(text: string): string[] {
  return norm(text)
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
}

function cosine(
  a: Map<string, number>,
  b: Map<string, number>,
  norA: number,
  norB: number
): number {
  if (norA === 0 || norB === 0) return 0;
  let dot = 0;
  const [small, large] = a.size < b.size ? [a, b] : [b, a];
  for (const [term, wa] of small) {
    const wb = large.get(term);
    if (wb) dot += wa * wb;
  }
  return dot / (norA * norB);
}

/**
 * Notlardan bağlantı grafiği kur. `minStrength` altındaki kenarlar atılır.
 */
export function buildNotesGraph(
  notes: Note[],
  tagById: Map<string, NoteTag>,
  opts: { minStrength?: number; tagWeight?: number } = {}
): NotesGraph {
  const minStrength = opts.minStrength ?? 0.12;
  const tagWeight = opts.tagWeight ?? 0.55;
  const lexWeight = 1 - tagWeight;

  const nodes: NoteNode[] = notes.map((n) => {
    const tagIds = [...new Set(n.blocks.flatMap((b) => b.tagIds))].filter((t) =>
      tagById.has(t)
    );
    const title =
      (n.title ?? "").trim() ||
      n.blocks.map((b) => b.text.trim()).find(Boolean) ||
      "Not";
    return {
      id: n.id,
      title,
      date: n.date,
      color: tagIds[0] ? tagById.get(tagIds[0])!.color : undefined,
      tagIds,
    };
  });

  const N = notes.length;
  if (N < 2) return { nodes, edges: [] };

  // Etiket idf — nadir etiket daha ayırt edici
  const tagDoc = new Map<string, number>();
  for (const node of nodes)
    for (const t of node.tagIds) tagDoc.set(t, (tagDoc.get(t) ?? 0) + 1);
  const tagIdf = (t: string) => Math.log(1 + N / (tagDoc.get(t) ?? 1));

  // Sözcük tf + idf
  const tf: Map<string, number>[] = [];
  const df = new Map<string, number>();
  for (const n of notes) {
    const words = tokenize(
      [(n.title ?? ""), ...n.blocks.map((b) => b.text)].join(" ")
    );
    const m = new Map<string, number>();
    for (const w of words) m.set(w, (m.get(w) ?? 0) + 1);
    tf.push(m);
    for (const w of m.keys()) df.set(w, (df.get(w) ?? 0) + 1);
  }
  const wordIdf = (w: string) => Math.log(1 + N / (df.get(w) ?? 1));

  // tf-idf vektörleri + normları
  const vecs = tf.map((m) => {
    const v = new Map<string, number>();
    let sq = 0;
    for (const [w, c] of m) {
      const val = c * wordIdf(w);
      v.set(w, val);
      sq += val * val;
    }
    return { v, nor: Math.sqrt(sq) };
  });

  const edges: NoteEdge[] = [];
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      const ni = nodes[i];
      const nj = nodes[j];

      // Etiket benzerliği — idf ağırlıklı örtüşme / birleşim
      const setI = new Set(ni.tagIds);
      const shared = nj.tagIds.filter((t) => setI.has(t));
      let tagSim = 0;
      if (ni.tagIds.length && nj.tagIds.length) {
        const union = new Set([...ni.tagIds, ...nj.tagIds]);
        let inter = 0;
        let uni = 0;
        for (const t of union) {
          const w = tagIdf(t);
          uni += w;
          if (setI.has(t) && nj.tagIds.includes(t)) inter += w;
        }
        tagSim = uni ? inter / uni : 0;
      }

      const lexSim = cosine(vecs[i].v, vecs[j].v, vecs[i].nor, vecs[j].nor);
      const strength = tagWeight * tagSim + lexWeight * lexSim;
      if (strength >= minStrength) {
        edges.push({ a: ni.id, b: nj.id, strength, shared });
      }
    }
  }

  return { nodes, edges };
}

/**
 * Kuvvet-yönlü yerleşim — güçlü kenarlar düğümleri yaklaştırır, itme dağıtır.
 * Deterministik (sabit tohum), animasyonsuz: tek seferde hesaplanır.
 */
export function layoutNotesGraph(
  graph: NotesGraph,
  iterations = 240
): Map<string, { x: number; y: number }> {
  const { nodes, edges } = graph;
  const pos = new Map<string, { x: number; y: number; vx: number; vy: number }>();
  const n = nodes.length;
  const R = Math.max(120, n * 22);

  // Halka üzerinde deterministik başlangıç
  nodes.forEach((node, i) => {
    const a = (i / Math.max(n, 1)) * Math.PI * 2;
    pos.set(node.id, { x: Math.cos(a) * R, y: Math.sin(a) * R, vx: 0, vy: 0 });
  });

  const kRep = R * R * 0.9; // itme sabiti
  const kGrav = 0.015; // merkeze çekim
  const damp = 0.82;

  for (let it = 0; it < iterations; it++) {
    // İtme — tüm çiftler
    for (let i = 0; i < n; i++) {
      const pi = pos.get(nodes[i].id)!;
      for (let j = i + 1; j < n; j++) {
        const pj = pos.get(nodes[j].id)!;
        let dx = pi.x - pj.x;
        let dy = pi.y - pj.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 1) {
          d2 = 1;
          dx = (i - j) || 1;
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
    // Çekim — kenarlar, güce göre
    for (const e of edges) {
      const pa = pos.get(e.a)!;
      const pb = pos.get(e.b)!;
      const dx = pb.x - pa.x;
      const dy = pb.y - pa.y;
      const d = Math.hypot(dx, dy) || 1;
      const f = d * 0.02 * (0.3 + e.strength);
      const fx = (dx / d) * f;
      const fy = (dy / d) * f;
      pa.vx += fx;
      pa.vy += fy;
      pb.vx -= fx;
      pb.vy -= fy;
    }
    // Merkez çekimi + entegrasyon
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
