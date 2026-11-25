const SVG = "http://www.w3.org/2000/svg";

export function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
  parent?: Element,
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  parent?.appendChild(el);
  return el;
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: { class?: string; text?: string; title?: string; style?: string } = {},
  children: (Node | string | null | undefined)[] = [],
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props.class) el.className = props.class;
  if (props.text != null) el.textContent = props.text;
  if (props.title) el.title = props.title;
  if (props.style) el.setAttribute("style", props.style);
  for (const c of children) if (c != null) el.append(c);
  return el;
}

export interface TipRow {
  value: string;
  label: string;
  color?: string;
}

const tip = () => document.getElementById("tooltip")!;

export function showTip(e: { clientX: number; clientY: number }, title: string, rows: TipRow[]) {
  const t = tip();
  t.replaceChildren(
    h("div", { class: "tip-title", text: title }),
    ...rows.map((r) =>
      h("div", { class: "tip-row" }, [
        r.color ? h("span", { class: "tip-key", style: `background:${r.color}` }) : h("span", { class: "tip-key none" }),
        h("strong", { text: r.value }),
        h("span", { class: "tip-label", text: r.label }),
      ]),
    ),
  );
  t.hidden = false;
  const pad = 14;
  const { width, height } = t.getBoundingClientRect();
  let x = e.clientX + pad;
  let y = e.clientY + pad;
  if (x + width > innerWidth - 8) x = e.clientX - width - pad;
  if (y + height > innerHeight - 8) y = e.clientY - height - pad;
  t.style.transform = `translate(${Math.max(8, x)}px, ${Math.max(8, y)}px)`;
}

export function hideTip() {
  tip().hidden = true;
}

function anchorOf(el: Element) {
  const r = el.getBoundingClientRect();
  return { clientX: r.left + r.width / 2, clientY: r.top };
}

export function bindTip(el: Element, get: () => { title: string; rows: TipRow[] }, onHover?: (on: boolean) => void) {
  el.addEventListener("pointermove", (e) => {
    const { title, rows } = get();
    showTip(e as PointerEvent, title, rows);
    onHover?.(true);
  });
  el.addEventListener("pointerleave", () => {
    hideTip();
    onHover?.(false);
  });
  el.addEventListener("focus", () => {
    const { title, rows } = get();
    showTip(anchorOf(el), title, rows);
    onHover?.(true);
  });
  el.addEventListener("blur", () => {
    hideTip();
    onHover?.(false);
  });
}

export function niceTicks(min: number, max: number, count = 4) {
  if (max === min) max = min + 1;
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  const step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return ticks;
}

function colPath(x: number, base: number, end: number, w: number, r: number, rounded: boolean) {
  const up = end < base;
  const top = Math.min(base, end);
  const bottom = Math.max(base, end);
  const hgt = bottom - top;
  const rr = rounded ? Math.min(r, w / 2, hgt) : 0;
  if (up) {
    return `M${x},${bottom}V${top + rr}Q${x},${top} ${x + rr},${top}H${x + w - rr}Q${x + w},${top} ${x + w},${top + rr}V${bottom}Z`;
  }
  return `M${x},${top}V${bottom - rr}Q${x},${bottom} ${x + rr},${bottom}H${x + w - rr}Q${x + w},${bottom} ${x + w},${bottom - rr}V${top}Z`;
}

export interface Series {
  key: string;
  name: string;
  color: string;
}

export interface Column {
  label: string;
  title: string;
  values: Record<string, number>;
}

export function legend(series: Series[], shape: "rect" | "line" = "rect") {
  return h(
    "div",
    { class: "legend" },
    series.map((s) =>
      h("span", { class: "legend-item" }, [h("span", { class: `swatch ${shape}`, style: `background:${s.color}` }), s.name]),
    ),
  );
}

export function columnChart(
  host: HTMLElement,
  columns: Column[],
  series: Series[],
  opts: { height?: number; tick: (v: number) => string; value: (v: number) => string },
) {
  const cs = getComputedStyle(host);
  const width = Math.max(280, host.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight));
  const height = opts.height ?? 260;
  const totals = columns.map((c) => series.reduce((s, se) => s + (c.values[se.key] ?? 0), 0));
  let maxPos = 0;
  let minNeg = 0;
  for (const c of columns) {
    let p = 0;
    let n = 0;
    for (const s of series) {
      const v = c.values[s.key] ?? 0;
      if (v > 0) p += v;
      else n += v;
    }
    maxPos = Math.max(maxPos, p);
    minNeg = Math.min(minNeg, n);
  }
  const ticks = niceTicks(minNeg, maxPos || 1, 4);
  const y0 = ticks[0]!;
  const y1 = ticks[ticks.length - 1]!;
  const tickLabels = ticks.map(opts.tick);
  const left = 10 + Math.max(...tickLabels.map((t) => t.length)) * 7;
  const m = { top: 18, right: 8, bottom: 26, left };
  const pw = width - m.left - m.right;
  const ph = height - m.top - m.bottom;
  const y = (v: number) => m.top + ph - ((v - y0) / (y1 - y0)) * ph;
  const band = pw / Math.max(1, columns.length);
  const bw = Math.max(1, Math.min(24, band - Math.max(2, band * 0.3)));

  const root = svg("svg", { width, height, viewBox: `0 0 ${width} ${height}`, class: "chart", role: "img" });
  const grid = svg("g", { class: "grid" }, root);
  ticks.forEach((t, i) => {
    const yy = Math.round(y(t)) + 0.5;
    svg("line", { x1: m.left, x2: width - m.right, y1: yy, y2: yy, class: t === 0 ? "baseline" : "gridline" }, grid);
    svg("text", { x: m.left - 8, y: yy, class: "tick", "text-anchor": "end", "dominant-baseline": "middle" }, grid).textContent =
      tickLabels[i]!;
  });

  const maxLabels = Math.max(2, Math.floor(pw / 72));
  const thinned = columns.some((c) => !c.label);
  const every = thinned ? 1 : Math.ceil(columns.length / maxLabels);
  const xAxis = svg("g", { class: "x-axis" }, root);
  columns.forEach((c, i) => {
    if (i % every !== 0 || !c.label) return;
    const cx = m.left + band * i + band / 2;
    const anchor = cx - m.left < 24 ? "start" : width - m.right - cx < 24 ? "end" : "middle";
    const tx = anchor === "start" ? m.left + band * i + (band - bw) / 2 : anchor === "end" ? cx + bw / 2 : cx;
    svg("text", { x: tx, y: height - 8, class: "tick", "text-anchor": anchor }, xAxis).textContent = c.label;
  });

  const marks = svg("g", { class: "marks" }, root);
  const base = y(0);
  let maxIdx = -1;
  totals.forEach((t, i) => {
    if (t > 0 && (maxIdx < 0 || t > totals[maxIdx]!)) maxIdx = i;
  });


  columns.forEach((c, i) => {
    const g = svg("g", { class: "col" }, marks);
    const x = m.left + band * i + (band - bw) / 2;
    const pos = series.filter((s) => (c.values[s.key] ?? 0) > 0);
    const neg = series.filter((s) => (c.values[s.key] ?? 0) < 0);
    for (const group of [pos, neg]) {
      let acc = 0;
      group.forEach((s, j) => {
        const v = c.values[s.key]!;
        const from = y(acc);
        acc += v;
        const to = y(acc);
        const dir = v > 0 ? -1 : 1;
        const gap = j > 0 ? 2 : 0;
        const start = from + dir * gap;
        if ((to - start) * dir <= 0.5) return;
        const p = svg("path", { d: colPath(x, start, to, bw, 4, j === group.length - 1) }, g);
        p.style.fill = s.color;
      });
    }
    if (i === maxIdx && columns.length > 1) {
      const lbl = svg("text", { x: x + bw / 2, y: y(pos.reduce((a, s) => a + c.values[s.key]!, 0)) - 6, class: "cap-label", "text-anchor": "middle" }, root);
      lbl.textContent = opts.value(totals[i]!);
      const lw = lbl.getComputedTextLength?.() ?? 0;
      const cx = x + bw / 2;
      if (cx - lw / 2 < m.left) lbl.setAttribute("text-anchor", "start"), lbl.setAttribute("x", String(x));
      else if (cx + lw / 2 > width - m.right) lbl.setAttribute("text-anchor", "end"), lbl.setAttribute("x", String(x + bw));
    }
    const hit = svg(
      "rect",
      { x: m.left + band * i, y: m.top, width: band, height: ph, class: "hit", tabindex: 0, "aria-label": `${c.title}: ${opts.value(totals[i]!)}` },
      root,
    );
    bindTip(
      hit,
      () => ({
        title: c.title,
        rows: [
          ...series
            .slice()
            .reverse()
            .map((s) => ({ value: opts.value(c.values[s.key] ?? 0), label: s.name, color: s.color })),
          { value: opts.value(totals[i]!), label: "Total" },
        ],
      }),
      (on) => g.classList.toggle("lift", on),
    );
  });
  svg("line", { x1: m.left, x2: width - m.right, y1: Math.round(base) + 0.5, y2: Math.round(base) + 0.5, class: "baseline" }, root);
  host.replaceChildren(root);
}

export interface BarItem {
  label: string;
  value: number;
  other?: boolean;
  title?: string;
}

export function barList(host: HTMLElement, items: BarItem[], fmt: (v: number) => string, color: string) {
  if (!items.length) {
    host.replaceChildren(h("p", { class: "empty", text: "No sales in this range" }));
    return;
  }
  const max = Math.max(...items.map((i) => i.value), 0) || 1;
  const total = items.reduce((s, i) => s + i.value, 0);
  const list = h(
    "div",
    { class: "bars" },
    items.map((it) => {
      const pct = Math.max(0, it.value) / max;
      const bar = h("span", { class: "bar", style: `width:${(pct * 100).toFixed(2)}%;background:${it.other ? "var(--other)" : color}` });
      const row = h("div", { class: `bar-row${it.other ? " other" : ""}` }, [
        h("span", { class: "bar-label", text: it.label, title: it.title ?? it.label }),
        h("span", { class: "bar-track" }, [bar, h("span", { class: "bar-value", text: fmt(it.value) })]),
      ]);
      row.tabIndex = 0;
      bindTip(
        row,
        () => ({
          title: it.title ?? it.label,
          rows: [
            { value: fmt(it.value), label: "Net revenue", color: it.other ? "var(--other)" : color },
            { value: total ? `${((it.value / total) * 100).toFixed(1)}%` : "—", label: "Share of shown" },
          ],
        }),
        (on) => row.classList.toggle("lift", on),
      );
      return row;
    }),
  );
  host.replaceChildren(list);
}

export function sparkline(values: number[], w = 112, hgt = 28) {
  const root = svg("svg", { width: w, height: hgt, viewBox: `0 0 ${w} ${hgt}`, class: "spark", "aria-hidden": "true" });
  if (values.length < 2) return root;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = 5;
  const x = (i: number) => pad + (i / (values.length - 1)) * (w - pad * 2);
  const y = (v: number) => (max === min ? hgt / 2 : pad + (1 - (v - min) / (max - min)) * (hgt - pad * 2));
  svg("polyline", { points: values.map((v, i) => `${x(i)},${y(v)}`).join(" "), class: "spark-line" }, root);
  const last = values.length - 1;
  svg("circle", { cx: x(last), cy: y(values[last]!), r: 4, class: "spark-dot" }, root);
  return root;
}

export function segmentedBar(parts: { label: string; value: number; color: string }[], fmt: (v: number) => string) {
  const total = parts.reduce((s, p) => s + Math.max(0, p.value), 0);
  const bar = h("div", { class: "seg" });
  const legendEl = h("div", { class: "seg-legend" });
  for (const p of parts) {
    const share = total ? Math.max(0, p.value) / total : 0;
    if (share > 0) {
      const part = h("span", { class: "seg-part", style: `flex-grow:${share};background:${p.color}` });
      part.tabIndex = 0;
      bindTip(part, () => ({
        title: p.label,
        rows: [
          { value: fmt(p.value), label: "Net revenue", color: p.color },
          { value: `${(share * 100).toFixed(1)}%`, label: "Share" },
        ],
      }));
      bar.append(part);
    }
    legendEl.append(
      h("span", { class: "legend-item" }, [
        h("span", { class: "swatch dot", style: `background:${p.color}` }),
        `${p.label} ${Math.round(share * 100)}%`,
      ]),
    );
  }
  bar.setAttribute("role", "img");
  bar.setAttribute("aria-label", parts.map((p) => `${p.label} ${fmt(p.value)}`).join(", "));
  return h("div", { class: "seg-wrap" }, [bar, legendEl]);
}

export function dataTable(headers: string[], rows: (string | number)[][], numeric: boolean[] = []) {
  const table = h("table", { class: "data" });
  const thead = h("thead");
  const tr = h("tr");
  headers.forEach((hd, i) => tr.append(h("th", { text: hd, class: numeric[i] ? "num" : "" })));
  thead.append(tr);
  const tbody = h("tbody");
  for (const r of rows) {
    const row = h("tr");
    r.forEach((c, i) => row.append(h("td", { text: String(c), class: numeric[i] ? "num" : "" })));
    tbody.append(row);
  }
  table.append(thead, tbody);
  return h("div", { class: "table-wrap" }, [table]);
}
