import type { ClassifiedAdjustment, Disposition } from "../types";

/**
 * The line's single headline disposition, chosen by precedence (D17):
 * **unmatched → out-of-balance → recoverable denial → contractual adjustment →
 * clean payment**. The structural outcomes (unmatched, out-of-balance) win
 * first; below them the disposition is the highest-ranking of the line's
 * per-`CAS` classifications, so a split line still shows one headline while its
 * dollars land in the right buckets underneath.
 */
export function disposeLine(input: {
  matched: boolean;
  balances: boolean;
  adjustments: ClassifiedAdjustment[];
}): Disposition {
  if (!input.matched) {
    return "unmatched";
  }
  if (!input.balances) {
    return "out-of-balance";
  }
  if (input.adjustments.some((adj) => adj.classification === "recoverable-denial")) {
    return "recoverable-denial";
  }
  if (input.adjustments.some((adj) => adj.classification === "contractual")) {
    return "contractual-adjustment";
  }
  return "clean-payment";
}
