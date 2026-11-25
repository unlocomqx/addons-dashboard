import index from "./index.html";
import type { ProductNames, Sale, SalesResponse } from "./types.ts";

const API = "https://api.addons.prestashop.com/request/seller";
const KEY = process.env.API_KEY;
if (!KEY) throw new Error("API_KEY missing (set it in .env)");

const TTL = 15 * 60 * 1000;
const FIRST_YEAR = 2015;

interface Entry<T> {
  at: number;
  data?: T;
  pending?: Promise<T>;
}

function cached<T>(load: () => Promise<T>) {
  const entry: Entry<T> = { at: 0 };
  return (force: boolean): Promise<T> => {
    if (entry.pending) return entry.pending;
    if (!force && entry.data && Date.now() - entry.at < TTL) return Promise.resolve(entry.data);
    entry.pending = load()
      .then((data) => {
        entry.data = data;
        entry.at = Date.now();
        return data;
      })
      .finally(() => {
        entry.pending = undefined;
      });
    return entry.pending;
  };
}

async function call(path: string, params: Record<string, string> = {}): Promise<any> {
  const url = new URL(`${API}/${path}`);
  url.searchParams.set("api_key", KEY!);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Addons API /${path} returned ${res.status}`);
  const json = await res.json();
  if (!json?.success) throw new Error(`Addons API /${path} returned success=false`);
  return json;
}

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

function normalize(r: any): Sale {
  return {
    id: num(r.id_seller_history),
    pid: num(r.id_product),
    type: String(r.type ?? ""),
    amount: num(r.amount),
    order: num(r.id_order),
    date: String(r.order_date ?? ""),
    name: String(r.product_name ?? ""),
    source: num(r.order_source),
    iso: String(r.iso_code ?? ""),
    ptype: String(r.product_type ?? ""),
    qty: num(r.product_quantity),
    qtyRefunded: num(r.product_quantity_refunded),
    customer: String(r.customer_hash || ""),
    discount: String(r.discount_name ?? ""),
    discountValue: num(r.discount_value),
    promo: num(r.contributor_promo),
  };
}

const getSales = cached<SalesResponse>(async () => {
  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: thisYear - FIRST_YEAR + 1 }, (_, i) => FIRST_YEAR + i);
  const chunks = await Promise.all(
    years.map((y) => call("orders", { date_from: `${y}-01-01`, date_to: `${y}-12-31` })),
  );
  const byId = new Map<number, Sale>();
  for (const chunk of chunks) for (const r of chunk.sales ?? []) byId.set(num(r.id_seller_history), normalize(r));
  const rows = [...byId.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id));
  return { fetchedAt: new Date().toISOString(), rows };
});

const getProducts = cached<ProductNames>(async () => {
  const json = await call("products");
  const names: ProductNames = {};
  for (const p of json.products ?? []) names[num(p.id_product)] = String(p.name ?? p.product_name?.name ?? "");
  return names;
});

const handle = (fn: (force: boolean) => Promise<unknown>) => async (req: Request) => {
  try {
    const force = new URL(req.url).searchParams.get("refresh") === "1";
    return Response.json(await fn(force));
  } catch (e) {
    console.error(e);
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
};

const server = Bun.serve({
  port: Number(process.env.PORT ?? 3000),
  development: process.env.NODE_ENV !== "production",
  routes: {
    "/": index,
    "/api/sales": handle(getSales),
    "/api/products": handle(getProducts),
  },
});

console.log(`Dashboard on ${server.url}`);
