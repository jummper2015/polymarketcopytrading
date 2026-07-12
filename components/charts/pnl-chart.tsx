"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface PnlDataPoint {
  /** Date label (e.g. "Jul 12") */
  date: string;
  /** Cumulative PnL at this point */
  pnl: number;
}

interface PnlChartProps {
  data: PnlDataPoint[];
  className?: string;
}

export function PnlChart({ data, className = "" }: PnlChartProps) {
  if (data.length === 0) {
    return (
      <div className={`flex items-center justify-center h-64 text-surface-500 text-sm ${className}`}>
        No PnL data yet — paper trades need price updates.
      </div>
    );
  }

  const isProfitable = data[data.length - 1]?.pnl >= 0;
  const lineColor = isProfitable ? "#22c55e" : "#ef4444";

  return (
    <div className={className}>
      <ResponsiveContainer width="100%" height={280}>
        <AreaChart data={data} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
          <defs>
            <linearGradient id="pnlGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={lineColor} stopOpacity={0.3} />
              <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="#334155"
            vertical={false}
          />
          <XAxis
            dataKey="date"
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#64748b", fontSize: 11 }}
            interval="preserveStartEnd"
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#64748b", fontSize: 11 }}
            tickFormatter={(v: number) => `$${v.toFixed(0)}`}
            width={55}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#1e293b",
              border: "1px solid #334155",
              borderRadius: "8px",
              fontSize: "12px",
              color: "#f1f5f9",
            }}
            formatter={(value: number) => [
              `${value >= 0 ? "+" : ""}$${value.toFixed(2)}`,
              "Cumulative PnL",
            ]}
            labelStyle={{ color: "#94a3b8", marginBottom: 4 }}
          />
          <Area
            type="monotone"
            dataKey="pnl"
            stroke={lineColor}
            strokeWidth={2}
            fill="url(#pnlGradient)"
            dot={false}
            activeDot={{
              r: 4,
              fill: lineColor,
              stroke: "#1e293b",
              strokeWidth: 2,
            }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
