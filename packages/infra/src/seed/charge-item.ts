import { cents } from "core";
import type { Charge, ChargeLine } from "core";

import { CHARGE_SK, claimPk } from "../persistence";

/**
 * The stored form of a seeded {@link Charge}: a `CHARGE` item carrying the billed
 * lines so the Lambda can read the charge back and reconcile the 835 against it
 * (D20). It shares the claim partition and `CHARGE` sort key with the contract's
 * reconciled `ChargeItem`, and the seed is the only `CHARGE` writer today. The
 * Lambda ticket that later writes the reconciled header must merge rather than
 * clobber, or the seeded `lines` are lost on reconcile (#20).
 */
export interface SeededChargeItem {
  PK: string;
  SK: typeof CHARGE_SK;
  type: "CHARGE";
  claimControlNumber: string;
  lines: ChargeLine[];
}

export function seededChargeItem(charge: Charge): SeededChargeItem {
  return {
    PK: claimPk(charge.claimControlNumber),
    SK: CHARGE_SK,
    type: "CHARGE",
    claimControlNumber: charge.claimControlNumber,
    lines: charge.lines,
  };
}

/**
 * Reconstructs the seeded {@link Charge} from its stored item, re-branding each
 * billed amount through `cents()` so a corrupted (non-integer) amount throws at
 * the read edge rather than entering the cents domain silently (STANDARDS).
 */
export function chargeFromItem(item: SeededChargeItem): Charge {
  return {
    claimControlNumber: item.claimControlNumber,
    lines: item.lines.map((line) => ({
      lineNumber: line.lineNumber,
      billed: cents(line.billed),
      ...(line.procedureCode ? { procedureCode: line.procedureCode } : {}),
    })),
  };
}
