"use client";

import { useRef } from "react";
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
}: {
  data: DayBucket[];
  color: string;
  unit?: string;
  onSelect?: (periodKey: string) => void;
}) {
  const allZero = data.every((d) => d.value === 0);
  // Çok sayıda gün olduğunda eksende sabit aralıklarla ~6 etiket göster (kalabalığı önler)
  const tickInterval = data.length > 8 ? Math.ceil(data.length / 6) - 1 : 0;

  // Tıklanan kova, X konumundan hesaplanır — recharts'ın tooltip/hover state'ine
  // güvenilmez. Ayrıca "click" olayı da kullanılamaz: hover, bar'ı activeBar ve
  // tooltip cursor'ıyla değiştirdiğinden dokunuşta (hover+basma aynı anda) DOM
  // down-up arasında mutasyona uğruyor ve tarayıcı click üretmiyor. pointerdown/up
  // çifti DOM değişiminden etkilenmez; hareket eşiği kaydırmayı dokunuştan ayırır.
  const pointerDown = useRef<{ x: number; y: number } | null>(null);

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
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
    <div
      className={`relative h-[170px] w-full${onSelect ? " cursor-pointer" : ""}`}
      onPointerDown={
        onSelect
          ? (e) => {
              pointerDown.current = { x: e.clientX, y: e.clientY };
            }
          : undefined
      }
      onPointerUp={onSelect ? handlePointerUp : undefined}
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
            tick={{ fill: "#a1a1aa", fontSize: 10 }}
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
          <Tooltip
            cursor={{ fill: "rgba(255,255,255,0.05)" }}
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
