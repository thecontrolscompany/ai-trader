/**
 * Calculate share quantity for a given dollar amount and price.
 * Always returns whole shares (Math.floor) — Tradier does not support fractional shares.
 */
export function calcShares(investDollars: number, pricePerShare: number): number {
  return Math.floor(investDollars / pricePerShare);
}
