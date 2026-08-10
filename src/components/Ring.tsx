interface Props {
  /** 0–1. */
  value: number;
  size?: number;
  stroke?: number;
  label?: string;
  sublabel?: string;
}

/** A circular progress dial. Starts at twelve o'clock and fills clockwise. */
export function Ring({ value, size = 84, stroke = 8, label, sublabel }: Props) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(1, value));

  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle
          className="ring-track"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
          fill="none"
        />
        <circle
          className="ring-value"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="ring-text">
        {label && <strong>{label}</strong>}
        {sublabel && <small>{sublabel}</small>}
      </div>
    </div>
  );
}
