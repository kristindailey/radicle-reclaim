import type { ParsedClaim, ParsedLine } from "../adapter/x12";
import type { Cents } from "../money";

/**
 * The balancer (D6): an 835 self-foots at every grain. The raw X12 identity is
 * **billed = paid + Σ CAS**, summing every `CAS` amount. Patient responsibility
 * (group `PR`) is one such adjustment and counts toward Σ like any other, so it is
 * never added a second time. A line or claim that does not foot surfaces a
 * warning; the transaction total (`BPR`) ties to the sum of claim payments,
 * catching a whole-file imbalance the per-line and per-claim checks cannot see.
 */
export interface BalanceCheck {
  balances: boolean;
  /** Present only when the amounts do not foot. */
  warning?: string;
}

function sumCas(adjustments: { amount: Cents }[]): number {
  return adjustments.reduce((total, adj) => total + adj.amount, 0);
}

/** Line grain: `SVC` billed = `SVC` paid + Σ line-level `CAS`. */
export function checkLineBalance(line: ParsedLine): BalanceCheck {
  const cas = sumCas(line.adjustments);
  if (line.paid + cas === line.billed) {
    return { balances: true };
  }
  return {
    balances: false,
    warning: `line does not foot: billed ${line.billed} ≠ paid ${line.paid} + Σ CAS ${cas}`,
  };
}

/**
 * Claim grain: `CLP` billed = `CLP` paid + Σ every `CAS` on the claim, both the
 * claim-level `CAS` and the line-level `CAS` under each `SVC`. Patient
 * responsibility (`CLP05`) restates the `PR` `CAS` amount, so it is not added
 * again. This catches a claim header that disagrees with its own lines, which a
 * per-line check passes over.
 */
export function checkClaimBalance(claim: ParsedClaim): BalanceCheck {
  const cas =
    sumCas(claim.adjustments) +
    claim.lines.reduce((total, line) => total + sumCas(line.adjustments), 0);
  if (claim.paid + cas === claim.billed) {
    return { balances: true };
  }
  return {
    balances: false,
    warning: `claim does not foot: billed ${claim.billed} ≠ paid ${claim.paid} + Σ CAS ${cas}`,
  };
}

/** Transaction grain: the `BPR` total ties to the sum of claim payments (`CLP04`). */
export function checkTransactionBalance(
  transactionPaid: Cents,
  claims: ParsedClaim[],
): BalanceCheck {
  const claimPaid = claims.reduce((total, claim) => total + claim.paid, 0);
  if (transactionPaid === claimPaid) {
    return { balances: true };
  }
  return {
    balances: false,
    warning: `transaction does not tie: BPR ${transactionPaid} ≠ Σ claim payments ${claimPaid}`,
  };
}
