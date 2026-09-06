import { buildSixOutcomeResult } from "../six-outcomes";
import generated from "../six-outcomes.result.json";

describe("six-outcome fixture harness", () => {
  it("reconciles the fixture through the core, not a hand-built result", () => {
    const result = buildSixOutcomeResult();

    const dispositionOf = (claim: string) =>
      result.lines.find((l) => l.claimControlNumber === claim)?.disposition;

    expect(dispositionOf("CLAIM101")).toBe("clean-payment");
    expect(dispositionOf("CLAIM102")).toBe("contractual-adjustment");
    expect(dispositionOf("CLAIM103")).toBe("recoverable-denial");
    expect(dispositionOf("CLAIM104")).toBe("contractual-adjustment");
    expect(dispositionOf("CLAIM105")).toBe("unmatched");
    expect(dispositionOf("CLAIM106")).toBe("out-of-balance");
  });

  it("carries the aggregates the dashboard tiles read", () => {
    const result = buildSixOutcomeResult();

    expect(result.aggregates).toEqual({
      totalRemittance: 165_000,
      totalPaid: 110_000,
      totalContractual: 8_000,
      totalPatientResponsibility: 2_000,
      dollarsAtRisk: 25_000,
      unmatchedCount: 1,
      outOfBalanceCount: 1,
    });
  });

  it("keeps the generated app fixture in lockstep with live reconcile output", () => {
    // The browser reads six-outcomes.result.json (it never runs the engine). This
    // guards that checked-in data against drift from the core: regenerate it if
    // this fails.
    expect(generated).toEqual(JSON.parse(JSON.stringify(buildSixOutcomeResult())));
  });
});
