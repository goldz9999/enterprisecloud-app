import type { Tone } from '../../components/StatusChip';

export interface OrderField {
  k: string;
  label: string;
  type?: 'text' | 'date' | 'select';
  options?: string[];
  /** Pre-filled value; dates as YYYY-MM-DD. */
  value: string;
  required?: boolean;
  wide?: boolean;
  placeholder?: string;
  /** Pre-fill with the order total. */
  total?: boolean;
}

/** Flow metadata for one step. */
export interface OrderStepBase {
  title: string;
  /** Document generated when the step is completed. */
  doc: string;
  /** Shown under a completed step. */
  meta: string;
  /** Shown under a pending step. */
  pending: string;
  /** Label of the header button while this is the next step. */
  action: string;
  /** Verb used in "Al <verb>" for effects not generated yet. */
  verb: string;
  who: string;
  /** History line once done. */
  histo: string;
  when: string;
}

/** What a step asks the user to fill in. */
export interface OrderForm {
  intro: string;
  submit?: string;
  /** Footer note in the form; defaults to the order total. */
  note?: string;
  doneMsg: string;
  fields: OrderField[];
}

export type OrderStep = OrderStepBase & OrderForm;

export interface OrderLine {
  name: string;
  sku: string;
  unit: string;
  qty: number;
  price: number;
  /** Stock before the step at `stockAt` is applied. */
  stock: number;
}

export interface OrderEffect {
  module: string;
  text: string;
  ref: string;
  /** Step index that generates it. */
  at: number;
}

/** A sales or purchase order moving through a 5-step flow. */
export interface OrderConfig {
  active: string;
  section: string;
  list: { label: string; to: string };
  /** Maintenance screen for the customer/supplier. */
  partyTo: string;
  code: string;
  kind: string;
  issued: string;
  partyLabel: string;
  flowHint: string;
  party: { name: string; ruc: string; contact: string; terms: string; address: string };
  whLabel: string;
  warehouse: string;
  stockHead: string;
  /** −1 for sales (stock goes out), +1 for purchases. */
  sign: number;
  /** Number of completed steps after which stock is moved. */
  stockAt: number;
  lines: OrderLine[];
  /** Completed steps when the screen opens (overridable with ?paso=N). */
  initialDone: number;
  /** Order status after N completed steps (index N−1). */
  status: [string, Tone][];
  steps: OrderStep[];
  effects: (total: number) => OrderEffect[];
  creditLabel: string;
  credit: (done: number, total: number) => { text: string; pct: string; color: string };
  facts: { k: string; v: string }[];
  docs: { name: string; at: number }[];
}
