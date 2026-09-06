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
 * hero figure, D4), and the disposition counts. An out-of-balance line's dollars
 * are excluded from the hero figure: a number that does not foot cannot be trusted
 * to contribute reliably (D19).
 */
export function aggregate(lines: ReconciledLine[]): Aggregates {
  // D19 is keyed on whether the line foots, not on its headline disposition: a
  // line that is both unmatched and non-footing shows an `unmatched` headline but
  // still must not inflate the hero, so exclude on the balance warning itself.
  const footingLines = lines.filter(
    (line) => line.balanceWarning === undefined,
  );
  return {
    totalRemittance: cents(lines.reduce((total, line) => total + line.billed, 0)),
    totalPaid: cents(lines.reduce((total, line) => total + line.paid, 0)),
    totalContractual: cents(sumByClassification(lines, "contractual")),
    totalPatientResponsibility: cents(
      sumByClassification(lines, "patient-responsibility"),
    ),
    dollarsAtRisk: cents(sumByClassification(footingLines, "recoverable-denial")),
    unmatchedCount: lines.filter((line) => line.disposition === "unmatched")
      .length,
    outOfBalanceCount: lines.filter(
      (line) => line.disposition === "out-of-balance",
    ).length,
  };
}
