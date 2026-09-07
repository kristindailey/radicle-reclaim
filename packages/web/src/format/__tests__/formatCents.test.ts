import { formatCents } from "../formatCents";

describe("formatCents", () => {
  it("formats zero", () => {
    expect(formatCents(0)).toBe("$0.00");
  });

  it("formats small amounts under a dollar, padding the cents", () => {
    expect(formatCents(5)).toBe("$0.05");
    expect(formatCents(99)).toBe("$0.99");
  });

  it("formats a plain amount", () => {
    expect(formatCents(12_345)).toBe("$123.45");
  });

  it("groups thousands in large amounts", () => {
    expect(formatCents(100_000_000)).toBe("$1,000,000.00");
  });

  it("keeps the sign on negative amounts", () => {
    expect(formatCents(-4_599)).toBe("-$45.99");
  });

  it("throws on a non-integer, catching a float leak at the edge (D7)", () => {
    expect(() => formatCents(12.34)).toThrow(RangeError);
  });
});
