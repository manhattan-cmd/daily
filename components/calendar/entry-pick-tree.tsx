"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Check,
  ChevronDown,
  CornerDownRight,
  Folder,
  FolderOpen,
  Move,
  Plus,
  Trash2,
} from "lucide-react";
import { moveSubCategory } from "@/lib/db/queries";
import {
  CategoryTileCore,
  CategoryTileAdd,
} from "@/components/structure/category-tile";
import { SubCategoryForm } from "@/components/structure/subcategory-form";
import { DeleteSubCategoryDialog } from "@/components/structure/delete-subcategory-dialog";
import { RadialExplorer } from "@/components/calendar/entry-radial-explorer";
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
 * Girdi ekleme seçim ekranı — "Ne eklemek istersin?" gövdesi. Modüler ızgara:
 * her kategori kendi başlığı altında 4 sütunlu kare karolar. Alt kategorisi
 * olana dokununca içi yine ızgara olarak açılır (aynı hizada). Kare çekirdek +
 * ad; şekil dili Yapı bölümüyle bir. Dokunuş kategori/alt kategori seçer (forma
 * geçer). "Düzenle · taşı" ile karolar basılı tutulup sürüklenir: başka karonun
 * altına (iç içe), kategori başlığına (kök), çöpe. Çok kategori ekranda olduğu
 * için kategoriler-arası taşıma doğaldır.
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
  // DENEME: alt kategoriye basınca açılan radyal keşif penceresi
  const [explorer, setExplorer] = useState<SubCategory | null>(null);
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
  const topSubsByCat = useMemo(
    () => new Map((groups ?? []).map((g) => [g.category.id, g.topSubs])),
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
          Bir kareyi basılı tutup sürükle: başka karenin üstüne (altına taşınır),
          kategori başlığına (kök) ya da çöpe. + ile yeni alt kategori.
        </p>
      )}

      <div className="flex flex-col gap-6">
        {(groups ?? []).map((g) => (
          <CategorySection
            key={g.category.id}
            category={g.category}
            topSubs={g.topSubs}
            childrenMap={childrenMap}
            subById={subById}
            editMode={editMode}
            isCatDrop={dropTarget?.kind === "cat" && dropTarget.id === g.category.id}
            draggingSubId={drag?.sub.id ?? null}
            dropTarget={dropTarget}
            onSubSelect={onSubSelect}
            onCategorySelect={onCategorySelect}
            onDragStart={startDrag}
            onOpenExplorer={(sub) => setExplorer(sub)}
            onAddChild={(categoryId, parentId) =>
              setAddTarget({ categoryId, parentId })
            }
          />
        ))}
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
              <span className="text-xs font-medium">Drop here to delete</span>
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

      {/* DENEME: radyal keşif penceresi */}
      {explorer && (
        <RadialExplorer
          initialSub={explorer}
          catById={catById}
          subById={subById}
          childrenMap={childrenMap}
          topSubsByCat={topSubsByCat}
          onSelectSub={(sub) => {
            setExplorer(null);
            onSubSelect(sub);
          }}
          onSelectCat={(cat) => {
            setExplorer(null);
            onCategorySelect(cat);
          }}
          onClose={() => setExplorer(null)}
        />
      )}
    </div>
  );
}

// ─── Kategori bölümü ──────────────────────────────────────────────────────────

function CategorySection({
  category,
  topSubs,
  childrenMap,
  subById,
  editMode,
  isCatDrop,
  draggingSubId,
  dropTarget,
  onSubSelect,
  onCategorySelect,
  onDragStart,
  onOpenExplorer,
  onAddChild,
}: {
  category: Category;
  topSubs: SubCategory[];
  childrenMap: Map<string, SubCategory[]>;
  subById: Map<string, SubCategory>;
  editMode: boolean;
  isCatDrop: boolean;
  draggingSubId: string | null;
  dropTarget: DropTarget | null;
  onSubSelect: (sub: SubCategory) => void;
  onCategorySelect: (category: Category) => void;
  onDragStart: (
    sub: SubCategory,
    color: string,
    pos: { x: number; y: number }
  ) => void;
  onOpenExplorer: (sub: SubCategory) => void;
  onAddChild: (categoryId: string, parentId?: string) => void;
}) {
  // expandedPath[d] = derinlik d'de açık alt kategori id'si (akordeon)
  const [expandedPath, setExpandedPath] = useState<string[]>([]);
  const color = category.color;

  function toggle(subId: string, depth: number) {
    setExpandedPath((prev) =>
      prev[depth] === subId ? prev.slice(0, depth) : [...prev.slice(0, depth), subId]
    );
  }

  function renderLevel(
    subs: SubCategory[],
    depth: number,
    parentId?: string
  ): React.ReactNode {
    const expandedId = expandedPath[depth];
    const expandedSub = expandedId ? subById.get(expandedId) : undefined;
    const childSubs = expandedId ? childrenMap.get(expandedId) ?? [] : [];

    // Açılan dal — aynı ızgara diliyle, kategori renginde kılavuz
    const expansion =
      expandedSub && (childSubs.length > 0 || editMode) ? (
        <div
          className="mt-2 ml-1 border-l-2 pl-2.5"
          style={{ borderColor: `${color}40` }}
        >
          <button
            data-drop-sub={expandedSub.id}
            type="button"
            onClick={() => onSubSelect(expandedSub)}
            className="mb-1.5 flex items-center gap-1.5 rounded-lg px-1 py-0.5 transition-colors hover:bg-white/5"
          >
            <CornerDownRight
              className="h-3 w-3 shrink-0"
              style={{ color: `${color}c0` }}
            />
            <span
              className="truncate text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: `${color}d0` }}
            >
              {expandedSub.name}
            </span>
            <span className="text-[10px] text-muted-foreground/60">· ekle</span>
          </button>
          {renderLevel(childSubs, depth + 1, expandedSub.id)}
        </div>
      ) : null;

    // Hücreler 4'lü satırlara bölünür; açılan karonun bulunduğu satırın HEMEN
    // altında açılır — çok aşağıda değil, ilgili yerde.
    type Cell = { kind: "sub"; sub: SubCategory } | { kind: "add" };
    const cells: Cell[] = [
      ...subs.map((sub): Cell => ({ kind: "sub", sub })),
      ...(editMode ? [{ kind: "add" } as Cell] : []),
    ];
    const rows: Cell[][] = [];
    for (let i = 0; i < cells.length; i += 4) rows.push(cells.slice(i, i + 4));

    return (
      <div className="flex flex-col gap-1">
        {rows.map((row, ri) => {
          const rowHasExpanded =
            !!expandedId &&
            row.some((c) => c.kind === "sub" && c.sub.id === expandedId);
          return (
            <div key={ri}>
              <div className="grid grid-cols-4 gap-x-1.5">
                {row.map((c) =>
                  c.kind === "add" ? (
                    <CategoryTileAdd
                      key="add"
                      label="Ekle"
                      onClick={() => onAddChild(category.id, parentId)}
                    />
                  ) : (
                    <SubTile
                      key={c.sub.id}
                      sub={c.sub}
                      color={color}
                      hasChildren={(childrenMap.get(c.sub.id)?.length ?? 0) > 0}
                      isExpanded={expandedId === c.sub.id}
                      isDragging={draggingSubId === c.sub.id}
                      isDropTarget={
                        dropTarget?.kind === "sub" && dropTarget.id === c.sub.id
                      }
                      editMode={editMode}
                      onSelect={() => onSubSelect(c.sub)}
                      onExpand={
                        (childrenMap.get(c.sub.id)?.length ?? 0) > 0
                          ? editMode
                            ? () => toggle(c.sub.id, depth)
                            : () => onOpenExplorer(c.sub)
                          : undefined
                      }
                      onDragStart={(pos) => onDragStart(c.sub, color, pos)}
                    />
                  )
                )}
              </div>
              {rowHasExpanded && expansion}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <section>
      {/* Kategori başlığı — dokun: doğrudan kategoriye ekle; sürüklemede kök hedefi */}
      <button
        data-drop-cat={category.id}
        onClick={() => onCategorySelect(category)}
        className={cn(
          "mb-2 flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left transition-all",
          isCatDrop ? "ring-1 ring-inset" : "hover:bg-white/5"
        )}
        style={
          isCatDrop
            ? {
                background: `${color}1f`,
                // @ts-expect-error CSS custom property
                "--tw-ring-color": color,
              }
            : undefined
        }
      >
        <span
          className="h-3 w-3 shrink-0 rounded-[4px]"
          style={{
            background: `linear-gradient(145deg, ${color}, ${color}88)`,
            boxShadow: `0 0 8px ${color}55`,
          }}
        />
        <span className="flex-1 truncate text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {category.name}
        </span>
        <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground/60">
          <Plus className="h-3 w-3" />
          girdi
        </span>
      </button>

      {topSubs.length === 0 && !editMode ? (
        <p className="px-1.5 text-[11px] text-muted-foreground/50">
          Alt kategori yok — başlığa dokunup doğrudan ekleyebilirsin.
        </p>
      ) : (
        renderLevel(topSubs, 0, undefined)
      )}
    </section>
  );
}

// ─── Kare karo ────────────────────────────────────────────────────────────────

/**
 * Alt kategori karesi. Yaprak → dokun seçer (forma geçer). Alt kategorisi olan →
 * dokun açar/kapar (içi ızgara). Düzenleme modunda basılı tut → sürükle (350ms;
 * erken hareket kaydırma sayılıp iptal eder).
 */
function SubTile({
  sub,
  color,
  hasChildren,
  isExpanded,
  isDragging,
  isDropTarget,
  editMode,
  onSelect,
  onExpand,
  onDragStart,
}: {
  sub: SubCategory;
  color: string;
  hasChildren: boolean;
  isExpanded: boolean;
  isDragging: boolean;
  isDropTarget: boolean;
  editMode: boolean;
  onSelect: () => void;
  onExpand?: () => void;
  onDragStart: (pos: { x: number; y: number }) => void;
}) {
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const downPos = useRef<{ x: number; y: number } | null>(null);
  const started = useRef(false);

  const clearHold = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
  };

  function handleClick() {
    if (started.current) {
      started.current = false;
      return; // sürükleme oldu — tıklama bastırılır
    }
    if (hasChildren && onExpand) onExpand();
    else onSelect();
  }

  return (
    <button
      data-drop-sub={sub.id}
      type="button"
      onClick={handleClick}
      onPointerDown={
        editMode
          ? (e) => {
              downPos.current = { x: e.clientX, y: e.clientY };
              started.current = false;
              clearHold();
              holdTimer.current = setTimeout(() => {
                started.current = true;
                onDragStart(downPos.current!);
              }, 350);
            }
          : undefined
      }
      onPointerMove={
        editMode
          ? (e) => {
              if (!downPos.current || started.current) return;
              if (
                Math.abs(e.clientX - downPos.current.x) > 10 ||
                Math.abs(e.clientY - downPos.current.y) > 10
              )
                clearHold();
            }
          : undefined
      }
      onPointerUp={editMode ? clearHold : undefined}
      onPointerCancel={editMode ? clearHold : undefined}
      onContextMenu={(e) => e.preventDefault()}
      className={cn(
        "flex select-none flex-col items-center gap-1.5 rounded-2xl px-1 py-2 transition-all hover:bg-white/5 active:scale-[0.92]",
        isDragging && "opacity-30"
      )}
    >
      <span className="relative">
        <span
          className="block rounded-xl"
          style={
            isDropTarget
              ? { outline: `2px solid ${color}`, outlineOffset: "2px" }
              : undefined
          }
        >
          <CategoryTileCore
            color={color}
            icon={sub.icon}
            fallback={hasChildren ? FolderOpen : Folder}
          />
        </span>
        {hasChildren && (
          <span
            className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-background"
            style={{ backgroundColor: color }}
          >
            <ChevronDown
              className={cn(
                "h-2.5 w-2.5 text-white transition-transform duration-200",
                isExpanded && "rotate-180"
              )}
              strokeWidth={2.75}
            />
          </span>
        )}
      </span>
      <span className="w-full truncate text-center text-[11px] font-medium leading-tight">
        {sub.name}
      </span>
    </button>
  );
}
