export const DAY_MS = 86400000;

const pad = (n: number) => String(n).padStart(2, "0");

export const dayNum = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / DAY_MS;
export const numDay = (n: number) => new Date(n * DAY_MS).toISOString().slice(0, 10);
export const todayNum = () => {
  const d = new Date();
  return dayNum(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
};

const eur2 = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" });
const eur0 = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const eurC = new Intl.NumberFormat("en-IE", {
  style: "currency",
  currency: "EUR",
  notation: "compact",
  maximumFractionDigits: 1,
});
const int = new Intl.NumberFormat("en-IE");
const intC = new Intl.NumberFormat("en-IE", { notation: "compact", maximumFractionDigits: 1 });
const pct1 = new Intl.NumberFormat("en-IE", { style: "percent", maximumFractionDigits: 1 });
const pct0 = new Intl.NumberFormat("en-IE", { style: "percent", maximumFractionDigits: 0 });

export const fmtEur = (v: number) => eur2.format(v);
export const fmtEurShort = (v: number) => (Math.abs(v) >= 10000 ? eurC.format(v) : eur0.format(v));
export const fmtInt = (v: number) => (Math.abs(v) >= 10000 ? intC.format(v) : int.format(v));
export const fmtIntFull = (v: number) => int.format(v);
export const fmtPct = (v: number) => pct1.format(v);
export const fmtPct0 = (v: number) => pct0.format(v);

const monthShort = new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" });
const dayMonth = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const dayMonthYear = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const monthYear = new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });

export const fmtDay = (n: number) => dayMonth.format(n * DAY_MS);
export const fmtDayYear = (n: number) => dayMonthYear.format(n * DAY_MS);
export const fmtMonth = (n: number) => monthShort.format(n * DAY_MS);
export const fmtMonthYear = (n: number) => monthYear.format(n * DAY_MS);

const regions = new Intl.DisplayNames(["en"], { type: "region" });
export const countryName = (iso: string) => {
  if (!iso) return "Unknown";
  try {
    return regions.of(iso.toUpperCase()) ?? iso;
  } catch {
    return iso;
  }
};
