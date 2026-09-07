import type {
  AdjustmentClassification,
  Cents,
  ClassifiedAdjustment,
  Disposition,
  GroupCode,
  ProposedLine,
  ProposedLineKind,
  ProposedLineStatus,
  ReconciledLine,
  ReconciliationResult,
} from "core";

import type {
  ApiAdjustment,
  ApiProposedLine,
  ApiReconciledLine,
  DashboardReader,
} from "./types";

// The wire already carries integer cents (D7): the core parsed and the store
// persisted them. The web app is a thin reader that never bundles the Node engine
// (only type-only imports from core), so it re-brands to read rather than re-run
// cents(), the same convention the composables use.
const asCents = (value: number): Cents => value as Cents;

function toAdjustment(adjustment: ApiAdjustment): ClassifiedAdjustment {
  return {
    groupCode: adjustment.groupCode as GroupCode | "unknown",
    carc: adjustment.carc,
    carcText: adjustment.carcText,
    amount: asCents(adjustment.amount),
    classification: adjustment.classification as AdjustmentClassification,
  };
}

function toLine(line: ApiReconciledLine): ReconciledLine {
  return {
    claimControlNumber: line.claimControlNumber,
    lineNumber: line.lineNumber,
    billed: asCents(line.billed),
    paid: asCents(line.paid),
    patientResponsibility: asCents(line.patientResponsibility),
    adjustments: line.adjustments.map(toAdjustment),
    disposition: line.disposition as Disposition,
    // The wire sends null for a footing line; the core shape leaves the field
    // absent, and the reasons composable keys off `=== undefined`, so restore it.
    balanceWarning: line.balanceWarning ?? undefined,
  };
}

function toProposedLine(line: ApiProposedLine): ProposedLine {
  return {
    idempotencyKey: line.idempotencyKey,
    kind: line.kind as ProposedLineKind,
    status: line.status as ProposedLineStatus,
    claimControlNumber: line.claimControlNumber,
    lineNumber: line.lineNumber,
    amount: asCents(line.amount),
    groupCode: (line.groupCode as GroupCode | "unknown" | null) ?? undefined,
    carc: line.carc ?? undefined,
  };
}

/**
 * Assembles a `ReconciliationResult`-shaped payload from the read API (issue #33):
 * the lines and aggregates come from one query each, the proposed lines from a
 * per-claim query gathered over the distinct claims. The web layer only reads and
 * reshapes; it runs no reconciliation, classification, or balancing (STANDARDS).
 *
 * The read API serves no claim rollup (D2) and no 835 control number, so `claims`
 * is empty and `controlNumber` blank. For this build every `CAS` sits under its
 * `SVC`, so the reasons list derives wholly from the lines and reads the same as
 * the fixture. `transactionBalance` and `logFigures` are the Lambda's own outputs,
 * not read fields; they carry structural neutrals the dashboard never reads.
 */
export async function loadReconciliationResult(
  reader: DashboardReader,
): Promise<ReconciliationResult> {
  const [apiLines, apiDashboard] = await Promise.all([
    reader.reconciledLines(),
    reader.dashboard(),
  ]);

  const claimControlNumbers = [
    ...new Set(apiLines.map((line) => line.claimControlNumber)),
  ];
  const perClaim = await Promise.all(
    claimControlNumbers.map((claimControlNumber) =>
      reader.proposedLines(claimControlNumber),
    ),
  );

  const lines = apiLines.map(toLine);

  return {
    controlNumber: "",
    claims: [],
    lines,
    proposedLines: perClaim.flat().map(toProposedLine),
    aggregates: {
      totalRemittance: asCents(apiDashboard.totalRemittance),
      totalPaid: asCents(apiDashboard.totalPaid),
      totalContractual: asCents(apiDashboard.totalContractual),
      totalPatientResponsibility: asCents(apiDashboard.totalPatientResponsibility),
      dollarsAtRisk: asCents(apiDashboard.dollarsAtRisk),
      unmatchedCount: apiDashboard.unmatchedCount,
      outOfBalanceCount: apiDashboard.outOfBalanceCount,
    },
    transactionBalance: { balances: true },
    logFigures: {
      linesReconciled: lines.length,
      dollarsAtRisk: asCents(apiDashboard.dollarsAtRisk),
      outOfBalanceCount: apiDashboard.outOfBalanceCount,
    },
  };
}
