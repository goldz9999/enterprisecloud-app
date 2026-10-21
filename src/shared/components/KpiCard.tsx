import type { ReactNode } from 'react';
import type { Tone } from './StatusChip';

interface KpiCardProps {
  label: string;
  value: string;
  note?: string;
  tone?: Tone;
}

/** Compact metric tile used above list screens. */
export function KpiCard({ label, value, note, tone }: KpiCardProps) {
  const color = tone && tone !== 'muted' ? `var(--${tone})` : 'var(--text)';
  return (
    <div className="kpi">
      <div className="kpi__label">{label}</div>
      <div className="kpi__value" style={{ color }}>{value}</div>
      {note && <div className="kpi__note">{note}</div>}
    </div>
  );
}

export function KpiRow({ children }: { children: ReactNode }) {
  return <div className="kpi-row">{children}</div>;
}
