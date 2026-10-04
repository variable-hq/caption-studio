import { formatMinutesSeconds } from "@/components/operator/format-duration";

const numberFormatter = new Intl.NumberFormat("en");

export function formatCount(value: number) {
  return numberFormatter.format(value);
}

export function formatDuration(value: number) {
  const totalSeconds = Math.max(0, Math.floor(value / 1_000));
  return formatMinutesSeconds(Math.floor(totalSeconds / 60), totalSeconds % 60);
}

interface UsageMetricProps {
  label: string;
  value: string;
  detail: string;
  status?: string;
  percent?: number;
  ariaValueText?: string;
}

export function UsageMetric({
  label,
  value,
  detail,
  status,
  percent,
  ariaValueText,
}: UsageMetricProps) {
  return (
    <article className="usageMetricCard">
      <div className="usageMetricHeading">
        <h4>{label}</h4>
        {status ? <span>{status}</span> : null}
      </div>
      <p className="usageMetricValue">{value}</p>
      <p className="usageMetricDetail">{detail}</p>
      {typeof percent === "number" ? (
        <div
          className="usageTrack"
          role="progressbar"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-valuetext={ariaValueText}
        >
          <span style={{ width: `${percent}%` }} />
        </div>
      ) : null}
    </article>
  );
}
