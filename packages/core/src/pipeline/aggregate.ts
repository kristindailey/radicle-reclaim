import { cents } from "../money";
import type {
  AdjustmentClassification,
  Aggregates,
  ClassifiedAdjustment,
  ReconciledClaim,
  ReconciledLine,
} from "../types";
import { sumClassified } from "./classify";

/** Sums the amounts of every classified adjustment of one kind across all lines. */
function sumByClassification(
  lines: ReconciledLine[],
  classification: AdjustmentClassification,
): number {
  return lines.reduce(
    (total, line) => total + sumClassified(line.adjustments, classification),
    0,
  );
}

/**
 * The dashboard aggregates (D13), all in integer cents: **total remittance**
 * (billed across the remittance), **total paid**, **total contractual** (group
 * `CO` write-downs), **total patient responsibility** (group `PR`, its own bucket,
 * never folded into contractual, D18), **dollars at risk** (the recoverable-denial
 * hero figure, D4), and the disposition counts.
 *
 * Dollars at risk is guarded twice, at whichever grain the adjustment lives. An
 * out-of-balance line (or claim) is excluded: a number that does not foot cannot
 * be trusted to contribute reliably (D19). An **unmatched** line or claim is also
 * excluded: the system cannot even place the remittance against a seeded charge,
 * so it drafts no proposed line for it (see reconcile) and it must not read as
 * money the provider can pursue. The contractual and patient-responsibility totals
 * are not guarded this way — a routine write-down or patient balance is a real
 * figure whether or not the claim matched — so they sum every reason at both grains.
 */
export function aggregate(claims: ReconciledClaim[]): Aggregates {
  const lines = claims.flatMap((claim) => claim.lines);
  const claimAdjustments = claims.flatMap((claim) => claim.adjustments);

  // At-risk eligibility: the line foots and is matched. A line that is both
  // unmatched and non-footing shows an `unmatched` headline but still must not
  // inflate the hero, so guard on both signals rather than the headline alone.
  const atRiskLineAdjustments = lines
    .filter(
      (line) =>
        line.balanceWarning === undefined && line.disposition !== "unmatched",
    )
    .flatMap((line) => line.adjustments);

  // The same guard at the claim grain, for claim-level `CAS`.
  const atRiskClaimAdjustments = claims
    .filter((claim) => claim.balanceWarning === undefined && claim.matched)
    .flatMap((claim) => claim.adjustments);

  const dollarsAtRisk =
    sumClassified(atRiskLineAdjustments, "recoverable-denial") +
    sumClassified(atRiskClaimAdjustments, "recoverable-denial");

  return {
    totalRemittance: cents(lines.reduce((total, line) => total + line.billed, 0)),
    totalPaid: cents(lines.reduce((total, line) => total + line.paid, 0)),
    totalContractual: cents(
      sumByClassification(lines, "contractual") +
        sumClassified(claimAdjustments, "contractual"),
    ),
    totalPatientResponsibility: cents(
      sumByClassification(lines, "patient-responsibility") +
        sumClassified(claimAdjustments, "patient-responsibility"),
    ),
    dollarsAtRisk: cents(dollarsAtRisk),
    unmatchedCount: lines.filter((line) => line.disposition === "unmatched")
      .length,
    outOfBalanceCount: lines.filter(
      (line) => line.disposition === "out-of-balance",
    ).length,
  };
}
