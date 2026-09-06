import { ZERO_CENTS } from "./money";
import type { ReconcileInput, ReconciliationResult } from "./types";

/**
 * The single reconcile seam (issue #1). Takes seeded charges plus a raw 835 and
 * returns the whole typed result in one call, with no I/O — the ingest Lambda is
 * a thin wrapper and the tests need no AWS.
 *
 * Scaffold only (issue #2): the shape is settled and returned zeroed. No outcome
 * logic — parsing, matching, classification, balancing, and proposing land in
 * later tickets.
 */
export function reconcile(input: ReconcileInput): ReconciliationResult {
  // Input is intentionally unused until the pipeline lands behind this seam.
  void input;

  return {
    claims: [],
    lines: [],
    proposedLines: [],
    aggregates: {
      totalRemittance: ZERO_CENTS,
      totalPaid: ZERO_CENTS,
      totalContractual: ZERO_CENTS,
      totalPatientResponsibility: ZERO_CENTS,
      dollarsAtRisk: ZERO_CENTS,
      unmatchedCount: 0,
      outOfBalanceCount: 0,
    },
  };
}
