"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { NotebookPen } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { listAllNotes, listNoteTags } from "@/lib/db/queries";
import { NotesMap } from "@/components/notes/notes-map";
import { EmptyState } from "@/components/ui/empty-state";

export default function NotesMapPage() {
  const notes = useLiveQuery(() => listAllNotes(), []);
  const tags = useLiveQuery(() => listNoteTags(), []);

  const ready = notes !== undefined && tags !== undefined;

  return (
    <div className="flex flex-col" style={{ height: "100%" }}>
      <PageHeader
        title="Not Haritası"
        description="Ortak örüntülere göre bağlanan notlar"
        back="/structure/notes"
        className="mb-0"
      />

      <div className="relative flex-1 -mx-4 -mb-4 overflow-hidden">
        {!ready ? null : notes.length < 2 ? (
          <div className="flex h-full items-center justify-center px-4">
            <EmptyState
              icon={NotebookPen}
              title="Harita için yeterli not yok"
              description="En az iki not olduğunda aralarındaki bağlar burada belirir."
            />
          </div>
        ) : (
          <>
            <NotesMap notes={notes} tags={tags} />
            {/* Legend */}
            <div className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex justify-center">
              <div className="flex items-center gap-2 rounded-full border border-border bg-card/80 px-4 py-1.5 backdrop-blur-sm">
                <svg width="24" height="6" viewBox="0 0 24 6">
                  <line
                    x1="1"
                    y1="3"
                    x2="23"
                    y2="3"
                    stroke="#a78bfa"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                  />
                </svg>
                <span className="text-[10px] text-muted-foreground">
                  kalın çizgi = güçlü örüntü bağı
                </span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
