import { readFileSync } from "node:fs";
import { join } from "node:path";

import { handleIngest } from "../src/ingest/handler";
import { FIXTURE_CHARGES } from "../src/seed/fixture-charges";

// Issue #25: the pure ingest handler over the six-outcome fixture buffer. The
// live S3 read and DynamoDB write are the untested edge (parent #20 decisions).
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

describe("handleIngest: the pure core the ingest Lambda wraps", () => {
  it("reconciles the fixture 835 buffer against the seeded charges", () => {
    const { result } = handleIngest(raw835, FIXTURE_CHARGES);

    const dispositionOf = (claim: string) =>
      result.lines.find((line) => line.claimControlNumber === claim)
        ?.disposition;

    expect(dispositionOf("CLAIM101")).toBe("clean-payment");
    expect(dispositionOf("CLAIM103")).toBe("recoverable-denial");
    expect(dispositionOf("CLAIM105")).toBe("unmatched");
    expect(dispositionOf("CLAIM106")).toBe("out-of-balance");
  });

  it("surfaces the 835 control number the persistence edge keys on", () => {
    const { result } = handleIngest(raw835, FIXTURE_CHARGES);

    expect(result.controlNumber).toBe("0000000009");
  });

  it("returns the structured-log figures the Lambda emits, without recomputing", () => {
    const { result, logFigures } = handleIngest(raw835, FIXTURE_CHARGES);

    expect(logFigures).toEqual({
      linesReconciled: 6,
      dollarsAtRisk: 25_000,
      outOfBalanceCount: 1,
    });
    // logFigures is the core's own, lifted through untouched: the edge adds only
    // the duration a pure core has no clock to measure.
    expect(logFigures).toBe(result.logFigures);
  });
});
