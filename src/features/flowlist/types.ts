import type { Tone } from '../../components/StatusChip';
import type { Action } from '../records/types';

export interface FlowItem {
  name: string;
  qty: number;
  unit: string;
  /** Unit price before IGV. */
  price: number;
}

export interface FlowRow {
  id: string;
  date: string;
  party: string;
  partySub: string;
  status: string;
  items: FlowItem[];
  facts: { k: string; v: string }[];
}

/** A document list that is the first step of a business flow (quotations, purchase requests). */
export interface FlowListConfig {
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
  actions: Record<string, Action[]>;
  notes: Record<string, string>;
  rows: FlowRow[];
}
