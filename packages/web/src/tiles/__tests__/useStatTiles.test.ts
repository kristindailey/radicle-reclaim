import { buildSixOutcomeResult } from "../../fixtures/six-outcomes";
import { formatCents } from "../../format/formatCents";
import { useStatTiles } from "../useStatTiles";

describe("useStatTiles", () => {
  // Reconcile the six-outcome fixture through the core, then assert the tiles the
  // composable derives read straight off its `Aggregates` (STANDARDS: the web
  // layer reads the result, it never recomputes the figures).
  const result = buildSixOutcomeResult();
  const a = result.aggregates;
  const tiles = useStatTiles(() => result).value;
  const tile = (key: string) => tiles.find((t) => t.key === key);

  it("derives exactly the seven tiles", () => {
    expect(tiles.map((t) => t.key)).toEqual([
      "dollarsAtRisk",
      "totalRemittance",
      "totalPaid",
      "totalContractual",
      "totalPatientResponsibility",
      "unmatchedCount",
      "outOfBalanceCount",
    ]);
  });

  it("makes dollars at risk the one hero, formatted through formatCents (D13)", () => {
    const heroes = tiles.filter((t) => t.hero);
    expect(heroes).toHaveLength(1);
    expect(heroes[0]?.key).toBe("dollarsAtRisk");
    expect(heroes[0]?.value).toBe(formatCents(a.dollarsAtRisk));
  });

  it("formats the four money tiles through formatCents", () => {
    expect(tile("totalRemittance")?.value).toBe(formatCents(a.totalRemittance));
    expect(tile("totalPaid")?.value).toBe(formatCents(a.totalPaid));
    expect(tile("totalContractual")?.value).toBe(formatCents(a.totalContractual));
    expect(tile("totalPatientResponsibility")?.value).toBe(
      formatCents(a.totalPatientResponsibility),
    );
  });

  it("holds patient responsibility distinct from contractual and dollars at risk (D18)", () => {
    const pr = tile("totalPatientResponsibility");
    expect(pr?.value).toBe(formatCents(a.totalPatientResponsibility));
    expect(pr?.value).not.toBe(tile("totalContractual")?.value);
    expect(pr?.value).not.toBe(tile("dollarsAtRisk")?.value);
  });

  it("renders the two counts as plain integers, not dollars", () => {
    expect(tile("unmatchedCount")?.value).toBe(String(a.unmatchedCount));
    expect(tile("outOfBalanceCount")?.value).toBe(String(a.outOfBalanceCount));
  });
});
