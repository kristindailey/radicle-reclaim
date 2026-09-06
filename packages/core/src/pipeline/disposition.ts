import type { Disposition } from "../types";

/**
 * The line's single headline disposition, chosen by precedence (D17):
 * **unmatched → out-of-balance → recoverable denial → contractual adjustment →
 * clean payment**. This tracer bullet resolves the structural outcomes it can
 * determine now; the adjustment-driven dispositions (recoverable-denial,
 * contractual-adjustment) arrive with the per-`CAS` classifier in a later ticket,
 * and the clean-payment path carries no adjustments.
 */
export function disposeLine(input: {
  matched: boolean;
  balances: boolean;
}): Disposition {
  if (!input.matched) {
    return "unmatched";
  }
  if (!input.balances) {
    return "out-of-balance";
  }
  return "clean-payment";
}
