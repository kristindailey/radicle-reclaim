import { readFileSync } from "node:fs";
import { join } from "node:path";

import { reconcile } from "../reconcile";
import { cents } from "../money";
import type { Charge } from "../types";

/**
 * The tracer bullet (issue #3): the whole pipeline threaded end-to-end for the
 * simplest outcome, a clean payment where paid equals billed. Every assertion
 * goes through the {@link reconcile} seam; nothing reaches into the adapter,
 * matcher, or balancer directly.
 */

const raw835 = readFileSync(
  join(__dirname, "fixtures", "clean-payment.835.edi"),
  "utf8",
);

/** The seeded charge whose control number round-trips against the fixture's `CLP01`. */
const seededCharge: Charge = {
  claimControlNumber: "CLAIM001",
  lines: [{ lineNumber: 1, billed: cents(50_000), procedureCode: "99213" }],
};

describe("reconcile: clean payment, end to end", () => {
  it("rolls one claim up from one line", () => {
    const result = reconcile({ charges: [seededCharge], raw835 });

    expect(result.claims).toHaveLength(1);
    expect(result.claims[0]?.claimControlNumber).toBe("CLAIM001");
    expect(result.claims[0]?.lines).toHaveLength(1);
    expect(result.lines).toHaveLength(1);
  });

  it("dispositions the line as clean-payment with one proposed Payment and no Adjustment", () => {
    const result = reconcile({ charges: [seededCharge], raw835 });

    const line = result.lines[0];
    expect(line?.disposition).toBe("clean-payment");

    expect(result.proposedLines).toHaveLength(1);
    const proposed = result.proposedLines[0];
    expect(proposed?.kind).toBe("payment");
    expect(result.proposedLines.some((p) => p.kind === "adjustment")).toBe(
      false,
    );
    expect(line?.adjustments).toEqual([]);
  });

  it("drafts the Payment pending review with a deterministic idempotency key", () => {
    const first = reconcile({ charges: [seededCharge], raw835 });
    const second = reconcile({ charges: [seededCharge], raw835 });

    const payment = first.proposedLines[0];
    expect(payment?.status).toBe("pending-review");
    expect(payment?.idempotencyKey).toBeTruthy();
    // The key derives from the reassociation trace (fixture TRN02), not ST02.
    expect(payment?.idempotencyKey).toContain("0000000001");

    // Same 835 + same charge reduces to the same key, so a redelivery upserts.
    expect(second.proposedLines[0]?.idempotencyKey).toBe(
      payment?.idempotencyKey,
    );
  });

  it("foots the line (billed = paid + Σ CAS) with no balance warning", () => {
    const result = reconcile({ charges: [seededCharge], raw835 });

    const line = result.lines[0];
    expect(line?.balanceWarning).toBeUndefined();
    const sumCas = (line?.adjustments ?? []).reduce((a, adj) => a + adj.amount, 0);
    expect(line?.billed).toBe((line?.paid ?? 0) + sumCas);
    expect(result.aggregates.outOfBalanceCount).toBe(0);
  });

  it("aggregates total remittance and total paid to the hand-computed cents", () => {
    const result = reconcile({ charges: [seededCharge], raw835 });

    expect(result.aggregates.totalRemittance).toBe(50_000);
    expect(result.aggregates.totalPaid).toBe(50_000);
  });

  it("keeps every money value on the result an integer number of cents", () => {
    const result = reconcile({ charges: [seededCharge], raw835 });

    const line = result.lines[0];
    for (const value of [
      line?.billed,
      line?.paid,
      line?.patientResponsibility,
      result.proposedLines[0]?.amount,
      result.aggregates.totalRemittance,
      result.aggregates.totalPaid,
    ]) {
      expect(Number.isInteger(value)).toBe(true);
    }
  });
});
