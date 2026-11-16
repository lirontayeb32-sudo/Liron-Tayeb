import { CURRENCY_SYMBOL, type Currency } from "./types";

export function formatMoney(amount: number | string | null | undefined, currency: string = "ILS"): string {
  if (amount === null || amount === undefined || amount === "") return "—";
  const n = Number(amount);
  if (!Number.isFinite(n)) return "—";
  const symbol = CURRENCY_SYMBOL[currency as Currency] ?? currency;
  const abs = Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: n % 1 === 0 ? 0 : 2 });
  // LRM keeps the number/symbol order stable inside right-to-left text
  return `‎${n < 0 ? "-" : ""}${symbol}${abs}`;
}

export function formatPercent(rate: number | null): string {
  if (rate === null) return "—";
  return `${(rate * 100).toFixed(rate * 100 < 10 ? 1 : 0)}%`;
}
