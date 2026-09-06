import { ZERO_CENTS, cents } from "../money";
import type { Aggregates, ReconciledLine } from "../types";

/**
 * The dashboard aggregates (D13), all in integer cents. This tracer bullet
 * computes the two figures a clean payment needs, **total remittance** (billed
 * across the remittance) and **total paid**, plus the disposition counts. The
 * classification-driven figures (contractual, patient responsibility, dollars at
 * risk) land with the classifier in a later ticket and stay zero here.
 */
export function aggregate(lines: ReconciledLine[]): Aggregates {
  return {
    totalRemittance: cents(lines.reduce((total, line) => total + line.billed, 0)),
    totalPaid: cents(lines.reduce((total, line) => total + line.paid, 0)),
    totalContractual: ZERO_CENTS,
    totalPatientResponsibility: ZERO_CENTS,
    dollarsAtRisk: ZERO_CENTS,
    unmatchedCount: lines.filter((line) => line.disposition === "unmatched")
      .length,
    outOfBalanceCount: lines.filter(
      (line) => line.disposition === "out-of-balance",
    ).length,
  };
}
