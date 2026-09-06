import { reconcile } from "../reconcile";
import { ZERO_CENTS } from "../money";

describe("reconcile seam (scaffold)", () => {
  it("is callable and returns the zeroed ReconciliationResult shape on empty input", () => {
    const result = reconcile({ charges: [], raw835: "" });

    expect(result.claims).toEqual([]);
    expect(result.lines).toEqual([]);
    expect(result.proposedLines).toEqual([]);
    expect(result.aggregates).toEqual({
      totalRemittance: ZERO_CENTS,
      totalPaid: ZERO_CENTS,
      totalContractual: ZERO_CENTS,
      totalPatientResponsibility: ZERO_CENTS,
      dollarsAtRisk: ZERO_CENTS,
      unmatchedCount: 0,
      outOfBalanceCount: 0,
    });
  });
});
