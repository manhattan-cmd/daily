"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft, CornerDownRight, Plus, Search, X } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { listUserCategories } from "@/lib/db/queries";
import { useT } from "@/lib/i18n";
import { useRoutePath } from "@/lib/use-route-path";
import { SummaryTile } from "@/components/ui/summary-block";
import { STRUCTURE_TABS, structureTabIndex } from "./structure-tabs";

/** Yapı'nın sarısı — şerit, sayfa başı ve sekmenin şekli */
const YAPI = "#ffd23f";

/**
 * Yapı sayfalarının başı (Brütal) — Harita dışındaki bütün Yapı sayfalarında
 * aynı: gövdenin tepesinde, altındaki pencerelerin dilinde tek blok (bkz.
 * SummaryBlock compact):
 *
 *  - Baş satırı: Yapı sarısında sekmenin şekli (kare = kategori, daire =
 *    özellik…), sayfanın adı ve kaç tane olduğu ("26 özellik"); sağda eşit
 *    boyda kare karolar — Ara (beyaz) ve Ekle (yeşil, artı). Altındaki
 *    pencerelerin ekle karosunun aynısı.
 *  - Konum yolu (kategori, alt kategori, liste, nesne sayfaları): baş
 *    satırının altında "↳ Harcamalar › Alışveriş › ■ Ev eşyası". Baş satırı
 *    o sayfalarda sekmenin köküne çıkar.
 *  - Ara'ya basınca arama satırı açılır; kapatınca arama silinir.
 *
 * Eskiden bu satır sarı üst menünün içinde beyaz bir karttı: menü 117 px
 * tutuyordu (ana sayfanınki 71, Takvim'inki 64). Ekle düğmesi yazılı
 * kapsüldü ("+ Özellik", "+ Yeni liste") — her sayfada başka boyda. Arama
 * kutusu da sayfanın başında hep açıktı.
 */
export function StructureHead({
  count,
  upHref,
  add,
  search,
  searchRow,
  onCloseSearch,
  rows,
}: {
  /** Başın alt satırı — "26 özellik"; yüklenirken boş */
  count?: string;
  /** Verilirse baş satırı sekmenin köküne bağlantı (alt sayfalar) */
  upHref?: string;
  /** Ekle karosu — label ekran okuyucuya ne ekleneceğini söyler */
  add?: { label: string; onClick: () => void };
  /** Verilirse Ara karosu ve arama satırı */
  search?: { value: string; onChange: (q: string) => void; placeholder: string };
  /** Arama satırı yerine (Özellikler: tür süzgeçli arama) — autoFocus alır */
  searchRow?: (autoFocus: boolean) => ReactNode;
  /** Arama kapanınca (Özellikler: tür süzgeci de sıfırlanır — gizli kalmasın) */
  onCloseSearch?: () => void;
  /** Baş satırının altındaki satırlar (konum yolu, görünüm anahtarı, boş pencere) */
  rows?: ReactNode;
}) {
  const t = useT();
  const path = useRoutePath();
  const tab = STRUCTURE_TABS[structureTabIndex(path)];
  // Adresten aranmış gelindiyse (Ara'nın özellik sonucu) açık başlar
  const [open, setOpen] = useState(() => !!search?.value);
  // Karoyla açıldıysa kutuya odaklan; açılışta açıksa klavye kendiliğinden açılmasın
  const [focus, setFocus] = useState(false);
  const searching = !!search && (open || !!search.value);

  function toggleSearch() {
    if (searching) {
      setOpen(false);
      search?.onChange("");
      onCloseSearch?.();
    } else {
      setOpen(true);
      setFocus(true);
    }
  }

  const title = t(tab?.key ?? "structure.title");
  const lead = (
    <div className="flex h-full min-h-[58px] items-center gap-2.5 px-3 py-2 text-[#111]" style={{ background: YAPI }}>
      {upHref && <ChevronLeft aria-hidden className="-ml-1 -mr-1 h-4 w-4 shrink-0 opacity-60" strokeWidth={3} />}
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border-[1.5px] border-[#111] bg-white">
        {tab && <tab.icon aria-hidden className="h-[18px] w-[18px]" strokeWidth={2.6} fill={YAPI} />}
      </span>
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[17px] font-black leading-tight tracking-tight">{title}</h1>
        {/* Sayı yüklenene dek yer tutar, baş zıplamasın */}
        <div className="h-[15px] truncate text-[11.5px] font-bold leading-[15px] opacity-65">{count}</div>
      </div>
    </div>
  );

  return (
    <section
      data-structure-head=""
      aria-label={title}
      className="mb-4 grid grid-cols-1 gap-[2px] overflow-hidden rounded-[18px] border-2 border-[#111] bg-[#111] shadow-[4px_4px_0_#111]"
    >
      <div className="flex gap-[2px]">
        {upHref ? (
          <Link href={upHref} prefetch={false} aria-label={title} className="block min-w-0 flex-1 active:brightness-95">
            {lead}
          </Link>
        ) : (
          <div className="min-w-0 flex-1">{lead}</div>
        )}
        {search && (
          <div className="w-[52px] shrink-0">
            <SummaryTile
              compact
              color="#ffffff"
              icon={searching ? X : Search}
              label={searching ? t("action.close") : t("action.search")}
              onClick={toggleSearch}
            />
          </div>
        )}
        {add && (
          <div className="w-[52px] shrink-0">
            <SummaryTile compact color="#7ae582" icon={Plus} label={`${t("action.add")}: ${add.label}`} onClick={add.onClick} />
          </div>
        )}
      </div>
      {rows}
      {searching &&
        (searchRow ? (
          searchRow(focus)
        ) : (
          <HeadSearch value={search.value} onChange={search.onChange} placeholder={search.placeholder} autoFocus={focus} />
        ))}
    </section>
  );
}

/** Başın arama satırı — beyaz, çerçevesiz (çizgisi bloğun) */
function HeadSearch({
  value,
  onChange,
  placeholder,
  autoFocus,
}: {
  value: string;
  onChange: (q: string) => void;
  placeholder: string;
  autoFocus: boolean;
}) {
  const t = useT();
  return (
    <label data-structure-search="" className="relative flex h-11 items-center bg-white">
      <Search className="pointer-events-none absolute left-3.5 h-4 w-4 text-[#111]/45" strokeWidth={2.4} />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        autoFocus={autoFocus}
        enterKeyHint="search"
        className="h-full w-full bg-transparent pl-10 pr-10 text-[14.5px] font-bold text-[#111] outline-none placeholder:font-semibold placeholder:text-[#111]/40"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute right-2 flex h-7 w-7 items-center justify-center rounded-full bg-[#111]/[0.07] text-[#111]/70"
          aria-label={t("features.clearSearch")}
        >
          <X className="h-3.5 w-3.5" strokeWidth={2.6} />
        </button>
      )}
    </label>
  );
}

/**
 * Sekme kökünün sayısı — alt sayfaların başı da kökünkini yazar
 * ("Kategoriler · 10 kategori" kategori sayfasında da)
 */
export function useRootCount(root: "categories" | "objects"): string | undefined {
  const t = useT();
  // Sorgu yalnız sayıları döndürür: t her çizimde yeni işlev, bağımlılıkta döngü kurar
  const n = useLiveQuery(async () => {
    if (root === "categories") return { n: (await listUserCategories()).length, things: 0 };
    const [cols, things] = await Promise.all([db.collections.count(), db.things.filter((th) => !th.archivedAt).count()]);
    return { n: cols, things };
  }, [root]);
  if (!n) return undefined;
  return root === "categories" ? t("struct.cats.count", { n: n.n }) : t("struct.lists.count", n);
}

/** Konum yolu satırı — baş satırının altında; önünde ↳: "bunun içinde" */
export function HeadTrailRow({ children }: { children: ReactNode }) {
  return (
    <div data-structure-trail-row="" className="flex min-w-0 items-center bg-white pl-2.5">
      <CornerDownRight aria-hidden className="h-4 w-4 shrink-0 text-[#111]/45" strokeWidth={2.6} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
