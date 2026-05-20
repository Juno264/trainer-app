"use client";
import type { StatsPoint } from "../lib/types";

type Props = {
  data: StatsPoint[];
  metric: "weight" | "reps" | "e1rm";
};

export default function StatsChart({ data, metric }: Props) {
  const valueOf = (d: StatsPoint) =>
    metric === "reps" ? d.reps : metric === "e1rm" ? d.e1rm : d.weight_kg;

  const validData = data.filter((d) => {
    const v = valueOf(d);
    return v != null && !isNaN(Number(v));
  });

  if (validData.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-zinc-500 text-sm">
        記録がありません
      </div>
    );
  }

  const unit = metric === "reps" ? "rep" : "kg";
  const values = validData.map((d) => Number(valueOf(d)));
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const pad = rawMax === rawMin ? 1 : (rawMax - rawMin) * 0.15;
  const minV = rawMin - pad;
  const maxV = rawMax + pad;
  const range = maxV - minV;

  const W = 320;
  const H = 180;
  const PL = 42;
  const PR = 8;
  const PT = 8;
  const PB = 28;
  const chartW = W - PL - PR;
  const chartH = H - PT - PB;

  const getX = (i: number) =>
    PL + (validData.length > 1 ? (i / (validData.length - 1)) * chartW : chartW / 2);
  const getY = (v: number) => PT + chartH - ((v - minV) / range) * chartH;

  const polylinePoints = values
    .map((v, i) => `${getX(i)},${getY(v)}`)
    .join(" ");

  const yTicks = rawMax === rawMin
    ? [rawMin]
    : [rawMin, rawMin + (rawMax - rawMin) / 2, rawMax];

  const xIdxs = Array.from(
    new Set(
      validData.length <= 3
        ? validData.map((_, i) => i)
        : [0, Math.floor((validData.length - 1) / 2), validData.length - 1]
    )
  );

  const fmtDate = (s: string) => s.slice(5).replace("-", "/");
  const fmtVal = (v: number) =>
    Number.isInteger(v) ? String(v) : v.toFixed(1);

  return (
    <div className="w-full overflow-hidden">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ height: 180 }}
        aria-hidden="true"
      >
        {yTicks.map((v, i) => {
          const y = getY(v);
          return (
            <g key={i}>
              <line x1={PL} y1={y} x2={W - PR} y2={y} stroke="#27272a" strokeWidth="1" />
              <text x={PL - 4} y={y + 4} textAnchor="end" fontSize="9" fill="#71717a">
                {fmtVal(v)}{unit}
              </text>
            </g>
          );
        })}

        <polyline
          points={polylinePoints}
          fill="none"
          stroke="#3b82f6"
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {values.map((v, i) => (
          <circle key={i} cx={getX(i)} cy={getY(v)} r="3.5" fill="#3b82f6" />
        ))}

        {xIdxs.map((idx) => (
          <text
            key={idx}
            x={getX(idx)}
            y={H - 6}
            textAnchor="middle"
            fontSize="9"
            fill="#71717a"
          >
            {fmtDate(validData[idx].date)}
          </text>
        ))}
      </svg>
    </div>
  );
}
