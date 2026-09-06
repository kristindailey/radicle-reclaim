import type { Cents } from "../money";
import type { ClassifiedAdjustment, ProposedLine } from "../types";

/**
 * The proposer (D5): a reconciled line drafts one Payment (when paid) plus one
 * Adjustment per `CAS` group+reason, all in a pending-review state a human
 * approves, so the feeder never auto-posts.
 *
 * Each key is derived deterministically from (835 control number, claim control
 * number, line number, `CAS` reason) (D12), so an at-least-once redelivery or
 * Lambda retry upserts on the same key instead of double-posting. The 835 control
 * number is the reassociation trace (`TRN02`); a Payment has no `CAS` reason, so
 * its key ends in `PMT`.
 */
export function paymentKey(
  traceNumber: string,
  claimControlNumber: string,
  lineNumber: number,
): string {
  return [
    traceNumber,
    `CLAIM#${claimControlNumber}`,
    `LINE#${lineNumber}`,
    "PMT",
  ].join("|");
}

export function proposePayment(input: {
  traceNumber: string;
  claimControlNumber: string;
  lineNumber: number;
  amount: Cents;
}): ProposedLine {
  return {
    idempotencyKey: paymentKey(
      input.traceNumber,
      input.claimControlNumber,
      input.lineNumber,
    ),
    kind: "payment",
    status: "pending-review",
    claimControlNumber: input.claimControlNumber,
    lineNumber: input.lineNumber,
    amount: input.amount,
  };
}

/**
 * An Adjustment's key ends in its `CAS` reason (`<group><carc>`, D12), so a line
 * carrying both a `CO` and a `PR` adjustment drafts two distinct keys that never
 * collide, and each upserts on redelivery.
 */
export function adjustmentKey(
  traceNumber: string,
  claimControlNumber: string,
  lineNumber: number,
  groupCode: string,
  carc: string,
): string {
  return [
    traceNumber,
    `CLAIM#${claimControlNumber}`,
    `LINE#${lineNumber}`,
    `${groupCode}${carc}`,
  ].join("|");
}

export function proposeAdjustment(input: {
  traceNumber: string;
  claimControlNumber: string;
  lineNumber: number;
  adjustment: ClassifiedAdjustment;
}): ProposedLine {
  const { adjustment } = input;
  return {
    idempotencyKey: adjustmentKey(
      input.traceNumber,
      input.claimControlNumber,
      input.lineNumber,
      adjustment.groupCode,
      adjustment.carc,
    ),
    kind: "adjustment",
    status: "pending-review",
    claimControlNumber: input.claimControlNumber,
    lineNumber: input.lineNumber,
    amount: adjustment.amount,
    groupCode: adjustment.groupCode,
    carc: adjustment.carc,
  };
}
