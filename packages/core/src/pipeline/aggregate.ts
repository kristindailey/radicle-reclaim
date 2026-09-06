import { ZERO_CENTS, cents } from "../money";
import type { AdjustmentClassification, Aggregates, ReconciledLine } from "../types";

/** Sums the amounts of every classified adjustment of one kind across all lines. */
function sumByClassification(
  lines: ReconciledLine[],
  classification: AdjustmentClassification,
): number {
  return lines.reduce(
    (total, line) =>
      total +
      line.adjustments
        .filter((adj) => adj.classification === classification)
        .reduce((lineTotal, adj) => lineTotal + adj.amount, 0),
    0,
  );
}

/**
 * The dashboard aggregates (D13), all in integer cents: **total remittance**
 * (billed across the remittance), **total paid**, **total contractual** (group
 * `CO` write-downs), and the disposition counts. The remaining classification
 * figures (patient responsibility, dollars at risk) land with their tickets and
 * stay zero here.
 */
export function aggregate(lines: ReconciledLine[]): Aggregates {
  return {
    totalRemittance: cents(lines.reduce((total, line) => total + line.billed, 0)),
    totalPaid: cents(lines.reduce((total, line) => total + line.paid, 0)),
    totalContractual: cents(sumByClassification(lines, "contractual")),
    totalPatientResponsibility: ZERO_CENTS,
    dollarsAtRisk: ZERO_CENTS,
    unmatchedCount: lines.filter((line) => line.disposition === "unmatched")
      .length,
    outOfBalanceCount: lines.filter(
      (line) => line.disposition === "out-of-balance",
    ).length,
  };
}
