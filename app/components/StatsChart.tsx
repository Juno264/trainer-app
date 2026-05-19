"use client";
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

  const unit = isBodyweight ? "rep" : "kg";
  const values = data.map((d) => (isBodyweight ? d.reps : d.weight_kg));
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const pad = rawMax === rawMin ? 1 : (rawMax - rawMin) * 0.15;
  const minV = rawMin - pad;
  const maxV = rawMax + pad;
  const range = maxV - minV;

  const W = 320;
  const H = 180;
  const PL = 38; // left padding for Y labels
  const PR = 8;
  const PT = 8;
  const PB = 28; // bottom padding for X labels
  const chartW = W - PL - PR;
  const chartH = H - PT - PB;

  const getX = (i: number) =>
    PL + (data.length > 1 ? (i / (data.length - 1)) * chartW : chartW / 2);
  const getY = (v: number) => PT + chartH - ((v - minV) / range) * chartH;

  const polylinePoints = data
    .map((d, i) => {
      const v = isBodyweight ? d.reps : d.weight_kg;
      return `${getX(i)},${getY(v)}`;
    })
    .join(" ");

  // Y axis: 3 ticks
  const yTicks = [rawMin, rawMin + (rawMax - rawMin) / 2, rawMax];

  // X axis: first, middle, last (deduplicated)
  const xIdxs = Array.from(
    new Set(
      data.length <= 3
        ? data.map((_, i) => i)
        : [0, Math.floor((data.length - 1) / 2), data.length - 1]
    )
  );

  const fmtDate = (s: string) => s.slice(5).replace("-", "/");

  return (
    <div className="w-full overflow-hidden">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ height: 180 }}
        aria-hidden="true"
      >
        {/* Grid + Y labels */}
        {yTicks.map((v, i) => {
          const y = getY(v);
          return (
            <g key={i}>
              <line
                x1={PL}
                y1={y}
                x2={W - PR}
                y2={y}
                stroke="#27272a"
                strokeWidth="1"
              />
              <text
                x={PL - 4}
                y={y + 4}
                textAnchor="end"
                fontSize="9"
                fill="#71717a"
              >
                {Number.isInteger(v) ? v : v.toFixed(1)}{unit}
              </text>
            </g>
          );
        })}

        {/* Line */}
        <polyline
          points={polylinePoints}
          fill="none"
          stroke="#3b82f6"
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Dots */}
        {data.map((d, i) => {
          const v = isBodyweight ? d.reps : d.weight_kg;
          return (
            <circle
              key={i}
              cx={getX(i)}
              cy={getY(v)}
              r="3.5"
              fill="#3b82f6"
            />
          );
        })}

        {/* X labels */}
        {xIdxs.map((idx) => (
          <text
            key={idx}
            x={getX(idx)}
            y={H - 6}
            textAnchor="middle"
            fontSize="9"
            fill="#71717a"
          >
            {fmtDate(data[idx].date)}
          </text>
        ))}
      </svg>
    </div>
  );
}
