import type { Cents } from "./money";

/**
 * The typed shape of the reconcile seam. This file is the skeleton only: the
 * fields are settled (issue #1), but no outcome logic populates them yet
 * (matching, classification, balancing, proposing land in later tickets).
 */

/** X12 `CAS` adjustment group codes. The first-order classification signal (D4). */
export type GroupCode = "CO" | "PR" | "PI" | "OA";

/**
 * Per-`CAS`-reason classification (D4), underneath the line's headline
 * disposition (D17). `other` is a payer-side adjustment that is none of the three
 * named buckets: not a `CO` write-down, not `PR`, and not pursuable - a
 * non-actionable reason in an actionable group, or a malformed group. Kept out of
 * both the contractual total and dollars at risk.
 */
export type AdjustmentClassification =
  | "contractual"
  | "patient-responsibility"
  | "recoverable-denial"
  | "other";

/**
 * The single headline outcome of one reconciled service line, chosen by
 * precedence (D17): highest-ranking first. `other-adjustment` sits just above
 * `clean-payment`, the headline for a line adjusted only by `other` reasons.
 */
export type Disposition =
  | "unmatched"
  | "out-of-balance"
  | "recoverable-denial"
  | "contractual-adjustment"
  | "other-adjustment"
  | "clean-payment";

/** A drafted worksheet line is one of two record types (Fiscal Periods model, D5). */
export type ProposedLineKind = "payment" | "adjustment";

/** Proposed lines are never auto-posted; they arrive pending a human's review (D5). */
export type ProposedLineStatus = "pending-review";

// --- Input: seeded charges ------------------------------------------------

/** One billed service line on a seeded charge. */
export interface ChargeLine {
  /** Service-line number within the claim (the reconciliation grain, D2). */
  lineNumber: number;
  /** Billed amount, integer cents. */
  billed: Cents;
  /** Procedure code, when known. */
  procedureCode?: string;
}

/**
 * A seeded charge: what this system billed, keyed by the claim control number it
 * assigned at 837 time (`CLP01`, D3), the join key an 835 line matches back on.
 */
export interface Charge {
  /** Claim control number, `CLP01`. The join key. */
  claimControlNumber: string;
  lines: ChargeLine[];
}

/** The reconcile seam's single input (issue #1). */
export interface ReconcileInput {
  /** Seeded charges, keyed by claim control number (`CLP01`). */
  charges: Charge[];
  /** The raw X12 835 transaction. */
  raw835: Buffer | string;
}

// --- Output: the reconciliation result ------------------------------------

/**
 * One classified `CAS` reason on a line: one entry per group-and-reason (D5), so
 * a split line carrying a `CO` and a `PR` reason yields two entries.
 */
export interface ClassifiedAdjustment {
  /** `CAS` group code, or `"unknown"` when the payer sent a code outside the closed X12 set (D4). */
  groupCode: GroupCode | "unknown";
  /** Raw CARC, e.g. `"197"`. */
  carc: string;
  /** CARC decoded to plain English, or the raw code when unknown (D18-scope). */
  carcText: string;
  /** Adjusted amount, integer cents. */
  amount: Cents;
  /** Per-reason classification. */
  classification: AdjustmentClassification;
}

/** One reconciled service line, the primary reconciliation grain (D2). */
export interface ReconciledLine {
  /** Claim control number (`CLP01`) this line rolls up to. */
  claimControlNumber: string;
  /** Service-line number within the claim. */
  lineNumber: number;
  /** Billed amount, integer cents. */
  billed: Cents;
  /** Paid amount, integer cents. */
  paid: Cents;
  /** Patient-responsibility amount (group `PR`), integer cents, its own bucket (D18). */
  patientResponsibility: Cents;
  /** One entry per `CAS` group-and-reason. */
  adjustments: ClassifiedAdjustment[];
  /** The single headline disposition, by precedence (D17). */
  disposition: Disposition;
  /** Present only when the line's amounts do not foot (D6). */
  balanceWarning?: string;
}

/** One reconciled claim, rolled up from its service lines for display (D2). */
export interface ReconciledClaim {
  /** Claim control number, `CLP01`. The join key. */
  claimControlNumber: string;
  /** Payer's own control number, `CLP07`, captured for resubmission, never the join key (D3). */
  payerControlNumber?: string;
  /** Whether this claim's `CLP01` round-tripped to a seeded charge (D3). */
  matched: boolean;
  lines: ReconciledLine[];
  /**
   * Claim-level `CAS` adjustments (D2): reasons carried on the claim header rather
   * than any one service line, classified like a line's. One entry per group-and-
   * reason. Empty for the common case where every `CAS` sits under an `SVC`.
   */
  adjustments: ClassifiedAdjustment[];
  /** Present only when the claim's amounts do not foot at the claim grain (D6). */
  balanceWarning?: string;
}

/**
 * Whole-transaction balance (D6): the `BPR` total (`BPR02`) tied to the sum of
 * claim payments, catching a file-wide imbalance the per-line and per-claim
 * checks cannot see.
 */
export interface TransactionBalance {
  balances: boolean;
  /** Present only when the `BPR` total does not tie to the sum of claim payments. */
  warning?: string;
}

/**
 * A drafted Payment or Adjustment line for a Payer Worksheet, pending review (D5).
 * Its {@link idempotencyKey} is derived deterministically so at-least-once
 * redelivery upserts instead of double-posting (D12).
 */
export interface ProposedLine {
  /** Deterministic idempotency key (835 control + claim control + line + `CAS` reason, D12). */
  idempotencyKey: string;
  kind: ProposedLineKind;
  status: ProposedLineStatus;
  /** Claim control number, `CLP01`. */
  claimControlNumber: string;
  /** Service-line number. */
  lineNumber: number;
  /** Amount, integer cents. */
  amount: Cents;
  /** Group code, on adjustment lines only; `"unknown"` for a malformed `CAS01` (D4). */
  groupCode?: GroupCode | "unknown";
  /** Raw CARC, on adjustment lines only. */
  carc?: string;
}

/** The dashboard stat-tile figures (D13). All money in integer cents. */
export interface Aggregates {
  /** Total billed across the remittance. */
  totalRemittance: Cents;
  /** Total paid. */
  totalPaid: Cents;
  /** Total contractual adjustments (group `CO`). */
  totalContractual: Cents;
  /** Total patient responsibility (group `PR`). */
  totalPatientResponsibility: Cents;
  /** Dollars at risk: recoverable denials only, out-of-balance lines excluded (D19). */
  dollarsAtRisk: Cents;
  /** Count of unmatched lines. */
  unmatchedCount: number;
  /** Count of out-of-balance lines. */
  outOfBalanceCount: number;
}

/**
 * The figures the ingest Lambda emits as structured JSON logs (D15), lifted onto
 * the result so the Lambda reads them off directly instead of recomputing.
 * Duration, the one figure a pure core cannot supply (no clock), is added at the
 * Lambda edge.
 */
export interface LogFigures {
  /** Count of reconciled service lines across the remittance. */
  linesReconciled: number;
  /** Dollars at risk (recoverable denials, out-of-balance lines excluded, D19), integer cents. */
  dollarsAtRisk: Cents;
  /** Count of out-of-balance lines. */
  outOfBalanceCount: number;
}

/** The whole result the seam returns in one call (issue #1). */
export interface ReconciliationResult {
  /** Reconciled claims, rolled up from lines. */
  claims: ReconciledClaim[];
  /** The flat service-line grain across all claims. */
  lines: ReconciledLine[];
  /** Drafted Payment and Adjustment lines, pending review. */
  proposedLines: ProposedLine[];
  /** Dashboard figures. */
  aggregates: Aggregates;
  /** Whole-transaction balance: the `BPR` total vs the sum of claim payments (D6). */
  transactionBalance: TransactionBalance;
  /** The figures the Lambda emits as structured JSON logs, without recomputing (D15). */
  logFigures: LogFigures;
}
