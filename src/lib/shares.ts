/**
 * Calculate share quantity for a given dollar amount and price.
 *
 * Tradier does not support fractional shares — set WHOLE_SHARES_ONLY=true
 * in your .env / Vercel env vars when using Tradier as the live broker.
 * Alpaca (paper and live) supports fractional shares, so leave it unset.
 */
export function calcShares(investDollars: number, pricePerShare: number): number {
  const raw = investDollars / pricePerShare;
  const wholeOnly = process.env.WHOLE_SHARES_ONLY === "true";
  if (wholeOnly) {
    return Math.floor(raw); // Tradier: whole shares only
  }
  return Math.round(raw * 10000) / 10000; // Alpaca: up to 4 decimal places
}

/**
 * Returns true if the platform is configured to trade whole shares only.
 * Use this to show a warning in the UI when fractional quantities are entered.
 */
export function isWholeSharesOnly(): boolean {
  return process.env.WHOLE_SHARES_ONLY === "true";
}
