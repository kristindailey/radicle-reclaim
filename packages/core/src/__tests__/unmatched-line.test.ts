import { readFileSync } from "node:fs";
import { join } from "node:path";

import { reconcile } from "../reconcile";
import { cents } from "../money";
import type { Charge } from "../types";

/**
 * Issue #7 (D3, D17). An 835 line whose `CLP01` finds no seeded charge is surfaced
 * as an unmatched line, not dropped, so a biller sees remittance the system cannot
 * place. Every assertion goes through the {@link reconcile} seam.
 *
 * The fixture pairs a matched clean claim (CLAIM009) with an unmatched one
 * (CLAIM999). The unmatched line is deliberately loaded: it carries a recoverable
 * CARC (`PI` 197) *and* its amounts do not foot (billed 250 ≠ paid 0 + CAS 200), so
 * on the matched path it would rank recoverable-denial, and structurally
 * out-of-balance. Proving it still dispositions `unmatched` shows unmatched
 * outranks every other disposition on the same line (D17).
 */

const raw835 = readFileSync(
  join(__dirname, "fixtures", "unmatched-line.835.edi"),
  "utf8",
);

/**
 * CLAIM009 is seeded and matches. CLAIM999 is not — and to prove `CLP07` is never
 * the join key, a decoy charge is seeded under "PAYER999", CLAIM999's payer control
 * number: were matching keyed on `CLP07` it would place, but keyed on `CLP01`
 * (D3) it stays unmatched.
 */
const seededCharges: Charge[] = [
  {
    claimControlNumber: "CLAIM009",
    lines: [{ lineNumber: 1, billed: cents(40_000), procedureCode: "99213" }],
  },
  {
    claimControlNumber: "PAYER999",
    lines: [{ lineNumber: 1, billed: cents(25_000), procedureCode: "99215" }],
  },
];

function run() {
  return reconcile({ charges: seededCharges, raw835 });
}

describe("reconcile: unmatched line, end to end", () => {
  it("surfaces the unmatched line rather than dropping it", () => {
    const result = run();

    const line = result.lines.find((l) => l.claimControlNumber === "CLAIM999");
    expect(line).toBeDefined();
    // The claim is rolled up too, so the row is visible on the dashboard.
    expect(
      result.claims.some((c) => c.claimControlNumber === "CLAIM999"),
    ).toBe(true);
  });

  it("dispositions it unmatched, outranking every other disposition on the line", () => {
    const result = run();

    const line = result.lines.find((l) => l.claimControlNumber === "CLAIM999");
    // Despite a recoverable CARC and a footing failure on the same line,
    // unmatched wins: it is the top of the precedence order (D17).
    expect(line?.disposition).toBe("unmatched");
  });

  it("counts it in the unmatched aggregate, and not as out-of-balance", () => {
    const result = run();

    expect(result.aggregates.unmatchedCount).toBe(1);
    // The line's raw amounts do not foot, but its single headline is unmatched,
    // so it never also shows up in the out-of-balance count.
    expect(result.aggregates.outOfBalanceCount).toBe(0);
  });

  it("keeps its non-footing recoverable dollars out of dollars at risk (D19)", () => {
    const result = run();

    // CLAIM999 carries a recoverable `PI` 197 but its amounts do not foot, so its
    // dollars stay out of the hero figure even though its headline is unmatched,
    // not out-of-balance. The only other line is a clean payment, so the figure is
    // zero.
    expect(result.aggregates.dollarsAtRisk).toBe(0);
  });

  it("captures CLP07 on the result for resubmission without using it as the join key", () => {
    const result = run();

    const claim = result.claims.find(
      (c) => c.claimControlNumber === "CLAIM999",
    );
    // CLP07 is present for appeals/resubmission...
    expect(claim?.payerControlNumber).toBe("PAYER999");
    // ...but a charge seeded under that very CLP07 did not place the claim: the
    // match is keyed on CLP01, so CLAIM999 stays unmatched (D3).
    expect(claim?.lines[0]?.disposition).toBe("unmatched");
  });

  it("drafts no proposed line for the unmatched line — there is nothing to post", () => {
    const result = run();

    const proposed = result.proposedLines.filter(
      (p) => p.claimControlNumber === "CLAIM999",
    );
    expect(proposed).toHaveLength(0);
  });

  it("leaves the matched clean claim on the same remittance untouched", () => {
    const result = run();

    const line = result.lines.find((l) => l.claimControlNumber === "CLAIM009");
    expect(line?.disposition).toBe("clean-payment");
    expect(
      result.proposedLines.some(
        (p) => p.claimControlNumber === "CLAIM009" && p.kind === "payment",
      ),
    ).toBe(true);
  });
});
