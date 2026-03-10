'use client';

import { TrendPoint } from '@/types/scoring';

interface TrendSparklineProps {
  data: TrendPoint[];
  width?: number;
  height?: number;
}

export function TrendSparkline({ data, width = 120, height = 40 }: TrendSparklineProps) {
  if (data.length === 0) return null;

  const maxScore = Math.max(...data.map(d => d.score), 100);
  const minScore = Math.min(...data.map(d => d.score), 0);
  const range = maxScore - minScore || 1;

  const points = data.map((point, index) => {
    const x = (index / (data.length - 1)) * width;
    const y = height - ((point.score - minScore) / range) * height;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width={width} height={height} className="inline-block">
      <polyline
        fill="none"
        stroke="#3b82f6"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}
