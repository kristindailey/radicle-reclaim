import { cents } from "core";
import type { ReconciledLine, ReconciliationResult } from "core";

import { buildSixOutcomeResult } from "../../fixtures/six-outcomes";
import { formatCents } from "../../format/formatCents";
import { useTopDenialReasons } from "../useTopDenialReasons";

describe("useTopDenialReasons", () => {
  // Reconcile the six-outcome fixture through the core, then assert the ranked list
  // the composable derives reads straight off `result.lines` (STANDARDS).
  const result = buildSixOutcomeResult();
  const reasons = useTopDenialReasons(() => result).value;

  it("ranks each recoverable-denial CARC once, decoded and money display-ready (D7)", () => {
    // The fixture's only at-risk recoverable denial is CLAIM103's PI 197 at $250.
    expect(reasons).toHaveLength(1);
    expect(reasons[0]).toMatchObject({
      carc: "197",
      amountCents: 25_000,
      dollars: formatCents(25_000),
    });
    expect(reasons[0]?.carcText).toContain("authorization");
  });

  it("excludes the out-of-balance line's recoverable denial, tying to dollars at risk (D19)", () => {
    // CLAIM106 also carries a PI 197 recoverable denial, but its line is out of
    // balance, so it must not inflate the ranked total above the hero figure.
    const total = reasons.reduce((sum, reason) => sum + reason.amountCents, 0);
    expect(total).toBe(result.aggregates.dollarsAtRisk);
    expect(total).toBe(25_000);
  });

  it("orders the list by dollars descending, CARC ascending on ties", () => {
    // Synthesise a result with several recoverable CARCs to prove the ordering; the
    // fixture carries only one at-risk denial.
    const line = (carc: string, amount: number): ReconciledLine => ({
      claimControlNumber: `CLAIM-${carc}`,
      lineNumber: 1,
      billed: cents(amount),
      paid: cents(0),
      patientResponsibility: cents(0),
      adjustments: [
        {
          groupCode: "PI",
          carc,
          carcText: `reason ${carc}`,
          amount: cents(amount),
          classification: "recoverable-denial",
        },
      ],
      disposition: "recoverable-denial",
    });
    const synthetic: ReconciliationResult = {
      ...result,
      claims: [],
      lines: [line("50", 3_000), line("197", 9_000), line("16", 3_000)],
    };
    const ranked = useTopDenialReasons(() => synthetic).value;
    // 197 leads on dollars; 16 precedes 50 on the CARC tie-break at $30.
    expect(ranked.map((r) => r.carc)).toEqual(["197", "16", "50"]);
    expect(ranked.map((r) => r.amountCents)).toEqual([9_000, 3_000, 3_000]);
  });

  it("sums repeated CARCs across lines into one ranked entry", () => {
    const line = (claim: string, amount: number): ReconciledLine => ({
      claimControlNumber: claim,
      lineNumber: 1,
      billed: cents(amount),
      paid: cents(0),
      patientResponsibility: cents(0),
      adjustments: [
        {
          groupCode: "PI",
          carc: "197",
          carcText: "auth missing",
          amount: cents(amount),
          classification: "recoverable-denial",
        },
      ],
      disposition: "recoverable-denial",
    });
    const synthetic: ReconciliationResult = {
      ...result,
      claims: [],
      lines: [line("CLAIM-A", 5_000), line("CLAIM-B", 7_000)],
    };
    const ranked = useTopDenialReasons(() => synthetic).value;
    expect(ranked).toHaveLength(1);
    expect(ranked[0]).toMatchObject({ carc: "197", amountCents: 12_000 });
  });

  it("is empty when no line carries a recoverable denial", () => {
    const synthetic: ReconciliationResult = { ...result, claims: [], lines: [] };
    expect(useTopDenialReasons(() => synthetic).value).toEqual([]);
  });
});
