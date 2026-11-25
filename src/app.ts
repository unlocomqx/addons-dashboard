import type { ProductNames, SalesResponse } from "./types.ts";
import {
  between,
  byCountry,
  byProduct,
  CARE,
  grainFor,
  metrics,
  prepare,
  sparkRanges,
  timeSeries,
  type Grain,
  type Line,
  type Metrics,
  type Prepared,
  type Range,
} from "./data.ts";
import {
  countryName,
  dayNum,
  fmtDay,
  fmtDayYear,
  fmtEur,
  fmtEurShort,
  fmtInt,
  fmtIntFull,
  fmtMonth,
  fmtMonthYear,
  fmtPct,
  numDay,
  todayNum,
} from "./format.ts";
import { barList, columnChart, dataTable, h, legend, segmentedBar, sparkline, type Series } from "./charts.ts";

type Preset = "7d" | "30d" | "90d" | "ytd" | "12m" | "all" | "custom";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const SERIES: Series[] = [
  { key: "modules", name: "Modules", color: "var(--series-1)" },
  { key: "care", name: "Business care", color: "var(--series-2)" },
];

const state = {
  preset: (localStorage.getItem("preset") as Preset) || "30d",
  custom: null as Range | null,
  data: null as Prepared | null,
  fetchedAt: "",
  tables: new Set<string>(),
  sort: { key: "date" as SortKey, dir: -1 },
  query: "",
  page: 0,
};

function rangeFor(preset: Preset): Range {
  const to = todayNum();
  switch (preset) {
    case "7d":
      return { from: to - 6, to };
    case "30d":
      return { from: to - 29, to };
    case "90d":
      return { from: to - 89, to };
    case "ytd":
      return { from: dayNum(`${numDay(to).slice(0, 4)}-01-01`), to };
    case "12m":
      return { from: to - 364, to };
    case "all":
      return { from: state.data?.minDn ?? to - 3650, to };
    case "custom":
      return state.custom ?? { from: to - 29, to };
  }
}

const currentRange = () => rangeFor(state.preset);
const prevRange = (r: Range): Range | null => {
  if (state.preset === "all") return null;
  const len = r.to - r.from + 1;
  return { from: r.from - len, to: r.from - 1 };
};

const rangeLabel = (r: Range) => `${fmtDayYear(r.from)} – ${fmtDayYear(r.to)}`;

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `${url} failed (${res.status})`);
  return body as T;
}

async function load(force = false) {
  const root = $("root");
  const btn = $<HTMLButtonElement>("refresh");
  root.classList.add("loading");
  btn.disabled = true;
  $("status").textContent = "Loading…";
  try {
    const q = force ? "?refresh=1" : "";
    const [sales, products] = await Promise.all([
      getJson<SalesResponse>(`/api/sales${q}`),
      getJson<ProductNames>(`/api/products${q}`),
    ]);
    state.data = prepare(sales.rows, products);
    state.fetchedAt = sales.fetchedAt;
    $("error").hidden = true;
    render();
  } catch (e) {
    $("error").textContent = `Could not load sales: ${(e as Error).message}`;
    $("error").hidden = false;
  } finally {
    root.classList.remove("loading");
    btn.disabled = false;
    updateStatus();
  }
}

function updateStatus() {
  const d = state.data;
  if (!d || !state.fetchedAt) {
    $("status").textContent = "";
    return;
  }
  const t = new Date(state.fetchedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  $("status").textContent = `Updated ${t} · ${fmtIntFull(d.income.length + d.payments.length)} lines`;
}

type Direction = "up" | "down" | "none";

interface TileSpec {
  label: string;
  value: string;
  cur: number;
  prev: number | null;
  good: Direction;
  spark: number[];
  sub?: Node | string;
  hero?: boolean;
}

function deltaEl(t: TileSpec, prevLabel: string) {
  if (t.prev == null) return h("div", { class: "tile-delta", text: "No comparison for all time" });
  if (t.prev === 0) {
    return h("div", { class: "tile-delta", text: t.cur === 0 ? `No change ${prevLabel}` : `New ${prevLabel}` });
  }
  const pct = (t.cur - t.prev) / Math.abs(t.prev);
  const up = pct > 0;
  const flat = Math.abs(pct) < 0.0005;
  const cls = flat || t.good === "none" ? "" : (up ? t.good === "up" : t.good === "down") ? "good" : "bad";
  const arrow = flat ? "→" : up ? "▲" : "▼";
  return h("div", { class: `tile-delta ${cls}` }, [
    h("strong", { text: `${arrow} ${up ? "+" : ""}${fmtPct(pct)}` }),
    ` ${prevLabel}`,
  ]);
}

function tile(t: TileSpec, prevLabel: string) {
  return h("article", { class: `tile${t.hero ? " hero" : ""}` }, [
    h("div", { class: "tile-label", text: t.label }),
    h("div", { class: "tile-main" }, [h("div", { class: "tile-value", text: t.value }), sparkline(t.spark, t.hero ? 200 : 96, t.hero ? 44 : 28)]),
    deltaEl(t, prevLabel),
    t.sub ? h("div", { class: "tile-sub" }, [t.sub]) : null,
  ]);
}

function renderTiles(d: Prepared, r: Range) {
  const m = metrics(d, r);
  const pr = prevRange(r);
  const pm = pr ? metrics(d, pr) : null;
  const sparks = sparkRanges(r).map((sr) => metrics(d, sr));
  const series = (f: (x: Metrics) => number) => sparks.map(f);
  const prev = (f: (x: Metrics) => number) => (pm ? f(pm) : null);
  const len = r.to - r.from + 1;
  const prevLabel = `vs previous ${len} day${len === 1 ? "" : "s"}`;

  const tiles: TileSpec[] = [
    {
      label: "Net revenue",
      value: fmtEurShort(m.net),
      cur: m.net,
      prev: prev((x) => x.net),
      good: "up",
      spark: series((x) => x.net),
      hero: true,
      sub: `${fmtEur(m.gross)} gross before refunds`,
    },
    {
      label: "Orders",
      value: fmtInt(m.orders),
      cur: m.orders,
      prev: prev((x) => x.orders),
      good: "up",
      spark: series((x) => x.orders),
    },
    {
      label: "Avg order value",
      value: fmtEur(m.aov),
      cur: m.aov,
      prev: prev((x) => x.aov),
      good: "up",
      spark: series((x) => x.aov),
      sub: "Gross sales per order",
    },
    {
      label: "Refunds",
      value: fmtEurShort(m.refundAmount),
      cur: m.refundAmount,
      prev: prev((x) => x.refundAmount),
      good: "down",
      spark: series((x) => x.refundAmount),
      sub: `${fmtIntFull(m.refundCount)} refund line${m.refundCount === 1 ? "" : "s"}`,
    },
    {
      label: "Subscription revenue",
      value: fmtEurShort(m.care),
      cur: m.care,
      prev: prev((x) => x.care),
      good: "up",
      spark: series((x) => x.care),
      sub: segmentedBar(
        [
          { label: "Business care", value: m.care, color: "var(--series-2)" },
          { label: "Modules", value: m.modules, color: "var(--series-1)" },
        ],
        fmtEur,
      ),
    },
    {
      label: "Active subscriptions",
      value: fmtInt(m.activeSubs),
      cur: m.activeSubs,
      prev: prev((x) => x.activeSubs),
      good: "up",
      spark: series((x) => x.activeSubs),
      sub: `Est. MRR ${fmtEur(m.mrr)} · billed in last 35 days to ${fmtDay(r.to)}`,
    },
    {
      label: "New customers",
      value: fmtInt(m.newCustomers),
      cur: m.newCustomers,
      prev: prev((x) => x.newCustomers),
      good: "up",
      spark: series((x) => x.newCustomers),
      sub: `${fmtIntFull(m.returningCustomers)} returning of ${fmtIntFull(m.customers)} buyers`,
    },
    {
      label: "Payouts",
      value: fmtEurShort(m.payouts),
      cur: m.payouts,
      prev: prev((x) => x.payouts),
      good: "none",
      spark: series((x) => x.payouts),
      sub: `${fmtIntFull(m.payoutCount)} transfer${m.payoutCount === 1 ? "" : "s"} to seller`,
    },
  ];
  $("tiles").replaceChildren(...tiles.map((t) => tile(t, prevLabel)));
}

const grainLabel: Record<Grain, string> = { day: "daily", week: "weekly", month: "monthly" };

function bucketLabels(start: number, end: number, grain: Grain, multiYear: boolean) {
  if (grain === "day") return { label: fmtDay(start), title: fmtDayYear(start) };
  if (grain === "week") return { label: fmtDay(start), title: `Week of ${fmtDayYear(start)}${end > start ? ` – ${fmtDay(end)}` : ""}` };
  return {
    label: multiYear ? (numDay(start).slice(5, 7) === "01" ? numDay(start).slice(0, 4) : fmtMonth(start)) : fmtMonth(start),
    title: fmtMonthYear(start),
  };
}

function renderTime(d: Prepared, r: Range) {
  const grain = grainFor(r);
  const buckets = timeSeries(d, r, grain);
  const multiYear = numDay(r.from).slice(0, 4) !== numDay(r.to).slice(0, 4) && buckets.length > 14;
  const columns = buckets.map((b) => ({ ...bucketLabels(b.start, b.end, grain, multiYear), values: { modules: b.modules, care: b.care } }));
  if (grain === "month" && multiYear && buckets.length > 36) {
    columns.forEach((c, i) => {
      if (numDay(buckets[i]!.start).slice(5, 7) !== "01") c.label = "";
    });
  }
  $("time-sub").textContent = `Net revenue, ${grainLabel[grain]}, stacked by product type (modules include Zen options)`;
  $("time-legend").replaceChildren(legend(SERIES));
  const host = $("time-plot");
  if (state.tables.has("time")) {
    host.replaceChildren(
      dataTable(
        ["Period", "Modules", "Business care", "Total"],
        columns
          .map((c) => [c.title, fmtEur(c.values.modules), fmtEur(c.values.care), fmtEur(c.values.modules + c.values.care)])
          .reverse(),
        [false, true, true, true],
      ),
    );
    return;
  }
  columnChart(host, columns, SERIES, { tick: fmtEurShort, value: fmtEur });
}

function renderRanked(id: "product" | "country", items: ReturnType<typeof byProduct>, header: string) {
  const host = $(`${id}-plot`);
  if (state.tables.has(id)) {
    const total = items.reduce((s, i) => s + i.value, 0);
    host.replaceChildren(
      dataTable(
        [header, "Net revenue", "Share"],
        items.map((i) => [i.label, fmtEur(i.value), total ? fmtPct(i.value / total) : "—"]),
        [false, true, true],
      ),
    );
    return;
  }
  barList(
    host,
    items.map((i) => ({ label: i.label, value: i.value, other: i.other, title: id === "country" && !i.other ? `${i.label} (${i.key})` : i.label })),
    fmtEurShort,
    "var(--series-1)",
  );
}

type SortKey = "date" | "order" | "product" | "country" | "type" | "amount" | "discount" | "refund";

const COLUMNS: { key: SortKey; label: string; num?: boolean }[] = [
  { key: "date", label: "Date" },
  { key: "order", label: "Order", num: true },
  { key: "product", label: "Product" },
  { key: "country", label: "Country" },
  { key: "type", label: "Type" },
  { key: "amount", label: "Amount", num: true },
  { key: "discount", label: "Discount" },
  { key: "refund", label: "Refund" },
];

const PAGE = 20;

const typeLabel = (t: string) => (t === CARE ? "Business care" : t === "zen" ? "Zen option" : t === "module" ? "Module" : t || "—");

function sortValue(l: Line, key: SortKey, d: Prepared): string | number {
  switch (key) {
    case "date":
      return l.date;
    case "order":
      return l.order;
    case "product":
      return (d.names.get(l.pid) ?? l.name).toLowerCase();
    case "country":
      return l.iso;
    case "type":
      return l.ptype;
    case "amount":
      return l.amount;
    case "discount":
      return l.discountValue * 1000 + (l.discount ? 1 : 0);
    case "refund":
      return l.amount < 0 ? 1 : 0;
  }
}

function renderOrders(d: Prepared, r: Range) {
  const all = between(d.income, r.from, r.to);
  const q = state.query.trim().toLowerCase();
  const rows = q
    ? all.filter((l) =>
        [d.names.get(l.pid) ?? l.name, l.name, String(l.order), l.iso, countryName(l.iso), l.discount, typeLabel(l.ptype), `source ${l.source}`]
          .join(" ")
          .toLowerCase()
          .includes(q),
      )
    : all.slice();
  const { key, dir } = state.sort;
  rows.sort((a, b) => {
    const va = sortValue(a, key, d);
    const vb = sortValue(b, key, d);
    return (va < vb ? -1 : va > vb ? 1 : a.id - b.id) * dir;
  });
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  state.page = Math.min(state.page, pages - 1);
  const slice = rows.slice(state.page * PAGE, state.page * PAGE + PAGE);

  const thead = h("thead");
  const htr = h("tr");
  for (const c of COLUMNS) {
    const th = h("th", { class: c.num ? "num" : "" });
    const b = h("button", { text: c.label + (key === c.key ? (dir > 0 ? " ↑" : " ↓") : "") });
    b.type = "button";
    b.onclick = () => {
      state.sort = { key: c.key, dir: key === c.key ? -dir : c.key === "date" || c.key === "amount" ? -1 : 1 };
      state.page = 0;
      renderOrders(d, r);
    };
    if (key === c.key) th.setAttribute("aria-sort", dir > 0 ? "ascending" : "descending");
    th.append(b);
    htr.append(th);
  }
  thead.append(htr);

  const tbody = h("tbody");
  for (const l of slice) {
    const refund = l.amount < 0;
    const name = d.names.get(l.pid) ?? l.name;
    const disc = [l.discount, l.discountValue ? `${l.discountValue}%` : ""].filter(Boolean).join(" · ");
    const tr = h("tr", { class: refund ? "refund" : "" }, [
      h("td", { text: l.date.slice(0, 16) }),
      h("td", { class: "num", text: String(l.order), title: `Source ${l.source}` }),
      h("td", { class: "product", text: name, title: l.name !== name ? `${name} — ${l.name}` : name }),
      h("td", { text: l.iso || "—", title: countryName(l.iso) }),
      h("td", { text: typeLabel(l.ptype) }),
      h("td", { class: "num", text: fmtEur(l.amount) }),
      h("td", { text: disc || "—" }),
      h("td", {}, [refund ? h("span", { class: "badge", text: "Refund" }) : ""]),
    ]);
    tbody.append(tr);
  }
  if (!slice.length) {
    const td = h("td", { class: "empty", text: q ? "No lines match this search" : "No sales in this range" });
    td.colSpan = COLUMNS.length;
    tbody.append(h("tr", {}, [td]));
  }
  const table = h("table", { class: "data" }, [thead, tbody]);
  $("orders-table").replaceChildren(table);

  const orderCount = new Set(all.filter((l) => l.amount > 0).map((l) => l.order)).size;
  $("orders-sub").textContent = `${fmtIntFull(all.length)} sale lines across ${fmtIntFull(orderCount)} orders`;
  $("pager-info").textContent = rows.length
    ? `${fmtIntFull(state.page * PAGE + 1)}–${fmtIntFull(state.page * PAGE + slice.length)} of ${fmtIntFull(rows.length)}`
    : "0 lines";
  $<HTMLButtonElement>("prev").disabled = state.page === 0;
  $<HTMLButtonElement>("next").disabled = state.page >= pages - 1;
}

function renderControls(r: Range) {
  for (const b of document.querySelectorAll<HTMLButtonElement>("[data-preset]")) {
    b.setAttribute("aria-checked", String(b.dataset.preset === state.preset));
  }
  $("custom").hidden = state.preset !== "custom";
  $<HTMLInputElement>("from").value = numDay(r.from);
  $<HTMLInputElement>("to").value = numDay(r.to);
  const pr = prevRange(r);
  $("range-caption").textContent = `${rangeLabel(r)}${pr ? ` · compared with ${rangeLabel(pr)}` : ""}`;
  for (const b of document.querySelectorAll<HTMLButtonElement>("[data-toggle]")) {
    b.setAttribute("aria-pressed", String(state.tables.has(b.dataset.toggle!)));
  }
}

function render() {
  const d = state.data;
  const r = currentRange();
  renderControls(r);
  if (!d) return;
  renderTiles(d, r);
  renderTime(d, r);
  renderRanked("product", byProduct(d, r), "Product");
  renderRanked("country", byCountry(d, r), "Country");
  renderOrders(d, r);
}

function bind() {
  for (const b of document.querySelectorAll<HTMLButtonElement>("[data-preset]")) {
    b.onclick = () => {
      const p = b.dataset.preset as Preset;
      if (p === "custom" && !state.custom) state.custom = currentRange();
      state.preset = p;
      state.page = 0;
      localStorage.setItem("preset", p);
      render();
    };
  }
  const onDate = () => {
    const f = $<HTMLInputElement>("from").value;
    const t = $<HTMLInputElement>("to").value;
    if (!f || !t) return;
    const a = dayNum(f);
    const b = dayNum(t);
    state.custom = { from: Math.min(a, b), to: Math.max(a, b) };
    state.page = 0;
    render();
  };
  $("from").onchange = onDate;
  $("to").onchange = onDate;
  $("refresh").onclick = () => load(true);
  for (const b of document.querySelectorAll<HTMLButtonElement>("[data-toggle]")) {
    b.onclick = () => {
      const k = b.dataset.toggle!;
      if (state.tables.has(k)) state.tables.delete(k);
      else state.tables.add(k);
      render();
    };
  }
  let timer = 0;
  $<HTMLInputElement>("search").oninput = (e) => {
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      state.query = (e.target as HTMLInputElement).value;
      state.page = 0;
      if (state.data) renderOrders(state.data, currentRange());
    }, 150);
  };
  $("prev").onclick = () => {
    state.page = Math.max(0, state.page - 1);
    if (state.data) renderOrders(state.data, currentRange());
  };
  $("next").onclick = () => {
    state.page++;
    if (state.data) renderOrders(state.data, currentRange());
  };
  let raf = 0;
  new ResizeObserver(() => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => state.data && renderTime(state.data, currentRange()));
  }).observe($("time-plot"));
}

if (state.preset === "custom") state.preset = "30d";
bind();
render();
load();
