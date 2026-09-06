import type {
  ProposedLine,
  ReconciledClaim,
  ReconciledLine,
  ReconciliationResult,
} from "core";

import {
  CHARGE_SK,
  KEY_PREFIX,
  RECOVERABLE_DENIAL_GSI1PK,
  claimPk,
} from "./schema";
import type { ChargeItem, Item, LineItem, ProposedLineItem } from "./schema";

/**
 * Turns a {@link ReconciliationResult} into the DynamoDB items the store holds
 * (D12), pure: no I/O, no AWS SDK. `controlNumber` is the 835's reassociation
 * trace (`TRN02`), stamped on each item to record which remittance wrote it.
 * Keys are deterministic, so a redelivered 835 upserts instead of double-posting.
 */
export function buildItems(
  controlNumber: string,
  result: ReconciliationResult,
): Item[] {
  const items: Item[] = [];

  for (const claim of result.claims) {
    if (claim.matched) {
      items.push(chargeItem(controlNumber, claim));
    }
  }
  for (const line of result.lines) {
    items.push(lineItem(controlNumber, line));
  }
  for (const proposed of result.proposedLines) {
    items.push(proposedLineItem(controlNumber, proposed));
  }

  return items;
}

function chargeItem(
  controlNumber: string,
  claim: ReconciledClaim,
): ChargeItem {
  return {
    PK: claimPk(claim.claimControlNumber),
    SK: CHARGE_SK,
    type: "CHARGE",
    controlNumber,
    claimControlNumber: claim.claimControlNumber,
    ...(claim.payerControlNumber
      ? { payerControlNumber: claim.payerControlNumber }
      : {}),
  };
}

function lineItem(controlNumber: string, line: ReconciledLine): LineItem {
  return {
    PK: claimPk(line.claimControlNumber),
    SK: `${KEY_PREFIX.LINE}${line.lineNumber}`,
    type: "LINE",
    controlNumber,
    claimControlNumber: line.claimControlNumber,
    lineNumber: line.lineNumber,
    billed: line.billed,
    paid: line.paid,
    patientResponsibility: line.patientResponsibility,
    disposition: line.disposition,
    adjustments: line.adjustments,
    ...(line.balanceWarning ? { balanceWarning: line.balanceWarning } : {}),
    ...(line.disposition === "recoverable-denial"
      ? { GSI1PK: RECOVERABLE_DENIAL_GSI1PK }
      : {}),
  };
}

function proposedLineItem(
  controlNumber: string,
  proposed: ProposedLine,
): ProposedLineItem {
  return {
    PK: claimPk(proposed.claimControlNumber),
    SK: proposedSk(proposed),
    type: "PROPOSED_LINE",
    controlNumber,
    claimControlNumber: proposed.claimControlNumber,
    kind: proposed.kind,
    status: proposed.status,
    lineNumber: proposed.lineNumber,
    amount: proposed.amount,
    idempotencyKey: proposed.idempotencyKey,
    ...(proposed.groupCode ? { groupCode: proposed.groupCode } : {}),
    ...(proposed.carc ? { carc: proposed.carc } : {}),
  };
}

/**
 * Derives the sort key from the reason token the core put at the tail of the
 * idempotency key, so the SK is a function of that key, not a parallel
 * reconstruction that could drift. An adjustment's token is `<group><carc>`, and
 * it keeps the core's `#<n>` disambiguation for a repeated reason.
 */
function proposedSk(proposed: ProposedLine): string {
  if (proposed.kind === "payment") {
    return `${KEY_PREFIX.PROPOSED_PAYMENT}${proposed.lineNumber}`;
  }
  const reasonToken = proposed.idempotencyKey.split("|").at(-1);
  if (!reasonToken) {
    throw new Error(
      `malformed proposed-line idempotency key: ${proposed.idempotencyKey}`,
    );
  }
  return `${KEY_PREFIX.PROPOSED_ADJUSTMENT}${proposed.lineNumber}-${reasonToken}`;
}
