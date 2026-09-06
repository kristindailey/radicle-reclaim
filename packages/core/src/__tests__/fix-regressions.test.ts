import { readFileSync } from "node:fs";
import { join } from "node:path";

import { reconcile } from "../reconcile";
import { cents } from "../money";
import type { Charge } from "../types";

/**
 * Regressions caught in review of the six-outcome core, each driven through the
 * `reconcile` seam:
 *
 * 1. An **unmatched** line that foots and carries a recoverable CARC must not
 *    inflate dollars at risk — the system cannot place it against a seeded charge,
 *    so it drafts nothing and the hero figure excludes it (D19).
 * 2. A **claim-level** `CAS` (a reason on the claim header, not any service line)
 *    is classified, surfaced on the claim, counted in the buckets, and drafted as
 *    a worksheet Adjustment — not silently consumed by the balancer alone (D2).
 * 3. Two reasons with the **same group and CARC** on one line draft two distinct
 *    idempotency keys, so a redelivery upserts both instead of clobbering one (D12).
 *
 * CLAIM999 is not seeded (unmatched); every other claim is. Header-only claims
 * (CLAIM041, CLAIM042) carry no `SVC`, so their `CAS` is claim-level.
 */

const raw835 = readFileSync(
  join(__dirname, "fixtures", "fix-regressions.835.edi"),
  "utf8",
);

const seededCharges: Charge[] = [
  {
    claimControlNumber: "CLAIM040",
    lines: [{ lineNumber: 1, billed: cents(40_000), procedureCode: "99213" }],
  },
  { claimControlNumber: "CLAIM041", lines: [] },
  { claimControlNumber: "CLAIM042", lines: [] },
  {
    claimControlNumber: "CLAIMDUP",
    lines: [{ lineNumber: 1, billed: cents(50_000), procedureCode: "99213" }],
  },
];

function run() {
  return reconcile({ charges: seededCharges, raw835 });
}

describe("reconcile: unmatched line does not inflate dollars at risk", () => {
  it("surfaces the unmatched line's recoverable reason but keeps it out of the hero", () => {
    const result = run();

    const line = result.lines.find((l) => l.claimControlNumber === "CLAIM999");
    expect(line?.disposition).toBe("unmatched");
    // The reason is still classified and surfaced on the row...
    expect(line?.adjustments[0]?.classification).toBe("recoverable-denial");
    // ...but a claim the system cannot place is not money it can pursue: excluded.
    // Only CLAIM042's claim-level PI 197 (30_000) counts, not CLAIM999's 25_000.
    expect(result.aggregates.dollarsAtRisk).toBe(30_000);
  });

  it("drafts no proposed line for the unmatched claim", () => {
    const result = run();

    const drafted = result.proposedLines.filter(
      (p) => p.claimControlNumber === "CLAIM999",
    );
    expect(drafted).toHaveLength(0);
  });
});

describe("reconcile: claim-level CAS is classified, aggregated, and proposed", () => {
  it("surfaces claim-level adjustments on the claim, not just the balancer", () => {
    const result = run();

    const contractual = result.claims.find(
      (c) => c.claimControlNumber === "CLAIM041",
    );
    expect(contractual?.adjustments).toHaveLength(1);
    expect(contractual?.adjustments[0]).toMatchObject({
      groupCode: "CO",
      carc: "45",
      amount: 5_000,
      classification: "contractual",
    });
    expect(contractual?.balanceWarning).toBeUndefined();
  });

  it("counts claim-level dollars in the right buckets", () => {
    const result = run();

    // Contractual: CLAIM041's claim-level CO 45 (5_000) + CLAIMDUP's two line CO 45
    // (6_000 + 4_000). At risk: CLAIM042's claim-level PI 197 (30_000).
    expect(result.aggregates.totalContractual).toBe(15_000);
    expect(result.aggregates.dollarsAtRisk).toBe(30_000);
  });

  it("drafts a worksheet Adjustment per claim-level reason, keyed on the sentinel line", () => {
    const result = run();

    const denial = result.proposedLines.find(
      (p) => p.claimControlNumber === "CLAIM042" && p.kind === "adjustment",
    );
    expect(denial?.amount).toBe(30_000);
    expect(denial?.status).toBe("pending-review");
    // LINE#0 marks a claim-level adjustment: no service line to anchor to.
    expect(denial?.idempotencyKey).toBe(
      "0000000040|CLAIM#CLAIM042|LINE#0|PI197",
    );
  });
});

describe("reconcile: duplicate CAS reason on one line keys uniquely", () => {
  it("drafts two distinct keys for two CO 45 reasons so neither clobbers the other", () => {
    const result = run();

    const adjustments = result.proposedLines.filter(
      (p) => p.kind === "adjustment" && p.claimControlNumber === "CLAIMDUP",
    );
    expect(adjustments).toHaveLength(2);

    const keys = adjustments.map((a) => a.idempotencyKey).sort();
    expect(keys).toEqual([
      "0000000040|CLAIM#CLAIMDUP|LINE#1|CO45#1",
      "0000000040|CLAIM#CLAIMDUP|LINE#1|CO45#2",
    ]);
    expect(new Set(keys).size).toBe(2);

    // Both amounts survive, distinct, summing to the line's contractual write-down.
    const amounts = adjustments.map((a) => a.amount).sort((x, y) => x - y);
    expect(amounts).toEqual([4_000, 6_000]);
  });

  it("keeps the keys stable across two runs of the same 835", () => {
    const first = run().proposedLines.map((p) => p.idempotencyKey).sort();
    const second = run().proposedLines.map((p) => p.idempotencyKey).sort();
    expect(second).toEqual(first);
  });
});
