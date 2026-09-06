import { cents } from "../money";
import type { AdjustmentClassification, Aggregates, ReconciledLine } from "../types";
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
 * hero figure, D4), and the disposition counts. Excluding out-of-balance lines
 * from dollars at risk (D19) lands with the out-of-balance ticket.
 */
export function aggregate(lines: ReconciledLine[]): Aggregates {
  return {
    totalRemittance: cents(lines.reduce((total, line) => total + line.billed, 0)),
    totalPaid: cents(lines.reduce((total, line) => total + line.paid, 0)),
    totalContractual: cents(sumByClassification(lines, "contractual")),
    totalPatientResponsibility: cents(
      sumByClassification(lines, "patient-responsibility"),
    ),
    dollarsAtRisk: cents(sumByClassification(lines, "recoverable-denial")),
    unmatchedCount: lines.filter((line) => line.disposition === "unmatched")
      .length,
    outOfBalanceCount: lines.filter(
      (line) => line.disposition === "out-of-balance",
    ).length,
  };
}
