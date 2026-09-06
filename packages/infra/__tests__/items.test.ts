import { readFileSync } from "node:fs";
import { join } from "node:path";

import { reconcile } from "core";
import type { ReconciliationResult } from "core";

import {
  CHARGE_SK,
  GSI1,
  KEY_PREFIX,
  RECOVERABLE_DENIAL_GSI1PK,
  buildItems,
} from "../src/persistence";
import type { LineItem, ProposedLineItem } from "../src/persistence";
import { FIXTURE_CHARGES } from "../src/seed/fixture-charges";

/**
 * Issue #23 (D12): the persistence contract, verified over the core's own
 * six-outcome fixture. The fixture and its seeded charges mirror the core's
 * capstone test so the item shapes are asserted against a real reconciled result,
 * not a hand-built stand-in.
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
  "utf8",
);

function build(): { result: ReconciliationResult; items: ReturnType<typeof buildItems> } {
  const result = reconcile({ charges: FIXTURE_CHARGES, raw835 });
  return { result, items: buildItems(CONTROL_NUMBER, result) };
}

describe("buildItems: DynamoDB persistence contract over the six-outcome fixture", () => {
  it("writes one CHARGE per seeded claim and none for the unmatched claim", () => {
    const { items } = build();
    const charges = items.filter((item) => item.SK === CHARGE_SK);

    expect(charges.map((item) => item.PK).sort()).toEqual([
      "CLAIM#CLAIM101",
      "CLAIM#CLAIM102",
      "CLAIM#CLAIM103",
      "CLAIM#CLAIM104",
      "CLAIM#CLAIM106",
    ]);
    expect(charges.every((item) => item.SK === "CHARGE")).toBe(true);
    expect(charges.every((item) => item.controlNumber === CONTROL_NUMBER)).toBe(
      true,
    );
    // CLAIM105 is unmatched, so it has no seeded charge to persist.
    expect(charges.some((item) => item.PK === "CLAIM#CLAIM105")).toBe(false);
  });

  it("writes one LINE item per reconciled line, keyed by claim and line number", () => {
    const { result, items } = build();
    const lines = items.filter(
      (item): item is LineItem => item.type === "LINE",
    );

    expect(lines).toHaveLength(result.lines.length);

    const clean = lines.find((item) => item.PK === "CLAIM#CLAIM101");
    expect(clean?.SK).toBe("LINE#1");
    expect(clean?.disposition).toBe("clean-payment");
    expect(clean?.billed).toBe(50_000);
    expect(clean?.paid).toBe(50_000);

    // The unmatched line is surfaced, not dropped.
    const unmatched = lines.find((item) => item.PK === "CLAIM#CLAIM105");
    expect(unmatched?.SK).toBe("LINE#1");
    expect(unmatched?.disposition).toBe("unmatched");
  });

  it("tags only the recoverable-denial line for the dollars-at-risk GSI", () => {
    const { items } = build();
    const tagged = items.filter(
      (item): item is LineItem =>
        item.type === "LINE" && item.GSI1PK !== undefined,
    );

    expect(tagged).toHaveLength(1);
    expect(tagged[0]?.PK).toBe("CLAIM#CLAIM103");
    expect(tagged[0]?.GSI1PK).toBe(RECOVERABLE_DENIAL_GSI1PK);
    expect(RECOVERABLE_DENIAL_GSI1PK).toBe("DISPOSITION#RECOVERABLE_DENIAL");
    // CLAIM106 carries a recoverable PI 197 too, but its line is out of balance,
    // so its disposition is out-of-balance and it must not reach the hero GSI.
    const outOfBalance = items.find(
      (item): item is LineItem =>
        item.type === "LINE" && item.PK === "CLAIM#CLAIM106",
    );
    expect(outOfBalance?.disposition).toBe("out-of-balance");
    expect(outOfBalance?.GSI1PK).toBeUndefined();
  });

  it("writes one proposed-line item per drafted line, keyed off the core idempotency key", () => {
    const { result, items } = build();
    const proposed = items.filter(
      (item): item is ProposedLineItem => item.type === "PROPOSED_LINE",
    );

    expect(proposed).toHaveLength(result.proposedLines.length);

    const keyOf = (item: ProposedLineItem) => `${item.PK}|${item.SK}`;
    expect(proposed.map(keyOf).sort()).toEqual(
      [
        "CLAIM#CLAIM101|PROPPMT#1",
        "CLAIM#CLAIM102|PROPADJ#1-CO45",
        "CLAIM#CLAIM102|PROPPMT#1",
        "CLAIM#CLAIM103|PROPADJ#1-PI197",
        "CLAIM#CLAIM104|PROPADJ#1-CO45",
        "CLAIM#CLAIM104|PROPADJ#1-PR2",
        "CLAIM#CLAIM104|PROPPMT#1",
        "CLAIM#CLAIM106|PROPADJ#1-PI197",
        "CLAIM#CLAIM106|PROPPMT#1",
      ].sort(),
    );

    // Every proposed item carries the core's key verbatim, the upsert mechanism.
    for (const item of proposed) {
      const source = result.proposedLines.find(
        (line) => line.idempotencyKey === item.idempotencyKey,
      );
      expect(source).toBeDefined();
    }
  });

  it("uses the documented key prefixes", () => {
    expect(KEY_PREFIX.CLAIM).toBe("CLAIM#");
    expect(KEY_PREFIX.LINE).toBe("LINE#");
    expect(KEY_PREFIX.PROPOSED_PAYMENT).toBe("PROPPMT#");
    expect(KEY_PREFIX.PROPOSED_ADJUSTMENT).toBe("PROPADJ#");
    expect(GSI1.NAME).toBe("GSI1");
    expect(GSI1.PK).toBe("GSI1PK");
  });

  it("builds byte-identical keys on a redelivery of the same 835", () => {
    const first = build().items;
    const second = build().items;

    const keys = (items: typeof first) =>
      items.map((item) => `${item.PK}|${item.SK}`);

    expect(keys(second)).toEqual(keys(first));
    // The whole item set is stable, not just the keys: a redelivered 835 upserts.
    expect(second).toEqual(first);
    // Keys are unique, so no two items of the run clobber each other on upsert.
    expect(new Set(keys(first)).size).toBe(first.length);
  });
});
