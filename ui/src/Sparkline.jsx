import { useId, useState } from "react";

// Minimal dependency-free sparkline: 2px line, soft area fill, hover crosshair
// with a value readout. `color` is a CSS custom property name (e.g. "--red").
export default function Sparkline({
  data,
  width = 120,
  height = 34,
  color = "--accent",
  format = (v) => String(v),
}) {
  const gid = useId();
  const [hover, setHover] = useState(null);
  if (!data || data.length < 2) return null;

  const pad = 3;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const x = (i) => pad + (i / (data.length - 1)) * (width - pad * 2);
  const y = (v) => height - pad - ((v - min) / span) * (height - pad * 2);
  const points = data.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${pad},${height - pad} ${points} ${width - pad},${height - pad}`;

  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * width;
    const i = Math.max(0, Math.min(data.length - 1, Math.round(((px - pad) / (width - pad * 2)) * (data.length - 1))));
    setHover(i);
  };

  return (
    <div className="spark-wrap" style={{ width }}>
      {hover != null && (
        <div className="spark-tip" style={{ left: `${(x(hover) / width) * 100}%` }}>
          {format(data[hover])}
        </div>
      )}
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        role="img"
        aria-label={`trend from ${format(data[0])} to ${format(data[data.length - 1])}`}
      >
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={`var(${color})`} stopOpacity="0.22" />
            <stop offset="100%" stopColor={`var(${color})`} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={area} fill={`url(#${gid})`} />
        <polyline
          points={points}
          fill="none"
          stroke={`var(${color})`}
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {hover != null ? (
          <>
            <line x1={x(hover)} x2={x(hover)} y1={pad} y2={height - pad} stroke="var(--border-strong)" strokeWidth="1" />
            <circle cx={x(hover)} cy={y(data[hover])} r="3" fill={`var(${color})`} stroke="var(--surface)" strokeWidth="1.5" />
          </>
        ) : (
          <circle cx={x(data.length - 1)} cy={y(data[data.length - 1])} r="2.5" fill={`var(${color})`} />
        )}
      </svg>
    </div>
  );
}
