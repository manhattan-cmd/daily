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
import { fmtNum, type DayBucket } from "@/lib/analytics";

// Plot alanının yatay sınırları — BarChart margin'ları ve YAxis genişliğiyle eşleşmeli
const Y_AXIS_WIDTH = 40;
const MARGIN_LEFT = -14;
const MARGIN_RIGHT = 4;

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
  useEffect(
    () => () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    },
    []
  );

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
    if (idx < 0 || idx >= data.length) return;
    const k = data[idx]?.periodKey;
    if (k) onSelect(k);
  };

  return (
    <>
    <div
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
          <Tooltip
            cursor={false}
            active={tipDismissed ? false : undefined}
            content={<ChartTip unit={unit} />}
          />
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
