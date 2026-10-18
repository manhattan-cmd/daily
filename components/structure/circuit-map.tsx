"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { getEntryCountsBySubcategory } from "@/lib/db/queries";
import { CanvasViewport } from "@/components/calendar/canvas-viewport";
import { HScroll } from "@/components/ui/h-scroll";
import { MapLegend, type MapGroup } from "@/components/structure/neural-map";
import { usageIntensity, usageRate, usageSince } from "@/lib/usage";
import { useT } from "@/lib/i18n";
import { routes } from "@/lib/routes";
import type { Category, Mod, SubCategory } from "@/types";

/** Kartın genişliği — telefon çerçevesine birebir sığıyor */
const W = 360;
const INK = "#111";
const INK_OFF = "rgba(17,17,17,.22)";
const INK_SOFT = "rgba(17,17,17,.55)";
const MONO = "ui-monospace, 'IBM Plex Mono', monospace";
/** Bu yoğunluğun üstündeki kalem "kullanılıyor": bacağı dolu, izi koyu */
const LIT = 0.12;

const NO_COUNTS: ReadonlyMap<string, number> = new Map();

const mix = (hex: string, pct: number) =>
  `color-mix(in srgb, ${hex} ${Math.round(pct)}%, #fff)`;
const short = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
/** Etiket genişliği tahmini — tek aralıklı yazıda harf başına ~5.4px */
const tagW = (s: string, per = 5.4) => 8 + s.length * per;

type Focus = null | { type: "cat"; id: string } | { type: "sub"; id: string };

/**
 * Harita — Brütal dilinde bir anakart.
 *
 * Üstte ROUTINE işlemcisi, iki yanında kategori çipleri. Her çipin
 * bacakları onun alt kategorileri: dolu bacak son 30 günde kullanılan
 * kalem, boş bacak bırakılmış kalem. İşlemciden çipe giden iz kategorinin
 * ne kadar kullanıldığı kadar kalın ve koyu; izler iç içe dizildiği için
 * hiçbiri ötekini kesmiyor (iç sıradaki çipin bacağı işlemcinin kenarına
 * daha yakın).
 *
 * Bir çipe dokununca kart o çipin içine geçiyor: kategori ortada büyük çip,
 * alt kategoriler iki yanda bileşen, bileşenin altındaki küçük pad'ler
 * onun alt kalemleri. Kategorinin kendi özellikleri çipi kesikli bir halka
 * gibi sarıyor — özellik bütün alt kalemlere iniyor. Alt kalemi olan bir
 * bileşene dokunmak onu çip yapıyor (derinlik sınırsız), yaprağa ve ortadaki
 * çipe dokunmak yapı sayfasına götürüyor.
 */
export function CircuitMap({ groups }: { groups: MapGroup[] }) {
  const t = useT();
  const router = useRouter();
  const [focus, setFocus] = useState<Focus>(null);

  const entryCounts =
    useLiveQuery(() => getEntryCountsBySubcategory(usageSince()), []) ??
    NO_COUNTS;
  const featData = useLiveQuery(async () => {
    const [mods, links] = await Promise.all([
      db.mods.toArray(),
      db.categoryModifiers.toArray(),
    ]);
    return { mods, links };
  }, []);

  const cats = useMemo(() => groups.map((g) => g.category), [groups]);
  const catById = useMemo(() => new Map(cats.map((c) => [c.id, c])), [cats]);
  const visibleSubs = useMemo(
    () => groups.flatMap((g) => g.allSubs).filter((s) => !s.isCategoryRoot),
    [groups]
  );
  const subById = useMemo(
    () => new Map(visibleSubs.map((s) => [s.id, s])),
    [visibleSubs]
  );
  const kidsOf = useMemo(() => {
    const m = new Map<string, SubCategory[]>();
    for (const s of visibleSubs) {
      if (!s.parentId) continue;
      const arr = m.get(s.parentId) ?? [];
      arr.push(s);
      m.set(s.parentId, arr);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.order - b.order);
    for (const g of groups) m.set(g.category.id, g.topSubs);
    return m;
  }, [visibleSubs, groups]);

  /** Alt ağacın son 30 gündeki girdisi ve alt kalem sayısı */
  const tally = useMemo(() => {
    const out = new Map<string, { n: number; desc: number }>();
    const walk = (id: string, own: number): { n: number; desc: number } => {
      let n = own;
      let desc = 0;
      for (const k of kidsOf.get(id) ?? []) {
        const r = walk(k.id, entryCounts.get(k.id) ?? 0);
        n += r.n;
        desc += 1 + r.desc;
      }
      const r = { n, desc };
      out.set(id, r);
      return r;
    };
    for (const g of groups) {
      // Kategoriye doğrudan girilenler gizli kök alt kategoride duruyor
      const rootOwn = g.allSubs
        .filter((s) => s.isCategoryRoot)
        .reduce((a, s) => a + (entryCounts.get(s.id) ?? 0), 0);
      walk(g.category.id, rootOwn);
    }
    return out;
  }, [groups, kidsOf, entryCounts]);
  const usage = (id: string) =>
    usageIntensity(usageRate(tally.get(id)?.n ?? 0));
  const descOf = (id: string) => tally.get(id)?.desc ?? 0;

  /** Bir kalemin kendi özellikleri (alt kaleme miras inenler sayılmıyor) */
  const featsOf = (id: string): Mod[] => {
    if (!featData) return [];
    const byId = new Map(featData.mods.map((m) => [m.id, m]));
    return featData.links
      .filter((l) => l.targetId === id && l.modId)
      .sort((a, b) => a.order - b.order)
      .map((l) => byId.get(l.modId!))
      .filter((m): m is Mod => !!m);
  };
  const unitTag = (mods: Mod[]) =>
    mods.map((m) => m.unit?.trim() || short(m.name, 7)).join(" · ");

  // Odak id'den çözülüyor — kalem silinirse kart kendiliğinden köke döner
  const fCat: Category | undefined =
    focus?.type === "cat"
      ? catById.get(focus.id)
      : focus?.type === "sub"
        ? catById.get(subById.get(focus.id)?.categoryId ?? "")
        : undefined;
  const fSub = focus?.type === "sub" ? subById.get(focus.id) : undefined;
  const live = focus == null || (focus.type === "cat" ? !!fCat : !!fSub);
  const at: Focus = live ? focus : null;
  const focusKey = at == null ? "root" : `${at.type}:${at.id}`;

  const trail = useMemo(() => {
    const list: { label: string; focus: Focus }[] = [
      { label: t("structure.categories"), focus: null },
    ];
    if (!fCat || at == null) return list;
    list.push({ label: fCat.name, focus: { type: "cat", id: fCat.id } });
    const chain: SubCategory[] = [];
    let cur = fSub;
    while (cur) {
      chain.unshift(cur);
      cur = cur.parentId ? subById.get(cur.parentId) : undefined;
    }
    for (const s of chain) list.push({ label: s.name, focus: { type: "sub", id: s.id } });
    return list;
  }, [at, fCat, fSub, subById, t]);

  const board =
    at == null || !fCat
      ? overview()
      : chipView(fCat, fSub);

  // ─── A · Anakart: işlemci + iki sütun kategori çipi ─────────────────────────
  function overview(): { h: number; body: ReactNode } {
    const n = cats.length;
    const nL = Math.ceil(n / 2);
    const per = Math.max(1, nL);
    const root = { x: 105, y: 26, w: 150, h: 54 };
    const rootBottom = root.y + root.h;
    // İşlemcinin altındaki bacak aralığı — çip çoğaldıkça sıkışıyor, ortayı geçmiyor
    const pitch = per > 1 ? Math.min(13, 56 / (per - 1)) : 0;
    const rowY = (k: number) => 132 + k * 96;
    const chips = cats.map((c, i) => {
      const L = i < nL;
      const k = L ? i : i - nL;
      return {
        c,
        i,
        L,
        x: L ? 10 : 246,
        y: rowY(k) - 21,
        w: 104,
        h: 42,
        px: L ? 118 + k * pitch : 242 - k * pitch,
      };
    });
    // Altta açıklama kutusunun payı
    const h = rowY(per - 1) + 21 + 96;

    const traces = chips.map((ch) => {
      const u = usage(ch.c.id);
      const on = u > LIT;
      const cy = ch.y + ch.h / 2;
      const ex = ch.L ? ch.x + ch.w : ch.x;
      const bend = cy - Math.abs(ch.px - ex);
      return (
        <g key={`t${ch.c.id}`}>
          <path
            d={`M${ch.px} ${rootBottom}V${bend}L${ex} ${cy}`}
            fill="none"
            stroke={on ? INK : INK_OFF}
            strokeWidth={1.4 + 3 * u}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <circle
            cx={ch.px}
            cy={bend}
            r={3.2}
            fill="var(--background)"
            stroke={on ? INK : INK_OFF}
            strokeWidth={1.6}
          />
        </g>
      );
    });

    const body = (
      <>
        {traces}
        {/* İşlemci */}
        <rect x={root.x + 3} y={root.y + 3} width={root.w} height={root.h} rx={7} fill={INK} />
        <rect x={root.x} y={root.y} width={root.w} height={root.h} rx={7} fill={INK} stroke={INK} strokeWidth={2} />
        {chips.map((ch) => (
          <rect key={`p${ch.c.id}`} x={ch.px - 2.5} y={rootBottom} width={5} height={6} fill={INK} />
        ))}
        <Txt x={180} y={root.y + 24} size={15} anchor="middle" fill="#ffd23f" weight={900}>
          ROUTINE
        </Txt>
        <Txt x={180} y={root.y + 40} size={8.5} anchor="middle" fill="#f4f1e4" mono weight={600}>
          {`U0 · ${t("map.rootSub", { n })}`}
        </Txt>

        {chips.map((ch) => {
          const { c } = ch;
          const subs = kidsOf.get(c.id) ?? [];
          const u = usage(c.id);
          const top = Math.ceil(subs.length / 2);
          const feats = featsOf(c.id);
          const tag = short(unitTag(feats), 18);
          const tw = tagW(tag);
          const tx = ch.L ? ch.x + ch.w - tw + 4 : ch.x - 4;
          return (
            <g
              key={c.id}
              data-net-node=""
              role="button"
              aria-label={c.name}
              style={{ cursor: "pointer" }}
              onClick={() => setFocus({ type: "cat", id: c.id })}
            >
              <rect x={ch.x - 4} y={ch.y - 14} width={ch.w + 8} height={ch.h + 28} fill="transparent" />
              <Txt x={ch.x + 2} y={ch.y - 9} size={8} mono fill={INK_SOFT} weight={600}>
                {`U${ch.i + 1}`}
              </Txt>
              <PinRow subs={subs.slice(0, top)} x={ch.x} w={ch.w} y={ch.y - 6} use={usage} />
              <PinRow subs={subs.slice(top)} x={ch.x} w={ch.w} y={ch.y + ch.h - 1} use={usage} />
              <rect x={ch.x + 3} y={ch.y + 3} width={ch.w} height={ch.h} rx={6} fill={INK} />
              <rect x={ch.x} y={ch.y} width={ch.w} height={ch.h} rx={6} fill={mix(c.color, 25 + 75 * u)} stroke={INK} strokeWidth={2} />
              <circle cx={ch.x + 8} cy={ch.y + 8} r={2.4} fill={INK} />
              <Txt x={ch.x + ch.w / 2} y={ch.y + 19} size={11.5} anchor="middle" weight={900}>
                {short(c.name, 14)}
              </Txt>
              <Txt x={ch.x + ch.w / 2} y={ch.y + 32} size={8.5} anchor="middle" mono weight={600} opacity={0.75}>
                {t("entry.subCount", { n: descOf(c.id) })}
              </Txt>
              {feats.length > 0 && (
                <>
                  <rect x={tx} y={ch.y + ch.h + 9} width={tw} height={13} rx={3} fill="#ffd23f" stroke={INK} strokeWidth={1.5} />
                  <Txt x={tx + tw / 2} y={ch.y + ch.h + 19} size={8.5} anchor="middle" mono>
                    {tag}
                  </Txt>
                </>
              )}
            </g>
          );
        })}
      </>
    );
    return { h, body };
  }

  // ─── B · Çip: odaktaki kalem ortada, alt kalemleri iki yanda bileşen ───────
  function chipView(cat: Category, sub?: SubCategory): { h: number; body: ReactNode } {
    const id = sub?.id ?? cat.id;
    const name = sub?.name ?? cat.name;
    const kids = kidsOf.get(id) ?? [];
    const per = Math.max(1, Math.ceil(kids.length / 2));
    const sides = [kids.slice(0, per), kids.slice(per)];
    const pitch = per > 1 ? Math.min(96, Math.max(64, 360 / (per - 1))) : 0;
    const span = (per - 1) * pitch;
    const chipH = Math.max(170, per * 22 + 40);
    const midY = Math.max(110 + span / 2, 80 + chipH / 2);
    const chip = { x: 128, y: midY - chipH / 2, w: 104, h: chipH };
    const h = midY + Math.max(span / 2, chipH / 2) + 96;
    // Halka: odaktaki kalemin kendi ve atalarından gelen özellikleri — hepsi
    // bütün alt kalemlere iniyor. Bileşenin etiketi yalnız bunların DIŞINDA
    // kalan kendi özellikleri; aynı şey iki kez yazılmasın.
    const chain: string[] = [cat.id];
    for (let cur = sub; cur; cur = cur.parentId ? subById.get(cur.parentId) : undefined)
      chain.splice(1, 0, cur.id);
    const feats: Mod[] = [];
    for (const cid of chain)
      for (const m of featsOf(cid)) if (!feats.some((f) => f.id === m.id)) feats.push(m);
    const inherited = new Set(feats.map((m) => m.id));
    const u0 = usage(id);
    const CW = 90;
    const CH = 30;
    const href = sub
      ? routes.structureSub(cat.id, sub.id)
      : routes.structureCategory(cat.id);

    const comps = sides.flatMap((arr, side) =>
      arr.map((s, k) => {
        const m = arr.length;
        const cy = midY - ((m - 1) * pitch) / 2 + k * pitch;
        const py = chip.y + 20 + (m > 1 ? (k * (chip.h - 40)) / (m - 1) : (chip.h - 40) / 2);
        return { s, side, cy, py, stub: 0 };
      })
    );
    // İzlerin şeridi: yukarı gidenlerde en üstteki, aşağı gidenlerde en
    // alttaki çipe en yakın şeritte — böylece hiçbir iz ötekini kesmiyor
    for (const side of [0, 1]) {
      const g = comps.filter((c) => c.side === side);
      const up = g.filter((c) => c.cy < c.py - 8);
      const down = g.filter((c) => c.cy > c.py + 8).reverse();
      for (const grp of [up, down]) {
        const step = grp.length > 1 ? Math.min(4, 16 / (grp.length - 1)) : 4;
        grp.forEach((c, k) => (c.stub = 5 + k * step));
      }
    }

    const body = (
      <>
        {feats.length > 0 && (
          <rect
            x={chip.x - 14}
            y={chip.y - 14}
            width={chip.w + 28}
            height={chip.h + 28}
            rx={10}
            fill="none"
            stroke="#e0a21a"
            strokeWidth={3}
            strokeDasharray="7 4"
          />
        )}
        {comps.map((cp) => {
          const { s, side, cy, py } = cp;
          const u = usage(s.id);
          const on = u > LIT;
          const L = side === 0;
          const cx = L ? 10 : W - 10 - CW;
          const ex = L ? cx + CW : cx;
          const sx = L ? chip.x : chip.x + chip.w;
          const dir = L ? -1 : 1;
          const r = 4;
          let d: string;
          if (cp.stub === 0) d = `M${sx} ${py}L${ex} ${cy}`;
          else {
            const lx = sx + dir * cp.stub;
            const sy = Math.sign(cy - py);
            d = `M${sx} ${py}H${lx - dir * r}L${lx} ${py + sy * r}V${cy - sy * r}L${lx + dir * r} ${cy}H${ex}`;
          }
          const grand = kidsOf.get(s.id) ?? [];
          const shown = grand.slice(0, 7);
          const step = shown.length > 1 ? Math.min(13, 70 / (shown.length - 1)) : 0;
          const sf = featsOf(s.id).filter((m) => !inherited.has(m.id));
          const tag = short(unitTag(sf), 15);
          const tw = tagW(tag, 5.2);
          const tx = L ? cx : cx + CW - tw;
          const open = () => {
            if (grand.length) setFocus({ type: "sub", id: s.id });
            else router.push(routes.structureSub(cat.id, s.id));
          };
          return (
            <g key={s.id}>
              <path d={d} fill="none" stroke={on ? INK : INK_OFF} strokeWidth={1.4 + 2.6 * u} strokeLinejoin="round" />
              <rect x={sx + (L ? -6 : 0)} y={py - 2.5} width={6} height={5} fill={INK} />
              <g
                data-net-node=""
                role="button"
                aria-label={s.name}
                style={{ cursor: "pointer" }}
                onClick={open}
              >
                <rect x={cx - 2} y={cy - CH / 2 - 18} width={CW + 4} height={CH + 38} fill="transparent" />
                <rect x={cx + 2.5} y={cy - CH / 2 + 2.5} width={CW} height={CH} rx={5} fill={INK} />
                <rect x={cx} y={cy - CH / 2} width={CW} height={CH} rx={5} fill={mix(cat.color, 18 + 70 * u)} stroke={INK} strokeWidth={1.8} />
                <Txt x={cx + CW / 2} y={cy + 3.5} size={10} anchor="middle" weight={800}>
                  {short(s.name, 15)}
                </Txt>
                {shown.map((k, j) => {
                  const px = L ? cx + 10 + j * step : cx + CW - 10 - j * step;
                  const py2 = cy + CH / 2 + 9;
                  const kon = usage(k.id) > LIT;
                  return (
                    <g key={k.id}>
                      <line x1={px} y1={cy + CH / 2} x2={px} y2={py2} stroke={kon ? INK : INK_OFF} strokeWidth={1.5} />
                      <rect x={px - 4} y={py2} width={8} height={8} rx={2} fill={kon ? INK : "#fff"} stroke={INK} strokeWidth={1} />
                    </g>
                  );
                })}
                {grand.length > shown.length && (
                  <Txt
                    x={L ? cx + 10 + shown.length * step + 2 : cx + CW - 10 - shown.length * step - 2}
                    y={cy + CH / 2 + 16}
                    size={8}
                    mono
                    anchor={L ? "start" : "end"}
                    fill={INK_SOFT}
                  >
                    {`+${grand.length - shown.length}`}
                  </Txt>
                )}
                {sf.length > 0 && (
                  <>
                    <rect x={tx} y={cy - CH / 2 - 15} width={tw} height={12} rx={3} fill="#ffd23f" stroke={INK} strokeWidth={1.2} />
                    <Txt x={tx + tw / 2} y={cy - CH / 2 - 6} size={8} anchor="middle" mono>
                      {tag}
                    </Txt>
                  </>
                )}
              </g>
            </g>
          );
        })}
        {/* Odaktaki çip — dokununca yapı sayfası */}
        <g
          data-net-node=""
          role="link"
          aria-label={name}
          style={{ cursor: "pointer" }}
          onClick={() => router.push(href)}
        >
          <rect x={chip.x + 4} y={chip.y + 4} width={chip.w} height={chip.h} rx={9} fill={INK} />
          <rect x={chip.x} y={chip.y} width={chip.w} height={chip.h} rx={9} fill={mix(cat.color, 25 + 75 * Math.max(0.6, u0))} stroke={INK} strokeWidth={2.5} />
          <circle cx={chip.x + 12} cy={chip.y + 12} r={3.5} fill={INK} />
          <Txt x={chip.x + chip.w / 2} y={midY - 4} size={14} anchor="middle" weight={900}>
            {short(name, 12)}
          </Txt>
          <Txt x={chip.x + chip.w / 2} y={midY + 12} size={8.5} anchor="middle" mono weight={600}>
            {t("entry.subCount", { n: descOf(id) })}
          </Txt>
        </g>
        {feats.length > 0 &&
          (() => {
            const tag = short(
              feats
                .map((m) => `${m.name.toLocaleUpperCase()}${m.unit ? ` ${m.unit}` : ""}`)
                .join("  "),
              52
            );
            const tw = tagW(tag, 5.3) + 4;
            return (
              <>
                <rect x={180 - tw / 2} y={chip.y - 44} width={tw} height={17} rx={4} fill="#ffd23f" stroke={INK} strokeWidth={2} />
                <Txt x={180} y={chip.y - 32} size={9} anchor="middle" mono>
                  {tag}
                </Txt>
              </>
            );
          })()}
        <Txt x={180} y={24} size={8.5} anchor="middle" mono fill={INK_SOFT} weight={600}>
          {feats.length ? t("map.ringHint") : t("map.noOwnFeature")}
        </Txt>
      </>
    );
    return { h, body };
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col" data-map-paper="">
      {at != null && (
        <div className="mb-2 px-4">
          <HScroll className="items-center gap-1" followEnd={focusKey}>
            {trail.map((tr, i) => {
              const last = i === trail.length - 1;
              return (
                <span key={i} className="flex shrink-0 items-center gap-1">
                  {i > 0 && (
                    <ChevronRight className="h-3 w-3 shrink-0 text-[#111]/50" strokeWidth={3} />
                  )}
                  <button
                    onClick={() => setFocus(tr.focus)}
                    aria-current={last ? "page" : undefined}
                    className={
                      "flex max-w-[140px] shrink-0 items-center rounded-lg border-2 border-[#111] px-2.5 py-1 text-xs text-[#111] " +
                      (last ? "font-black shadow-[2px_2px_0_#111]" : "bg-white font-bold")
                    }
                    style={
                      last && fCat
                        ? { background: `color-mix(in srgb, ${fCat.color} 55%, #fff)` }
                        : undefined
                    }
                  >
                    <span className="truncate">{tr.label}</span>
                  </button>
                </span>
              );
            })}
          </HScroll>
        </div>
      )}

      <CanvasViewport width={W} height={board.h} resetKey={focusKey}>
        <svg
          key={focusKey}
          className="animate-zoom-in block"
          viewBox={`0 0 ${W} ${board.h}`}
          width={W}
          height={board.h}
        >
          {board.body}
        </svg>
      </CanvasViewport>

      <MapLegend brutal />
    </div>
  );
}

/** Çipin bir kenarındaki bacaklar — her biri bir alt kategori */
function PinRow({
  subs,
  x,
  w,
  y,
  use,
}: {
  subs: SubCategory[];
  x: number;
  w: number;
  y: number;
  use: (id: string) => number;
}) {
  const n = subs.length;
  if (!n) return null;
  const gap = n > 1 ? (w - 24) / (n - 1) : 0;
  const pw = n > 1 ? Math.max(2.5, Math.min(6, gap - 1.5)) : 6;
  return (
    <>
      {subs.map((s, j) => {
        const cx = n === 1 ? x + w / 2 : x + 12 + j * gap;
        return (
          <rect
            key={s.id}
            x={cx - pw / 2}
            y={y}
            width={pw}
            height={7}
            rx={1}
            fill={use(s.id) > LIT ? INK : "#fff"}
            stroke={INK}
            strokeWidth={1}
          />
        );
      })}
    </>
  );
}

function Txt({
  x,
  y,
  size,
  children,
  anchor = "start",
  fill = INK,
  weight = 700,
  mono,
  opacity,
}: {
  x: number;
  y: number;
  size: number;
  children: ReactNode;
  anchor?: "start" | "middle" | "end";
  fill?: string;
  weight?: number;
  mono?: boolean;
  opacity?: number;
}) {
  return (
    <text
      x={x}
      y={y}
      fontSize={size}
      fill={fill}
      fontWeight={weight}
      textAnchor={anchor}
      opacity={opacity}
      fontFamily={mono ? MONO : undefined}
      style={{ pointerEvents: "none" }}
    >
      {children}
    </text>
  );
}
