"use client";

import { Trash2 } from "lucide-react";
import type { EntryWithContext } from "@/types";
import { Button } from "@/components/ui/button";
import { deleteEntry } from "@/lib/db/queries";
import { formatDateTime } from "@/lib/utils";

export function EntryCard({ entry }: { entry: EntryWithContext }) {
  async function onDelete() {
    if (!confirm("Bu girdiyi silmek istediğinden emin misin?")) return;
    await deleteEntry(entry.id);
  }

  return (
    <div className="group rounded-2xl border border-border bg-card p-4 transition-colors">
      <div className="flex items-start gap-3">
        <div
          className="mt-0.5 h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: entry.category.color }}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="font-medium">{entry.subcategory.name}</span>
              <span className="text-xs text-muted-foreground">
                {entry.category.name}
              </span>
            </div>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={onDelete}
              aria-label="Sil"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>

          {entry.values.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm">
              {entry.values.map((v) => {
                const field = entry.fields.find((f) => f.id === v.fieldId);
                if (!field) return null;
                return (
                  <span key={v.id} className="text-muted-foreground">
                    <span className="text-foreground">
                      {formatValue(field, v.value)}
                    </span>{" "}
                    {field.name}
                  </span>
                );
              })}
            </div>
          ) : null}

          {entry.notes ? (
            <p className="mt-2 text-sm text-muted-foreground">{entry.notes}</p>
          ) : null}

          <div className="mt-2 text-xs text-muted-foreground">
            {formatDateTime(entry.occurredAt)}
          </div>
        </div>
      </div>
    </div>
  );
}

function formatValue(
  field: EntryWithContext["fields"][number],
  raw: string
): string {
  if (raw === "") return "—";
  switch (field.type) {
    case "money":
      return `${raw} ${field.options?.currency ?? "TL"}`;
    case "duration":
      return `${raw} dk`;
    case "boolean":
      return raw === "true" ? "Evet" : "Hayır";
    case "rating":
      return `${raw}/10`;
    case "number":
      return field.options?.unit ? `${raw} ${field.options.unit}` : raw;
    default:
      return raw;
  }
}
