"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Locate } from "lucide-react";

/**
 * Sığdırılmış hale göre en çok bu kadar yakınlaşılır — ama en az DOĞAL BOYA
 * kadar. Tavan yalnız sığdırmaya bağlıyken büyük tuvalde tuzak oluyordu:
 * bin küsur düğümlü bir ağ %3,5'e sığıyor ve 2,5 katı bile %9 ediyor, yani
 * kullanıcı hiçbir zaman yazıları okuyabileceği boya gelemiyordu.
 */
const MIN_MAX_ZOOM = 2.5;
/** Pencere en az bu kadar yer kaplar; üstü kabın verdiği alandır */
const MIN_FRAME_H = 300;
/**
 * Sığdırma yalnız KÜÇÜLTÜR, asla büyütmez. Az düğümlü sayfaları kutuya
 * doldurmak için büyütmeyi denedik; hücreler kocaman oldu.
 */
const MAX_FIT = 1;
/** Sığdırırken kenarlarda bırakılan pay (px) — adlar ekran kenarına yapışmasın */
const FIT_MARGIN = 18;
/**
 * Kaydırırken şeklin pencerede en az bu oranı kalır. Açılışta da kaydırmak
 * serbest (eskiden kilitliydi, harita "donmuş" hissi veriyordu) ama şekil
 * ekrandan kaçıp kullanıcıyı boşlukta bırakamaz.
 */
const KEEP_VISIBLE = 0.35;
/** Çift dokunuşta yakınlaşılan kat */
const DOUBLE_TAP_ZOOM = 2.2;
/** Bırakınca kayma: her 16ms'de hızın bu kadarı kalır */
const FRICTION = 0.93;

type Pt = { x: number; y: number };

/**
 * Ağın gezinilebilir penceresi.
 *
 * AÇILIŞ: haritanın kalbi (`origin`, merkez düğüm) pencerenin tam ortasında
 * ve şeklin tamamı kenar payıyla sığdırılmış. Eskiden tuval kutusunun
 * ortası ortalanıyordu — kümeler dengesizse merkez düğüm kenara kayıyor,
 * kenardaki adlar ekrandan taşıyordu.
 *
 * GEZİNME:
 * - İki parmak / tekerlek / trackpad sıkıştırma: parmakların (imlecin)
 *   ALTINDAKİ nokta yerinde kalarak yakınlaşır. Ortaya doğru yakınlaşmak
 *   bakılan şeyi ekrandan kaçırıyordu.
 * - Tek parmak kaydırır, bırakınca biraz kayarak durur.
 * - Boş yere çift dokunmak o noktaya yakınlaşır; yakınken çift dokunmak
 *   açılış haline döner.
 * - Açılış hali en uzak hal: daha fazla uzaklaşmak şekli okunmaz yapıyordu.
 *
 * Düğümlerin kendi dokunma/basılı-tutma davranışı var; düğümden başlayan
 * tek parmak ancak HEMEN kayarsa kaydırır (`data-net-node` taşıyanlar).
 */
export function CanvasViewport({
  width,
  height,
  origin,
  /** Değişince görünüm sıfırlanır — başka bir düğüme geçildi demektir */
  resetKey,
  children,
}: {
  width: number;
  height: number;
  /** Pencerenin ortasına gelecek tuval noktası; yoksa tuvalin ortası */
  origin?: Pt;
  resetKey: string;
  children: React.ReactNode;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [frame, setFrame] = useState({ w: 0, h: MIN_FRAME_H });
  /** Sığdırılmış hale göre kaç kat — 1 = açılış hali */
  const [zoom, setZoom] = useState(1);
  /** Kökün, pencere ortasına göre ekrandaki yeri (px) */
  const [pan, setPan] = useState<Pt>({ x: 0, y: 0 });

  const ox = origin?.x ?? width / 2;
  const oy = origin?.y ?? height / 2;

  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const r = e.contentRect;
      if (r.width > 0) setFrame({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /**
   * Görünümün doğrusu bu ref: art arda gelen tekerlek ve parmak olayları bir
   * sonraki çizimi beklemeden birbirinin sonucunu görmeli. Her değişiklik
   * commit'ten geçer — ref'e ve çizime birlikte yazılır.
   */
  const view = useRef({ zoom: 1, pan: { x: 0, y: 0 } as Pt });
  const commit = (z: number, p: Pt) => {
    view.current = { zoom: z, pan: p };
    setZoom(z);
    setPan(p);
  };

  // Yeni sayfaya geçince sıfırla — render sırasında, effect turu beklemesin
  const [prevKey, setPrevKey] = useState(resetKey);
  if (prevKey !== resetKey) {
    setPrevKey(resetKey);
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }
  useLayoutEffect(() => {
    view.current = { zoom: 1, pan: { x: 0, y: 0 } };
  }, [resetKey]);

  /**
   * Kök ortadayken şeklin tamamını sığdıran ölçek. Kökün iki yanındaki
   * uzaklığın BÜYÜĞÜ esas: şekil kökün bir yanında daha uzunsa o yan da
   * pencereye girmeli.
   */
  const halfW = Math.max(ox, width - ox);
  const halfH = Math.max(oy, height - oy);
  const fit =
    frame.w > 0 && halfW > 0
      ? Math.max(
          0.01,
          Math.min(
            MAX_FIT,
            (frame.w - FIT_MARGIN * 2) / (halfW * 2),
            (frame.h - FIT_MARGIN * 2) / (halfH * 2)
          )
        )
      : 1;
  const scale = fit * zoom;
  const maxZoom = Math.max(MIN_MAX_ZOOM, 1 / fit);

  /** Kaydırma sınırı: şeklin en az KEEP_VISIBLE'ı pencerede kalsın */
  const clampAt = (p: Pt, s: number): Pt => {
    const keepX = KEEP_VISIBLE * Math.min(frame.w, width * s);
    const keepY = KEEP_VISIBLE * Math.min(frame.h, height * s);
    // Şeklin ekrandaki sol/sağ kenarı: p.x - ox*s ve p.x + (width-ox)*s
    const minX = -frame.w / 2 + keepX - (width - ox) * s;
    const maxX = frame.w / 2 - keepX + ox * s;
    const minY = -frame.h / 2 + keepY - (height - oy) * s;
    const maxY = frame.h / 2 - keepY + oy * s;
    return {
      x: Math.max(minX, Math.min(maxX, p.x)),
      y: Math.max(minY, Math.min(maxY, p.y)),
    };
  };

  /** Pencereye bağlı ölçüler — olay dinleyicileri buradan okur */
  const geom = useRef({ fit, maxZoom, clampAt });
  useLayoutEffect(() => {
    geom.current = { fit, maxZoom, clampAt };
  });

  /** Pencere ortasına göre ekran noktası */
  const local = (clientX: number, clientY: number): Pt => {
    const r = frameRef.current?.getBoundingClientRect();
    if (!r) return { x: 0, y: 0 };
    return { x: clientX - r.left - r.width / 2, y: clientY - r.top - r.height / 2 };
  };

  /** q noktası ekranda yerinde kalarak yakınlaş */
  const zoomAround = (q: Pt, nextZoom: number) => {
    const g = geom.current;
    const v = view.current;
    const z = Math.max(1, Math.min(g.maxZoom, nextZoom));
    const k = z / v.zoom;
    const p = {
      x: q.x - (q.x - v.pan.x) * k,
      y: q.y - (q.y - v.pan.y) * k,
    };
    commit(z, g.clampAt(p, g.fit * z));
  };

  // ── Bırakınca kayma ────────────────────────────────────────────────────
  const glide = useRef<number | null>(null);
  const stopGlide = () => {
    if (glide.current != null) cancelAnimationFrame(glide.current);
    glide.current = null;
  };
  const startGlide = (v: Pt) => {
    stopGlide();
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let vel = v;
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(48, now - last);
      last = now;
      const g = geom.current;
      const v = view.current;
      const next = g.clampAt(
        { x: v.pan.x + vel.x * dt, y: v.pan.y + vel.y * dt },
        g.fit * v.zoom
      );
      // Sınıra dayandıysa o eksende dur
      if (next.x === v.pan.x) vel = { ...vel, x: 0 };
      if (next.y === v.pan.y) vel = { ...vel, y: 0 };
      commit(v.zoom, next);
      const f = Math.pow(FRICTION, dt / 16);
      vel = { x: vel.x * f, y: vel.y * f };
      if (Math.hypot(vel.x, vel.y) > 0.02) glide.current = requestAnimationFrame(step);
      else glide.current = null;
    };
    glide.current = requestAnimationFrame(step);
  };
  useEffect(() => stopGlide, []);

  // ── Tekerlek ve trackpad ───────────────────────────────────────────────
  // React'in tekerlek dinleyicisi pasif — preventDefault yok, trackpad'de
  // iki parmak sıkıştırma (ctrl+wheel) haritayı değil SAYFAYI büyütüyordu.
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      stopGlide();
      const g = geom.current;
      const v = view.current;
      // Satır/sayfa birimli tekerlekler piksele çevrilir
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
      const dy = e.deltaY * unit;
      const dx = e.deltaX * unit;
      // Trackpad'de iki parmakla sürüklemek (ctrl'siz, yatay bileşenli) kaydırır
      if (!e.ctrlKey && Math.abs(dx) > Math.abs(dy) * 0.5 && e.deltaMode === 0) {
        commit(v.zoom, g.clampAt({ x: v.pan.x - dx, y: v.pan.y - dy }, g.fit * v.zoom));
        return;
      }
      // Sıkıştırma daha hassas gelir; ikisi de pürüzsüz, adım adım değil
      const k = Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0022));
      zoomAround(local(e.clientX, e.clientY), v.zoom * k);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
    // Dinleyici bir kez bağlanır: zoomAround/local/commit yalnız ref ve
    // kararlı state ayarlayıcıları okuyor, ilk çizimdeki halleri hep güncel
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Sürükleme + iki parmakla yakınlaştırma ─────────────────────────────
  // Hücreler tuvalin çoğunu kaplıyor; parmağın boş yere denk gelmesi zor.
  // O yüzden jest düğümlerin üstünde de başlıyor: iki parmak her zaman
  // yakınlaştırır, tek parmak ancak HEMEN kaydırmaya başlarsa (basılı tutup
  // sürükleme düğümün kendi işi — sıra değiştirme — 350ms sonra başlıyor).
  const pointers = useRef(new Map<number, Pt & { onNode: boolean }>());
  const gesture = useRef<{
    pan: Pt;
    zoom: number;
    dist: number;
    mid: Pt;
    at: number;
  } | null>(null);
  /** Kaydırma oldu mu — olduysa parmağı kaldırınca tıklama sayılmamalı */
  const panned = useRef(false);
  /** Hız ölçümü — bırakınca kayma için son hareketler */
  const track = useRef<{ t: number; p: Pt }[]>([]);
  /** Son boş dokunuş — çift dokunuşu yakalamak için */
  const lastTap = useRef<{ t: number; p: Pt } | null>(null);

  const midOf = (): Pt => {
    const pts = [...pointers.current.values()];
    if (!pts.length) return { x: 0, y: 0 };
    return local(
      pts.reduce((a, p) => a + p.x, 0) / pts.length,
      pts.reduce((a, p) => a + p.y, 0) / pts.length
    );
  };
  const distOf = () => {
    const [a, b] = [...pointers.current.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };
  const beginGesture = () => {
    gesture.current = {
      pan: view.current.pan,
      zoom: view.current.zoom,
      dist: pointers.current.size === 2 ? distOf() : 0,
      mid: midOf(),
      at: Date.now(),
    };
    track.current = [];
  };

  const onDown = (e: React.PointerEvent) => {
    stopGlide();
    const onNode = !!(e.target as HTMLElement).closest("[data-net-node]");
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY, onNode });
    // Düğümün üstündeki parmağı YAKALAMIYORUZ: yakalarsak dokunma ve basılı
    // tutma düğüme hiç ulaşmaz. Olaylar zaten buraya kabarıyor.
    if (!onNode) e.currentTarget.setPointerCapture(e.pointerId);
    if (pointers.current.size === 1) panned.current = false;
    beginGesture();
  };

  const onMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev || !gesture.current) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY, onNode: prev.onNode });
    const g = gesture.current;
    const mid = midOf();

    if (pointers.current.size === 2 && g.dist > 0) {
      // Parmakların arası büyüdükçe yakınlaş; başlangıçta parmakların
      // altındaki nokta şimdi parmakların altında kalsın (kaydırma dahil)
      const geo = geom.current;
      const z = Math.max(1, Math.min(geo.maxZoom, g.zoom * (distOf() / g.dist)));
      const k = z / g.zoom;
      const p = {
        x: mid.x - (g.mid.x - g.pan.x) * k,
        y: mid.y - (g.mid.y - g.pan.y) * k,
      };
      commit(z, geo.clampAt(p, geo.fit * z));
      panned.current = true;
      return;
    }

    const moved = { x: g.pan.x + mid.x - g.mid.x, y: g.pan.y + mid.y - g.mid.y };
    const far = Math.abs(mid.x - g.mid.x) + Math.abs(mid.y - g.mid.y) > 6;
    // Düğümden başlayan tek parmak: hareket geç başladıysa bu bir basılı
    // tutma, tuvali kaydırmıyoruz
    if (prev.onNode && !panned.current && (!far || Date.now() - g.at > 300)) return;
    if (far) panned.current = true;
    if (!panned.current) return;
    const geo = geom.current;
    commit(view.current.zoom, geo.clampAt(moved, geo.fit * view.current.zoom));
    const now = performance.now();
    track.current.push({ t: now, p: mid });
    while (track.current.length > 2 && now - track.current[0].t > 90) track.current.shift();
  };

  const onUp = (e: React.PointerEvent) => {
    const info = pointers.current.get(e.pointerId);
    pointers.current.delete(e.pointerId);
    const wasPan = panned.current;

    if (pointers.current.size === 0) {
      gesture.current = null;
      // Hızla bırakıldıysa kaymaya devam
      const pts = track.current;
      if (wasPan && pts.length >= 2) {
        const a = pts[0];
        const b = pts[pts.length - 1];
        const dt = b.t - a.t;
        if (dt > 0 && performance.now() - b.t < 60) {
          startGlide({ x: (b.p.x - a.p.x) / dt, y: (b.p.y - a.p.y) / dt });
        }
      }
      track.current = [];

      // Boş yere çift dokunuş: o noktaya yakınlaş ya da açılışa dön
      if (!wasPan && info && !info.onNode) {
        const p = local(e.clientX, e.clientY);
        const now = Date.now();
        const lt = lastTap.current;
        if (lt && now - lt.t < 320 && Math.hypot(p.x - lt.p.x, p.y - lt.p.y) < 30) {
          lastTap.current = null;
          if (view.current.zoom > 1.4) {
            commit(1, { x: 0, y: 0 });
          } else {
            zoomAround(p, DOUBLE_TAP_ZOOM);
          }
        } else {
          lastTap.current = { t: now, p };
        }
      }
    } else {
      // Bir parmak kalktı, öteki devam ediyor — jest ondan yeniden başlasın
      beginGesture();
    }
  };

  const moved = zoom !== 1 || pan.x !== 0 || pan.y !== 0;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={frameRef}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        // Kaydırdıktan sonra parmağı bir hücrenin üstünde kaldırmak o
        // hücreye girmek anlamına gelmemeli
        onClickCapture={(e) => {
          if (!panned.current) return;
          panned.current = false;
          e.stopPropagation();
          e.preventDefault();
        }}
        className="relative min-h-0 flex-1 overflow-hidden overscroll-contain touch-none"
        style={{ minHeight: MIN_FRAME_H }}
      >
        {/* Kök pencerenin ortasında; ölçek ve kaydırma kökün etrafında —
            "ortala" gerçekten başlangıç haline döner */}
        <div
          className="absolute left-1/2 top-1/2 will-change-transform"
          style={{
            width,
            height,
            marginLeft: -ox,
            marginTop: -oy,
            transformOrigin: `${ox}px ${oy}px`,
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
          }}
        >
          {children}
        </div>
      </div>

      {/* Yakınlaştırma düğmesi yok — parmakla yapılıyor. Yalnız kullanıcı
          şekli oynattığında bir dönüş yolu beliriyor. */}
      {moved && (
        <button
          type="button"
          onClick={() => {
            stopGlide();
            commit(1, { x: 0, y: 0 });
          }}
          aria-label="Ortala"
          className="absolute bottom-1 right-1 flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card/85 text-muted-foreground backdrop-blur transition-colors hover:text-foreground"
        >
          <Locate className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
