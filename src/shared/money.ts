/**
 * Money model
 * -----------
 * All amounts are stored and computed as INTEGERS in thousands of the auction currency
 * ("k units"). $1M = 1_000, $4.5M = 4_500, $25M = 25_000. Integers avoid floating-point
 * drift in purse arithmetic. The UI and the organizer always talk in millions ("M"),
 * exactly like the client's event ("$25M purse", "bid 10 million").
 */

export const K_PER_MILLION = 1000;

/** 2_000 → "$2M", 4_500 → "$4.5M", 10_250 → "$10.25M", 500 → "$500K", 0 → "$0". */
export function formatMoney(k: number | null | undefined, symbol = "$"): string {
  if (k === null || k === undefined || Number.isNaN(k)) return "—";
  const sign = k < 0 ? "-" : "";
  const abs = Math.abs(k);
  if (abs === 0) return `${symbol}0`;
  if (abs < K_PER_MILLION) return `${sign}${symbol}${abs}K`;
  const millions = abs / K_PER_MILLION;
  const text = Number.isInteger(millions) ? String(millions) : String(Number(millions.toFixed(3)));
  return `${sign}${symbol}${text}M`;
}

/** Millions as a plain number string for inputs: 23_000 → "23", 4_500 → "4.5". */
export function toMillionsString(k: number): string {
  const m = k / K_PER_MILLION;
  return Number.isInteger(m) ? String(m) : String(Number(m.toFixed(3)));
}

/**
 * Parse what an organizer types into an amount box — always interpreted as MILLIONS.
 * Accepts "10", "10.5", "$10M", "10 m", "10 million", " 23 ". Returns k units, or null
 * when the text is not a positive number with at most 3 decimals.
 * (The reference tool read "10" as ten dollars and rejected it — see requirement R-BID-07.)
 */
export function parseMillions(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === "number") {
    if (!Number.isFinite(input) || input <= 0) return null;
    return Math.round(input * K_PER_MILLION);
  }
  const cleaned = input
    .trim()
    .toLowerCase()
    .replace(/[$₹€£,\s]/g, "")
    .replace(/(million|mn|m)$/, "");
  if (!/^\d+(\.\d{1,3})?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * K_PER_MILLION);
}

/** Multiple of base price, e.g. 2_000 / 1_000 → "2.0×". */
export function multipleOfBase(amount: number, base: number): string {
  if (!base) return "";
  return `${(amount / base).toFixed(1)}×`;
}

/**
 * Real annual salaries (offer letters) are whole US dollars — a different unit from the
 * auction credits above. 431000 → "$431,000".
 */
export function formatUsd(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return "—";
  return `$${Math.round(amount).toLocaleString("en-US")}`;
}

/**
 * Parse an annual salary typed or imported as whole US dollars: "120000", "$120,000",
 * "120,000.00", "USD 95000". Returns null for anything that is not a positive whole amount.
 */
export function parseUsd(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === "number") return Number.isInteger(input) && input > 0 ? input : null;
  const cleaned = input
    .trim()
    .toLowerCase()
    .replace(/^usd|usd$/g, "")
    .replace(/[$,\s]/g, "")
    .replace(/\.0+$/, "");
  if (!/^\d+$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}
