import type { ReconciliationResult } from "core";

import { buildSixOutcomeResult } from "../../fixtures/six-outcomes";
import { useTopDenialReasons } from "../../reasons/useTopDenialReasons";
import { useReconciliationTable } from "../../table/useReconciliationTable";
import { useStatTiles } from "../../tiles/useStatTiles";
import { loadReconciliationResult } from "../loadReconciliationResult";
import type { ApiProposedLine, ApiReconciledLine, DashboardReader } from "../types";

/**
 * A reader over what the deployed API would serve for the six-outcome remittance,
 * built from live `reconcile()` output: lines and dashboard from the store, proposed
 * lines filtered per claim, with the wire's `null` in the optional slots the core
 * leaves absent. Assembling from this proves the client hands the sections the same
 * shape as the fixture, so nothing downstream changed (issue #33).
 */
function readerFor(result: ReconciliationResult): DashboardReader {
  const reconciledLines: ApiReconciledLine[] = result.lines.map((line) => ({
    claimControlNumber: line.claimControlNumber,
    lineNumber: line.lineNumber,
    billed: line.billed,
    paid: line.paid,
    patientResponsibility: line.patientResponsibility,
    disposition: line.disposition,
    adjustments: line.adjustments.map((adjustment) => ({ ...adjustment })),
    balanceWarning: line.balanceWarning ?? null,
  }));

  return {
    reconciledLines: async () => reconciledLines,
    dashboard: async () => ({ ...result.aggregates }),
    proposedLines: async (claimControlNumber) =>
      result.proposedLines
        .filter((line) => line.claimControlNumber === claimControlNumber)
        .map(
          (line): ApiProposedLine => ({
            claimControlNumber: line.claimControlNumber,
            lineNumber: line.lineNumber,
            kind: line.kind,
            status: line.status,
            amount: line.amount,
            groupCode: line.groupCode ?? null,
            carc: line.carc ?? null,
            idempotencyKey: line.idempotencyKey,
          }),
        ),
  };
}

const byKey = (a: { idempotencyKey: string }, b: { idempotencyKey: string }) =>
  a.idempotencyKey.localeCompare(b.idempotencyKey);

describe("loadReconciliationResult", () => {
  const fixture = buildSixOutcomeResult();

  it("assembles the lines and aggregates the read queries serve", async () => {
    const result = await loadReconciliationResult(readerFor(fixture));

    expect(result.lines).toEqual(fixture.lines);
    expect(result.aggregates).toEqual(fixture.aggregates);
  });

  it("restores the optional balanceWarning the wire sends as null", async () => {
    const result = await loadReconciliationResult(readerFor(fixture));

    const outOfBalance = result.lines.find((line) => line.disposition === "out-of-balance");
    const clean = result.lines.find((line) => line.disposition === "clean-payment");

    expect(outOfBalance?.balanceWarning).toBeDefined();
    expect(clean?.balanceWarning).toBeUndefined();
  });

  it("gathers proposed lines across every distinct claim", async () => {
    const result = await loadReconciliationResult(readerFor(fixture));

    expect([...result.proposedLines].sort(byKey)).toEqual(
      [...fixture.proposedLines].sort(byKey),
    );
  });

  it("reads only: it carries no claim rollup or control number the API does not serve", async () => {
    const result = await loadReconciliationResult(readerFor(fixture));

    expect(result.claims).toEqual([]);
    expect(result.controlNumber).toBe("");
  });

  it("feeds the sections output identical to the fixture, so no composable changes", async () => {
    const result = await loadReconciliationResult(readerFor(fixture));

    expect(useStatTiles(result).value).toEqual(useStatTiles(fixture).value);
    expect(useReconciliationTable(result).value).toEqual(
      useReconciliationTable(fixture).value,
    );
    expect(useTopDenialReasons(result).value).toEqual(
      useTopDenialReasons(fixture).value,
    );
  });
});
