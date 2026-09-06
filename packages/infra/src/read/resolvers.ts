import type { LineItem, ProposedLineItem } from "../persistence";
import type {
  GqlDashboard,
  GqlProposedLine,
  GqlReconciledLine,
} from "./graphql";

/**
 * The read API's pure resolvers (issue #26): stored items in, GraphQL shapes out.
 * No reconciliation and no AWS: the Lambda edge does the DynamoDB reads and hands
 * these the items. The adjustments already carry their decoded CARC (`carcText`),
 * stamped at reconcile time, so a resolver reads it and never decodes.
 */

/** Maps one stored line to its GraphQL shape; a footing line reports `balanceWarning: null`. */
export function toReconciledLines(lines: LineItem[]): GqlReconciledLine[] {
  return lines.map((line) => ({
    claimControlNumber: line.claimControlNumber,
    lineNumber: line.lineNumber,
    billed: line.billed,
    paid: line.paid,
    patientResponsibility: line.patientResponsibility,
    disposition: line.disposition,
    adjustments: line.adjustments.map((adjustment) => ({
      groupCode: adjustment.groupCode,
      carc: adjustment.carc,
      carcText: adjustment.carcText,
      amount: adjustment.amount,
      classification: adjustment.classification,
    })),
    balanceWarning: line.balanceWarning ?? null,
  }));
}

/** Maps a claim's stored proposed lines; a payment carries no group code or CARC. */
export function toProposedLines(items: ProposedLineItem[]): GqlProposedLine[] {
  return items.map((item) => ({
    claimControlNumber: item.claimControlNumber,
    lineNumber: item.lineNumber,
    kind: item.kind,
    status: item.status,
    amount: item.amount,
    groupCode: item.groupCode ?? null,
    carc: item.carc ?? null,
    idempotencyKey: item.idempotencyKey,
  }));
}

/** Sums the amounts of one classification across every adjustment on the given lines. */
function sumByClassification(
  lines: LineItem[],
  classification: string,
): number {
  return lines.reduce(
    (total, line) =>
      total +
      line.adjustments
        .filter((adjustment) => adjustment.classification === classification)
        .reduce((lineTotal, adjustment) => lineTotal + adjustment.amount, 0),
    0,
  );
}

/**
 * The dashboard stat-tile figures (D13). The sum and count figures come from the
 * scanned line items; **dollars at risk comes only from `recoverableDenialLines`**,
 * the GSI query result (D12): the store tags exactly the matched, in-balance
 * recoverable-denial lines, so summing their recoverable-denial adjustments yields
 * the hero figure without a table scan. Passing an empty GSI result zeroes the
 * hero while the scanned figures hold, which is the seam the dashboard relies on.
 */
export function toDashboard(
  lines: LineItem[],
  recoverableDenialLines: LineItem[],
): GqlDashboard {
  return {
    totalRemittance: lines.reduce((total, line) => total + line.billed, 0),
    totalPaid: lines.reduce((total, line) => total + line.paid, 0),
    totalContractual: sumByClassification(lines, "contractual"),
    totalPatientResponsibility: sumByClassification(
      lines,
      "patient-responsibility",
    ),
    dollarsAtRisk: sumByClassification(
      recoverableDenialLines,
      "recoverable-denial",
    ),
    unmatchedCount: lines.filter((line) => line.disposition === "unmatched")
      .length,
    outOfBalanceCount: lines.filter(
      (line) => line.disposition === "out-of-balance",
    ).length,
  };
}
