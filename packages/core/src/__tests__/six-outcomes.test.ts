import { readFileSync } from "node:fs";
import { join } from "node:path";

import { reconcile } from "../reconcile";
import { cents } from "../money";
import type { Charge } from "../types";

/**
 * Issue #9 (D8, D9, D12, D13, D15, D18, D19): the capstone. One hand-authored
 * synthetic 835, zero PHI, carrying all six committed outcomes together, run once
 * through the {@link reconcile} seam. Structure is authored to real X12 (segment
 * order, real CARC/group codes, footing amounts) and sanity-checked against the
 * public 005010X221A1 sample so the file is not malformed; every control number is
 * synthetic and no field carries patient-identifying data.
 *
 * The six outcomes and their claims:
 *   CLAIM101  clean payment          paid in full, no CAS
 *   CLAIM102  contractual short-pay  CO 45 (not at risk)
 *   CLAIM103  recoverable denial     paid 0, PI 197 (at risk)
 *   CLAIM104  split line             CO 45 + PR 2 on one line (D5, D18)
 *   CLAIM105  unmatched line         a CLP01 with no seeded charge (D3)
 *   CLAIM106  out-of-balance line    billed 300 != paid 100 + CAS 100 (D6, D19)
 *
 * CLAIM105 is deliberately left out of the seeded set so it reconciles unmatched;
 * every other claim is seeded so it matches.
 */

const raw835 = readFileSync(
  join(__dirname, "fixtures", "six-outcomes.835.edi"),
  "utf8",
);

const seededCharges: Charge[] = [
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

function run() {
  return reconcile({ charges: seededCharges, raw835 });
}

describe("reconcile: full six-outcome fixture, end to end", () => {
  it("dispositions all six outcomes correctly in one run", () => {
    const result = run();

    const dispositionOf = (claim: string) =>
      result.lines.find((l) => l.claimControlNumber === claim)?.disposition;

    expect(dispositionOf("CLAIM101")).toBe("clean-payment");
    expect(dispositionOf("CLAIM102")).toBe("contractual-adjustment");
    expect(dispositionOf("CLAIM103")).toBe("recoverable-denial");
    // The split line's headline is contractual (CO outranks PR), its two dollars
    // landing in separate buckets underneath.
    expect(dispositionOf("CLAIM104")).toBe("contractual-adjustment");
    expect(dispositionOf("CLAIM105")).toBe("unmatched");
    expect(dispositionOf("CLAIM106")).toBe("out-of-balance");
  });

  it("splits the split line into a CO and a PR bucket, not one merged figure", () => {
    const result = run();

    const line = result.lines.find((l) => l.claimControlNumber === "CLAIM104");
    const co = line?.adjustments.find((a) => a.groupCode === "CO");
    const pr = line?.adjustments.find((a) => a.groupCode === "PR");
    expect(co?.classification).toBe("contractual");
    expect(co?.amount).toBe(3_000);
    expect(pr?.classification).toBe("patient-responsibility");
    expect(pr?.amount).toBe(2_000);
    expect(line?.patientResponsibility).toBe(2_000);
  });

  it("ties every aggregate to its hand-computed cents total", () => {
    const result = run();

    expect(result.aggregates).toEqual({
      // billed 500 + 300 + 250 + 200 + 100 + 300 = 1650
      totalRemittance: 165_000,
      // paid 500 + 250 + 0 + 150 + 100 + 100 = 1100
      totalPaid: 110_000,
      // CO 50 (CLAIM102) + CO 30 (CLAIM104) = 80
      totalContractual: 8_000,
      // PR 20 (CLAIM104)
      totalPatientResponsibility: 2_000,
      // recoverable PI 197: CLAIM103's 250 foots and counts; CLAIM106's 100 does
      // not foot and is excluded (D19)
      dollarsAtRisk: 25_000,
      unmatchedCount: 1,
      outOfBalanceCount: 1,
    });
  });

  it("counts dollars at risk from the recoverable denial alone, excluding CO and out-of-balance", () => {
    const result = run();

    // 25_000 is CLAIM103's recoverable PI 197 by itself. The CLAIM102 CO short-pay
    // is contractual, and CLAIM106's recoverable PI 197 is dropped because the line
    // does not foot, so neither reaches the hero figure.
    expect(result.aggregates.dollarsAtRisk).toBe(25_000);
  });

  it("ties the transaction total (BPR) to the sum of claim payments despite the out-of-balance line", () => {
    const result = run();

    // BPR 1100 = Σ CLP04 (500 + 250 + 0 + 150 + 100 + 100). The line-grain footing
    // failure on CLAIM106 does not disturb the whole-file tie: the grains are
    // independent (D6).
    expect(result.transactionBalance.balances).toBe(true);
    expect(result.transactionBalance.warning).toBeUndefined();
  });

  it("flags only the out-of-balance line and its claim, no others", () => {
    const result = run();

    for (const line of result.lines) {
      const expected = line.claimControlNumber === "CLAIM106";
      expect(line.balanceWarning !== undefined).toBe(expected);
    }
    const badClaim = result.claims.find(
      (c) => c.claimControlNumber === "CLAIM106",
    );
    expect(badClaim?.balanceWarning).toBeDefined();
  });

  it("drafts no proposed line for the unmatched claim", () => {
    const result = run();

    const proposed = result.proposedLines.filter(
      (p) => p.claimControlNumber === "CLAIM105",
    );
    expect(proposed).toHaveLength(0);
  });

  it("surfaces the 835 control number (TRN02) so the persistence edge can key on it", () => {
    const result = run();

    expect(result.controlNumber).toBe("0000000009");
  });

  it("surfaces the structured log figures on the result without recomputing (D15)", () => {
    const result = run();

    expect(result.logFigures).toEqual({
      linesReconciled: 6,
      dollarsAtRisk: 25_000,
      outOfBalanceCount: 1,
    });
    // The two figures the aggregates already carry are the same values, lifted
    // onto logFigures so the Lambda reads them off directly.
    expect(result.logFigures.dollarsAtRisk).toBe(result.aggregates.dollarsAtRisk);
    expect(result.logFigures.outOfBalanceCount).toBe(
      result.aggregates.outOfBalanceCount,
    );
  });

  it("keeps every proposed line's idempotency key stable across two runs of the same 835", () => {
    const first = run();
    const second = run();

    const keysOf = (r: ReturnType<typeof run>) =>
      r.proposedLines.map((p) => p.idempotencyKey).sort();

    const firstKeys = keysOf(first);
    expect(firstKeys).toEqual(keysOf(second));
    // Redelivery upserts on these keys instead of double-posting (D12): the
    // trace number (TRN02) anchors every key, and each is unique within the run.
    expect(new Set(firstKeys).size).toBe(firstKeys.length);
    expect(firstKeys).toEqual([
      "0000000009|CLAIM#CLAIM101|LINE#1|PMT",
      "0000000009|CLAIM#CLAIM102|LINE#1|CO45",
      "0000000009|CLAIM#CLAIM102|LINE#1|PMT",
      "0000000009|CLAIM#CLAIM103|LINE#1|PI197",
      "0000000009|CLAIM#CLAIM104|LINE#1|CO45",
      "0000000009|CLAIM#CLAIM104|LINE#1|PMT",
      "0000000009|CLAIM#CLAIM104|LINE#1|PR2",
      "0000000009|CLAIM#CLAIM106|LINE#1|PI197",
      "0000000009|CLAIM#CLAIM106|LINE#1|PMT",
    ]);
  });
});
