"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { Waypoints } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { getEntryBriefs, listAllNotes } from "@/lib/db/queries";
import { LifeMap } from "@/components/notes/life-map";
import type { LifeGraph, LifeNode, LifeEdge } from "@/lib/life-graph";
import { EmptyState } from "@/components/ui/empty-state";

function noteTitleOf(title: string | undefined, blocks: { text: string }[]) {
  return (
    (title ?? "").trim() ||
    blocks.map((b) => b.text.trim()).find(Boolean) ||
    "Not"
  );
}

export default function LifeMapPage() {
  const graph = useLiveQuery(async (): Promise<LifeGraph> => {
    const notes = await listAllNotes();
    const noteIds = new Set(notes.map((n) => n.id));

    // Girdi bağlarının hedefleri
    const entryIds = new Set<string>();
    for (const n of notes)
      for (const b of n.blocks)
        for (const l of b.links ?? [])
          if (l.type === "entry") entryIds.add(l.targetId);
    const entryBriefs = await getEntryBriefs([...entryIds]);

    const nodes: LifeNode[] = [];
    for (const n of notes) {
      nodes.push({
        id: n.id,
        kind: "note",
        label: noteTitleOf(n.title, n.blocks),
        date: n.date,
      });
    }
    for (const [id, e] of entryBriefs) {
      nodes.push({ id, kind: "entry", label: e.title, color: e.color, date: e.date });
    }

    const edges: LifeEdge[] = [];
    const seen = new Set<string>();
    for (const n of notes) {
      for (const b of n.blocks) {
        for (const l of b.links ?? []) {
          const targetOk =
            l.type === "note" ? noteIds.has(l.targetId) : entryBriefs.has(l.targetId);
          if (!targetOk || l.targetId === n.id) continue;
          const key = `${n.id}|${l.targetId}|${l.anchor}`;
          if (seen.has(key)) continue;
          seen.add(key);
          edges.push({ a: n.id, b: l.targetId, anchor: l.anchor });
        }
      }
    }

    return { nodes, edges };
  }, []);

  const ready = graph !== undefined;
  const hasEdges = (graph?.edges.length ?? 0) > 0;

  return (
    <div className="flex flex-col" style={{ height: "100%" }}>
      <PageHeader
        title="Hayat Haritası"
        description="Notlar ve girdiler — kendi kurduğun bağlar"
        back="/structure/notes"
        className="mb-0"
      />

      <div className="relative flex-1 -mx-4 -mb-4 overflow-hidden">
        {!ready ? null : !hasEdges ? (
          <div className="flex h-full items-center justify-center px-4">
            <EmptyState
              icon={Waypoints}
              title="Henüz bağ yok"
              description="Bir notta bir kelimeyi seçip “Girdi iliştir” ya da bir öbeği seçip “Not aç” dediğinde kurduğun bağlar burada belirir."
            />
          </div>
        ) : (
          <>
            <LifeMap graph={graph} />
            <div className="pointer-events-none absolute inset-x-0 top-2 z-10 flex justify-center">
              <div className="flex items-center gap-3 rounded-full border border-border bg-card/80 px-4 py-1.5 backdrop-blur-sm">
                <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#a78bfa]" />
                  not
                </span>
                <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#f97316]" />
                  girdi · yakınlaş, sürükle, dokun
                </span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
