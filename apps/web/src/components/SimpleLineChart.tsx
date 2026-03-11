"use client";

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";

interface SimpleLineChartProps {
  data: Array<Record<string, number | string>>;
  xKey: string;
  yKey: string;
  stroke?: string;
}

export default function SimpleLineChart({ data, xKey, yKey, stroke = "#1565c0" }: SimpleLineChartProps) {
  return (
    <div className="chart-wrap">
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#d7dde6" />
          <XAxis dataKey={xKey} />
          <YAxis />
          <Tooltip />
          <Line type="monotone" dataKey={yKey} stroke={stroke} strokeWidth={2.2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
