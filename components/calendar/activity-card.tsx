"use client";

import { useMemo, useState } from "react";
import { thingLabel } from "@/lib/db/thing-names";
import Link from "next/link";
import { ArrowRight, Boxes, ChevronDown, Plus, Sigma, Trash2 } from "lucide-react";
import type { Activity, EntryWithContext } from "@/types";
import { deleteActivity } from "@/lib/db/queries";
import {
  classifyMod,
  dtrDurationHours,
  fmtNum,
  parseNumeric,
} from "@/lib/analytics";
import { formatTime } from "@/lib/utils";
import { useT } from "@/lib/i18n";
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
import { useLongPress } from "@/lib/use-long-press";
import {
  SelectionLayer,
  selectedCardClass,
  type EntrySelection,
} from "@/components/calendar/entry-selection";
import { routes } from "@/lib/routes";
import { useSkin } from "@/lib/skin";
import { SymbolIcon } from "@/lib/icons";
import { ValueCapsuleRow } from "@/components/dashboard/entry-parts";
import { ENTRY_BLOCK_CLS, EntryBlockCell, EntryBlockHead, EntryBlockTime } from "@/components/dashboard/entry-block";

/** Aktivitenin rengi — kategorisi yok, kendi camgöbeği */
const ACT = "#06b6d4";

/**
 * Gün sayfasındaki aktivite kartı — farklı kategorilerden girdileri tek çatı
 * altında katlar. Başlıkta çocukların sayısal modlarından otomatik toplamlar
 * (sayı/süre toplanır, skala atlanır — puanları toplamak anlamsız) ve kategori
 * renk noktaları. Açılınca girdiler mini satırlar; satıra dokununca düzenleme.
 * Silme iki seçenekli: "dağıt" (girdiler bağımsız kalır) / girdilerle sil.
 * `selection` verilirse basılı tutmak aktivitenin tüm girdilerini seçer.
 */
export function ActivityCard({
  activity,
  entries,
  onAddEntries,
  selection,
}: {
  activity?: Activity;
  entries: EntryWithContext[];
  /** "Girdi ekle" — sheet'i bu aktiviteyle (isim adımı atlanarak) açar */
  onAddEntries?: (activity: Activity) => void;
  selection?: EntrySelection;
}) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState<EntryWithContext | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const longPress = useLongPress({ onLongPress: () => selection?.onStart() });
  const brutal = useSkin() === "brutal";

  const name = activity?.name ?? "Aktivite";

  // Otomatik toplamlar — özellik × alt kategori bazında; farklı alt
  // kategorilerin değerleri TOPLANMAZ (60 şınav + 50 squat ≠ 110), her biri
  // kendi adıyla gösterilir. En büyük 3 gösterilir.
  const totals = useMemo(() => {
    const map = new Map<
      string,
      { name: string; unit: string; total: number; subName: string }
    >();
    for (const e of entries) {
      const subName = e.subcategory.isCategoryRoot
        ? e.category.name
        : e.subcategory.name;
      for (const v of e.values) {
        if (!v.modId || !v.mod) continue;
        const nm = classifyMod(v.mod);
        // Kart TOPLAM gösteriyor; yalnız toplanabilir türler girer. Skala
        // ortalanır, oran/doluluk/dağılım ise toplanacak bir sayı taşımaz.
        if (!nm || (nm.kind !== "number" && nm.kind !== "duration")) continue;
        const amount =
          nm.kind === "duration" ? dtrDurationHours(v.value) : parseNumeric(v.value);
        if (!amount) continue;
        const key = `${nm.id}:${e.subcategoryId}`;
        const cur =
          map.get(key) ?? { name: nm.name, unit: nm.unit, total: 0, subName };
        cur.total += amount;
        map.set(key, cur);
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

  // Düzenleme ve silme onayı — iki biçimde de aynı
  const overlays = (
    <>
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
              days kalır; girdilerle silersen hepsi kalıcı olarak silinir.
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

  // Brütal: ana sayfanın blok dili (bkz. entry-block) — künye aktivitenin
  // camgöbeğinde (ad, girdi sayısı, kategori noktaları, aç/kapa), altında
  // beyaz hücrede toplam kapsülleri; açılınca eylem satırı ve her girdi kendi
  // hücresinde, değerleri kapsül
  if (brutal) {
    return (
      <>
        <div
          data-entry-block=""
          className={cn(ENTRY_BLOCK_CLS, selection?.selected && selectedCardClass)}
          {...(selection && !selection.active ? longPress : {})}
        >
          <div
            role="button"
            tabIndex={0}
            onClick={() => setExpanded((v) => !v)}
            onKeyDown={(e) => {
              if (e.key === "Enter") setExpanded((v) => !v);
            }}
            aria-label={`${name} aktivitesini ${expanded ? "kapat" : "aç"}`}
            className="cursor-pointer"
          >
            <EntryBlockHead
              color={ACT}
              icon={<Boxes className="h-3.5 w-3.5" strokeWidth={2.25} />}
              title={name}
              sub={
                <span className="flex items-center gap-1">
                  {t("add.activity")} · {entries.length} {t("home.entries")}
                  <span className="ml-0.5 flex items-center gap-[3px]">
                    {cats.map((c) => (
                      <span
                        key={c.id}
                        className="h-[7px] w-[7px] rounded-full border border-[#111]"
                        style={{ backgroundColor: c.color }}
                      />
                    ))}
                  </span>
                </span>
              }
              right={
                <ChevronDown
                  className={cn("h-4 w-4 shrink-0 transition-transform duration-200", expanded && "rotate-180")}
                  strokeWidth={2.75}
                />
              }
            />
          </div>

          {/* Toplamlar — kapsül (alt kategori başına, toplanabilen özellikler) */}
          {totals.length > 0 && (
            <EntryBlockCell className="flex flex-wrap items-center gap-1">
              {totals.map((x) => (
                <span
                  key={`${x.name}:${x.subName}`}
                  data-capsule=""
                  className="inline-flex items-center gap-1 rounded-full py-0.5 pl-0.5 pr-2"
                  style={{ ["--cap-c" as string]: ACT, background: `${ACT}14`, boxShadow: `inset 0 0 0 1px ${ACT}33` }}
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full" style={{ background: `${ACT}33` }}>
                    <Sigma className="h-3 w-3" strokeWidth={2.25} />
                  </span>
                  <span className="text-[13px] font-semibold leading-none tabular-nums">{fmtNum(x.total)}</span>
                  {x.unit && <span className="text-[10px] leading-none">{x.unit}</span>}
                  <span className="text-[10px] leading-none">{x.subName}</span>
                </span>
              ))}
            </EntryBlockCell>
          )}

          {expanded && (
            <>
              <EntryBlockCell className="flex items-center gap-3 text-[11.5px] font-extrabold">
                {activity && onAddEntries && (
                  <button type="button" onClick={() => onAddEntries(activity)} className="flex items-center gap-1 active:opacity-60">
                    <Plus className="h-3.5 w-3.5" strokeWidth={3} />
                    {t("home.addEntry")}
                  </button>
                )}
                <Link href={routes.activity(name)} className="ml-auto flex items-center gap-1 active:opacity-60">
                  {t("activity.insights")}
                  <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.75} />
                </Link>
                <button
                  type="button"
                  onClick={() => setDeleteOpen(true)}
                  aria-label={t("activity.deleteOrUnpack")}
                  className="flex items-center gap-1 text-[#c0262d] active:opacity-60"
                >
                  <Trash2 className="h-3.5 w-3.5" strokeWidth={2.5} />
                  {t("action.delete")}
                </button>
              </EntryBlockCell>
              {entries.map((e) => {
                const icon = e.subcategory.icon || e.category.icon;
                const vals = e.values.filter((v) => !!v.entryType && !v.thingId);
                return (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => setEditing(e)}
                    className="flex min-w-0 flex-col gap-1 bg-white px-2 py-1.5 text-left active:bg-[#f5f1e8]"
                    aria-label={`${e.subcategory.name} girdisini düzenle`}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] border-[1.5px] border-[#111]"
                        style={{ background: e.category.color }}
                      >
                        {icon && <SymbolIcon name={icon} size={13} style={{ color: "#111" }} />}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[12.5px] font-bold">
                        {e.subcategory.isCategoryRoot ? e.category.name : e.subcategory.name}
                      </span>
                      <EntryBlockTime>{formatTime(e.occurredAt)}</EntryBlockTime>
                    </span>
                    {vals.length > 0 && <ValueCapsuleRow values={vals} color={e.category.color} />}
                  </button>
                );
              })}
            </>
          )}

          {selection?.active && (
            <SelectionLayer
              selected={selection.selected}
              onToggle={selection.onToggle}
              label={`${name} aktivitesinin girdilerini seç`}
            />
          )}
        </div>
        {overlays}
      </>
    );
  }

  return (
    <>
      <div
        data-entry-card=""
        style={{ ["--card-c" as string]: "#06b6d4" }}
        className={cn(
          "group relative select-none touch-manipulation overflow-hidden rounded-2xl border transition-colors",
          "border-cyan-500/45 bg-card bg-gradient-to-br from-cyan-500/14 via-cyan-500/5 to-transparent",
          selection?.selected && selectedCardClass
        )}
        {...(selection && !selection.active ? longPress : {})}
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
          className="relative flex w-full cursor-pointer items-center gap-2.5 px-3 py-2.5 text-left select-none"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-cyan-500/20">
            <Boxes className="h-4 w-4 text-cyan-300" strokeWidth={1.75} />
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
            <div className="mt-0.5 text-sm font-semibold truncate">{name}</div>
            {totals.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1.5">
                {totals.map((t) => (
                  <span
                    key={`${t.name}:${t.subName}`}
                    className="flex items-baseline gap-1 rounded-md bg-muted/70 px-2 py-0.5"
                  >
                    <span className="text-xs font-semibold tabular-nums">
                      {fmtNum(t.total)}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {t.unit ? `${t.unit} ` : ""}
                      {t.subName}
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
                  Add entry
                </button>
              ) : (
                <span />
              )}
              <div className="flex items-center gap-3">
                <Link
                  href={routes.activity(name)}
                  className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  Aktivite Analizi
                  <ArrowRight className="h-3 w-3" />
                </Link>
                {/* Sil/dağıt — görünür buton (köşedeki hover-gizli buton okla çakışıyordu) */}
                <button
                  type="button"
                  onClick={() => setDeleteOpen(true)}
                  className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-destructive"
                  aria-label={t("activity.deleteOrUnpack")}
                >
                  <Trash2 className="h-3 w-3" />
                  Sil
                </button>
              </div>
            </div>
            {entries.map((e) => {
              const valueChips = e.values
                .filter((v) => !!v.entryType)
                .slice(0, 3);
              return (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => setEditing(e)}
                  className="flex items-center gap-2.5 rounded-xl px-1.5 py-2 text-left transition-colors hover:bg-[var(--sf-2)] active:scale-[0.99]"
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
                            ? "Yes"
                            : "No"
                          : v.entryType!.valueType === "object"
                            ? thingLabel(v.value)
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

        {selection?.active && (
          <SelectionLayer
            selected={selection.selected}
            onToggle={selection.onToggle}
            label={`${name} aktivitesinin girdilerini seç`}
          />
        )}
      </div>

      {overlays}
    </>
  );
}
