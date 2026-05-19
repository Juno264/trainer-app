"use client";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import type { StatsPoint } from "../lib/types";

type Props = {
  data: StatsPoint[];
  isBodyweight: boolean;
};

export default function StatsChart({ data, isBodyweight }: Props) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-zinc-500 text-sm">
        記録がありません
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
        <XAxis
          dataKey="date"
          tick={{ fill: "#71717a", fontSize: 10 }}
          tickFormatter={(v: string) => v.slice(5).replace("-", "/")}
        />
        <YAxis
          tick={{ fill: "#71717a", fontSize: 10 }}
          unit={isBodyweight ? "rep" : "kg"}
          width={isBodyweight ? 42 : 38}
        />
        <Tooltip
          contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8, fontSize: 12 }}
          labelStyle={{ color: "#a1a1aa" }}
          itemStyle={{ color: "#60a5fa" }}
          formatter={(value: number) => [`${value}${isBodyweight ? "rep" : "kg"}`, isBodyweight ? "回数" : "重量"]}
          labelFormatter={(label: string) => label.replace(/-/g, "/")}
        />
        <Line
          type="monotone"
          dataKey={isBodyweight ? "reps" : "weight_kg"}
          stroke="#3b82f6"
          strokeWidth={2}
          dot={{ r: 3, fill: "#3b82f6", strokeWidth: 0 }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
