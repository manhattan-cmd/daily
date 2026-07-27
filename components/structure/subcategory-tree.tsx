"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  Check,
  ChevronRight,
  CornerUpLeft,
  Folder,
  FolderInput,
  FolderOpen,
  GripVertical,
  Move,
  Plus,
  Trash2,
} from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import {
  moveSubCategory,
  deleteSubCategory,
  listCategories,
} from "@/lib/db/queries";
import { CategoryTileCore } from "@/components/structure/category-tile";
import { modAtomIcon } from "@/components/structure/mod-atom";
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
 * Düzenleme modu: "Düzenle · taşı" ile açılır. O modda satırlar basılı tutulup
 * sürüklenerek başka bir satırın altına, ağacın köküne, çöpe ya da başka bir
 * kategoriye taşınabilir. Taşıma mantığı moveSubCategory'de (döngü koruması,
 * alt ağaç kategori güncellemesi). Girdi ekleme sheet'indeki deneyimle aynı.
 */
export function SubCategoryTree({
  categoryId,
  color,
  parentId,
  onAddChild,
}: {
  categoryId: string;
  color: string;
  /** undefined: kategorinin kök alt kategorileri; dolu: bu düğümün çocukları */
  parentId?: string;
  /** parentSubId undefined ise kök seviyeye ekleme istenmiştir */
  onAddChild: (parentSubId?: string) => void;
}) {
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

  const [editMode, setEditMode] = useState(false);
  const [drag, setDrag] = useState<{
    sub: SubCategory;
    /** Taşınanın kendisi + torunları — bunların üstüne/köke bırakılamaz (döngü) */
    invalidIds: Set<string>;
  } | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const dropRef = useRef<DropTarget | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<SubCategory | null>(null);
  const [deleting, setDeleting] = useState(false);
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
  const rootLabel = parentId ? "Bu dalın köküne taşı" : "Kategori köküne taşı";
  const otherCategories = (categories ?? []).filter(
    (c) => c.id !== categoryId && !c.isBuiltIn
  );

  return (
    <div ref={rootRef} className="flex flex-col gap-0.5">
      {/* Düzenleme anahtarı — yalnızca taşınabilecek satır varsa */}
      {roots.length > 0 && (
        <div className="mb-1 flex justify-end">
          <button
            type="button"
            onClick={() => setEditMode((v) => !v)}
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              editMode
                ? "border-primary/50 bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:text-foreground hover:bg-white/5"
            )}
          >
            {editMode ? (
              <>
                <Check className="h-3.5 w-3.5" />
                Bitir
              </>
            ) : (
              <>
                <Move className="h-3.5 w-3.5" />
                Düzenle · taşı
              </>
            )}
          </button>
        </div>
      )}

      {editMode && !drag && (
        <p className="px-1 pb-1.5 text-[11px] leading-snug text-muted-foreground/70">
          Bir satırı basılı tutup sürükle: başka satırın üstüne bırak (altına
          taşınır), köke, çöpe ya da başka kategoriye.
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
          editMode={editMode}
          draggingSubId={drag?.sub.id ?? null}
          dropTarget={dropTarget}
          onAddChild={onAddChild}
          onDragStart={startDrag}
        />
      ))}
      <AddRow
        label={
          roots.length === 0 ? "İlk alt kategoriyi ekle" : "Alt kategori ekle"
        }
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
                <span className="text-xs font-medium">Sil</span>
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
                <span className="text-xs font-medium">Başka kategori</span>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Sürükle-sil onayı */}
      <Dialog
        open={confirmDelete !== null}
        onOpenChange={(o) => {
          if (!o) setConfirmDelete(null);
        }}
      >
        <DialogContent className="max-w-[320px]">
          <DialogHeader>
            <DialogTitle>{`"${confirmDelete?.name ?? ""}" silinsin mi?`}</DialogTitle>
            <DialogDescription>
              Bu alt kategoriye (ve altlarına) ait tüm girdiler kalıcı olarak
              silinecek.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmDelete(null)}
              disabled={deleting}
            >
              İptal
            </Button>
            <Button
              variant="destructive"
              disabled={deleting}
              onClick={async () => {
                if (!confirmDelete) return;
                setDeleting(true);
                try {
                  await deleteSubCategory(confirmDelete.id);
                } finally {
                  setDeleting(false);
                  setConfirmDelete(null);
                }
              }}
            >
              {deleting ? "Siliniyor..." : "Sil"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Başka kategoriye taşıma seçicisi */}
      <Dialog
        open={movePickFor !== null}
        onOpenChange={(o) => {
          if (!o) setMovePickFor(null);
        }}
      >
        <DialogContent className="max-w-[340px] gap-4">
          <DialogHeader>
            <DialogTitle className="text-base">Başka kategoriye taşı</DialogTitle>
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
  editMode,
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
  editMode: boolean;
  draggingSubId: string | null;
  dropTarget: DropTarget | null;
  onAddChild: (parentSubId?: string) => void;
  onDragStart: (sub: SubCategory, pos: { x: number; y: number }) => void;
}) {
  const kids = data.childrenMap.get(sub.id) ?? [];
  const mods = data.modsBySub.get(sub.id) ?? [];
  // Kökler dolu geliyorsa hiyerarşi ilk bakışta görünsün
  const [open, setOpen] = useState(depth === 0 && kids.length > 0);

  const isDragging = draggingSubId === sub.id;
  const isDropTarget = dropTarget?.kind === "sub" && dropTarget.id === sub.id;

  const rowInner = (
    <>
      <CategoryTileCore
        color={color}
        icon={sub.icon}
        fallback={kids.length > 0 ? FolderOpen : Folder}
        size="sm"
      />
      <span className="truncate text-sm font-medium">{sub.name}</span>

      {editMode ? (
        <GripVertical className="ml-auto h-4 w-4 shrink-0 text-muted-foreground/40" />
      ) : (
        mods.length > 0 && (
          <span className="ml-auto flex shrink-0 items-center gap-1 pl-1">
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
        )
      )}
    </>
  );

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-0.5">
        {editMode ? (
          <DragRow
            sub={sub}
            color={color}
            isDragging={isDragging}
            isDropTarget={isDropTarget}
            onDragStart={onDragStart}
          >
            {rowInner}
          </DragRow>
        ) : (
          <Link
            href={`/structure/${categoryId}/${sub.id}`}
            className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-1.5 py-1.5 transition-all hover:bg-white/5 active:scale-[0.99]"
          >
            {rowInner}
          </Link>
        )}

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
              editMode={editMode}
              draggingSubId={draggingSubId}
              dropTarget={dropTarget}
              onAddChild={onAddChild}
              onDragStart={onDragStart}
            />
          ))}
          <AddRow
            label={kids.length === 0 ? "İçine alt kategori ekle" : "Ekle"}
            onClick={() => onAddChild(sub.id)}
          />
        </div>
      )}
    </div>
  );
}

/**
 * Düzenleme modunda satırın sürüklenebilir gövdesi. Basılı tutma → sürükleme:
 * 350ms hareketsiz basış başlatır; erken hareket (>10px) kaydırma sayılır ve
 * iptal eder. Hedef vurgusu kategori renginde.
 */
function DragRow({
  sub,
  color,
  isDragging,
  isDropTarget,
  onDragStart,
  children,
}: {
  sub: SubCategory;
  color: string;
  isDragging: boolean;
  isDropTarget: boolean;
  onDragStart: (sub: SubCategory, pos: { x: number; y: number }) => void;
  children: React.ReactNode;
}) {
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const downPos = useRef<{ x: number; y: number } | null>(null);
  const started = useRef(false);

  const clearHold = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
  };

  return (
    <div
      data-drop-sub={sub.id}
      onPointerDown={(e) => {
        downPos.current = { x: e.clientX, y: e.clientY };
        started.current = false;
        clearHold();
        holdTimer.current = setTimeout(() => {
          started.current = true;
          onDragStart(sub, downPos.current!);
        }, 350);
      }}
      onPointerMove={(e) => {
        if (!downPos.current || started.current) return;
        if (
          Math.abs(e.clientX - downPos.current.x) > 10 ||
          Math.abs(e.clientY - downPos.current.y) > 10
        )
          clearHold();
      }}
      onPointerUp={clearHold}
      onPointerCancel={clearHold}
      onContextMenu={(e) => e.preventDefault()}
      className={cn(
        "flex min-w-0 flex-1 select-none items-center gap-2.5 rounded-xl px-1.5 py-1.5 transition-all",
        isDragging ? "opacity-30" : "hover:bg-white/5"
      )}
      style={
        isDropTarget
          ? { outline: `2px solid ${color}`, outlineOffset: "1px" }
          : undefined
      }
    >
      {children}
    </div>
  );
}

function AddRow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex items-center gap-2.5 rounded-xl px-1.5 py-1.5 text-xs text-muted-foreground/60 transition-colors hover:bg-white/5 hover:text-foreground"
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-dashed border-muted-foreground/25 transition-colors group-hover:border-primary/50 group-hover:text-primary">
        <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
      </span>
      {label}
    </button>
  );
}
