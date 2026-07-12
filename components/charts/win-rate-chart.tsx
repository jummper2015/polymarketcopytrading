"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface WinRateDataPoint {
  /** Date label (e.g. "Jul 12") */
  date: string;
  /** Win rate for that day (0-1) */
  winRate: number;
  /** Total resolved trades that day */
  total: number;
}

interface WinRateChartProps {
  data: WinRateDataPoint[];
  className?: string;
}

function barColor(winRate: number): string {
  if (winRate >= 0.6) return "#22c55e";
  if (winRate >= 0.4) return "#f59e0b";
  return "#ef4444";
}

export function WinRateChart({ data, className = "" }: WinRateChartProps) {
  if (data.length === 0) {
    return (
      <div className={`flex items-center justify-center h-64 text-surface-500 text-sm ${className}`}>
        No resolved trades yet — win rate data will appear as markets resolve.
      </div>
    );
  }

  return (
    <div className={className}>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
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
            tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
            domain={[0, 1]}
            width={45}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#1e293b",
              border: "1px solid #334155",
              borderRadius: "8px",
              fontSize: "12px",
              color: "#f1f5f9",
            }}
            formatter={(value: number, name: string, props: any) => {
              const row = props.payload;
              return [
                `${(value * 100).toFixed(0)}% (${row.total} trades)`,
                "Win Rate",
              ];
            }}
            labelStyle={{ color: "#94a3b8", marginBottom: 4 }}
          />
          <Bar dataKey="winRate" radius={[3, 3, 0, 0]} maxBarSize={32}>
            {data.map((entry, index) => (
              <Cell key={index} fill={barColor(entry.winRate)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
