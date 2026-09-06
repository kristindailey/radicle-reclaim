import { readFileSync } from "node:fs";
import { join } from "node:path";

import { reconcile } from "../reconcile";
import { cents } from "../money";
import type { Charge } from "../types";

/**
 * Issue #8 (D6, D19). A line whose amounts do not foot fires the balancer and is
 * kept out of the dollars-at-risk hero figure. Every assertion goes through the
 * {@link reconcile} seam.
 *
 * The fixture pairs an out-of-balance line (CLAIM010, billed 300 not equal to paid
 * 100 + CAS 100) carrying a recoverable `PI` 197, with a clean recoverable denial
 * (CLAIM011, `PI` 197 that foots), so the at-risk figure can be shown to count
 * CLAIM011 alone while CLAIM010's row is still populated. The `BPR` total ties to
 * the sum of claim payments, so the whole-file check passes even though a line
 * does not foot: the grains are independent.
 */
const outOfBalance835 = readFileSync(
  join(__dirname, "fixtures", "out-of-balance.835.edi"),
  "utf8",
);

const seededCharges: Charge[] = [
  {
    claimControlNumber: "CLAIM010",
    lines: [{ lineNumber: 1, billed: cents(30_000), procedureCode: "99214" }],
  },
  {
    claimControlNumber: "CLAIM011",
    lines: [{ lineNumber: 1, billed: cents(25_000), procedureCode: "99215" }],
  },
];

function run() {
  return reconcile({ charges: seededCharges, raw835: outOfBalance835 });
}

describe("reconcile: out-of-balance line, end to end", () => {
  it("surfaces the out-of-balance line with a warning and disposition; no other line carries the warning", () => {
    const result = run();

    const outOfBalance = result.lines.find(
      (l) => l.claimControlNumber === "CLAIM010",
    );
    expect(outOfBalance?.disposition).toBe("out-of-balance");
    expect(outOfBalance?.balanceWarning).toBeDefined();

    const others = result.lines.filter(
      (l) => l.claimControlNumber !== "CLAIM010",
    );
    for (const line of others) {
      expect(line.balanceWarning).toBeUndefined();
    }
  });

  it("validates balancing at the claim grain: the claim carrying the bad line is flagged, the footing claim is not", () => {
    const result = run();

    const badClaim = result.claims.find(
      (c) => c.claimControlNumber === "CLAIM010",
    );
    const goodClaim = result.claims.find(
      (c) => c.claimControlNumber === "CLAIM011",
    );
    expect(badClaim?.balanceWarning).toBeDefined();
    expect(goodClaim?.balanceWarning).toBeUndefined();
  });

  it("ties the transaction total (BPR) to the sum of claim payments", () => {
    const result = run();

    // BPR is 100 and the only paid claim is CLAIM010 at 100, so the whole-file
    // check ties even though a line does not foot: the grains are independent.
    expect(result.transactionBalance.balances).toBe(true);
    expect(result.transactionBalance.warning).toBeUndefined();
  });

  it("excludes the out-of-balance line's dollars from dollars at risk", () => {
    const result = run();

    // Both lines carry a recoverable `PI` 197, but only CLAIM011 foots. The hero
    // figure is CLAIM011's 250 alone; CLAIM010's 100 stays out because the line
    // does not foot (D19).
    expect(result.aggregates.dollarsAtRisk).toBe(25_000);
  });

  it("still parses and classifies the out-of-balance line so the row is populated", () => {
    const result = run();

    const line = result.lines.find((l) => l.claimControlNumber === "CLAIM010");
    expect(line?.adjustments).toHaveLength(1);
    const adjustment = line?.adjustments[0];
    expect(adjustment?.groupCode).toBe("PI");
    expect(adjustment?.carc).toBe("197");
    expect(adjustment?.classification).toBe("recoverable-denial");
  });

  it("still drafts proposed lines for the out-of-balance line", () => {
    const result = run();

    const proposed = result.proposedLines.filter(
      (p) => p.claimControlNumber === "CLAIM010",
    );
    const payment = proposed.find((p) => p.kind === "payment");
    const adjustment = proposed.find((p) => p.kind === "adjustment");

    expect(payment?.amount).toBe(10_000);
    expect(adjustment?.amount).toBe(10_000);
    expect(adjustment?.groupCode).toBe("PI");
    expect(adjustment?.carc).toBe("197");
  });

  it("counts the out-of-balance line in the out-of-balance aggregate", () => {
    const result = run();

    expect(result.aggregates.outOfBalanceCount).toBe(1);
  });
});

/**
 * A whole-file imbalance the per-line checks cannot see: CLAIM012 foots at both
 * the line and claim grain (200 = 200), but the `BPR` total (150) does not tie to
 * the sum of claim payments (200). The transaction-grain check catches it.
 */
const transactionImbalance835 = readFileSync(
  join(__dirname, "fixtures", "transaction-imbalance.835.edi"),
  "utf8",
);

describe("reconcile: transaction-grain imbalance, end to end", () => {
  function runTransaction() {
    return reconcile({
      charges: [
        {
          claimControlNumber: "CLAIM012",
          lines: [
            { lineNumber: 1, billed: cents(20_000), procedureCode: "99213" },
          ],
        },
      ],
      raw835: transactionImbalance835,
    });
  }

  it("catches an imbalance the per-line and per-claim checks miss", () => {
    const result = runTransaction();

    // Every line and claim foots on its own, so no line or claim is flagged.
    expect(result.aggregates.outOfBalanceCount).toBe(0);
    for (const line of result.lines) {
      expect(line.balanceWarning).toBeUndefined();
    }
    for (const claim of result.claims) {
      expect(claim.balanceWarning).toBeUndefined();
    }

    // But the BPR total does not tie to the sum of claim payments.
    expect(result.transactionBalance.balances).toBe(false);
    expect(result.transactionBalance.warning).toBeDefined();
  });
});
