import type { ParsedLine } from "../adapter/x12";

/**
 * The balancer (D6): an 835 self-foots. At the service-line grain the identity
 * is **billed = paid + Σ CAS**, summing every line-level `CAS` amount. Patient
 * responsibility (group `PR`) is one such adjustment and counts toward Σ like any
 * other, so it is not added a second time. A clean line (no `CAS`, paid = billed)
 * foots trivially; a line that does not foot surfaces a warning and becomes an
 * out-of-balance disposition.
 */
export interface BalanceCheck {
  balances: boolean;
  /** Present only when the line does not foot. */
  warning?: string;
}

export function checkBalance(line: ParsedLine): BalanceCheck {
  const sumCas = line.adjustments.reduce((total, adj) => total + adj.amount, 0);
  const expectedBilled = line.paid + sumCas;

  if (expectedBilled === line.billed) {
    return { balances: true };
  }

  return {
    balances: false,
    warning: `line does not foot: billed ${line.billed} ≠ paid ${line.paid} + Σ CAS ${sumCas}`,
  };
}
