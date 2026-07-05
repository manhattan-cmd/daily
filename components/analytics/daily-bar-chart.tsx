"use client";

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

/**
 * Günlük kolon grafiği — tek seri, tek renk.
 * İnce barlar, 4px yuvarlak uç (taban düz), hairline yatay grid, hover tooltip.
 */
export function DailyBarChart({
  data,
  color,
  unit,
}: {
  data: DayBucket[];
  color: string;
  unit?: string;
}) {
  const allZero = data.every((d) => d.value === 0);

  return (
    <div className="relative h-[170px] w-full">
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
          margin={{ top: 8, right: 4, bottom: 0, left: -14 }}
          barCategoryGap="30%"
        >
          <CartesianGrid
            vertical={false}
            stroke="var(--border)"
            strokeWidth={1}
          />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
            tick={{ fill: "#a1a1aa", fontSize: 10 }}
            minTickGap={18}
            interval="preserveStartEnd"
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fill: "#a1a1aa", fontSize: 10 }}
            tickCount={3}
            allowDecimals={false}
            tickFormatter={(v: number) => fmtNum(v)}
            width={40}
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
