'use client';

import { TrendPoint } from '@/types/scoring';

interface TrendChartProps {
  data: TrendPoint[];
}

export function TrendChart({ data }: TrendChartProps) {
  if (data.length === 0) return null;

  const width = 600;
  const height = 120;
  const padding = { top: 10, right: 10, bottom: 30, left: 40 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const maxScore = 100;
  const minScore = 0;

  const points = data.map((point, index) => {
    const x = padding.left + (index / (data.length - 1)) * innerW;
    const y = padding.top + (1 - (point.score - minScore) / (maxScore - minScore)) * innerH;
    return { x, y, ...point };
  });

  const polylinePoints = points.map(p => `${p.x},${p.y}`).join(' ');

  // Y-axis ticks
  const yTicks = [0, 25, 50, 75, 100];

  return (
    <div className="overflow-x-auto">
      <svg width={width} height={height} className="text-xs">
        {/* Y-axis labels */}
        {yTicks.map(tick => {
          const y = padding.top + (1 - tick / 100) * innerH;
          return (
            <g key={tick}>
              <line
                x1={padding.left}
                x2={width - padding.right}
                y1={y}
                y2={y}
                stroke="#e5e7eb"
                strokeDasharray="4,4"
              />
              <text
                x={padding.left - 6}
                y={y + 4}
                textAnchor="end"
                fill="#9ca3af"
                fontSize="10"
              >
                {tick}
              </text>
            </g>
          );
        })}

        {/* Observed vs derived shading */}
        {points.map((point, i) => {
          if (!point.is_observed) return null;
          return (
            <circle
              key={i}
              cx={point.x}
              cy={point.y}
              r={3}
              fill="#3b82f6"
              opacity={0.6}
            />
          );
        })}

        {/* Trend line */}
        <polyline
          fill="none"
          stroke="#3b82f6"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={polylinePoints}
        />

        {/* X-axis labels (first, middle, last) */}
        {[0, Math.floor(data.length / 2), data.length - 1].map(i => {
          const p = points[i];
          const date = new Date(data[i].date);
          const label = `${date.getMonth() + 1}/${date.getDate()}`;
          return (
            <text
              key={i}
              x={p.x}
              y={height - 5}
              textAnchor="middle"
              fill="#9ca3af"
              fontSize="10"
            >
              {label}
            </text>
          );
        })}
      </svg>
      <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-full bg-blue-500 opacity-60" />
          Observed (real data)
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-6 border-t-2 border-blue-500 border-dashed" />
          Derived (calculated)
        </span>
      </div>
    </div>
  );
}
