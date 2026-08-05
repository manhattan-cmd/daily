"use client";

import { useEffect, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowRight } from "lucide-react";
import { fmtNum, type DayBucket } from "@/lib/analytics";

const MARGIN_RIGHT = 4;
/** Balon yüksekliği — sütunun üstünde bu kadar yer yoksa aşağı açılır */
const BALLOON_H = 72;

/**
 * Seri kolon grafiği (günlük/haftalık/aylık kovalar) — tek seri, tek renk.
 * İnce barlar, 4px yuvarlak uç (taban düz), hairline yatay grid, hover tooltip.
 * onSelect verilirse grafik tıklanabilir olur — kovanın dönem sayfasına gidilir.
 */
export function DailyBarChart({
  data,
  color,
  unit,
  onSelect,
  caption,
  showAllTicks,
}: {
  data: DayBucket[];
  color: string;
  unit?: string;
  onSelect?: (periodKey: string) => void;
  /** Grafiğin altında ortalanmış dönem bağlamı (örn. "Temmuz", "2026") */
  caption?: string;
  /** Eksende her kovanın etiketini göster (dönem serilerinde yer hep ayrılır) */
  showAllTicks?: boolean;
}) {
  const allZero = data.every((d) => d.value === 0);

  // Y ekseni genişliği en uzun etikete göre — sabit 40px + negatif sol margin
  // büyük değerleri kırpıyordu ("1.100" → ".100"). Rakam ~7px, artı iç boşluk;
  // recharts eksen üst sınırını yukarı yuvarlayabildiği için bir hane pay.
  const maxVal = data.reduce((m, d) => Math.max(m, d.value), 0);
  const Y_AXIS_WIDTH = Math.min(
    68,
    Math.max(30, (fmtNum(maxVal).length + 1) * 7 + 8)
  );
  const MARGIN_LEFT = 0;
  // Çok sayıda gün olduğunda eksende sabit aralıklarla ~6 etiket göster (kalabalığı önler)
  const tickInterval =
    !showAllTicks && data.length > 8 ? Math.ceil(data.length / 6) - 1 : 0;
  const hasSub = data.some((d) => d.axisSub);

  // Tıklanan kova, X konumundan hesaplanır — recharts'ın tooltip/hover state'ine
  // güvenilmez. Ayrıca "click" olayı da kullanılamaz: hover, bar'ı activeBar ve
  // tooltip cursor'ıyla değiştirdiğinden dokunuşta (hover+basma aynı anda) DOM
  // down-up arasında mutasyona uğruyor ve tarayıcı click üretmiyor. pointerdown/up
  // çifti DOM değişiminden etkilenmez; hareket eşiği kaydırmayı dokunuştan ayırır.
  const pointerDown = useRef<{ x: number; y: number } | null>(null);

  // Dokunuşta tarayıcının emüle hover'ı tooltip'i grafikte takılı bırakıyor —
  // parmak kalktıktan kısa süre sonra gizlenir (true → Tooltip'e active={false});
  // böylece dokunulan değer görünüp kendiliğinden kaybolur. Yeni basış ya da
  // gerçek fare hareketi serbest bırakır; masaüstü hover akışı etkilenmez.
  const [tipDismissed, setTipDismissed] = useState(false);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Seçilen kova + balonun sütuna göre konumu. Dokunuş doğrudan gitmez:
  // sütunun üstünde küçük bir balon açılır, gitmek balonun içindeki
  // bağlantıyla olur. Boşluğa dokunmak kapatır.
  const [picked, setPicked] = useState<
    { bucket: DayBucket; x: number; y: number } | null
  >(null);
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(
    () => () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    },
    []
  );

  // Grafiğin dışına dokunmak balonu kapatır
  useEffect(() => {
    if (!picked) return;
    const onDown = (e: PointerEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setPicked(null);
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [picked]);

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse") {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
      dismissTimer.current = setTimeout(() => setTipDismissed(true), 1500);
    }
    const down = pointerDown.current;
    pointerDown.current = null;
    if (!onSelect || !data.length || !down) return;
    // Kaydırma/sürükleme dokunuş sayılmaz
    if (Math.abs(e.clientX - down.x) > 10 || Math.abs(e.clientY - down.y) > 10)
      return;
    const rect = e.currentTarget.getBoundingClientRect();
    const plotLeft = Y_AXIS_WIDTH + MARGIN_LEFT;
    const plotWidth = rect.width - plotLeft - MARGIN_RIGHT;
    if (plotWidth <= 0) return;
    const relX = e.clientX - rect.left - plotLeft;
    const idx = Math.floor((relX / plotWidth) * data.length);
    const b = idx >= 0 && idx < data.length ? data[idx] : undefined;
    // Boş kovada gidilecek bir şey yok; dokunuş seçimi de temizler
    if (!b || b.value <= 0 || !b.periodKey) return setPicked(null);

    // Balonu sütunun tepesine tuttur — sütun DOM'dan okunur, okunamazsa
    // dokunulan noktanın biraz üstünde açılır
    const bar = boxRef.current
      ?.querySelectorAll(".recharts-bar-rectangle")
      ?.[idx]?.getBoundingClientRect();
    const x = bar ? bar.left + bar.width / 2 - rect.left : e.clientX - rect.left;
    const y = bar ? bar.top - rect.top : e.clientY - rect.top - 12;
    setPicked({ bucket: b, x, y });
  };

  return (
    <>
    <div
      ref={boxRef}
      className={`relative h-[170px] w-full select-none [-webkit-tap-highlight-color:transparent]${onSelect ? " cursor-pointer" : ""}`}
      onPointerDown={(e) => {
        pointerDown.current = { x: e.clientX, y: e.clientY };
        if (dismissTimer.current) clearTimeout(dismissTimer.current);
        setTipDismissed(false);
      }}
      onPointerUp={handlePointerUp}
      onPointerMove={(e) => {
        if (e.pointerType === "mouse" && tipDismissed) setTipDismissed(false);
      }}
    >
      {allZero && (
        <div className="absolute inset-0 flex items-center justify-center pb-6">
          <span className="text-xs text-muted-foreground/60">
            Bu aralıkta veri yok
          </span>
        </div>
      )}
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 8, right: MARGIN_RIGHT, bottom: 0, left: MARGIN_LEFT }}
          barCategoryGap="30%"
          // Recharts 3'te varsayılan açık — grafiği odaklanabilir yapıp tıklamada
          // dikdörtgen focus çerçevesi çiziyor; dokunmatik akışta gereksiz
          accessibilityLayer={false}
        >
          <CartesianGrid
            vertical={false}
            stroke="var(--border)"
            strokeWidth={1}
          />
          <XAxis
            dataKey="axisLabel"
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
            tick={
              hasSub ? <TwoLineTick data={data} /> : { fill: "#a1a1aa", fontSize: 10 }
            }
            height={hasSub ? 34 : undefined}
            interval={tickInterval}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fill: "#a1a1aa", fontSize: 10 }}
            tickCount={3}
            allowDecimals={false}
            tickFormatter={(v: number) => fmtNum(v)}
            width={Y_AXIS_WIDTH}
            className="tabular-nums"
          />
          {/* cursor kapalı: kolon boyu gri dikdörtgen bandı "çerçeve" gibi
              algılanıyordu — vurgu activeBar'ın parlamasına bırakıldı */}
          {/* Kendi balonu olan grafiklerde (onSelect) recharts balonu kapalı —
              ikisi üst üste binmesin */}
          {!onSelect && (
            <Tooltip
              cursor={false}
              active={tipDismissed ? false : undefined}
              content={<ChartTip unit={unit} />}
            />
          )}
          <Bar
            dataKey="value"
            fill={color}
            fillOpacity={0.85}
            radius={[4, 4, 0, 0]}
            maxBarSize={18}
            activeBar={{ fill: color, fillOpacity: 1 }}
          />
        </BarChart>
      </ResponsiveContainer>

      {/* Seçilen sütunun balonu — sütunun tepesinde, ön planda. Sütun uzunsa
          yukarıda yer kalmaz (balon karttan taşıp üstteki kutulara binerdi):
          o durumda sütunun üstüne doğru aşağı açılır. */}
      {onSelect && picked && (
        <div
          className="animate-in pointer-events-none absolute z-20"
          style={{
            left: Math.min(
              Math.max(picked.x, 56),
              (boxRef.current?.clientWidth ?? 340) - 56
            ),
            top: picked.y < BALLOON_H ? picked.y + 8 : picked.y - 8,
            transform:
              picked.y < BALLOON_H
                ? "translate(-50%, 0)"
                : "translate(-50%, -100%)",
          }}
        >
          <div className="pointer-events-auto overflow-hidden rounded-xl border border-white/10 bg-[#1c1c1f]/95 shadow-[0_10px_30px_rgba(0,0,0,0.5)] backdrop-blur-sm">
            <div className="px-2.5 pb-1.5 pt-2">
              <div className="whitespace-nowrap text-sm font-semibold leading-none">
                {fmtNum(picked.bucket.value)}
                {unit && (
                  <span className="ml-1 text-[11px] font-normal text-muted-foreground">
                    {unit}
                  </span>
                )}
              </div>
              <div className="mt-1 whitespace-nowrap text-[10px] leading-none text-muted-foreground">
                {picked.bucket.full}
              </div>
            </div>
            <button
              type="button"
              onClick={() =>
                picked.bucket.periodKey && onSelect(picked.bucket.periodKey)
              }
              className="flex w-full items-center justify-center gap-1 border-t border-white/10 px-2.5 py-1.5 text-[11px] font-medium text-primary transition-colors hover:bg-primary/10"
            >
              Aç
              <ArrowRight className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}
    </div>
    {caption && (
      <div className="mt-1 text-center text-[10px] font-medium text-muted-foreground">
        {caption}
      </div>
    )}

    </>
  );
}

/** İki satırlı eksen etiketi: üstte axisLabel (recharts payload), altta axisSub */
function TwoLineTick({
  x,
  y,
  payload,
  data,
}: {
  x?: number;
  y?: number;
  payload?: { value: string; index: number };
  data: DayBucket[];
}) {
  if (x === undefined || y === undefined || !payload) return null;
  const sub = data[payload.index]?.axisSub;
  return (
    <g transform={`translate(${x},${y})`}>
      <text dy={10} textAnchor="middle" fill="#a1a1aa" fontSize={10}>
        {payload.value}
      </text>
      {sub && (
        <text dy={22} textAnchor="middle" fill="#71717a" fontSize={8.5}>
          {sub}
        </text>
      )}
    </g>
  );
}

function ChartTip({
  active,
  payload,
  unit,
}: {
  active?: boolean;
  payload?: { value: number; payload: DayBucket }[];
  unit?: string;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  // Boş kovada gösterilecek bir şey yok — "0 girdi" balonu gürültü
  if (!p.value) return null;
  return (
    <div className="rounded-xl border border-border bg-[#1c1c1f] px-3 py-2 shadow-xl">
      <div className="text-sm font-semibold leading-tight">
        {fmtNum(p.value)}
        {unit && (
          <span className="ml-1 text-xs font-normal text-muted-foreground">
            {unit}
          </span>
        )}
      </div>
      <div className="mt-0.5 text-[10px] text-muted-foreground">
        {p.payload.full}
      </div>
    </div>
  );
}
