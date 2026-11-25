import type { ProductNames, Sale } from "./types.ts";
import { countryName, dayNum, numDay } from "./format.ts";

export interface Line extends Sale {
  dn: number;
}

export interface Prepared {
  income: Line[];
  payments: Line[];
  firstOrder: Map<string, number>;
  names: Map<number, string>;
  minDn: number;
}

export interface Range {
  from: number;
  to: number;
}

export const CARE = "business_care";
export const ACTIVE_WINDOW = 35;

export function prepare(rows: Sale[], products: ProductNames): Prepared {
  const lines = rows.map((r) => ({ ...r, dn: dayNum(r.date) })).sort((a, b) => a.dn - b.dn || a.id - b.id);
  const income = lines.filter((l) => l.type === "income");
  const payments = lines.filter((l) => l.type === "payment");
  const firstOrder = new Map<string, number>();
  const names = new Map<number, string>();
  for (const l of income) {
    if (l.amount > 0 && l.customer && !firstOrder.has(l.customer)) firstOrder.set(l.customer, l.dn);
    if (l.name) names.set(l.pid, l.name);
  }
  for (const [id, name] of Object.entries(products)) if (name) names.set(Number(id), name);
  return { income, payments, firstOrder, names, minDn: lines[0]?.dn ?? 0 };
}

function lowerBound(arr: Line[], dn: number) {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid]!.dn < dn) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export const between = (arr: Line[], from: number, to: number) =>
  arr.slice(lowerBound(arr, from), lowerBound(arr, to + 1));

export interface Metrics {
  net: number;
  gross: number;
  orders: number;
  aov: number;
  refundAmount: number;
  refundCount: number;
  care: number;
  modules: number;
  activeSubs: number;
  mrr: number;
  customers: number;
  newCustomers: number;
  returningCustomers: number;
  payouts: number;
  payoutCount: number;
}

export function metrics(p: Prepared, { from, to }: Range): Metrics {
  let net = 0;
  let gross = 0;
  let refundAmount = 0;
  let refundCount = 0;
  let care = 0;
  let modules = 0;
  const orders = new Set<number>();
  const customers = new Set<string>();
  for (const l of between(p.income, from, to)) {
    net += l.amount;
    if (l.amount > 0) {
      gross += l.amount;
      orders.add(l.order);
      if (l.customer) customers.add(l.customer);
    } else if (l.amount < 0) {
      refundAmount -= l.amount;
      refundCount++;
    }
    if (l.ptype === CARE) care += l.amount;
    else modules += l.amount;
  }
  let newCustomers = 0;
  for (const c of customers) if ((p.firstOrder.get(c) ?? -Infinity) >= from) newCustomers++;

  let payouts = 0;
  let payoutCount = 0;
  for (const l of between(p.payments, from, to)) {
    payouts -= l.amount;
    payoutCount++;
  }

  const subs = new Map<string, number>();
  for (const l of between(p.income, to - ACTIVE_WINDOW + 1, to)) {
    if (l.ptype === CARE && l.amount > 0) subs.set(`${l.customer}|${l.pid}`, l.amount);
  }
  let mrr = 0;
  for (const v of subs.values()) mrr += v;

  return {
    net,
    gross,
    orders: orders.size,
    aov: orders.size ? gross / orders.size : 0,
    refundAmount,
    refundCount,
    care,
    modules,
    activeSubs: subs.size,
    mrr,
    customers: customers.size,
    newCustomers,
    returningCustomers: customers.size - newCustomers,
    payouts,
    payoutCount,
  };
}

export function sparkRanges({ from, to }: Range, points = 12): Range[] {
  const len = to - from + 1;
  const n = Math.min(points, len);
  return Array.from({ length: n }, (_, i) => ({
    from: from + Math.floor((i * len) / n),
    to: from + Math.floor(((i + 1) * len) / n) - 1,
  }));
}

export type Grain = "day" | "week" | "month";

export const grainFor = ({ from, to }: Range): Grain => {
  const len = to - from + 1;
  return len <= 45 ? "day" : len <= 200 ? "week" : "month";
};

export function bucketStart(dn: number, grain: Grain) {
  if (grain === "day") return dn;
  if (grain === "week") return dn - ((new Date(dn * 86400000).getUTCDay() + 6) % 7);
  return dayNum(`${numDay(dn).slice(0, 7)}-01`);
}

function nextBucket(start: number, grain: Grain) {
  if (grain === "day") return start + 1;
  if (grain === "week") return start + 7;
  const d = new Date(start * 86400000);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) / 86400000;
}

export interface Bucket {
  start: number;
  end: number;
  modules: number;
  care: number;
}

export function timeSeries(p: Prepared, range: Range, grain: Grain): Bucket[] {
  const buckets: Bucket[] = [];
  const index = new Map<number, Bucket>();
  for (let s = bucketStart(range.from, grain); s <= range.to; s = nextBucket(s, grain)) {
    const b = { start: s, end: Math.min(nextBucket(s, grain) - 1, range.to), modules: 0, care: 0 };
    buckets.push(b);
    index.set(s, b);
  }
  for (const l of between(p.income, range.from, range.to)) {
    const b = index.get(bucketStart(l.dn, grain));
    if (!b) continue;
    if (l.ptype === CARE) b.care += l.amount;
    else b.modules += l.amount;
  }
  return buckets;
}

export interface Ranked {
  key: string;
  label: string;
  value: number;
  other?: boolean;
}

function rank(map: Map<string, { label: string; value: number }>, top: number, withOther: boolean): Ranked[] {
  const all = [...map.entries()].map(([key, v]) => ({ key, ...v })).sort((a, b) => b.value - a.value);
  const head = all.slice(0, top);
  const rest = all.slice(top);
  if (withOther && rest.length) {
    head.push({
      key: "__other",
      label: `Other (${rest.length})`,
      value: rest.reduce((s, r) => s + r.value, 0),
      other: true,
    } as Ranked);
  }
  return head;
}

export function byProduct(p: Prepared, range: Range): Ranked[] {
  const map = new Map<string, { label: string; value: number }>();
  for (const l of between(p.income, range.from, range.to)) {
    const k = String(l.pid);
    const e = map.get(k) ?? { label: p.names.get(l.pid) ?? `Product ${l.pid}`, value: 0 };
    e.value += l.amount;
    map.set(k, e);
  }
  return rank(map, 8, true);
}

export function byCountry(p: Prepared, range: Range): Ranked[] {
  const map = new Map<string, { label: string; value: number }>();
  for (const l of between(p.income, range.from, range.to)) {
    const k = l.iso || "??";
    const e = map.get(k) ?? { label: countryName(l.iso), value: 0 };
    e.value += l.amount;
    map.set(k, e);
  }
  return rank(map, 10, false);
}
