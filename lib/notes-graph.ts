import type { Note, NoteTag } from "@/types";

/**
 * Not grafiği yardımcıları.
 *
 * Bağlantıların KENDİSİ artık yapay zekâ tarafından, içgörüyle kurulur
 * ([[notes-feature]], `lib/ai/note-analysis.ts`). Buradaki yerel sözcüksel
 * benzerlik yalnızca **aday bulucu (retriever)** olarak kalır: yeni bir notu
 * hangi eski notlarla birlikte modele göndereceğimizi ucuza seçer. Etiketler
 * artık bağ sinyali değil; not sayfasında arama/filtre içindir.
 *
 * `layoutNotesGraph` düğüm+kenar geometrisini üretir (kuvvet-yönlü, tek
 * seferde, animasyonsuz) ve yapay zekâ kenarlarıyla beslenir.
 */

export type NoteNode = {
  id: string;
  title: string;
  date: string;
  /** baskın etiketin rengi (yoksa nötr) */
  color?: string;
  tagIds: string[];
};

export type NoteEdge = { a: string; b: string; strength: number };

export type NotesGraph = { nodes: NoteNode[]; edges: NoteEdge[] };

// Türkçe durak sözcükleri — sinyal taşımayan yüksek frekanslılar
const STOPWORDS = new Set([
  "ve", "ya", "veya", "ama", "fakat", "ki", "de", "da", "ta", "te", "bir",
  "bu", "şu", "o", "çok", "daha", "en", "gibi", "için", "ile", "ise", "hem",
  "ne", "her", "bazı", "hiç", "hep", "şey", "kadar", "sonra", "önce", "ben",
  "sen", "biz", "siz", "onlar", "beni", "seni", "bana", "sana", "ona", "bunu",
  "şunu", "olan", "olarak", "oldu", "olur", "değil", "yok", "var", "mi", "mı",
  "mu", "mü", "diye", "yani", "işte", "hâlâ", "hala", "artık", "biraz",
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

/** Notun tüm metni — başlık + paragraflar. */
export function noteText(note: Note): string {
  return [(note.title ?? ""), ...note.blocks.map((b) => b.text)].join(" ");
}

/** Notun kart/harita başlığı — başlık yoksa ilk dolu satır. */
export function noteTitle(note: Note): string {
  return (
    (note.title ?? "").trim() ||
    note.blocks.map((b) => b.text.trim()).find(Boolean) ||
    "Not"
  );
}

/**
 * Sözcüksel aday bulucu — bir kez tf-idf indeksi kurar, her not için en
 * benzer K notu döndürür (yapay zekâ çözümüne aday listesi).
 */
export function buildLexicalIndex(notes: Note[]) {
  const N = notes.length;
  const tf: Map<string, number>[] = [];
  const df = new Map<string, number>();
  for (const n of notes) {
    const m = new Map<string, number>();
    for (const w of tokenize(noteText(n))) m.set(w, (m.get(w) ?? 0) + 1);
    tf.push(m);
    for (const w of m.keys()) df.set(w, (df.get(w) ?? 0) + 1);
  }
  const idf = (w: string) => Math.log(1 + N / (df.get(w) ?? 1));
  const vecs = tf.map((m) => {
    const v = new Map<string, number>();
    let sq = 0;
    for (const [w, c] of m) {
      const val = c * idf(w);
      v.set(w, val);
      sq += val * val;
    }
    return { v, nor: Math.sqrt(sq) };
  });
  const indexById = new Map(notes.map((n, i) => [n.id, i]));

  function cosine(i: number, j: number): number {
    const A = vecs[i];
    const B = vecs[j];
    if (A.nor === 0 || B.nor === 0) return 0;
    let dot = 0;
    const [small, large] = A.v.size < B.v.size ? [A.v, B.v] : [B.v, A.v];
    for (const [t, wa] of small) {
      const wb = large.get(t);
      if (wb) dot += wa * wb;
    }
    return dot / (A.nor * B.nor);
  }

  return {
    /** targetId dışındaki notlardan en benzer K tanesi (benzerlik>0). */
    topK(targetId: string, k: number): Note[] {
      const i = indexById.get(targetId);
      if (i === undefined) return [];
      const scored: { note: Note; s: number }[] = [];
      for (let j = 0; j < N; j++) {
        if (j === i) continue;
        const s = cosine(i, j);
        if (s > 0) scored.push({ note: notes[j], s });
      }
      scored.sort((a, b) => b.s - a.s);
      return scored.slice(0, k).map((x) => x.note);
    },
  };
}

/** Notlardan harita düğümleri. */
export function noteNodes(
  notes: Note[],
  tagById: Map<string, NoteTag>
): NoteNode[] {
  return notes.map((n) => {
    const tagIds = [...new Set(n.blocks.flatMap((b) => b.tagIds))].filter((t) =>
      tagById.has(t)
    );
    return {
      id: n.id,
      title: noteTitle(n),
      date: n.date,
      color: tagIds[0] ? tagById.get(tagIds[0])!.color : undefined,
      tagIds,
    };
  });
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
    for (const e of edges) {
      const pa = pos.get(e.a);
      const pb = pos.get(e.b);
      if (!pa || !pb) continue;
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
