import { cents, reconcile } from "core";
import type { Charge, ReconciliationResult } from "core";

import { SIX_OUTCOMES_835 } from "./six-outcomes.edi";

/**
 * The seeded charges behind the six-outcome remittance, mirroring the core's
 * six-outcome test. CLAIM105 is deliberately absent so its line reconciles
 * unmatched.
 */
const SEEDED_CHARGES: Charge[] = [
  {
    claimControlNumber: "CLAIM101",
    lines: [{ lineNumber: 1, billed: cents(50_000), procedureCode: "99213" }],
  },
  {
    claimControlNumber: "CLAIM102",
    lines: [{ lineNumber: 1, billed: cents(30_000), procedureCode: "99214" }],
  },
  {
    claimControlNumber: "CLAIM103",
    lines: [{ lineNumber: 1, billed: cents(25_000), procedureCode: "99215" }],
  },
  {
    claimControlNumber: "CLAIM104",
    lines: [{ lineNumber: 1, billed: cents(20_000), procedureCode: "99214" }],
  },
  {
    claimControlNumber: "CLAIM106",
    lines: [{ lineNumber: 1, billed: cents(30_000), procedureCode: "99214" }],
  },
];

/**
 * Reconciles the six-outcome fixture through the core seam. It runs the engine, so
 * it is Node only (tests, and regenerating the app's JSON); the browser reads the
 * generated result and never reconciles (STANDARDS).
 */
export function buildSixOutcomeResult(): ReconciliationResult {
  return reconcile({ charges: SEEDED_CHARGES, raw835: SIX_OUTCOMES_835 });
}
