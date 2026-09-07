import type { ReconciledLine, ReconciliationResult } from "core";

import { buildSixOutcomeResult } from "../../fixtures/six-outcomes";
import { formatCents } from "../../format/formatCents";
import { useReconciliationTable, type TableRow } from "../useReconciliationTable";

describe("useReconciliationTable", () => {
  // Reconcile the six-outcome fixture through the core, then assert the rows the
  // composable derives read straight off `result.lines` (STANDARDS: the web layer
  // formats the result for display, it never re-reconciles).
  const result = buildSixOutcomeResult();
  const rows = useReconciliationTable(() => result).value;
  const row = (claim: string) => rows.find((r) => r.claimControlNumber === claim) as TableRow;

  it("derives one row per reconciled line, in line order", () => {
    expect(rows).toHaveLength(result.lines.length);
    expect(rows.map((r) => r.key)).toEqual(result.lines.map((l) => `${l.claimControlNumber}-${l.lineNumber}`));
  });

  it("carries the identifiers and money display-ready (D7)", () => {
    const clean = row("CLAIM101");
    expect(clean.claimControlNumber).toBe("CLAIM101");
    expect(clean.lineNumber).toBe(1);
    expect(clean.billed).toBe(formatCents(50_000));
    expect(clean.paid).toBe(formatCents(50_000));
  });

  it("decodes each adjustment to group code and plain-English CARC (D4)", () => {
    const adjustment = row("CLAIM102").adjustments[0];
    expect(adjustment?.groupCode).toBe("CO");
    expect(adjustment?.carc).toBe("45");
    expect(adjustment?.carcText).toContain("fee schedule");
    expect(adjustment?.amount).toBe(formatCents(5_000));
  });

  it("exercises every disposition the fixture carries (six outcomes, D17)", () => {
    expect(row("CLAIM101").disposition.disposition).toBe("clean-payment");
    expect(row("CLAIM102").disposition.disposition).toBe("contractual-adjustment");
    expect(row("CLAIM103").disposition.disposition).toBe("recoverable-denial");
    expect(row("CLAIM104").disposition.disposition).toBe("contractual-adjustment");
    expect(row("CLAIM105").disposition.disposition).toBe("unmatched");
    expect(row("CLAIM106").disposition.disposition).toBe("out-of-balance");
  });

  it("gives the risk and out-of-balance outcomes a distinct tone and a label", () => {
    expect(row("CLAIM103").disposition).toMatchObject({ tone: "risk", label: "Recoverable denial" });
    expect(row("CLAIM106").disposition).toMatchObject({ tone: "warning", label: "Out of balance" });
    expect(row("CLAIM101").disposition).toMatchObject({ tone: "clean", label: "Clean payment" });
  });

  it("shows a split line as one disposition over its several adjustments (D17)", () => {
    const split = row("CLAIM104");
    expect(split.adjustments.map((a) => a.groupCode)).toEqual(["CO", "PR"]);
    expect(split.disposition.disposition).toBe("contractual-adjustment");
  });

  it("surfaces the balance warning only on the out-of-balance line (D6)", () => {
    expect(row("CLAIM106").balanceWarning).toBeDefined();
    expect(row("CLAIM101").balanceWarning).toBeUndefined();
  });

  it("reveals a clean line's proposed Payment, pending review (D5)", () => {
    const clean = row("CLAIM101").proposedLines;
    expect(clean).toHaveLength(1);
    expect(clean[0]).toMatchObject({
      kind: "payment",
      kindLabel: "Payment",
      statusLabel: "Pending review",
      amount: formatCents(50_000),
    });
    // A Payment carries no group code or CARC.
    expect(clean[0]?.groupCode).toBeUndefined();
    expect(clean[0]?.carc).toBeUndefined();
  });

  it("reveals a recoverable-denial line's proposed Adjustment with group code and CARC (D14)", () => {
    const denial = row("CLAIM103");
    expect(denial.disposition.disposition).toBe("recoverable-denial");
    expect(denial.proposedLines).toHaveLength(1);
    expect(denial.proposedLines[0]).toMatchObject({
      kind: "adjustment",
      kindLabel: "Adjustment",
      statusLabel: "Pending review",
      amount: formatCents(25_000),
      groupCode: "PI",
      carc: "197",
    });
  });

  it("reveals a split line's Payment and both Adjustments (D8-4)", () => {
    const split = row("CLAIM104").proposedLines;
    expect(split.map((p) => p.kind)).toEqual(["payment", "adjustment", "adjustment"]);
    expect(split.map((p) => p.groupCode)).toEqual([undefined, "CO", "PR"]);
  });

  it("keys each proposed-line row on its idempotency key, and reads them off the result (STANDARDS)", () => {
    const keys = rows.flatMap((r) => r.proposedLines.map((p) => p.idempotencyKey));
    expect(keys).toEqual(result.proposedLines.map((p) => p.idempotencyKey));
  });

  it("leaves the unmatched line with no proposed lines", () => {
    expect(row("CLAIM105").proposedLines).toEqual([]);
  });

  it("labels the other-adjustment disposition the fixture does not carry", () => {
    // The sixth disposition value has no fixture line; feed a synthetic one so the
    // composable's badge map is proven exhaustive over the union.
    const otherLine: ReconciledLine = {
      claimControlNumber: "CLAIM900",
      lineNumber: 1,
      billed: 1_000 as ReconciledLine["billed"],
      paid: 900 as ReconciledLine["paid"],
      patientResponsibility: 0 as ReconciledLine["patientResponsibility"],
      adjustments: [],
      disposition: "other-adjustment",
    };
    const synthetic: ReconciliationResult = { ...result, lines: [otherLine] };
    const only = useReconciliationTable(() => synthetic).value[0];
    expect(only?.disposition).toMatchObject({
      disposition: "other-adjustment",
      label: "Other adjustment",
      tone: "neutral",
    });
  });
});
