import { readFileSync } from "node:fs";
import { join } from "node:path";

import { reconcile } from "../reconcile";
import { cents } from "../money";
import type { Charge } from "../types";

/**
 * Issue #5: a line paid zero for an actionable reason (an actionable CARC such as
 * 197 in an actionable group) is a recoverable denial, drafted as an Adjustment
 * and counted toward dollars at risk, distinct from a `CO` contractual write-off
 * (D4). Every assertion goes through the {@link reconcile} seam. The fixture pairs
 * the recoverable denial (CLAIM004, paid zero, `PI` 197) with a contractual
 * short-pay (CLAIM005, `CO` 45) so the hero figure can be shown to count only the
 * recoverable one.
 */

const raw835 = readFileSync(
  join(__dirname, "fixtures", "recoverable-denial.835.edi"),
  "utf8",
);

const seededCharges: Charge[] = [
  {
    claimControlNumber: "CLAIM004",
    lines: [{ lineNumber: 1, billed: cents(25_000), procedureCode: "99215" }],
  },
  {
    claimControlNumber: "CLAIM005",
    lines: [{ lineNumber: 1, billed: cents(30_000), procedureCode: "99213" }],
  },
  {
    claimControlNumber: "CLAIM006",
    lines: [{ lineNumber: 1, billed: cents(10_000), procedureCode: "99213" }],
  },
];

function run() {
  return reconcile({ charges: seededCharges, raw835 });
}

describe("reconcile: recoverable denial, end to end", () => {
  it("drafts a proposed Adjustment (and no Payment) for the paid-zero CARC-197 line", () => {
    const result = run();

    const adjustments = result.proposedLines.filter(
      (p) => p.kind === "adjustment" && p.claimControlNumber === "CLAIM004",
    );
    const payments = result.proposedLines.filter(
      (p) => p.kind === "payment" && p.claimControlNumber === "CLAIM004",
    );

    expect(adjustments).toHaveLength(1);
    expect(adjustments[0]?.amount).toBe(25_000);
    expect(adjustments[0]?.status).toBe("pending-review");
    expect(payments).toHaveLength(0);
  });

  it("classifies the reason as a recoverable denial and decodes CARC 197", () => {
    const result = run();

    const line = result.lines.find((l) => l.claimControlNumber === "CLAIM004");
    expect(line?.adjustments).toHaveLength(1);
    const adjustment = line?.adjustments[0];
    expect(adjustment?.groupCode).toBe("PI");
    expect(adjustment?.carc).toBe("197");
    expect(adjustment?.carcText).toBe(
      "Precertification/authorization/notification/pre-treatment absent",
    );
    expect(adjustment?.amount).toBe(25_000);
    expect(adjustment?.classification).toBe("recoverable-denial");
  });

  it("dispositions the paid-zero recoverable denial as recoverable-denial", () => {
    const result = run();

    const line = result.lines.find((l) => l.claimControlNumber === "CLAIM004");
    expect(line?.disposition).toBe("recoverable-denial");
  });

  it("counts only the recoverable denial toward dollars at risk", () => {
    const result = run();

    // The hero figure is CLAIM004's 197 alone: the CO-45 short-pay and the
    // non-actionable PI-253 sequestration reduction both stay out of it.
    expect(result.aggregates.dollarsAtRisk).toBe(25_000);
    // The contractual total is the CO-45 write-down only; the PI-253 "other"
    // reason is not contractual and stays out.
    expect(result.aggregates.totalContractual).toBe(10_000);
  });

  it("keeps the CO short-pay contractual and out of dollars at risk", () => {
    const result = run();

    const line = result.lines.find((l) => l.claimControlNumber === "CLAIM005");
    expect(line?.disposition).toBe("contractual-adjustment");
    expect(line?.adjustments[0]?.classification).toBe("contractual");
  });

  it("classifies a non-actionable CARC in an actionable group as other, not recoverable", () => {
    const result = run();

    const line = result.lines.find((l) => l.claimControlNumber === "CLAIM006");
    const adjustment = line?.adjustments[0];
    expect(adjustment?.groupCode).toBe("PI");
    expect(adjustment?.carc).toBe("253");
    expect(adjustment?.classification).toBe("other");
    expect(line?.disposition).toBe("other-adjustment");
  });

  it("keys the recoverable-denial Adjustment deterministically to its CAS reason", () => {
    const first = run();
    const second = run();

    const adjustment = first.proposedLines.find(
      (p) => p.kind === "adjustment" && p.claimControlNumber === "CLAIM004",
    );
    expect(adjustment?.idempotencyKey).toBe(
      "0000000003|CLAIM#CLAIM004|LINE#1|PI197",
    );

    const secondAdjustment = second.proposedLines.find(
      (p) => p.kind === "adjustment" && p.claimControlNumber === "CLAIM004",
    );
    expect(secondAdjustment?.idempotencyKey).toBe(adjustment?.idempotencyKey);
  });

  it("foots every line (billed = paid + Σ CAS), no balance warning", () => {
    const result = run();

    for (const line of result.lines) {
      expect(line.balanceWarning).toBeUndefined();
      const sumCas = line.adjustments.reduce((a, adj) => a + adj.amount, 0);
      expect(line.billed).toBe(line.paid + sumCas);
    }
    expect(result.aggregates.outOfBalanceCount).toBe(0);
  });
});
