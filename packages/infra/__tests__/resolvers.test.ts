import { readFileSync } from "node:fs";
import { join } from "node:path";

import { reconcile } from "core";
import type { ReconciliationResult } from "core";

import { buildItems } from "../src/persistence";
import type { LineItem, ProposedLineItem } from "../src/persistence";
import {
  toDashboard,
  toProposedLines,
  toReconciledLines,
} from "../src/read/resolvers";
import { FIXTURE_CHARGES } from "../src/seed/fixture-charges";

/**
 * Issue #26 (D22): the read API's pure resolvers, verified over the core's own
 * six-outcome fixture. The resolvers read stored items only (no reconciliation),
 * so the strongest check is that, fed the items the ingest Lambda persisted, they
 * reproduce the core's own aggregates, lines, and proposed lines. The live
 * AppSync/DynamoDB edge is the untested wrapper (parent #20 decisions).
 */
const CONTROL_NUMBER = "0000000009";

const raw835 = readFileSync(
  join(
    __dirname,
    "..",
    "..",
    "core",
    "src",
    "__tests__",
    "fixtures",
    "six-outcomes.835.edi",
  ),
);

function reconciled(): {
  result: ReconciliationResult;
  lineItems: LineItem[];
  recoverableDenialItems: LineItem[];
  proposedItems: ProposedLineItem[];
} {
  const result = reconcile({ charges: FIXTURE_CHARGES, raw835 });
  const items = buildItems(CONTROL_NUMBER, result);
  const lineItems = items.filter(
    (item): item is LineItem => item.type === "LINE",
  );
  return {
    result,
    lineItems,
    // The GSI query the dashboard's dollars-at-risk read stands on: only the
    // recoverable-denial lines carry the tag.
    recoverableDenialItems: lineItems.filter(
      (item) => item.GSI1PK !== undefined,
    ),
    proposedItems: items.filter(
      (item): item is ProposedLineItem => item.type === "PROPOSED_LINE",
    ),
  };
}

describe("toReconciledLines: stored lines with dispositions and decoded adjustments", () => {
  it("maps every stored line, preserving disposition and balance warning", () => {
    const { result, lineItems } = reconciled();
    const lines = toReconciledLines(lineItems);

    expect(lines).toHaveLength(result.lines.length);

    const byClaim = (claim: string) =>
      lines.find((line) => line.claimControlNumber === claim);

    expect(byClaim("CLAIM101")?.disposition).toBe("clean-payment");
    expect(byClaim("CLAIM105")?.disposition).toBe("unmatched");

    const outOfBalance = byClaim("CLAIM106");
    expect(outOfBalance?.disposition).toBe("out-of-balance");
    expect(outOfBalance?.balanceWarning).toEqual(expect.any(String));
    // A line that foots reports no warning as null, not undefined, so the field
    // is a real GraphQL value.
    expect(byClaim("CLAIM101")?.balanceWarning).toBeNull();
  });

  it("carries the decoded adjustment: group code plus decoded CARC", () => {
    const { lineItems } = reconciled();
    const lines = toReconciledLines(lineItems);

    const denial = lines.find((line) => line.claimControlNumber === "CLAIM103");
    const adjustment = denial?.adjustments[0];

    expect(adjustment?.groupCode).toBe("PI");
    expect(adjustment?.carc).toBe("197");
    expect(adjustment?.classification).toBe("recoverable-denial");
    // Decoded at reconcile time and stored; the resolver reads it, never decodes.
    expect(adjustment?.carcText).not.toBe("197");
    expect(adjustment?.carcText.length).toBeGreaterThan(0);
  });
});

describe("toProposedLines: the drafted lines a denial clicks into", () => {
  it("returns a claim's proposed payment and adjustment lines", () => {
    const { proposedItems } = reconciled();
    const forClaim = proposedItems.filter(
      (item) => item.claimControlNumber === "CLAIM104",
    );
    const proposed = toProposedLines(forClaim);

    expect(proposed).toHaveLength(3);
    const kinds = proposed.map((line) => line.kind).sort();
    expect(kinds).toEqual(["adjustment", "adjustment", "payment"]);

    const adjustment = proposed.find(
      (line) => line.kind === "adjustment" && line.groupCode === "PR",
    );
    expect(adjustment?.carc).toBe("2");
    expect(adjustment?.status).toBe("pending-review");

    const payment = proposed.find((line) => line.kind === "payment");
    // A payment carries no group code or CARC; those surface as null in GraphQL.
    expect(payment?.groupCode).toBeNull();
    expect(payment?.carc).toBeNull();
  });
});

describe("toDashboard: the stat-tile figures, dollars at risk off the GSI", () => {
  it("reproduces the core's aggregates from the stored items", () => {
    const { result, lineItems, recoverableDenialItems } = reconciled();
    const dashboard = toDashboard(lineItems, recoverableDenialItems);

    // Every fixture CAS sits under an SVC (line grain), so the read side's
    // line-only sums equal the core's aggregate; a header-level reason, which the
    // store does not persist (#23), is out of this fixture's and this ticket's scope.
    const { aggregates } = result;
    expect(dashboard).toEqual({
      totalRemittance: aggregates.totalRemittance,
      totalPaid: aggregates.totalPaid,
      totalContractual: aggregates.totalContractual,
      totalPatientResponsibility: aggregates.totalPatientResponsibility,
      dollarsAtRisk: aggregates.dollarsAtRisk,
      unmatchedCount: aggregates.unmatchedCount,
      outOfBalanceCount: aggregates.outOfBalanceCount,
    });
    expect(dashboard.dollarsAtRisk).toBe(25_000);
  });

  it("draws dollars at risk only from the GSI input, never the full-line scan", () => {
    const { lineItems } = reconciled();
    // Same lines, but the recoverable-denial GSI query returned nothing: the hero
    // figure must fall to zero while every scan-derived figure holds. This is the
    // D12 guarantee: dollars at risk is served off the GSI, not a table scan.
    const dashboard = toDashboard(lineItems, []);

    expect(dashboard.dollarsAtRisk).toBe(0);
    expect(dashboard.totalRemittance).toBeGreaterThan(0);
    expect(dashboard.outOfBalanceCount).toBe(1);
  });
});
