import type { Charge } from "../types";

/**
 * The matcher (D3): each 835 line joins back to a seeded charge on the claim
 * control number (`CLP01`), never the payer's own control number (`CLP07`).
 * Matching is a claim-level join, so every line under a matched claim is matched
 * and a claim with no seeded charge yields unmatched lines.
 */
export function indexCharges(charges: Charge[]): ReadonlySet<string> {
  return new Set(charges.map((charge) => charge.claimControlNumber));
}

/** Whether a claim control number (`CLP01`) round-trips to a seeded charge. */
export function isMatched(
  seeded: ReadonlySet<string>,
  claimControlNumber: string,
): boolean {
  return seeded.has(claimControlNumber);
}
