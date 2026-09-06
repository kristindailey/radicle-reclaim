import { cents } from "core";
import type { Charge } from "core";

/**
 * The charges the six-outcome fixture 835 reconciles against, keyed by claim
 * control number (`CLP01`). Seeding these lets the fixture round-trip on `CLP01`
 * against real stored `CHARGE` items (D20). They mirror the core's capstone
 * fixture and the persistence-contract test, so the live seed and the in-memory
 * core tests reconcile against the same billed amounts.
 *
 * CLAIM105 is absent on purpose: it is the fixture's unmatched claim.
 */
export const FIXTURE_CHARGES: Charge[] = [
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
