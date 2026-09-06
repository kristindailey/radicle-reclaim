import type { Cents } from "../money";
import type { ProposedLine } from "../types";

/**
 * The proposer (D5): a reconciled line drafts one Payment (when paid) plus one
 * Adjustment per `CAS` reason, all in a pending-review state a human approves,
 * so the feeder never auto-posts. This tracer bullet drafts the Payment; the
 * per-`CAS` Adjustment lines arrive with the classifier in a later ticket.
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
