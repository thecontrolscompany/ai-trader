/**
 * Robinhood fee structure (as of 2024):
 *
 * BUY:  $0 commission, $0 regulatory fees
 * SELL: $0 commission, but two small regulatory fees apply:
 *   - SEC Transaction Fee: $27.80 per $1,000,000 of principal sold
 *     = $0.0000278 × (price × shares), minimum $0.01
 *   - FINRA Trading Activity Fee (TAF): $0.000166 per share sold, max $8.30
 *
 * A typical $1,000 sell order incurs ~$0.04 in total fees.
 */
export function calcSellFees(price: number, qty: number): number {
  const principal = price * qty;
  const secFee   = Math.max(0.01, principal * 0.0000278);
  const finraFee = Math.min(8.30, qty * 0.000166);
  return Math.round((secFee + finraFee) * 100) / 100;
}

export function calcBuyFees(): number {
  return 0; // Robinhood: no fees on buys
}

export function formatFees(fees: number): string {
  if (fees === 0) return "$0.00";
  return `$${fees.toFixed(2)}`;
}
