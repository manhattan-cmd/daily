/**
 * Hayat haritası grafiği — notlar ve girdiler düğüm, kullanıcının notlarda
 * kendi kurduğu bağlar (kelime→girdi, öbek→not) kenar. Kenarlar YEREL ve
 * deterministik: hiçbir çıkarım yok, tümü kullanıcının örgüsü. [[app-vision]]
 *
 * Yerleşim canlı kuvvet simülasyonuyla `components/notes/life-map.tsx`
 * içinde yapılır (Obsidian tarzı).
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
