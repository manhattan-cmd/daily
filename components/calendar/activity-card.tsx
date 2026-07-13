"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Boxes, ChevronDown, Plus, Trash2 } from "lucide-react";
import type { Activity, EntryWithContext } from "@/types";
import { deleteActivity } from "@/lib/db/queries";
import {
  classifyNumericMod,
  dtrDurationHours,
  fmtNum,
  parseNumeric,
} from "@/lib/analytics";
import { formatTime } from "@/lib/utils";
import { EditEntryModal } from "@/components/forms/edit-entry-modal";
import { EntryIcon } from "@/components/dashboard/entry-icon";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * Gün sayfasındaki aktivite kartı — farklı kategorilerden girdileri tek çatı
 * altında katlar. Başlıkta çocukların sayısal modlarından otomatik toplamlar
 * (sayı/süre toplanır, skala atlanır — puanları toplamak anlamsız) ve kategori
 * renk noktaları. Açılınca girdiler mini satırlar; satıra dokununca düzenleme.
 * Silme iki seçenekli: "dağıt" (girdiler bağımsız kalır) / girdilerle sil.
 */
export function ActivityCard({
  activity,
  entries,
  onAddEntries,
}: {
  activity?: Activity;
  entries: EntryWithContext[];
  /** "Girdi ekle" — sheet'i bu aktiviteyle (isim adımı atlanarak) açar */
  onAddEntries?: (activity: Activity) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState<EntryWithContext | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const name = activity?.name ?? "Aktivite";

  // Otomatik toplamlar — mod bazında; en büyük 3 gösterilir
  const totals = useMemo(() => {
    const map = new Map<string, { name: string; unit: string; total: number }>();
    for (const e of entries) {
      for (const v of e.values) {
        if (!v.modId || !v.mod || !v.entryType) continue;
        const nm = classifyNumericMod(v.mod, v.entryType);
        if (!nm || nm.kind === "scale") continue;
        const amount =
          nm.kind === "duration" ? dtrDurationHours(v.value) : parseNumeric(v.value);
        if (!amount) continue;
        const cur = map.get(nm.id) ?? { name: nm.name, unit: nm.unit, total: 0 };
        cur.total += amount;
        map.set(nm.id, cur);
      }
    }
    return [...map.values()].sort((a, b) => b.total - a.total).slice(0, 3);
  }, [entries]);

  // Kategori renk noktaları (görülme sırasıyla, tekil)
  const cats = useMemo(
    () => [...new Map(entries.map((e) => [e.category.id, e.category])).values()],
    [entries]
  );

  async function handleDelete(mode: "disband" | "with-entries") {
    if (!activity) return;
    setDeleting(true);
    try {
      await deleteActivity(activity.id, mode);
    } finally {
      setDeleting(false);
      setDeleteOpen(false);
    }
  }

  return (
    <>
      <div
        className={cn(
          "group overflow-hidden rounded-2xl border transition-colors",
          "border-cyan-500/25 bg-gradient-to-br from-cyan-500/12 via-cyan-500/4 to-transparent"
        )}
      >
        {/* Başlık — dokununca açılır/kapanır */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setExpanded((v) => !v)}
          onKeyDown={(e) => {
            if (e.key === "Enter") setExpanded((v) => !v);
          }}
          aria-label={`${name} aktivitesini ${expanded ? "kapat" : "aç"}`}
          className="relative flex w-full cursor-pointer items-center gap-3 p-3 text-left select-none"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cyan-500/20">
            <Boxes className="h-4.5 w-4.5 text-cyan-300" />
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 text-[10px] leading-none">
              <span className="font-semibold uppercase tracking-[0.14em] text-cyan-300/80">
                Aktivite
              </span>
              <span className="text-muted-foreground/40">·</span>
              <span className="text-muted-foreground/70">
                {entries.length} girdi
              </span>
              <span className="ml-0.5 flex items-center gap-1">
                {cats.map((c) => (
                  <span
                    key={c.id}
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: c.color }}
                  />
                ))}
              </span>
            </div>
            <div className="mt-1 text-sm font-semibold truncate">{name}</div>
            {totals.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {totals.map((t) => (
                  <span
                    key={t.name}
                    className="flex items-baseline gap-1 rounded-md bg-muted/70 px-2 py-0.5"
                  >
                    <span className="text-xs font-semibold tabular-nums">
                      {fmtNum(t.total)}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {t.unit ? `${t.unit} ` : ""}
                      {t.name}
                    </span>
                  </span>
                ))}
              </div>
            )}
          </div>
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-muted-foreground/60 transition-transform duration-200",
              expanded && "rotate-180"
            )}
          />
          {/* Sil/dağıt — köşede, hover'da belirir */}
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              setDeleteOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.stopPropagation();
                setDeleteOpen(true);
              }
            }}
            className="absolute right-2 top-2 rounded-lg p-1.5 text-muted-foreground/0 transition-colors group-hover:text-muted-foreground/60 hover:!text-destructive hover:bg-destructive/10"
            aria-label="Aktiviteyi sil veya dağıt"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </span>
        </div>

        {/* Girdiler — satıra dokununca düzenleme */}
        {expanded && (
          <div className="border-t border-cyan-500/15 px-3 py-2 flex flex-col">
            {/* Aksiyon satırı: girdi ekle + analiz */}
            <div className="flex items-center justify-between gap-2 px-1.5 pb-1.5">
              {activity && onAddEntries ? (
                <button
                  type="button"
                  onClick={() => onAddEntries(activity)}
                  className="flex items-center gap-1 text-xs font-medium text-cyan-300/80 hover:text-cyan-200 transition-colors"
                >
                  <Plus className="h-3 w-3" />
                  Girdi ekle
                </button>
              ) : (
                <span />
              )}
              <Link
                href={`/analytics/activity/${encodeURIComponent(name)}`}
                className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                Aktivite Analizi
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            {entries.map((e) => {
              const valueChips = e.values
                .filter((v) => v.entryTypeId && v.entryType)
                .slice(0, 3);
              return (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => setEditing(e)}
                  className="flex items-center gap-2.5 rounded-xl px-1.5 py-2 text-left transition-colors hover:bg-white/5 active:scale-[0.99]"
                  aria-label={`${e.subcategory.name} girdisini düzenle`}
                >
                  <EntryIcon
                    category={e.category}
                    subcategory={e.subcategory}
                    size="sm"
                  />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium truncate block">
                      {e.subcategory.isCategoryRoot
                        ? e.category.name
                        : e.subcategory.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {valueChips.map((v) => (
                      <span
                        key={v.id}
                        className="rounded-md bg-muted/70 px-1.5 py-0.5 text-xs font-semibold tabular-nums"
                      >
                        {(v.entryType!.valueType ?? "number") === "boolean"
                          ? v.value === "true"
                            ? "Evet"
                            : "Hayır"
                          : v.value}
                        {v.entryType!.unit && (
                          <span className="ml-0.5 font-normal text-muted-foreground text-[10px]">
                            {v.entryType!.unit}
                          </span>
                        )}
                      </span>
                    ))}
                    <span className="text-[10px] text-muted-foreground/60 tabular-nums">
                      {formatTime(e.occurredAt)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {editing && (
        <EditEntryModal
          entry={editing}
          open
          onOpenChange={(o) => {
            if (!o) setEditing(null);
          }}
        />
      )}

      {/* Silme onayı — dağıt / girdilerle sil */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="max-w-[340px]">
          <DialogHeader>
            <DialogTitle>{`"${name}" aktivitesi`}</DialogTitle>
            <DialogDescription>
              Dağıtırsan içindeki {entries.length} girdi bağımsız girdi olarak
              günde kalır; girdilerle silersen hepsi kalıcı olarak silinir.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setDeleteOpen(false)}
              disabled={deleting}
            >
              Vazgeç
            </Button>
            <Button
              variant="outline"
              onClick={() => handleDelete("disband")}
              disabled={deleting}
            >
              Dağıt
            </Button>
            <Button
              variant="destructive"
              onClick={() => handleDelete("with-entries")}
              disabled={deleting}
            >
              {deleting ? "..." : "Girdilerle Sil"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
