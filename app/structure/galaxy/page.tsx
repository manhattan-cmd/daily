"use client";

import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, Waypoints } from "lucide-react";
import { db } from "@/lib/db";
import ConnectionMap, {
  type MapCategory,
  type MapConnection,
  type MapParallel,
} from "@/components/structure/connection-map";
import { EmptyState } from "@/components/ui/empty-state";

export default function GalaxyPage() {
  const data = useLiveQuery(async () => {
    const [cats, allSubs, allMods, allTypes] = await Promise.all([
      db.categories.orderBy("order").toArray(),
      db.subcategories.toArray(),
      db.categoryModifiers.toArray(),
      db.entryTypes.toArray(),
    ]);
    const typeName = new Map(allTypes.map((t) => [t.id, t.name]));
    const subById = new Map(allSubs.map((s) => [s.id, s]));

    // Kategori başına mod türleri: kategori seviyesi + alt kategorilerinin modları
    const modsByCat = new Map<string, Set<string>>();
    for (const mod of allMods) {
      const catId =
        mod.targetType === "category"
          ? mod.targetId
          : subById.get(mod.targetId)?.categoryId;
      if (!catId) continue;
      if (!modsByCat.has(catId)) modsByCat.set(catId, new Set());
      modsByCat.get(catId)!.add(mod.entryTypeId);
    }

    const categories: MapCategory[] = cats.map((cat) => ({
      id: cat.id,
      name: cat.name,
      color: cat.color,
      icon: cat.icon,
      subs: allSubs
        .filter((s) => s.categoryId === cat.id && !s.parentId)
        .sort((a, b) => a.order - b.order)
        .map((s) => ({ id: s.id, name: s.name, icon: s.icon })),
    }));

    // Ortak mod bağlantıları — kategori çiftleri, paylaşılan tür adlarıyla
    const connections: MapConnection[] = [];
    for (let i = 0; i < categories.length; i++) {
      for (let j = i + 1; j < categories.length; j++) {
        const setA = modsByCat.get(categories[i].id);
        const setB = modsByCat.get(categories[j].id);
        if (!setA || !setB) continue;
        const shared = [...setA].filter((id) => setB.has(id));
        if (shared.length > 0) {
          connections.push({
            a: categories[i].id,
            b: categories[j].id,
            labels: shared.map((id) => typeName.get(id) ?? "?"),
          });
        }
      }
    }

    // Paralel bağlantılar — farklı kategorilerde aynı isimli alt kategoriler
    const parallels: MapParallel[] = [];
    for (let i = 0; i < categories.length; i++) {
      for (let j = i + 1; j < categories.length; j++) {
        for (const sa of categories[i].subs) {
          for (const sb of categories[j].subs) {
            if (
              sa.name.toLowerCase().trim() === sb.name.toLowerCase().trim()
            ) {
              parallels.push({ a: sa.id, b: sb.id });
            }
          }
        }
      }
    }

    return { categories, connections, parallels };
  }, []);

  return (
    <div className="relative -mx-4 -mb-4 overflow-hidden" style={{ height: "100%" }}>
      {data ? (
        data.categories.length === 0 ? (
          <div className="flex h-full items-center justify-center px-4">
            <EmptyState
              icon={Waypoints}
              title="Harita boş"
              description="Bağlantı haritasını görmek için önce kategori oluştur."
            />
          </div>
        ) : (
          <ConnectionMap
            categories={data.categories}
            connections={data.connections}
            parallels={data.parallels}
          />
        )
      ) : null}

      {/* Header */}
      <div className="absolute top-10 left-4 z-10">
        <Link
          href="/structure"
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Yapı
        </Link>
      </div>
      <div className="absolute top-10 inset-x-0 flex justify-center z-10 pointer-events-none">
        <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground/60">
          Bağlantı Haritası
        </span>
      </div>

      {/* Legend */}
      {data && (data.connections.length > 0 || data.parallels.length > 0) && (
        <div className="absolute bottom-4 inset-x-0 flex justify-center z-10 pointer-events-none">
          <div className="flex items-center gap-3 rounded-full border border-border bg-card/80 backdrop-blur-sm px-4 py-1.5">
            {data.connections.length > 0 && (
              <div className="flex items-center gap-1.5">
                <svg width="18" height="4" viewBox="0 0 18 4">
                  <line x1="0" y1="2" x2="18" y2="2" stroke="currentColor" className="text-muted-foreground" strokeWidth="1" strokeDasharray="3 3" />
                </svg>
                <span className="text-[10px] text-muted-foreground">ortak mod</span>
              </div>
            )}
            {data.connections.length > 0 && data.parallels.length > 0 && (
              <div className="w-px h-3 bg-border" />
            )}
            {data.parallels.length > 0 && (
              <div className="flex items-center gap-1.5">
                <svg width="18" height="4" viewBox="0 0 18 4">
                  <line x1="0" y1="2" x2="18" y2="2" stroke="#a78bfa" strokeWidth="1.5" />
                </svg>
                <span className="text-[10px] text-muted-foreground">paralel</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
