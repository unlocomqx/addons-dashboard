export interface Sale {
  id: number;
  pid: number;
  type: string;
  amount: number;
  order: number;
  date: string;
  name: string;
  source: number;
  iso: string;
  ptype: string;
  qty: number;
  qtyRefunded: number;
  customer: string;
  discount: string;
  discountValue: number;
  promo: number;
}

export interface SalesResponse {
  fetchedAt: string;
  rows: Sale[];
}

export type ProductNames = Record<number, string>;
