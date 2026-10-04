import type { TimeseriesPoint } from "./types";

export function BarChart({
  data,
  maxValue
}: {
  data: Array<{ label: string; value: number }>;
  maxValue: number;
}) {
  return (
    <div className="bar-chart">
      {data.map((item) => (
        <div key={item.label} className="bar-row">
          <span>{item.label}</span>
          <div className="bar-track">
            <div
              className="bar-fill"
              style={{ width: `${maxValue > 0 ? Math.max(4, (item.value / maxValue) * 100) : 0}%` }}
            />
          </div>
          <strong>{item.value}</strong>
        </div>
      ))}
    </div>
  );
}

export function LineChart({
  ariaLabel = "Trend",
  points
}: {
  ariaLabel?: string;
  points: TimeseriesPoint[];
}) {
  if (!points.length) return <p className="muted" style={{ fontSize: "0.82rem" }}>No trend data yet.</p>;
  const width = 420;
  const height = 100;
  const normalizedPoints = points
    .map((p) => ({ bucketStart: Number(p.bucket_start), count: Number(p.count) }))
    .filter((p) => Number.isFinite(p.bucketStart) && Number.isFinite(p.count));
  if (!normalizedPoints.length) return <p className="muted" style={{ fontSize: "0.82rem" }}>No trend data yet.</p>;

  const maxY = Math.max(...normalizedPoints.map((p) => p.count), 1);
  const minX = normalizedPoints[0].bucketStart;
  const maxX = normalizedPoints[normalizedPoints.length - 1].bucketStart;
  const xSpan = Math.max(1, maxX - minX);
  const coords = normalizedPoints
    .map((p) => {
      const x = ((p.bucketStart - minX) / xSpan) * (width - 10) + 5;
      const y = height - (p.count / maxY) * (height - 10) - 5;
      return { x, y };
    })
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  if (!coords.length) return <p className="muted" style={{ fontSize: "0.82rem" }}>No trend data yet.</p>;

  const polylinePoints = coords.map((point) => `${point.x},${point.y}`).join(" ");
  const latestPoint = coords[coords.length - 1];
  return (
    <svg
      width="100%"
      viewBox={`0 0 ${width} ${height}`}
      className="line-chart"
      role="img"
      aria-label={ariaLabel}
      style={{ color: "var(--accent, #9db8ae)" }}
    >
      {coords.length > 1 ? (
        <polyline fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" points={polylinePoints} />
      ) : null}
      <circle cx={latestPoint.x} cy={latestPoint.y} r="3.5" fill="currentColor" />
    </svg>
  );
}
