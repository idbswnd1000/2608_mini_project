interface MetricBarProps {
  label: string;
  value: number | null;
  max?: number;
  suffix?: string;
}

export function MetricBar({ label, value, max = 1, suffix = "" }: MetricBarProps) {
  const percentage = value === null ? 0 : Math.max(0, Math.min((value / max) * 100, 100));

  return (
    <div className="metric-bar">
      <div className="metric-label">
        <span>{label}</span>
        <strong>{value === null ? "-" : `${value.toFixed(value > 10 ? 0 : 2)}${suffix}`}</strong>
      </div>
      <div className="bar-track">
        <div className="bar-fill" style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}
