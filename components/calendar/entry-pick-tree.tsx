"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Check,
  ChevronRight,
  Folder,
  FolderOpen,
  GripVertical,
  Move,
  Plus,
  Trash2,
} from "lucide-react";
import { moveSubCategory } from "@/lib/db/queries";
import { CategoryTileCore } from "@/components/structure/category-tile";
import { SubCategoryForm } from "@/components/structure/subcategory-form";
import { DeleteSubCategoryDialog } from "@/components/structure/delete-subcategory-dialog";
import { cn } from "@/lib/utils";
import type { Category, SubCategory } from "@/types";

export type PickGroup = {
  category: Category;
  topSubs: SubCategory[];
  allSubs: SubCategory[];
};

type DropTarget =
  | { kind: "sub"; id: string }
  | { kind: "cat"; id: string }
  | { kind: "trash" };

/**
 * Girdi ekleme seçim ağacı — "Ne eklemek istersin?" gövdesi. Yapı bölümünün
 * satır diliyle aynı: kare çekirdek + ad + ok. Dokunuş kategori/alt kategori
 * seçer (girdi formuna geçer). "Düzenle · taşı" ile satırlar basılı tutulup
 * sürüklenir: başka satırın altına, başka kategorinin başlığına (kök), çöpe.
 * Çok kategori aynı ekranda olduğundan kategoriler-arası taşıma doğaldır.
 */
export function EntryPickTree({
  groups,
  onSubSelect,
  onCategorySelect,
  scrollParentRef,
}: {
  groups: PickGroup[] | undefined;
  onSubSelect: (sub: SubCategory) => void;
  onCategorySelect: (category: Category) => void;
  scrollParentRef?: React.RefObject<HTMLElement | null>;
}) {
  const [editMode, setEditMode] = useState(false);
  const [drag, setDrag] = useState<{
    sub: SubCategory;
    color: string;
    invalidIds: Set<string>;
  } | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const dropRef = useRef<DropTarget | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<SubCategory | null>(null);
  const [addTarget, setAddTarget] = useState<{
    categoryId: string;
    parentId?: string;
  } | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const visibleSubs = useMemo(
    () =>
      (groups ?? []).flatMap((g) => g.allSubs).filter((s) => !s.isCategoryRoot),
    [groups]
  );
  const childrenMap = useMemo(() => {
    const m = new Map<string, SubCategory[]>();
    for (const s of visibleSubs) {
      if (!s.parentId) continue;
      const arr = m.get(s.parentId) ?? [];
      arr.push(s);
      m.set(s.parentId, arr);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.order - b.order);
    return m;
  }, [visibleSubs]);
  const subById = useMemo(
    () => new Map(visibleSubs.map((s) => [s.id, s])),
    [visibleSubs]
  );
  const catById = useMemo(
    () => new Map((groups ?? []).map((g) => [g.category.id, g.category])),
    [groups]
  );
  const hasAnySub = visibleSubs.length > 0;

  function startDrag(
    sub: SubCategory,
    color: string,
    pos: { x: number; y: number }
  ) {
    const invalid = new Set<string>([sub.id]);
    const stack = [sub.id];
    while (stack.length) {
      const cur = stack.pop()!;
      for (const s of visibleSubs)
        if (s.parentId === cur && !invalid.has(s.id)) {
          invalid.add(s.id);
          stack.push(s.id);
        }
    }
    setDrag({ sub, color, invalidIds: invalid });
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
    const scroller = scrollParentRef?.current ?? null;
    const onMove = (e: PointerEvent) => {
      setDragPos({ x: e.clientX, y: e.clientY });
      if (scroller) {
        const r = scroller.getBoundingClientRect();
        if (e.clientY < r.top + 56) scroller.scrollTop -= 12;
        else if (e.clientY > r.bottom - 84) scroller.scrollTop += 12;
      }
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const t = el?.closest?.(
        "[data-drop-sub],[data-drop-cat],[data-drop-trash]"
      ) as HTMLElement | null;
      if (!t) return setTarget(null);
      if (t.dataset.dropTrash !== undefined) return setTarget({ kind: "trash" });
      const subId = t.dataset.dropSub;
      if (subId) {
        if (drag.invalidIds.has(subId) || drag.sub.parentId === subId)
          return setTarget(null);
        return setTarget({ kind: "sub", id: subId });
      }
      const catId = t.dataset.dropCat;
      if (catId) {
        // Zaten o kategorinin kökündeyse no-op
        if (drag.sub.categoryId === catId && !drag.sub.parentId)
          return setTarget(null);
        return setTarget({ kind: "cat", id: catId });
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
      } else if (t.kind === "sub") {
        const parent = subById.get(t.id);
        if (parent)
          await moveSubCategory(moving.id, {
            categoryId: parent.categoryId,
            parentId: parent.id,
          });
      } else if (t.kind === "cat") {
        await moveSubCategory(moving.id, { categoryId: t.id });
      }
    };
    const onCancel = () => endDrag();
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
  }, [drag, subById, scrollParentRef]);

  // Silinen düğümün içindekilerinin taşınacağı üstün adı
  const deleteParentName = confirmDelete
    ? confirmDelete.parentId
      ? subById.get(confirmDelete.parentId)?.name ??
        catById.get(confirmDelete.categoryId)?.name ??
        "üst"
      : catById.get(confirmDelete.categoryId)?.name ?? "kategori"
    : "";

  return (
    <div ref={rootRef}>
      {/* Düzenlemeye giriş — çıkış (Bitir) sürekli görünür yüzen butonla */}
      {hasAnySub && !editMode && (
        <div className="mb-3 flex justify-end">
          <button
            type="button"
            onClick={() => setEditMode(true)}
            className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
          >
            <Move className="h-3.5 w-3.5" />
            Düzenle · taşı
          </button>
        </div>
      )}
      {editMode && !drag && (
        <p className="mb-3 px-1 text-[11px] leading-snug text-muted-foreground/70">
          Bir satırı basılı tutup sürükle: başka satırın üstüne (altına taşınır),
          kategori başlığına (kök) ya da çöpe. + ile yeni alt kategori.
        </p>
      )}

      <div className="flex flex-col gap-5">
        {(groups ?? []).map((g) => {
          const isCatDrop =
            dropTarget?.kind === "cat" && dropTarget.id === g.category.id;
          return (
            <section key={g.category.id}>
              {/* Kategori başlığı — dokun: doğrudan kategoriye ekle; sürüklemede kök hedefi */}
              <button
                data-drop-cat={g.category.id}
                onClick={() => onCategorySelect(g.category)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition-all active:scale-[0.99]",
                  isCatDrop ? "ring-1 ring-inset" : "hover:bg-white/5"
                )}
                style={
                  isCatDrop
                    ? {
                        background: `${g.category.color}1f`,
                        // @ts-expect-error CSS custom property
                        "--tw-ring-color": g.category.color,
                      }
                    : undefined
                }
              >
                <CategoryTileCore
                  color={g.category.color}
                  icon={g.category.icon}
                  size="sm"
                />
                <span className="flex-1 truncate text-sm font-semibold">
                  {g.category.name}
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/40" />
              </button>

              <div className="mt-0.5 flex flex-col gap-0.5 pl-1">
                {g.topSubs.map((sub) => (
                  <PickTreeNode
                    key={sub.id}
                    sub={sub}
                    depth={0}
                    color={g.category.color}
                    childrenMap={childrenMap}
                    editMode={editMode}
                    draggingSubId={drag?.sub.id ?? null}
                    dropTarget={dropTarget}
                    onSubSelect={onSubSelect}
                    onDragStart={startDrag}
                    onAddChild={(categoryId, parentId) =>
                      setAddTarget({ categoryId, parentId })
                    }
                  />
                ))}
                {editMode && (
                  <AddRow
                    label={
                      g.topSubs.length === 0
                        ? "İlk alt kategoriyi ekle"
                        : "Alt kategori ekle"
                    }
                    onClick={() => setAddTarget({ categoryId: g.category.id })}
                  />
                )}
                {!editMode && g.topSubs.length === 0 && (
                  <p className="px-1.5 py-1 text-[11px] text-muted-foreground/50">
                    Alt kategori yok — başlığa dokunup doğrudan ekleyebilirsin.
                  </p>
                )}
              </div>
            </section>
          );
        })}
      </div>

      {/* Çöp alanı — sürüklerken görünür */}
      {drag &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-x-0 bottom-4 z-[60] mx-auto max-w-[390px] px-4">
            <div
              data-drop-trash
              className={cn(
                "flex h-14 items-center justify-center gap-2 rounded-2xl border-2 border-dashed transition-colors",
                dropTarget?.kind === "trash"
                  ? "border-red-500 bg-red-500/25 text-red-200"
                  : "border-red-500/40 bg-background/95 text-red-400/80"
              )}
            >
              <Trash2 className="h-4 w-4" />
              <span className="text-xs font-medium">Silmek için buraya bırak</span>
            </div>
          </div>,
          document.body
        )}

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
                backgroundColor: `${drag.color}26`,
                outline: `2px solid ${drag.color}`,
                backdropFilter: "blur(4px)",
              }}
            >
              <CategoryTileCore
                color={drag.color}
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

      {/* Düzenlemeden çıkış — sürekli erişilebilir yüzen buton */}
      {editMode &&
        !drag &&
        !confirmDelete &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] mx-auto max-w-[390px] px-4">
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setEditMode(false)}
                className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/30 transition-transform active:scale-95"
              >
                <Check className="h-4 w-4" />
                Düzenlemeyi bitir
              </button>
            </div>
          </div>,
          document.body
        )}

      {/* Çöpe sürükleme → silme seçenekleri */}
      <DeleteSubCategoryDialog
        sub={confirmDelete}
        parentName={deleteParentName}
        onOpenChange={(o) => {
          if (!o) setConfirmDelete(null);
        }}
      />

      {/* Alt kategori ekle */}
      <SubCategoryForm
        open={addTarget !== null}
        onOpenChange={(o) => {
          if (!o) setAddTarget(null);
        }}
        categoryId={addTarget?.categoryId ?? ""}
        parentSubcategoryId={addTarget?.parentId}
        categoryName={
          addTarget ? catById.get(addTarget.categoryId)?.name : undefined
        }
      />
    </div>
  );
}

function PickTreeNode({
  sub,
  depth,
  color,
  childrenMap,
  editMode,
  draggingSubId,
  dropTarget,
  onSubSelect,
  onDragStart,
  onAddChild,
}: {
  sub: SubCategory;
  depth: number;
  color: string;
  childrenMap: Map<string, SubCategory[]>;
  editMode: boolean;
  draggingSubId: string | null;
  dropTarget: DropTarget | null;
  onSubSelect: (sub: SubCategory) => void;
  onDragStart: (
    sub: SubCategory,
    color: string,
    pos: { x: number; y: number }
  ) => void;
  onAddChild: (categoryId: string, parentId?: string) => void;
}) {
  const kids = childrenMap.get(sub.id) ?? [];
  const [open, setOpen] = useState(false);

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
      {editMode && (
        <GripVertical className="ml-auto h-4 w-4 shrink-0 text-muted-foreground/40" />
      )}
    </>
  );

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-0.5">
        {editMode ? (
          <PickDragRow
            isDragging={isDragging}
            isDropTarget={isDropTarget}
            color={color}
            dropId={sub.id}
            onStart={(pos) => onDragStart(sub, color, pos)}
          >
            {rowInner}
          </PickDragRow>
        ) : (
          <button
            type="button"
            onClick={() => onSubSelect(sub)}
            className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-1.5 py-1.5 text-left transition-all hover:bg-white/5 active:scale-[0.99]"
          >
            {rowInner}
          </button>
        )}

        {kids.length > 0 && (
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
        )}
      </div>

      {open && (
        <div
          className="ml-[21px] flex flex-col gap-0.5 border-l pl-2.5"
          style={{ borderColor: `${color}2e` }}
        >
          {kids.map((child) => (
            <PickTreeNode
              key={child.id}
              sub={child}
              depth={depth + 1}
              color={color}
              childrenMap={childrenMap}
              editMode={editMode}
              draggingSubId={draggingSubId}
              dropTarget={dropTarget}
              onSubSelect={onSubSelect}
              onDragStart={onDragStart}
              onAddChild={onAddChild}
            />
          ))}
          {editMode && (
            <AddRow
              label={kids.length === 0 ? "İçine alt kategori ekle" : "Ekle"}
              onClick={() => onAddChild(sub.categoryId, sub.id)}
            />
          )}
        </div>
      )}
    </div>
  );
}

/** Düzenleme modunda satırın sürüklenebilir gövdesi (350ms basılı tut → sürükle). */
function PickDragRow({
  isDragging,
  isDropTarget,
  color,
  dropId,
  onStart,
  children,
}: {
  isDragging: boolean;
  isDropTarget: boolean;
  color: string;
  dropId: string;
  onStart: (pos: { x: number; y: number }) => void;
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
      data-drop-sub={dropId}
      onPointerDown={(e) => {
        downPos.current = { x: e.clientX, y: e.clientY };
        started.current = false;
        clearHold();
        holdTimer.current = setTimeout(() => {
          started.current = true;
          onStart(downPos.current!);
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
