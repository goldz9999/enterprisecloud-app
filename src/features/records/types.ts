import type { Crumb } from '../../components/AppShell';
import type { Tone } from '../../components/StatusChip';
import type { Fmt } from '../../lib/format';

export type { Fmt };
export type Value = string | number;
export type Row = Record<string, Value> & { _id: number };

export interface Column {
  k: string;
  label: string;
  /** CSS grid track, e.g. '100px' or 'minmax(0,1fr)'. */
  w: string;
  /** Key shown as a second, smaller line. */
  sub?: string;
  fmt?: Fmt;
  mono?: boolean;
  muted?: boolean;
  bold?: boolean;
  align?: 'left' | 'right';
  /** Render as a status chip coloured by `statuses`. */
  chip?: boolean;
}

export interface Field {
  k: string;
  label: string;
  type?: 'text' | 'number' | 'select';
  options?: string[];
  required?: boolean;
  wide?: boolean;
  placeholder?: string;
  fmt?: Fmt;
  mono?: boolean;
}

export interface Action {
  label: string;
  /** Navigate to this route. */
  href?: string;
  /** Move the record to this status. */
  to?: string;
  /** Extra fields set together with the status change. */
  set?: Record<string, Value>;
  primary?: boolean;
  danger?: boolean;
  toast?: string;
}

export interface Kpi {
  label: string;
  value: string;
  note: string;
  tone?: Tone;
}

export interface RecordsConfig {
  /** Sidebar label to highlight. */
  active: string;
  title: string;
  subtitle: string;
  breadcrumb: Crumb[];
  /** Label of the topbar primary button; omit for read-only lists. */
  newLabel?: string;

  /** Full CRUD: rows open in edit mode. Otherwise rows open read-only with `actions`. */
  crud?: boolean;
  entity: string;
  titleKey: string;
  subKey?: string;
  statusKey: string;
  statuses: Record<string, Tone>;

  keys: string[];
  rows: Value[][];
  columns: Column[];
  fields: Field[];

  /** Values for system-assigned keys on creation; n is the running sequence number. */
  defaults?: (n: number) => Record<string, Value>;
  /** Normalise a record before it's stored (e.g. sign of an amount). */
  onSave?: (r: Record<string, Value>) => Record<string, Value>;
  kpis?: Kpi[] | ((rows: Row[]) => Kpi[]);

  newTitle?: string;
  newKicker?: string;
  msgNew?: string;
  msgDel?: string;
  /** Shown in every drawer. */
  note?: string;
  /** Shown in the drawer for records in a given status (takes precedence over `note`). */
  notes?: Record<string, string>;
  /** Read-only drawer actions per status; '*' is the fallback. */
  actions?: Record<string, Action[]>;
}
