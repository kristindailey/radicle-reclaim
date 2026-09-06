import { cents } from "core";

import { CHARGE_SK, claimPk } from "../src/persistence";
import { FIXTURE_CHARGES } from "../src/seed/fixture-charges";
import { chargeFromItem, seededChargeItem } from "../src/seed/charge-item";

/**
 * Issue #24 (D20): the seed maps the fixture charges to `CHARGE` items and back.
 * The live DynamoDB write and read are the untested edge (parent #20 testing
 * decisions); this asserts the pure mapping the round-trip rests on.
 */
describe("seed charge items: the round-trip the fixture 835 matches against", () => {
  it("keys each charge on its claim partition under the CHARGE sort key", () => {
    const item = seededChargeItem(FIXTURE_CHARGES[0]!);

    expect(item.PK).toBe(claimPk("CLAIM101"));
    expect(item.SK).toBe(CHARGE_SK);
    expect(item.type).toBe("CHARGE");
    expect(item.claimControlNumber).toBe("CLAIM101");
  });

  it("stores the billed lines so the charge reads back as it was seeded", () => {
    for (const charge of FIXTURE_CHARGES) {
      expect(chargeFromItem(seededChargeItem(charge))).toEqual(charge);
    }
  });

  it("re-brands the read-back amount as Cents, throwing on a corrupted item", () => {
    const item = seededChargeItem(FIXTURE_CHARGES[0]!);
    const corrupted = {
      ...item,
      lines: [{ ...item.lines[0]!, billed: 100.5 as ReturnType<typeof cents> }],
    };

    expect(() => chargeFromItem(corrupted)).toThrow();
  });

  it("builds a byte-identical item on a reseed", () => {
    const charge = FIXTURE_CHARGES[2]!;
    expect(seededChargeItem(charge)).toEqual(seededChargeItem(charge));
  });
});
