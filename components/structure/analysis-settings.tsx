"use client";

import { useRef, useState } from "react";
import { X } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import {
  addAnalysisWidget,
  listAnalysisModCandidates,
  listAnalysisWidgets,
  removeAnalysisWidget,
} from "@/lib/db/queries";
import { cn } from "@/lib/utils";
import type { NumericMod } from "@/lib/analytics";
import {
  ANALYSIS_METHOD_DESCRIPTIONS,
  ANALYSIS_METHOD_LABELS,
  type AnalysisMethod,
  type Category,
} from "@/types";

const METHODS: AnalysisMethod[] = ["sum", "avg", "max", "min", "daily"];

/** Skala modlarında toplamın anlamı yok — sum alanına bırakılamaz */
const methodAllows = (method: AnalysisMethod, mod: NumericMod) =>
  !(method === "sum" && mod.kind === "scale");

/** Parmak kıpırdaması ile sürükleme ayrımı (px) */
const DRAG_THRESHOLD = 6;

interface DragState {
  mod: NumericMod;
  x: number;
  y: number;
  moved: boolean;
}

/**
 * Analiz Ayarları — kategori/alt kategori analizinde hangi (mod × yöntem)
 * kutularının görüneceğini kurgulayan interaktif sayfa. Üstte hedefin
 * erişebildiği sayısal mod küreleri, altta yöntem alanları; küre bir alana
 * sürüklenerek (ya da küreye dokunup alana dokunarak) widget oluşturulur.
 */
export function AnalysisSettings({
  targetType,
  targetId,
  category,
}: {
  targetType: "category" | "subcategory";
  targetId: string;
  category: Category;
}) {
  const candidates = useLiveQuery(
    () => listAnalysisModCandidates(targetType, targetId),
    [targetType, targetId]
  );
  const widgets = useLiveQuery(
    () => listAnalysisWidgets(targetType, targetId),
    [targetType, targetId]
  );
  const allMods = useLiveQuery(() => db.mods.toArray(), []);
  const modNameById = new Map((allMods ?? []).map((m) => [m.id, m.name]));

  const [drag, setDrag] = useState<DragState | null>(null);
  const [selectedMod, setSelectedMod] = useState<NumericMod | null>(null);
  const [hoverMethod, setHoverMethod] = useState<AnalysisMethod | null>(null);
  const zoneRefs = useRef(new Map<AnalysisMethod, HTMLDivElement>());
  const dragStartPos = useRef({ x: 0, y: 0 });
  // Pointer olayları arasında güncel kalması gereken sürükleme durumu (state gecikmeli)
  const dragModRef = useRef<NumericMod | null>(null);
  const dragMovedRef = useRef(false);

  const color = category.color;

  function methodUnderPoint(x: number, y: number): AnalysisMethod | null {
    for (const method of METHODS) {
      const el = zoneRefs.current.get(method);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
        return method;
      }
    }
    return null;
  }

  async function assign(mod: NumericMod, method: AnalysisMethod) {
    if (!methodAllows(method, mod)) return;
    await addAnalysisWidget(targetType, targetId, mod.id, method);
  }

  function onSpherePointerDown(mod: NumericMod, e: React.PointerEvent) {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    dragModRef.current = mod;
    dragMovedRef.current = false;
    setDrag({ mod, x: e.clientX, y: e.clientY, moved: false });
  }

  function onSpherePointerMove(e: React.PointerEvent) {
    const mod = dragModRef.current;
    if (!mod) return;
    if (!dragMovedRef.current) {
      dragMovedRef.current =
        Math.hypot(
          e.clientX - dragStartPos.current.x,
          e.clientY - dragStartPos.current.y
        ) > DRAG_THRESHOLD;
    }
    const moved = dragMovedRef.current;
    setDrag({ mod, x: e.clientX, y: e.clientY, moved });
    if (moved) {
      const m = methodUnderPoint(e.clientX, e.clientY);
      setHoverMethod(m && methodAllows(m, mod) ? m : null);
    }
  }

  async function onSpherePointerUp(e: React.PointerEvent) {
    const mod = dragModRef.current;
    const moved = dragMovedRef.current;
    dragModRef.current = null;
    dragMovedRef.current = false;
    setDrag(null);
    setHoverMethod(null);
    if (!mod) return;
    if (!moved) {
      // Dokunma: küreyi seç / seçimi kaldır — sonra bir yönteme dokunulur
      setSelectedMod((cur) => (cur?.id === mod.id ? null : mod));
      return;
    }
    const method = methodUnderPoint(e.clientX, e.clientY);
    if (method && methodAllows(method, mod)) {
      await assign(mod, method);
    }
  }

  async function onZoneTap(method: AnalysisMethod) {
    if (!selectedMod) return;
    await assign(selectedMod, method);
    setSelectedMod(null);
  }

  if (!candidates || !widgets) return null;

  const dragMod = drag?.moved ? drag.mod : null;

  return (
    <div className="flex flex-col gap-5 pb-8">
      {/* Mod küreleri */}
      <section className="flex flex-col gap-3">
        <div className="px-1">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Mod Küreleri
          </h2>
          <p className="mt-1 text-xs text-muted-foreground/70">
            Bir küreyi aşağıdaki yöntemlerden birine sürükle — ya da küreye
            dokunup yöntemi seç.
          </p>
        </div>

        {candidates.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/40 px-4 py-5 text-center">
            <p className="text-sm text-muted-foreground">
              Buraya atanmış sayısal mod yok. Önce kategori/alt kategori
              sayfasından mod ekle.
            </p>
          </div>
        ) : (
          <div className="flex flex-wrap gap-3 px-1">
            {candidates.map((mod) => {
              const isSelected = selectedMod?.id === mod.id;
              const isDragging = drag?.mod.id === mod.id && drag.moved;
              return (
                <div
                  key={mod.id}
                  className="flex w-16 flex-col items-center gap-1"
                >
                  <button
                    onPointerDown={(e) => onSpherePointerDown(mod, e)}
                    onPointerMove={onSpherePointerMove}
                    onPointerUp={onSpherePointerUp}
                    onPointerCancel={() => {
                      dragModRef.current = null;
                      dragMovedRef.current = false;
                      setDrag(null);
                      setHoverMethod(null);
                    }}
                    aria-label={`${mod.name} küresi`}
                    className={cn(
                      "flex h-14 w-14 touch-none select-none items-center justify-center rounded-full border text-sm font-semibold transition-all",
                      isDragging && "opacity-30 scale-90",
                      isSelected
                        ? "scale-110 shadow-lg"
                        : "hover:scale-105 active:scale-110"
                    )}
                    style={{
                      background: `radial-gradient(circle at 32% 28%, ${color}55, ${color}18 70%)`,
                      borderColor: isSelected ? color : `${color}50`,
                      boxShadow: isSelected
                        ? `0 0 16px ${color}66`
                        : `inset 0 1px 6px ${color}22`,
                      color,
                    }}
                  >
                    {mod.unit || mod.name.slice(0, 2)}
                  </button>
                  <span className="w-full truncate text-center text-[10px] text-muted-foreground">
                    {mod.name}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {selectedMod && (
          <p className="px-1 text-xs" style={{ color }}>
            <span className="font-medium">{selectedMod.name}</span> seçildi —
            şimdi bir yönteme dokun.
          </p>
        )}
      </section>

      {/* Yöntem alanları */}
      <section className="flex flex-col gap-2">
        <h2 className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Analiz Yöntemleri
        </h2>
        {METHODS.map((method) => {
          const assigned = widgets.filter((w) => w.method === method);
          const activeMod = dragMod ?? selectedMod;
          const allowed = activeMod ? methodAllows(method, activeMod) : true;
          const isHover = hoverMethod === method;
          const isTarget = !!activeMod && allowed;
          return (
            <div
              key={method}
              ref={(el) => {
                if (el) zoneRefs.current.set(method, el);
                else zoneRefs.current.delete(method);
              }}
              onClick={() => allowed && onZoneTap(method)}
              className={cn(
                "rounded-2xl border bg-card p-3.5 transition-all",
                activeMod && !allowed && "opacity-35",
                isTarget && "border-dashed",
                isHover && "scale-[1.02]",
                selectedMod && allowed && "cursor-pointer"
              )}
              style={{
                borderColor: isHover
                  ? color
                  : isTarget
                    ? `${color}70`
                    : undefined,
                backgroundColor: isHover ? `${color}14` : undefined,
              }}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium">
                  {ANALYSIS_METHOD_LABELS[method]}
                </span>
                <span className="truncate text-[10px] text-muted-foreground/70">
                  {ANALYSIS_METHOD_DESCRIPTIONS[method]}
                </span>
              </div>

              {assigned.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {assigned.map((w) => (
                    <span
                      key={w.id}
                      className="flex items-center gap-1 rounded-lg border px-2 py-1 text-xs"
                      style={{
                        borderColor: `${color}50`,
                        backgroundColor: `${color}14`,
                      }}
                    >
                      {modNameById.get(w.modId) ?? "—"}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeAnalysisWidget(w.id);
                        }}
                        className="rounded p-0.5 text-muted-foreground transition-colors hover:text-destructive"
                        aria-label={`${modNameById.get(w.modId) ?? "mod"} — ${
                          ANALYSIS_METHOD_LABELS[method]
                        } analizini kaldır`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </section>

      <p className="px-1 text-[11px] leading-relaxed text-muted-foreground/60">
        Buradaki seçimler bu {targetType === "category" ? "kategorinin" : "alt kategorinin"}{" "}
        analiz sayfasında birer kutu olarak görünür. Analiz sayfasındaki kutuya
        dokunarak buraya geri dönebilirsin.
      </p>

      {/* Sürüklenen küre hayaleti */}
      {drag?.moved && (
        <div
          className="pointer-events-none fixed z-50 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border text-sm font-semibold"
          style={{
            left: drag.x,
            top: drag.y,
            background: `radial-gradient(circle at 32% 28%, ${color}77, ${color}33 70%)`,
            borderColor: color,
            boxShadow: `0 4px 20px ${color}55`,
            color,
          }}
        >
          {drag.mod.unit || drag.mod.name.slice(0, 2)}
        </div>
      )}
    </div>
  );
}
