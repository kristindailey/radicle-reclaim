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

/**
 * A claim-level `CAS` has no service line to anchor to, so its proposed
 * Adjustment carries this sentinel line number. Real service lines are 1-based
 * (`SVC` order within the claim), so `0` cannot collide with one.
 */
export const CLAIM_LEVEL_LINE = 0;

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
 * The reason token that ends an Adjustment's idempotency key: `<group><carc>` (D12),
 * so a line carrying both a `CO` and a `PR` adjustment drafts two distinct keys
 * that never collide.
 *
 * When a line carries two reasons with the *same* group and CARC but different
 * amounts (legal in X12, e.g. two `CO 45` lines), the bare `<group><carc>` would
 * collide and the second upsert would clobber the first, losing its dollars. So a
 * repeated reason is disambiguated with a stable 1-based occurrence ordinal
 * (`CO45#1`, `CO45#2`), taken in `CAS` order — deterministic across redeliveries
 * of the same 835. A reason that appears once keeps its bare token, so the common
 * case is unchanged.
 */
export function reasonTokens(adjustments: ClassifiedAdjustment[]): string[] {
  const totals = new Map<string, number>();
  for (const adjustment of adjustments) {
    const base = `${adjustment.groupCode}${adjustment.carc}`;
    totals.set(base, (totals.get(base) ?? 0) + 1);
  }

  const seen = new Map<string, number>();
  return adjustments.map((adjustment) => {
    const base = `${adjustment.groupCode}${adjustment.carc}`;
    if ((totals.get(base) ?? 0) <= 1) {
      return base;
    }
    const occurrence = (seen.get(base) ?? 0) + 1;
    seen.set(base, occurrence);
    return `${base}#${occurrence}`;
  });
}

export function adjustmentKey(
  traceNumber: string,
  claimControlNumber: string,
  lineNumber: number,
  reasonToken: string,
): string {
  return [
    traceNumber,
    `CLAIM#${claimControlNumber}`,
    `LINE#${lineNumber}`,
    reasonToken,
  ].join("|");
}

export function proposeAdjustment(input: {
  traceNumber: string;
  claimControlNumber: string;
  lineNumber: number;
  adjustment: ClassifiedAdjustment;
  /** Disambiguated reason token (see {@link reasonTokens}); defaults to `<group><carc>`. */
  reasonToken?: string;
}): ProposedLine {
  const { adjustment } = input;
  return {
    idempotencyKey: adjustmentKey(
      input.traceNumber,
      input.claimControlNumber,
      input.lineNumber,
      input.reasonToken ?? `${adjustment.groupCode}${adjustment.carc}`,
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
