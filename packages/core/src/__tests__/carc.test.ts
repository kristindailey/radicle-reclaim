import { decodeCarc } from "../carc/decode";

describe("decodeCarc (scaffold)", () => {
  it("decodes a known code to plain English", () => {
    const decoded = decodeCarc("197");
    expect(decoded).toEqual({
      code: "197",
      text: "Precertification/authorization/notification/pre-treatment absent",
      known: true,
    });
  });

  it("surfaces an unknown code's raw value without throwing", () => {
    const decoded = decodeCarc("B13");
    expect(decoded).toEqual({ code: "B13", text: "B13", known: false });
  });
});
