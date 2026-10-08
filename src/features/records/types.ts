import type { Crumb } from '../../components/AppShell';
import type { Tone } from '../../components/StatusChip';
import type { PermAction } from '../../data/permissions';
import type { DB, RecordCollection, Row, Value } from '../../data/types';
import type { Fmt } from '../../lib/format';

export type { Fmt, Row, Value };

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
  type?: 'text' | 'number' | 'select' | 'date' | 'password';
  /** Static options, or computed from the data (e.g. active clients). */
  options?: string[] | ((d: DB) => string[]);
  required?: boolean;
  /** Show the field only when creating ('new') or only when editing ('edit'). */
  only?: 'new' | 'edit';
  wide?: boolean;
  placeholder?: string;
  fmt?: Fmt;
  mono?: boolean;
  /** Default value for new records (defaults to the first option or ''). */
  value?: string | ((d: DB, row?: Row) => string);
}

export interface Action {
  label: string;
  /** Navigate to this route. */
  href?: string | ((row: Row) => string);
  /** Move the record to this status. */
  to?: string;
  /** Extra fields set together with the status change. */
  set?: Record<string, Value>;
  primary?: boolean;
  danger?: boolean;
  toast?: string;
  /** Ask for these values first (shown as a small form in the drawer). */
  fields?: Field[] | ((row: Row, d: DB) => Field[]);
  /**
   * Effect run inside the data update. `row` is the stored record (mutable).
   * Return a message to abort with an error.
   */
  run?: (d: DB, row: Row, values: Record<string, string>) => string | void;
  /** Permission required on this screen's module (default: Editar). */
  perm?: PermAction;
}

export interface Kpi {
  label: string;
  value: string;
  note: string;
  tone?: Tone;
}

export interface RecordsConfig {
  /** Sidebar label to highlight; also the permission module. */
  active: string;
  title: string;
  subtitle: string;
  breadcrumb: Crumb[];
  /** Label of the topbar primary button; omit for read-only lists. */
  newLabel?: string;
  /** Route for creating records with a dedicated screen (instead of the drawer form). */
  newTo?: string;

  /** Stored collection the screen edits. */
  collection?: RecordCollection;
  /** Read-only rows derived from other data (e.g. purchase orders). */
  source?: (d: DB) => Row[];
  /** Display-time transformation of each row (computed columns, due dates…). */
  view?: (row: Row, d: DB) => Row;

  /** Full CRUD: rows open in edit mode. Otherwise rows open read-only with `actions`. */
  crud?: boolean;
  entity: string;
  titleKey: string;
  subKey?: string;
  statusKey: string;
  statuses: Record<string, Tone>;

  /** Column keys of the stored records. */
  keys: string[];
  columns: Column[];
  fields: Field[];

  /** System-assigned code for new records. */
  code?: { key: string; prefix: string | (() => string); width: number };
  /** Values for other system-assigned keys on creation. */
  defaults?: (d: DB) => Record<string, Value>;
  /** Normalise a record before it's stored (e.g. sign of an amount). */
  onSave?: (r: Record<string, Value>) => Record<string, Value>;
  /** Effects after creating (inside the update). Return a message to abort. */
  onCreate?: (d: DB, row: Row) => string | void;
  onUpdate?: (d: DB, before: Row, after: Row) => string | void;
  /** Return a reason to block deletion. */
  canDelete?: (row: Row, d: DB) => string | void;
  kpis?: Kpi[] | ((rows: Row[], d: DB) => Kpi[]);

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