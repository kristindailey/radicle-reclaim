import { readFileSync } from "node:fs";
import { join } from "node:path";

import { reconcile } from "../reconcile";
import { cents } from "../money";
import type { Charge } from "../types";

/**
 * Issue #4: a line paid below billed under the payer contract (group `CO`, e.g.
 * CARC 45) drafts a Payment plus a contractual Adjustment, so the expected
 * write-down is recorded and not chased. Every assertion goes through the
 * {@link reconcile} seam. The fixture carries two contractual short-pays: one
 * with a known CARC (45) and one with a CARC outside the ~20-code lookup (`B13`),
 * which must reconcile and surface its raw code rather than throw.
 */

const raw835 = readFileSync(
  join(__dirname, "fixtures", "contractual-short-pay.835.edi"),
  "utf8",
);

const seededCharges: Charge[] = [
  {
    claimControlNumber: "CLAIM002",
    lines: [{ lineNumber: 1, billed: cents(50_000), procedureCode: "99213" }],
  },
  {
    claimControlNumber: "CLAIM003",
    lines: [{ lineNumber: 1, billed: cents(40_000), procedureCode: "99214" }],
  },
];

function run() {
  return reconcile({ charges: seededCharges, raw835 });
}

describe("reconcile: contractual short-pay, end to end", () => {
  it("drafts one Payment and one contractual Adjustment for the short-paid line", () => {
    const result = run();

    const payments = result.proposedLines.filter(
      (p) => p.kind === "payment" && p.claimControlNumber === "CLAIM002",
    );
    const adjustments = result.proposedLines.filter(
      (p) => p.kind === "adjustment" && p.claimControlNumber === "CLAIM002",
    );

    expect(payments).toHaveLength(1);
    expect(payments[0]?.amount).toBe(30_000);
    expect(adjustments).toHaveLength(1);
    expect(adjustments[0]?.amount).toBe(20_000);
    expect(adjustments[0]?.status).toBe("pending-review");
    expect(payments[0]?.status).toBe("pending-review");
  });

  it("carries the Adjustment's group code, raw CARC, decoded text, and cents", () => {
    const result = run();

    const line = result.lines.find((l) => l.claimControlNumber === "CLAIM002");
    expect(line?.adjustments).toHaveLength(1);
    const adjustment = line?.adjustments[0];
    expect(adjustment?.groupCode).toBe("CO");
    expect(adjustment?.carc).toBe("45");
    expect(adjustment?.carcText).toBe(
      "Charge exceeds fee schedule/maximum allowable or contracted/legislated fee arrangement",
    );
    expect(adjustment?.amount).toBe(20_000);
    expect(adjustment?.classification).toBe("contractual");
  });

  it("dispositions a CO-only short-pay as contractual-adjustment", () => {
    const result = run();

    const line = result.lines.find((l) => l.claimControlNumber === "CLAIM002");
    expect(line?.disposition).toBe("contractual-adjustment");
  });

  it("reconciles a CARC outside the lookup and surfaces the raw code, no throw", () => {
    const result = run();

    const line = result.lines.find((l) => l.claimControlNumber === "CLAIM003");
    const adjustment = line?.adjustments[0];
    expect(adjustment?.carc).toBe("B13");
    expect(adjustment?.carcText).toBe("B13");
    expect(adjustment?.classification).toBe("contractual");
    expect(line?.disposition).toBe("contractual-adjustment");
  });

  it("totals the contractual bucket to the hand-computed cents", () => {
    const result = run();

    expect(result.aggregates.totalContractual).toBe(35_000);
  });

  it("keys each proposed line deterministically to its CAS group+reason", () => {
    const first = run();
    const second = run();

    const adjustment = first.proposedLines.find(
      (p) => p.kind === "adjustment" && p.claimControlNumber === "CLAIM002",
    );
    expect(adjustment?.idempotencyKey).toBe(
      "0000000002|CLAIM#CLAIM002|LINE#1|CO45",
    );

    const payment = first.proposedLines.find(
      (p) => p.kind === "payment" && p.claimControlNumber === "CLAIM002",
    );
    expect(payment?.idempotencyKey).toBe("0000000002|CLAIM#CLAIM002|LINE#1|PMT");

    // A redelivery of the same 835 reduces to the same keys, so retries upsert.
    const secondAdjustment = second.proposedLines.find(
      (p) => p.kind === "adjustment" && p.claimControlNumber === "CLAIM002",
    );
    expect(secondAdjustment?.idempotencyKey).toBe(adjustment?.idempotencyKey);
  });

  it("foots each short-paid line (billed = paid + Σ CAS), no balance warning", () => {
    const result = run();

    for (const line of result.lines) {
      expect(line.balanceWarning).toBeUndefined();
      const sumCas = line.adjustments.reduce((a, adj) => a + adj.amount, 0);
      expect(line.billed).toBe(line.paid + sumCas);
    }
    expect(result.aggregates.outOfBalanceCount).toBe(0);
  });
});
