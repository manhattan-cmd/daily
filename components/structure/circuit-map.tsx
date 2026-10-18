"use client";

import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { getEntryCountsBySubcategory } from "@/lib/db/queries";
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
/** Ağaçtaki alt kalem kutusu, sütun arası (tarak izi bu boşlukta), satır */
const BW = 96;
const BH = 30;
const GAP = 44;
const STEP = BW + GAP;
const ROW = 46;
/** Bacak aralığı ve izin 45° köşe payı */
const PIN = 6;
const CHAMF = 6;

/** Bir kenardaki n bacağın y'leri — kenarın ortasına toplanmış */
const pinYs = (mid: number, n: number) =>
  Array.from({ length: n }, (_, i) => mid + (i - (n - 1) / 2) * PIN);
/** Bacağın kendi kalemini taşıyacak gövde boyu */
const bodyH = (n: number, min: number) => Math.max(min, 14 + (n - 1) * PIN);

/**
 * Bir gövdenin dış kenarındaki bacaklardan çocuklarının pad'ine giden izler.
 * Her iz kendi bacağından çıkıyor; önce dışarı, 45° kırılıp dikine, yine 45°
 * ile pad'e. Kesişmesinler diye şeritler iç içe: yukarı gidenlerde en üstteki,
 * aşağı gidenlerde en alttaki gövdeye en yakın şeritte.
 */
function fanOut(pe: number, dir: number, ends: { py: number; cy: number }[]): string[] {
  const lane = ends.map(() => 0);
  const idx = ends.map((_, i) => i);
  const up = idx.filter((i) => ends[i].cy < ends[i].py - 2 * CHAMF);
  const down = idx.filter((i) => ends[i].cy > ends[i].py + 2 * CHAMF).reverse();
  for (const g of [up, down]) {
    const step = g.length > 1 ? Math.min(5, (GAP - 2 * CHAMF - 8) / (g.length - 1)) : 0;
    g.forEach((i, k) => (lane[i] = CHAMF + 2 + k * step));
  }
  const inner = pe + dir * GAP;
  return ends.map(({ py, cy }, i) => {
    if (!lane[i]) return `M${pe} ${py}L${pe + dir * 8} ${py}L${inner - dir * 8} ${cy}H${inner}`;
    const lx = pe + dir * lane[i];
    const sy = Math.sign(cy - py);
    return `M${pe} ${py}H${lx - dir * CHAMF}L${lx} ${py + sy * CHAMF}V${cy - sy * CHAMF}L${lx + dir * CHAMF} ${cy}H${inner}`;
  });
}
/** Bu yoğunluğun üstündeki kalem "kullanılıyor": bacağı dolu, izi koyu */
const LIT = 0.12;

const NO_COUNTS: ReadonlyMap<string, number> = new Map();

const mix = (hex: string, pct: number) =>
  `color-mix(in srgb, ${hex} ${Math.round(pct)}%, #fff)`;
const short = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
/** Etiket genişliği tahmini — tek aralıklı yazıda harf başına ~5.4px */
const tagW = (s: string, per = 5.4) => 8 + s.length * per;

type Board = { w: number; h: number; cx: number; body: ReactNode };
type Box = { s: SubCategory; d: number; y: number; kids: Box[] };

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

  // Açılışta işlemci ortada — iki yana açılan ağacın başı
  const scrollRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollLeft = (board.cx / board.w) * el.scrollWidth - el.clientWidth / 2;
  }, [focusKey, board.cx, board.w]);

  // ─── A · Anakart: işlemci + iki sütun kategori çipi ─────────────────────────
  function overview(): Board {
    const n = cats.length;
    const nL = Math.ceil(n / 2);
    const per = Math.max(1, nL);
    const root = { x: 105, y: 26, w: 150, h: 54 };
    const rootBottom = root.y + root.h;
    // İşlemcinin altındaki bacak aralığı — çip çoğaldıkça sıkışıyor, ortayı geçmiyor
    const pitch = per > 1 ? Math.min(13, 56 / (per - 1)) : 0;
    // Teknoloji ağacı: her alt kalem kuşağı bir sütun. Soldaki kategorilerin
    // ağacı sola, sağdakilerin sağa açılıyor; her yaprak bir satır, üst kalem
    // çocuklarının ortasında. Kategori bloğu ağacı kadar uzun.
    const leavesOf = (id: string): number => {
      const k = kidsOf.get(id) ?? [];
      return k.length ? k.reduce((a, c) => a + leavesOf(c.id), 0) : 1;
    };
    const depthOf = (id: string): number => {
      const k = kidsOf.get(id) ?? [];
      return k.length ? 1 + Math.max(...k.map((c) => depthOf(c.id))) : 0;
    };
    const place = (sub: SubCategory, d: number, y0: number): Box => {
      const k = kidsOf.get(sub.id) ?? [];
      if (!k.length) return { s: sub, d, y: y0 + ROW / 2, kids: [] };
      let y = y0;
      const kids = k.map((c) => {
        const b = place(c, d + 1, y);
        y += leavesOf(c.id) * ROW;
        return b;
      });
      return { s: sub, d, y: (kids[0].y + kids[kids.length - 1].y) / 2, kids };
    };
    const cursor = [104, 104];
    const maxD = [0, 0];
    const chips = cats.map((c, i) => {
      const L = i < nL;
      const side = L ? 0 : 1;
      const k = L ? i : i - nL;
      const subs = kidsOf.get(c.id) ?? [];
      const leaves = subs.reduce((a, x) => a + leavesOf(x.id), 0);
      // Çip bloğun başında, ilk yaprak onun hizasında; ağaç aşağı akıyor
      const cy = cursor[side] + 52;
      let y = cy - ROW / 2;
      const end = Math.max(cursor[side] + 104, y + leaves * ROW);
      const boxes = subs.map((x) => {
        const b = place(x, 1, y);
        y += leavesOf(x.id) * ROW;
        return b;
      });
      maxD[side] = Math.max(maxD[side], depthOf(c.id));
      cursor[side] = end + 22;
      return {
        c,
        i,
        L,
        x: L ? 10 : 246,
        y: cy - 24,
        w: 104,
        h: bodyH(subs.length, 48),
        px: L ? 118 + k * pitch : 242 - k * pitch,
        boxes,
      };
    });
    // Altta açıklama kutusunun payı
    const h = Math.max(cursor[0], cursor[1]) + 74;
    const offX = maxD[0] * STEP;
    const w = W + offX + maxD[1] * STEP;

    // Serigrafi kodları: entegre U<kategori>.<sıra>, eleman R<sıra>
    let rN = 0;
    const uN = new Map<string, number>();
    /**
     * Bir kalemin gövdesi ve dış kenarındaki bacaklardan çocuklarına giden
     * izler. Alt kalemi olan kalem bir entegre (çocuk sayısı kadar bacak),
     * yaprak kalem iki uçlu bir eleman.
     */
    const drawBody = (b: Box, L: boolean, color: string, catId: string, ci: number): ReactNode => {
      const dir = L ? -1 : 1;
      const inner = L ? 10 - GAP - (b.d - 1) * STEP : 350 + GAP + (b.d - 1) * STEP;
      const bx = L ? inner - BW : inner;
      const outer = L ? bx : bx + BW;
      const ic = b.kids.length > 0;
      const bh = ic ? bodyH(b.kids.length, BH) : BH;
      const top = b.y - bh / 2;
      const u = usage(b.s.id);
      const on = u > LIT;
      const fill = mix(color, 18 + 70 * u);
      let ref: string;
      if (ic) {
        const n = (uN.get(catId) ?? 0) + 1;
        uN.set(catId, n);
        ref = `U${ci + 1}.${n}`;
      } else ref = `R${++rN}`;
      const open = () => {
        if (ic) setFocus({ type: "sub", id: b.s.id });
        else router.push(routes.structureSub(catId, b.s.id));
      };
      const pys = pinYs(b.y, b.kids.length);
      const paths = fanOut(outer, dir, b.kids.map((k, i) => ({ py: pys[i], cy: k.y })));
      return (
        <g key={b.s.id}>
          {b.kids.map((k, i) => {
            const ku = usage(k.s.id);
            return (
              <path key={`w${k.s.id}`} d={paths[i]} fill="none" stroke={ku > LIT ? INK : INK_OFF} strokeWidth={1.2 + 1.8 * ku} strokeLinejoin="round" />
            );
          })}
          <g role="button" aria-label={b.s.name} style={{ cursor: "pointer" }} onClick={open}>
            {/* gelen izin oturduğu pad */}
            <rect x={L ? outer + BW - 1 : inner - 5} y={b.y - 2.5} width={6} height={5} fill={on ? INK : "#fff"} stroke={INK} strokeWidth={1} />
            {ic &&
              pys.map((py, i) => (
                <rect key={i} x={L ? outer - 5 : outer - 1} y={py - 1.5} width={6} height={3} fill={INK} />
              ))}
            <rect x={bx + 2.5} y={top + 2.5} width={BW} height={bh} rx={ic ? 4 : 3} fill={INK} />
            <rect x={bx} y={top} width={BW} height={bh} rx={ic ? 4 : 3} fill={fill} stroke={INK} strokeWidth={1.8} />
            {ic ? (
              <circle cx={L ? bx + BW - 7 : bx + 7} cy={top + 7} r={2} fill={INK} />
            ) : (
              // elemanın iki metal ucu
              <>
                <rect x={bx} y={top} width={8} height={bh} rx={2} fill={INK} />
                <rect x={bx + BW - 8} y={top} width={8} height={bh} rx={2} fill={INK} />
              </>
            )}
            <Txt x={bx + BW / 2} y={b.y + 3.8} size={10.5} anchor="middle" weight={800}>
              {short(b.s.name, ic ? 15 : 13)}
            </Txt>
            <Txt x={L ? bx + BW : bx} y={top - 4} size={7.5} anchor={L ? "end" : "start"} mono fill={INK_SOFT} weight={600}>
              {ref}
            </Txt>
          </g>
          {b.kids.map((k) => drawBody(k, L, color, catId, ci))}
        </g>
      );
    };
    const trees = chips.map((ch) => {
      const pe = ch.L ? ch.x : ch.x + ch.w;
      const pys = pinYs(ch.y + ch.h / 2, ch.boxes.length);
      const paths = fanOut(pe, ch.L ? -1 : 1, ch.boxes.map((b, i) => ({ py: pys[i], cy: b.y })));
      return (
        <g key={`tree${ch.c.id}`}>
          {ch.boxes.map((b, i) => {
            const bu = usage(b.s.id);
            return (
              <g key={`w${b.s.id}`}>
                <path d={paths[i]} fill="none" stroke={bu > LIT ? INK : INK_OFF} strokeWidth={1.2 + 1.8 * bu} strokeLinejoin="round" />
                <rect x={ch.L ? pe - 5 : pe - 1} y={pys[i] - 1.5} width={6} height={3} fill={INK} />
              </g>
            );
          })}
          {ch.boxes.map((b) => drawBody(b, ch.L, ch.c.color, ch.c.id, ch.i))}
        </g>
      );
    });

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
      <g transform={`translate(${offX} 0)`}>
        {trees}
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
          const u = usage(c.id);
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
              <rect x={ch.x + 3} y={ch.y + 3} width={ch.w} height={ch.h} rx={6} fill={INK} />
              <rect x={ch.x} y={ch.y} width={ch.w} height={ch.h} rx={6} fill={mix(c.color, 25 + 75 * u)} stroke={INK} strokeWidth={2} />
              <circle cx={ch.x + 8} cy={ch.y + 8} r={2.4} fill={INK} />
              <Txt x={ch.x + ch.w / 2} y={ch.y + 21} size={12.5} anchor="middle" weight={900}>
                {short(c.name, 14)}
              </Txt>
              <Txt x={ch.x + ch.w / 2} y={ch.y + 37} size={9} anchor="middle" mono weight={600} opacity={0.75}>
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
      </g>
    );
    return { w, h, cx: offX + W / 2, body };
  }

  // ─── B · Çip: odaktaki kalem ortada, alt kalemleri iki yanda bileşen ───────
  function chipView(cat: Category, sub?: SubCategory): Board {
    const id = sub?.id ?? cat.id;
    const name = sub?.name ?? cat.name;
    const kids = kidsOf.get(id) ?? [];
    const per = Math.max(1, Math.ceil(kids.length / 2));
    const sides = [kids.slice(0, per), kids.slice(per)];
    const pitch = per > 1 ? Math.min(110, Math.max(84, 360 / (per - 1))) : 0;
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
    const CH = 34;
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
                <Txt x={cx + CW / 2} y={cy + 4} size={11} anchor="middle" weight={800}>
                  {short(s.name, 14)}
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
          <Txt x={chip.x + chip.w / 2} y={midY - 4} size={15} anchor="middle" weight={900}>
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
    return { w: W, h, cx: W / 2, body };
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

      {/* Teknoloji ağacı gibi: kart ekran genişliğinde, aşağı kaydırarak
          ilerleniyor. Başka bir çipe geçince baştan (key) */}
      <div
        key={focusKey}
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-auto overscroll-contain"
        style={{ containerType: "inline-size" }}
      >
        <svg
          className="animate-zoom-in mx-auto block h-auto max-w-none"
          // Ölçek: 360 birimlik orta şerit ekran genişliğinde (en çok 440px);
          // ağaç ondan geniş, yana kaydırılıyor
          style={{ width: `calc(min(100cqw, 440px) * ${board.w / W})` }}
          viewBox={`0 0 ${board.w} ${board.h}`}
        >
          {board.body}
        </svg>
      </div>

      <MapLegend brutal />
    </div>
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
