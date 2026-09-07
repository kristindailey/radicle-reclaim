import { computed, toValue, type ComputedRef, type MaybeRefOrGetter } from "vue";

import type { Cents, ClassifiedAdjustment, ReconciliationResult } from "core";

import { formatCents } from "../format/formatCents";

/**
 * One decoded CARC in the "top denial reasons by dollars" ranked list: AccuBill's
 * own "why not billed" language, extended to money-in (D13). One entry per CARC,
 * summed across the remittance.
 */
export interface DenialReasonRow {
  /** Raw CARC, e.g. `"197"`, the stable render key. */
  carc: string;
  /** CARC decoded to plain English (`ClassifiedAdjustment.carcText`). */
  carcText: string;
  /** Summed recoverable-denial dollars for this CARC, integer cents; the rank key. */
  amountCents: Cents;
  /** The same total through `formatCents`, display-ready (D7). */
  dollars: string;
}

/**
 * The recoverable-denial adjustments eligible for the at-risk figure, applying the
 * same guard the core's `aggregate()` uses for dollars at risk: an out-of-balance
 * or unmatched line contributes nothing, and claim-level `CAS` counts only when the
 * claim foots and matched (D19). Reading them the same way keeps the ranked list's
 * total tied to the hero tile rather than drifting above it.
 */
function atRiskRecoverableAdjustments(result: ReconciliationResult): ClassifiedAdjustment[] {
  const fromLines = result.lines
    .filter((line) => line.balanceWarning === undefined && line.disposition !== "unmatched")
    .flatMap((line) => line.adjustments);
  const fromClaims = result.claims
    .filter((claim) => claim.balanceWarning === undefined && claim.matched)
    .flatMap((claim) => claim.adjustments);
  return [...fromLines, ...fromClaims].filter(
    (adjustment) => adjustment.classification === "recoverable-denial",
  );
}

/**
 * Derives the ranked list of decoded CARCs by summed recoverable-denial dollars
 * from the result (D13). The web layer reads the figures the core already
 * classified; it never re-reconciles (STANDARDS). Ordered by dollars descending,
 * with CARC ascending as a deterministic tie-break so the ranking is stable.
 */
export function useTopDenialReasons(
  result: MaybeRefOrGetter<ReconciliationResult>,
): ComputedRef<DenialReasonRow[]> {
  return computed(() => {
    const byCarc = new Map<string, { carcText: string; amount: number }>();
    for (const adjustment of atRiskRecoverableAdjustments(toValue(result))) {
      const entry = byCarc.get(adjustment.carc) ?? {
        carcText: adjustment.carcText,
        amount: 0,
      };
      entry.amount += adjustment.amount;
      byCarc.set(adjustment.carc, entry);
    }
    return [...byCarc.entries()]
      .map(([carc, { carcText, amount }]) => ({
        carc,
        carcText,
        // A sum of branded integer cents is itself integer cents; the web layer
        // reads and formats, so it re-brands rather than re-running core's guard.
        amountCents: amount as Cents,
        dollars: formatCents(amount),
      }))
      .sort((a, b) => b.amountCents - a.amountCents || a.carc.localeCompare(b.carc));
  });
}
