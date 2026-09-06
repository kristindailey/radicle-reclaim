import { readFileSync } from "node:fs";
import { join } from "node:path";

import { reconcile } from "../reconcile";
import { cents } from "../money";
import type { Charge } from "../types";

/**
 * Issue #6 (D5, D17, D18). The fixture pairs the split line (CLAIM007, `CO` 45 +
 * `PR` 2) with a recoverable denial (CLAIM008, `PI` 197) so patient responsibility
 * can be shown out of both the contractual total and dollars at risk while both
 * are nonzero.
 */

const raw835 = readFileSync(
  join(__dirname, "fixtures", "split-line.835.edi"),
  "utf8",
);

const seededCharges: Charge[] = [
  {
    claimControlNumber: "CLAIM007",
    lines: [{ lineNumber: 1, billed: cents(20_000), procedureCode: "99214" }],
  },
  {
    claimControlNumber: "CLAIM008",
    lines: [{ lineNumber: 1, billed: cents(10_000), procedureCode: "99215" }],
  },
];

function run() {
  return reconcile({ charges: seededCharges, raw835 });
}

describe("reconcile: split line (CO + PR), end to end", () => {
  it("drafts two Adjustments for the split line, one CO and one PR, not one merged figure", () => {
    const result = run();

    const adjustments = result.proposedLines.filter(
      (p) => p.kind === "adjustment" && p.claimControlNumber === "CLAIM007",
    );
    expect(adjustments).toHaveLength(2);

    const co = adjustments.find((p) => p.groupCode === "CO");
    const pr = adjustments.find((p) => p.groupCode === "PR");
    expect(co?.amount).toBe(3_000);
    expect(co?.carc).toBe("45");
    expect(pr?.amount).toBe(2_000);
    expect(pr?.carc).toBe("2");
    for (const adjustment of adjustments) {
      expect(adjustment.status).toBe("pending-review");
    }
  });

  it("classifies the split line's two reasons into separate buckets", () => {
    const result = run();

    const line = result.lines.find((l) => l.claimControlNumber === "CLAIM007");
    expect(line?.adjustments).toHaveLength(2);

    const co = line?.adjustments.find((a) => a.groupCode === "CO");
    const pr = line?.adjustments.find((a) => a.groupCode === "PR");
    expect(co?.classification).toBe("contractual");
    expect(pr?.classification).toBe("patient-responsibility");
    expect(pr?.carcText).toBe("Coinsurance amount");
  });

  it("lands the CO dollars in the contractual bucket and the PR dollars in patient responsibility", () => {
    const result = run();

    const line = result.lines.find((l) => l.claimControlNumber === "CLAIM007");
    expect(line?.patientResponsibility).toBe(2_000);

    expect(result.aggregates.totalContractual).toBe(3_000);
    expect(result.aggregates.totalPatientResponsibility).toBe(2_000);
  });

  it("excludes patient responsibility from dollars at risk and the contractual total", () => {
    const result = run();

    // Dollars at risk is CLAIM008's recoverable 197 alone; the PR coinsurance and
    // the CO write-down both stay out. The contractual total is the CO write-down
    // alone; the PR amount is never folded into it.
    expect(result.aggregates.dollarsAtRisk).toBe(10_000);
    expect(result.aggregates.totalContractual).toBe(3_000);
    expect(result.aggregates.totalPatientResponsibility).toBe(2_000);
  });

  it("shows one headline disposition for the split line, chosen by precedence", () => {
    const result = run();

    // CO outranks PR (which has no headline of its own), so the row reads
    // contractual-adjustment while both dollars sit in their buckets underneath.
    const line = result.lines.find((l) => l.claimControlNumber === "CLAIM007");
    expect(line?.disposition).toBe("contractual-adjustment");
  });

  it("keys each split Adjustment deterministically to its own CAS reason", () => {
    const result = run();

    const adjustments = result.proposedLines.filter(
      (p) => p.kind === "adjustment" && p.claimControlNumber === "CLAIM007",
    );
    const keys = adjustments.map((a) => a.idempotencyKey).sort();
    expect(keys).toEqual([
      "0000000004|CLAIM#CLAIM007|LINE#1|CO45",
      "0000000004|CLAIM#CLAIM007|LINE#1|PR2",
    ]);
  });

  it("still drafts one Payment for the paid portion of the split line", () => {
    const result = run();

    const payments = result.proposedLines.filter(
      (p) => p.kind === "payment" && p.claimControlNumber === "CLAIM007",
    );
    expect(payments).toHaveLength(1);
    expect(payments[0]?.amount).toBe(15_000);
  });

  it("foots the split line (billed = paid + Σ CAS), no balance warning", () => {
    const result = run();

    const line = result.lines.find((l) => l.claimControlNumber === "CLAIM007");
    expect(line?.balanceWarning).toBeUndefined();
    const sumCas = line!.adjustments.reduce((a, adj) => a + adj.amount, 0);
    expect(line?.billed).toBe(line!.paid + sumCas);
  });
});
