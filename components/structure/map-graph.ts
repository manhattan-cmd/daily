"use client";

import { useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { getEntryCountsBySubcategory } from "@/lib/db/queries";
import type { MapGroup } from "@/components/structure/neural-map";
import { usageIntensity, usageRate, usageSince } from "@/lib/usage";
import { modColor } from "@/lib/mod-color";

export type Kind = "cat" | "sub" | "mod";
export type GNode = {
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
export type GLink = { s: string; t: string; feat: boolean };

const NO_COUNTS: ReadonlyMap<string, number> = new Map();

/**
 * Haritanın verisi — kategoriler, alt kategoriler, özellikler ve aralarındaki
 * bağlar; kullanım son 30 günden. Devre şehri bu veriden kuruluyor.
 */
export function useMapGraph(groups: MapGroup[]) {
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
      // Yapıdaki her atama olduğu gibi: kalemde kayıtlıysa orada görünür
      // (alt kaleme miras kayıt kopyalanarak geçiyor, kaldırılan inmiyor)
      const used = new Map<string, number>();
      for (const [target, set] of own) {
        for (const m of set) {
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
  return data;
}
