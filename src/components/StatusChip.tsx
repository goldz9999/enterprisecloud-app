export type Tone = 'green' | 'amber' | 'red' | 'blue' | 'muted';

interface StatusChipProps {
  label: string;
  tone: Tone;
  /** Leading dot — shown in tables, omitted in drawer headers. */
  dot?: boolean;
}

export function StatusChip({ label, tone, dot = true }: StatusChipProps) {
  return (
    <span className={`chip chip--${tone}`}>
      {dot && <span className="chip__dot" />}
      {label}
    </span>
  );
}

/** Foreground colour for a tone (used for dots outside a chip). */
export function toneColor(tone: Tone | undefined): string {
  return !tone || tone === 'muted' ? 'var(--text-2)' : `var(--${tone})`;
}
