"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  ChevronRight,
  CornerUpLeft,
  Folder,
  FolderInput,
  FolderOpen,
  Move,
  Plus,
  Trash2,
} from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { useLongPress } from "@/lib/use-long-press";
import { moveSubCategory, listCategories } from "@/lib/db/queries";
import { CategoryTileCore } from "@/components/structure/category-tile";
import { modAtomIcon } from "@/components/structure/mod-atom";
import { DeleteSubCategoryDialog } from "@/components/structure/delete-subcategory-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import type { EntryType, SubCategory } from "@/types";

type SubMods = { name?: string; entryType: EntryType }[];
type TreeData = {
  childrenMap: Map<string, SubCategory[]>;
  modsBySub: Map<string, SubMods>;
};

/** Sürükleme sırasında parmağın altındaki bırakma hedefi */
type DropTarget =
  | { kind: "sub"; id: string } // bir satırın üzerine → onun altına taşı
  | { kind: "root" } // ağacın köküne taşı
  | { kind: "trash" } // sil
  | { kind: "othercat" }; // başka kategoriye taşı (seçici açılır)

/**
 * Alt kategori ağacı — hiyerarşi iç içe açılır satırlarla. Her satır: kare
 * raf çekirdeği + ad + satırın kendi özellik atomları (minik daireler).
 *
 * Taşıma ayrı bir "düzenleme modu" istemez: satırı basılı tut, sürükle. Başka
 * bir satırın üstüne bırakınca onun altına taşınır; ayrıca köke, çöpe ya da
 * başka bir kategoriye bırakılabilir (bu hedefler yalnız sürüklerken çıkar).
 * Taşıma mantığı moveSubCategory'de (döngü koruması, alt ağaç kategori
 * güncellemesi). Girdi ekleme ağındaki jestle aynı.
 */
export function SubCategoryTree({
  categoryId,
  categoryName,
  color,
  parentId,
  parentName,
  onAddChild,
}: {
  categoryId: string;
  /** Ekleme satırlarında "neyin altına" olduğunu açıkça yazmak için */
  categoryName?: string;
  color: string;
  /** undefined: kategorinin kök alt kategorileri; dolu: bu düğümün çocukları */
  parentId?: string;
  /** parentId doluyken o dalın adı — ekleme satırı bunu yazar */
  parentName?: string;
  /** parentSubId undefined ise kök seviyeye ekleme istenmiştir */
  onAddChild: (parentSubId?: string) => void;
}) {
  const t = useT();
  const data = useLiveQuery(async (): Promise<TreeData> => {
    const [subs, atts, mods, types] = await Promise.all([
      db.subcategories.where("categoryId").equals(categoryId).toArray(),
      db.categoryModifiers.toArray(),
      db.mods.toArray(),
      db.entryTypes.toArray(),
    ]);
    const visible = subs.filter((s) => !s.isCategoryRoot);
    const subIds = new Set(visible.map((s) => s.id));
    const modById = new Map(mods.map((m) => [m.id, m]));
    const typeById = new Map(types.map((t) => [t.id, t]));

    // Semboller alt kategori sayfasındaki daire sırasıyla aynı gelsin
    atts.sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);

    const modsBySub = new Map<string, SubMods>();
    for (const a of atts) {
      if (a.targetType !== "subcategory" || !subIds.has(a.targetId)) continue;
      const mod = a.modId ? modById.get(a.modId) : undefined;
      const entryType = typeById.get(mod?.entryTypeId ?? a.entryTypeId ?? "");
      if (!entryType) continue;
      const list = modsBySub.get(a.targetId) ?? [];
      list.push({ name: mod?.name, entryType });
      modsBySub.set(a.targetId, list);
    }

    const childrenMap = new Map<string, SubCategory[]>();
    for (const s of visible) {
      const key = s.parentId ?? "";
      const list = childrenMap.get(key) ?? [];
      list.push(s);
      childrenMap.set(key, list);
    }
    for (const list of childrenMap.values()) {
      list.sort((a, b) => a.order - b.order);
    }
    return { childrenMap, modsBySub };
  }, [categoryId]);

  // Başka kategoriye taşıma seçicisi için diğer kategoriler
  const categories = useLiveQuery(() => listCategories(), []);

  const [drag, setDrag] = useState<{
    sub: SubCategory;
    /** Taşınanın kendisi + torunları — bunların üstüne/köke bırakılamaz (döngü) */
    invalidIds: Set<string>;
  } | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const dropRef = useRef<DropTarget | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<SubCategory | null>(null);
  const [movePickFor, setMovePickFor] = useState<SubCategory | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const allSubs = useMemo(
    () => (data ? [...data.childrenMap.values()].flat() : []),
    [data]
  );
  const subById = useMemo(() => {
    const m = new Map<string, SubCategory>();
    for (const s of allSubs) m.set(s.id, s);
    return m;
  }, [allSubs]);

  function startDrag(sub: SubCategory, pos: { x: number; y: number }) {
    const invalid = new Set<string>([sub.id]);
    const stack = [sub.id];
    while (stack.length) {
      const cur = stack.pop()!;
      for (const s of allSubs)
        if (s.parentId === cur && !invalid.has(s.id)) {
          invalid.add(s.id);
          stack.push(s.id);
        }
    }
    setDrag({ sub, invalidIds: invalid });
    setDragPos(pos);
    navigator.vibrate?.(15);
  }

  useEffect(() => {
    if (!drag) return;
    const setTarget = (t: DropTarget | null) => {
      dropRef.current = t;
      setDropTarget(t);
    };
    const endDrag = () => {
      setDrag(null);
      setDragPos(null);
      setTarget(null);
    };
    // Kaydırma kabı app-shell'in main'i — kenara yaklaşınca kendiliğinden kaysın
    const scroller = rootRef.current?.closest("main") as HTMLElement | null;
    const atRoot = (drag.sub.parentId ?? undefined) === (parentId ?? undefined);
    const onMove = (e: PointerEvent) => {
      setDragPos({ x: e.clientX, y: e.clientY });
      if (scroller) {
        const r = scroller.getBoundingClientRect();
        if (e.clientY < r.top + 60) scroller.scrollTop -= 12;
        else if (e.clientY > r.bottom - 90) scroller.scrollTop += 12;
      }
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const t = el?.closest?.(
        "[data-drop-sub],[data-drop-root],[data-drop-trash],[data-drop-othercat]"
      ) as HTMLElement | null;
      if (!t) return setTarget(null);
      if (t.dataset.dropTrash !== undefined) return setTarget({ kind: "trash" });
      if (t.dataset.dropOthercat !== undefined)
        return setTarget({ kind: "othercat" });
      if (t.dataset.dropRoot !== undefined) {
        if (atRoot) return setTarget(null); // zaten kökte — no-op
        return setTarget({ kind: "root" });
      }
      const subId = t.dataset.dropSub;
      if (subId) {
        // Kendi alt ağacına ya da zaten altında olduğu üste bırakılamaz
        if (drag.invalidIds.has(subId) || drag.sub.parentId === subId)
          return setTarget(null);
        return setTarget({ kind: "sub", id: subId });
      }
      setTarget(null);
    };
    const onUp = async () => {
      const t = dropRef.current;
      const moving = drag.sub;
      endDrag();
      if (!t) return;
      if (t.kind === "trash") {
        setConfirmDelete(moving);
      } else if (t.kind === "othercat") {
        setMovePickFor(moving);
      } else if (t.kind === "root") {
        await moveSubCategory(moving.id, { categoryId, parentId });
      } else if (t.kind === "sub") {
        const parent = subById.get(t.id);
        if (parent)
          await moveSubCategory(moving.id, {
            categoryId,
            parentId: parent.id,
          });
      }
    };
    const onCancel = () => endDrag();
    // Sürükleme boyunca dokunmatik kaydırmayı kilitle
    const prevent = (e: TouchEvent) => e.preventDefault();
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("touchmove", prevent, { passive: false });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("touchmove", prevent);
    };
  }, [drag, subById, categoryId, parentId]);

  if (!data) return null;
  const roots = data.childrenMap.get(parentId ?? "") ?? [];
  const rootLabel = parentId ? t("tree.moveToBranchRoot") : t("tree.moveToCategoryRoot");
  const currentCatName =
    (categories ?? []).find((c) => c.id === categoryId)?.name ?? "kategori";
  const otherCategories = (categories ?? []).filter(
    (c) => c.id !== categoryId && !c.isBuiltIn
  );
  // Silinen düğümün içindekilerinin taşınacağı üstün adı
  const deleteParentName = confirmDelete
    ? confirmDelete.parentId
      ? subById.get(confirmDelete.parentId)?.name ?? currentCatName
      : currentCatName
    : "";

  return (
    <div ref={rootRef} className="flex flex-col gap-0.5">
      {/* Jest ipucu — düzenleme modu yok, doğrudan basılı tut */}
      {roots.length > 0 && !drag && (
        <p className="flex items-center gap-1.5 px-1 pb-1.5 text-[11px] leading-snug text-muted-foreground/50">
          <Move className="h-3 w-3 shrink-0" />
          Hold and drag: move under another row, to the root, or delete
        </p>
      )}

      {/* Kök bırakma alanı — yalnızca sürüklerken görünür */}
      {drag && (
        <div
          data-drop-root
          className={cn(
            "mb-1 flex items-center gap-2 rounded-xl border-2 border-dashed px-3 py-2 text-xs font-medium transition-colors",
            dropTarget?.kind === "root"
              ? "border-primary bg-primary/15 text-primary"
              : "border-border/60 text-muted-foreground/80"
          )}
        >
          <CornerUpLeft className="h-3.5 w-3.5" />
          {rootLabel}
        </div>
      )}

      {roots.map((sub) => (
        <TreeNode
          key={sub.id}
          sub={sub}
          depth={0}
          categoryId={categoryId}
          color={color}
          data={data}
          draggingSubId={drag?.sub.id ?? null}
          dropTarget={dropTarget}
          onAddChild={onAddChild}
          onDragStart={startDrag}
        />
      ))}
      <AddRow
        color={color}
        emphasis
        label={`${parentName ?? categoryName ?? t("tree.here")} altına alt kategori ekle`}
        onClick={() => onAddChild(undefined)}
      />

      {/* Sürüklenen hayalet — parmağı izler */}
      {drag &&
        dragPos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[100]"
            style={{
              left: dragPos.x,
              top: dragPos.y,
              transform: "translate(-50%, -115%)",
            }}
          >
            <div
              className="flex items-center gap-2 rounded-xl px-2.5 py-1.5 shadow-2xl"
              style={{
                backgroundColor: `${color}26`,
                outline: `2px solid ${color}`,
                backdropFilter: "blur(4px)",
              }}
            >
              <CategoryTileCore
                color={color}
                icon={drag.sub.icon}
                fallback={Folder}
                size="sm"
              />
              <span className="max-w-[160px] truncate text-sm font-medium">
                {drag.sub.name}
              </span>
            </div>
          </div>,
          document.body
        )}

      {/* Alt bırakma alanları — sil + başka kategori */}
      {drag &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-x-0 bottom-4 z-[90] px-4">
            <div className="mx-auto flex max-w-[420px] gap-2">
              <div
                data-drop-trash
                className={cn(
                  "flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl border-2 border-dashed transition-colors",
                  dropTarget?.kind === "trash"
                    ? "border-red-500 bg-red-500/25 text-red-200"
                    : "border-red-500/40 bg-background/95 text-red-400/80"
                )}
              >
                <Trash2 className="h-4 w-4" />
                <span className="text-xs font-medium">{t("action.delete")}</span>
              </div>
              <div
                data-drop-othercat
                className={cn(
                  "flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl border-2 border-dashed transition-colors",
                  dropTarget?.kind === "othercat"
                    ? "border-primary bg-primary/25 text-primary"
                    : "border-primary/40 bg-background/95 text-primary/80"
                )}
              >
                <FolderInput className="h-4 w-4" />
                <span className="text-xs font-medium">{t("tree.otherCategory")}</span>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Çöpe sürükleme → silme seçenekleri (tamamen sil / sadece bunu sil) */}
      <DeleteSubCategoryDialog
        sub={confirmDelete}
        parentName={deleteParentName}
        onOpenChange={(o) => {
          if (!o) setConfirmDelete(null);
        }}
      />

      {/* Başka kategoriye taşıma seçicisi */}
      <Dialog
        open={movePickFor !== null}
        onOpenChange={(o) => {
          if (!o) setMovePickFor(null);
        }}
      >
        <DialogContent className="max-w-[340px] gap-4">
          <DialogHeader>
            <DialogTitle className="text-base">{t("tree.moveToOtherCategory")}</DialogTitle>
            <DialogDescription>
              &bdquo;{movePickFor?.name}&rdquo; (ve altındakiler) seçtiğin
              kategorinin köküne taşınır.
            </DialogDescription>
          </DialogHeader>
          <div className="flex max-h-[50dvh] flex-col gap-1.5 overflow-y-auto">
            {otherCategories.length === 0 ? (
              <p className="px-1 text-xs text-muted-foreground/70">
                Taşınacak başka kategori yok.
              </p>
            ) : (
              otherCategories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={async () => {
                    const moving = movePickFor;
                    setMovePickFor(null);
                    if (moving)
                      await moveSubCategory(moving.id, { categoryId: c.id });
                  }}
                  className="flex items-center gap-2.5 rounded-xl border border-border bg-card px-3 py-2.5 text-left transition-colors hover:border-primary/40 hover:bg-muted/40"
                >
                  <CategoryTileCore
                    color={c.color}
                    icon={c.icon}
                    size="sm"
                  />
                  <span className="truncate text-sm font-medium">{c.name}</span>
                </button>
              ))
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMovePickFor(null)}>
              İptal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TreeNode({
  sub,
  depth,
  categoryId,
  color,
  data,
  draggingSubId,
  dropTarget,
  onAddChild,
  onDragStart,
}: {
  sub: SubCategory;
  depth: number;
  categoryId: string;
  color: string;
  data: TreeData;
  draggingSubId: string | null;
  dropTarget: DropTarget | null;
  onAddChild: (parentSubId?: string) => void;
  onDragStart: (sub: SubCategory, pos: { x: number; y: number }) => void;
}) {
  const kids = data.childrenMap.get(sub.id) ?? [];
  const mods = data.modsBySub.get(sub.id) ?? [];
  // Kökler dolu geliyorsa hiyerarşi ilk bakışta görünsün
  const [open, setOpen] = useState(depth === 0 && kids.length > 0);
  // Basılı tutma → sürükleme. Jest tetiklendiğinde sonraki click yutulduğu
  // için satır bağlantısı açılmaz.
  const longPress = useLongPress({
    onLongPress: () => onDragStart(sub, lastPos.current),
    delay: 350,
    moveTolerance: 10,
  });
  const lastPos = useRef({ x: 0, y: 0 });

  const isDragging = draggingSubId === sub.id;
  const isDropTarget = dropTarget?.kind === "sub" && dropTarget.id === sub.id;

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-0.5">
        <Link
          href={`/structure/${categoryId}/${sub.id}`}
          prefetch={false}
          data-drop-sub={sub.id}
          // Bağlantılar varsayılan olarak sürüklenebilir; tarayıcının yerel
          // sürükleme jesti başlayınca pointer olayları iptal edilip bizim
          // taşımamız yarıda kalıyordu
          draggable={false}
          onDragStart={(e) => e.preventDefault()}
          {...longPress}
          onPointerDownCapture={(e) => {
            lastPos.current = { x: e.clientX, y: e.clientY };
          }}
          className={cn(
            "flex min-w-0 flex-1 select-none touch-manipulation items-center gap-2.5 rounded-xl px-1.5 py-1.5 transition-all",
            isDragging ? "opacity-30" : "hover:bg-white/5 active:scale-[0.99]"
          )}
          style={
            isDropTarget
              ? { outline: `2px solid ${color}`, outlineOffset: "1px" }
              : undefined
          }
        >
          <CategoryTileCore
            color={color}
            icon={sub.icon}
            fallback={kids.length > 0 ? FolderOpen : Folder}
            size="sm"
          />
          <span className="min-w-0 flex-1 truncate text-sm font-medium">
            {sub.name}
          </span>

          {/* Kaç alt kalemi var — hiyerarşi satırdan okunsun */}
          {kids.length > 0 && (
            <span
              className="shrink-0 rounded-full px-1.5 py-px text-[10px] font-semibold tabular-nums"
              style={{ backgroundColor: `${color}1f`, color: `${color}dd` }}
            >
              {kids.length}
            </span>
          )}

          {mods.length > 0 && (
            <span className="flex shrink-0 items-center gap-1 pl-0.5">
              {mods.slice(0, 3).map((m, i) => {
                const Icon = modAtomIcon(m);
                return (
                  <span
                    key={i}
                    className="flex h-5 w-5 items-center justify-center rounded-full"
                    style={{
                      background:
                        "radial-gradient(circle at 32% 28%, rgba(129,140,248,0.30), rgba(129,140,248,0.07) 72%)",
                      boxShadow: "inset 0 0 0 1px rgba(129,140,248,0.22)",
                    }}
                  >
                    <Icon className="h-3 w-3 text-primary" strokeWidth={1.75} />
                  </span>
                );
              })}
              {mods.length > 3 && (
                <span className="text-[10px] text-muted-foreground">
                  +{mods.length - 3}
                </span>
              )}
            </span>
          )}
        </Link>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground/60 transition-colors hover:bg-white/5 hover:text-foreground"
          aria-label={open ? `${sub.name} dalını kapat` : `${sub.name} dalını aç`}
          aria-expanded={open}
        >
          <ChevronRight
            className={cn(
              "h-4 w-4 transition-transform duration-200",
              open && "rotate-90"
            )}
          />
        </button>
      </div>

      {/* Çocuklar — kategori renginde kılavuz çizgisiyle iç içe */}
      {open && (
        <div
          className="ml-[21px] flex flex-col gap-0.5 border-l pl-2.5"
          style={{ borderColor: `${color}2e` }}
        >
          {kids.map((child) => (
            <TreeNode
              key={child.id}
              sub={child}
              depth={depth + 1}
              categoryId={categoryId}
              color={color}
              data={data}
              draggingSubId={draggingSubId}
              dropTarget={dropTarget}
              onAddChild={onAddChild}
              onDragStart={onDragStart}
            />
          ))}
          <AddRow
            color={color}
            label={`${sub.name} add inside`}
            onClick={() => onAddChild(sub.id)}
          />
        </div>
      )}
    </div>
  );
}

/**
 * Ekleme satırı — neyin altına eklendiğini açıkça yazar. `emphasis`: kategori
 * kökündeki ana ekleme, kategori renginde kesikli çerçeveyle öne çıkar.
 */
function AddRow({
  label,
  color,
  emphasis = false,
  onClick,
}: {
  label: string;
  color: string;
  emphasis?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex items-center gap-2.5 rounded-xl px-1.5 py-1.5 text-xs transition-colors",
        emphasis
          ? "mt-1 border border-dashed py-2 font-medium"
          : "text-muted-foreground/60 hover:bg-white/5 hover:text-foreground"
      )}
      style={
        emphasis
          ? { borderColor: `${color}45`, color: `${color}dd` }
          : undefined
      }
    >
      <span
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-dashed transition-colors"
        style={{
          borderColor: emphasis ? `${color}70` : undefined,
          color: emphasis ? color : undefined,
        }}
      >
        <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
      </span>
      <span className="truncate">{label}</span>
    </button>
  );
}
