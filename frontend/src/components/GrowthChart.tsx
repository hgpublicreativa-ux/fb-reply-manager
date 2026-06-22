'use client';

interface GrowthChartProps {
  points: (number | null)[];
  labels: string[];
  type: 'line' | 'bar';
  color: string; // hex
}

const W = 600;
const H = 160;
const PAD = 8;

export function GrowthChart({ points, labels, type, color }: GrowthChartProps) {
  const valid = points.filter((p): p is number => p !== null);

  if (valid.length === 0) {
    return (
      <div className="h-40 flex items-center justify-center text-sm text-gray-400">
        Aún no hay datos suficientes
      </div>
    );
  }

  const max = Math.max(...valid, 1);
  const min = Math.min(...valid, 0);
  const range = max - min || 1;
  const n = points.length;
  const stepX = (W - PAD * 2) / Math.max(n - 1, 1);

  const x = (i: number) => PAD + i * stepX;
  const y = (v: number) => H - PAD - ((v - min) / range) * (H - PAD * 2);

  // For a line series, build a path over the points that have values,
  // connecting across gaps (followers history accumulates over time).
  const linePoints = points
    .map((p, i) => (p !== null ? `${x(i)},${y(p)}` : null))
    .filter((s): s is string => s !== null);
  const linePath = linePoints.length ? 'M' + linePoints.join(' L') : '';

  // Indices to label on the x-axis (first, middle, last).
  const tickIdx = n <= 1 ? [0] : [0, Math.floor((n - 1) / 2), n - 1];

  return (
    <svg viewBox={`0 0 ${W} ${H + 20}`} className="w-full" preserveAspectRatio="none">
      {type === 'bar'
        ? points.map((p, i) => {
            const v = p ?? 0;
            const barH = ((v - min) / range) * (H - PAD * 2);
            const bw = Math.max(stepX * 0.6, 2);
            return (
              <rect
                key={i}
                x={x(i) - bw / 2}
                y={H - PAD - barH}
                width={bw}
                height={Math.max(barH, v > 0 ? 2 : 0)}
                rx={1}
                fill={color}
                opacity={0.85}
              />
            );
          })
        : (
          <>
            {linePoints.length > 1 && (
              <path
                d={`${linePath} L${x(n - 1)},${H - PAD} L${x(0)},${H - PAD} Z`}
                fill={color}
                opacity={0.08}
              />
            )}
            <path d={linePath} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" />
            {points.map((p, i) =>
              p !== null ? <circle key={i} cx={x(i)} cy={y(p)} r={2.5} fill={color} /> : null
            )}
          </>
        )}

      {tickIdx.map((i) => (
        <text
          key={i}
          x={Math.min(Math.max(x(i), 16), W - 16)}
          y={H + 14}
          textAnchor="middle"
          fontSize="11"
          fill="#9ca3af"
        >
          {labels[i]?.slice(5) /* MM-DD */}
        </text>
      ))}
    </svg>
  );
}
