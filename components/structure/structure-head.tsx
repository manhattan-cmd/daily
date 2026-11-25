"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft, CornerDownRight, Plus, Search, X } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { listUserCategories } from "@/lib/db/queries";
import { useT } from "@/lib/i18n";
import { useRoutePath } from "@/lib/use-route-path";
import { SummaryEmpty } from "@/components/ui/summary-block";
import { STRUCTURE_TABS, structureTabIndex } from "./structure-tabs";
import { blockFill, fillStyle } from "@/lib/fill";

/** Yapı'nın sarısı — şerit, sayfa başı ve sekmenin şekli */
const YAPI = "#ffd23f";

/** Bölüm bantlarının tram benekleri (bkz. SummaryBlock link, globals.css) */
const BAND = {
  ["--fc" as string]: YAPI,
  backgroundColor: blockFill(YAPI),
  backgroundImage: "radial-gradient(var(--dot) 1.2px, transparent 1.5px)",
  backgroundSize: "11px 11px",
};

/** Bantta duran kare düğme — Ara ve Ekle aynı boyda */
const HEAD_BTN =
  "flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] border-2 border-line text-ink shadow-[2px_2px_0_var(--shade)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none";

/**
 * Yapı sayfalarının başı (Brütal) — Harita dışındaki bütün Yapı sayfalarında
 * aynı: beyaz pencerenin (bkz. PageSheet) başlık çubuğu. Pencerenin
 * tepesine kenardan kenara oturur, köşeleri pencereninkiyle bir; altında
 * şeritteki gibi kalın siyah çizgi. İçerik blokları onun altında başlar.
 *
 *  - Baş satırı: bölüm bantlarının benekli Yapı sarısında sekmenin şekli
 *    (kare = kategori, daire = özellik…), sayfanın adı ve kaç tane olduğu
 *    ("26 özellik"); sağda bandın üstünde aynı boyda iki kare düğme — Ara
 *    (beyaz) ve Ekle (yeşil, artı). Ana sayfa şeridinin düğmeleri gibi.
 *  - Konum yolu (kategori, alt kategori, liste, nesne sayfaları): baş
 *    satırının altında "↳ Harcamalar › Alışveriş › ■ Ev eşyası". Baş satırı
 *    o sayfalarda sekmenin köküne çıkar.
 *  - Ara'ya basınca arama satırı açılır; kapatınca arama silinir.
 *  - Hiç kayıt yoksa boş pencere başın altında ayrı durur.
 *
 * İlk hali içerik bloklarıyla aynı çerçeveli, gölgeli bir bloktu (sağında
 * tam boy karolar): kullanıcıya göre başı pencerenin geri kalanından ayıran
 * bir şey yoktu. Daha önce de sarı üst menünün içinde beyaz bir karttı —
 * menü 117 px tutuyordu; ekle düğmesi yazılı kapsüldü ("+ Özellik", "+ Yeni
 * liste"), her sayfada başka boyda; arama kutusu hep açıktı.
 */
export function StructureHead({
  count,
  upHref,
  add,
  search,
  searchRow,
  onCloseSearch,
  rows,
  empty,
}: {
  /** Başın alt satırı — "26 özellik"; yüklenirken boş */
  count?: string;
  /** Verilirse baş satırı sekmenin köküne bağlantı (alt sayfalar) */
  upHref?: string;
  /** Ekle düğmesi — label ekran okuyucuya ne ekleneceğini söyler */
  add?: { label: string; onClick: () => void };
  /** Verilirse Ara düğmesi ve arama satırı */
  search?: { value: string; onChange: (q: string) => void; placeholder: string };
  /** Arama satırı yerine (Özellikler: tür süzgeçli arama) — autoFocus alır */
  searchRow?: (autoFocus: boolean) => ReactNode;
  /** Arama kapanınca (Özellikler: tür süzgeci de sıfırlanır — gizli kalmasın) */
  onCloseSearch?: () => void;
  /** Baş satırının altındaki satırlar (konum yolu, görünüm anahtarı) */
  rows?: ReactNode;
  /** Hiç kayıt yok — başın altında küçük boş pencere */
  empty?: { text: string; action: { label: string; onClick: () => void } };
}) {
  const t = useT();
  const path = useRoutePath();
  const tab = STRUCTURE_TABS[structureTabIndex(path)];
  // Adresten aranmış gelindiyse (Ara'nın özellik sonucu) açık başlar
  const [open, setOpen] = useState(() => !!search?.value);
  // Düğmeyle açıldıysa kutuya odaklan; açılışta açıksa klavye kendiliğinden açılmasın
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
  const name = (
    <>
      {upHref && <ChevronLeft aria-hidden className="-ml-1 -mr-1.5 h-4 w-4 shrink-0 opacity-60" strokeWidth={3} />}
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] border-2 border-line bg-paper">
        {tab && <tab.icon aria-hidden className="h-5 w-5" strokeWidth={2.6} fill={YAPI} />}
      </span>
      <span className="min-w-0 flex-1">
        <h1 className="truncate text-[19px] font-black leading-tight tracking-tight">{title}</h1>
        {/* Sayı yüklenene dek yer tutar, baş zıplamasın */}
        <span className="block h-4 truncate text-[12px] font-bold leading-4 opacity-65">{count}</span>
      </span>
    </>
  );

  return (
    <>
      <section
        data-structure-head=""
        aria-label={title}
        // Pencerenin iç payını (yanlarda 6, üstte 12 px) aşıp kenardan kenara
        className="-mx-1.5 -mt-3 mb-4 grid grid-cols-1 gap-[2px] overflow-hidden rounded-t-[18px] border-b-[3px] border-line bg-line"
      >
        <div className="flex min-h-[66px] items-center gap-2 py-2.5 pl-3 pr-2.5 text-ink" style={BAND}>
          {upHref ? (
            <Link
              href={upHref}
              prefetch={false}
              aria-label={title}
              className="-my-1 flex min-w-0 flex-1 items-center gap-2.5 rounded-[12px] py-1 active:bg-ink/[0.06]"
            >
              {name}
            </Link>
          ) : (
            <div className="flex min-w-0 flex-1 items-center gap-2.5">{name}</div>
          )}
          {search && (
            <button
              type="button"
              onClick={toggleSearch}
              aria-label={searching ? t("action.close") : t("action.search")}
              title={searching ? t("action.close") : t("action.search")}
              aria-pressed={searching}
              className={HEAD_BTN}
              style={{ background: searching ? "var(--well)" : "var(--paper)", color: searching ? "#ffffff" : "var(--ink)" }}
            >
              {searching ? <X className="h-[18px] w-[18px]" strokeWidth={2.75} /> : <Search className="h-[18px] w-[18px]" strokeWidth={2.75} />}
            </button>
          )}
          {add && (
            <button
              type="button"
              onClick={add.onClick}
              aria-label={`${t("action.add")}: ${add.label}`}
              title={`${t("action.add")}: ${add.label}`}
              className={HEAD_BTN}
              style={fillStyle("#7ae582")}
            >
              <Plus className="h-5 w-5" strokeWidth={3} />
            </button>
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
      {empty && (
        <div className="mb-4 overflow-hidden rounded-[18px] border-2 border-line shadow-[4px_4px_0_var(--shade)]">
          <SummaryEmpty text={empty.text} action={empty.action} />
        </div>
      )}
    </>
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
    <label data-structure-search="" className="relative flex h-11 items-center bg-paper">
      <Search className="pointer-events-none absolute left-3.5 h-4 w-4 text-ink/45" strokeWidth={2.4} />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        autoFocus={autoFocus}
        enterKeyHint="search"
        className="h-full w-full bg-transparent pl-10 pr-10 text-[14.5px] font-bold text-ink outline-none placeholder:font-semibold placeholder:text-ink/40"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute right-2 flex h-7 w-7 items-center justify-center rounded-full bg-ink/[0.07] text-ink/70"
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
    <div data-structure-trail-row="" className="flex min-w-0 items-center bg-paper pl-2.5">
      <CornerDownRight aria-hidden className="h-4 w-4 shrink-0 text-ink/45" strokeWidth={2.6} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
