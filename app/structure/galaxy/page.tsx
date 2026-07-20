"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { Waypoints } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { StructureTabs } from "@/components/structure/structure-tabs";
import { db } from "@/lib/db";
import ConnectionMap, {
  type MapCategory,
  type MapConnection,
  type MapParallel,
} from "@/components/structure/connection-map";
import { EmptyState } from "@/components/ui/empty-state";

export default function GalaxyPage() {
  const data = useLiveQuery(async () => {
    const [cats, allSubs, attachments, poolMods, entryTypes] = await Promise.all([
      db.categories.orderBy("order").toArray(),
      db.subcategories.toArray(),
      db.categoryModifiers.toArray(),
      db.mods.toArray(),
      db.entryTypes.toArray(),
    ]);
    const modName = new Map(poolMods.map((m) => [m.id, m.name]));
    const valueTypeByEntryType = new Map(
      entryTypes.map((t) => [t.id, t.valueType ?? "number"])
    );
    // Modun ölçüsü — parçacık simgesi bunun üstünden seçilir
    const modMeasure = new Map(
      poolMods.map((m) => [
        m.id,
        valueTypeByEntryType.get(m.entryTypeId) ?? "number",
      ])
    );
    const subById = new Map(allSubs.map((s) => [s.id, s]));

    // Kategori başına paylaşılan atomlar: kategori + alt kategorilerinin modları
    const modsByCat = new Map<string, Set<string>>();
    for (const a of attachments) {
      if (!a.modId) continue;
      const catId =
        a.targetType === "category"
          ? a.targetId
          : subById.get(a.targetId)?.categoryId;
      if (!catId) continue;
      if (!modsByCat.has(catId)) modsByCat.set(catId, new Set());
      modsByCat.get(catId)!.add(a.modId);
    }

    const categories: MapCategory[] = cats.map((cat) => ({
      id: cat.id,
      name: cat.name,
      color: cat.color,
      icon: cat.icon,
      subs: allSubs
        .filter((s) => s.categoryId === cat.id && !s.parentId && !s.isCategoryRoot)
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
            labels: shared.map((id) => ({
              name: modName.get(id) ?? "?",
              valueType: modMeasure.get(id) ?? "number",
            })),
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
    <div className="flex flex-col" style={{ height: "100%" }}>
      {/* Diğer Yapı sayfalarıyla aynı başlık + menü hizası */}
      <PageHeader
        title="Yapı"
        description="Harita — kategori ve özellik bağlantıları"
        className="mb-0"
      />
      <StructureTabs className="mt-4 mb-4" />

      <div className="relative flex-1 -mx-4 -mb-4 overflow-hidden">
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

        {/* Legend */}
      {data && (data.connections.length > 0 || data.parallels.length > 0) && (
        <div className="absolute bottom-4 inset-x-0 flex justify-center z-10 pointer-events-none">
          <div className="flex items-center gap-3 rounded-full border border-border bg-card/80 backdrop-blur-sm px-4 py-1.5">
            {data.connections.length > 0 && (
              <div className="flex items-center gap-1.5">
                <svg width="18" height="4" viewBox="0 0 18 4">
                  <line x1="0" y1="2" x2="18" y2="2" stroke="currentColor" className="text-muted-foreground" strokeWidth="1" strokeDasharray="3 3" />
                </svg>
                <span className="text-[10px] text-muted-foreground">ortak özellik</span>
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
    </div>
  );
}
