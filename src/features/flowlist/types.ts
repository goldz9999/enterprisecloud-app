import type { Tone } from '../../components/StatusChip';

export interface FlowItem {
  sku?: string;
  name: string;
  qty: number;
  unit: string;
  /** Unit price (quotation) or estimated cost (request), before IGV. */
  price: number;
}

export interface FlowRow {
  id: string;
  date: string;
  party: string;
  partySub: string;
  status: string;
  items: FlowItem[];
  /** Label/value pairs shown in the detail panel. */
  facts: { k: string; v: string }[];
  /** Structured values entered in the form (for editing and conversion). */
  data?: Record<string, string>;
  /** Order generated from this document. */
  order?: string;
}

/** A document list that is the first step of a business flow (quotations, purchase requests). */
export interface FlowListConfig {
  kind: 'cotizacion' | 'solicitud';
  active: string;
  section: string;
  title: string;
  subtitle: string;
  newLabel: string;
  partyHead: string;
  amountHead: string;
  searchPh: string;
  /** Steps of the flow this document starts; the first one is this screen. */
  flow: string[];
  statuses: Record<string, Tone>;
  notes: Record<string, string>;
  /** Sample rows loaded in demo mode. */
  rows: FlowRow[];
}
