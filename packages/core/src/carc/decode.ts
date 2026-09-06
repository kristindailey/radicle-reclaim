import carcCodes from "./carcCodes.json";

/**
 * CARC decode: a JSON lookup of the ~20 most common Claim Adjustment Reason
 * Codes (not the national ~800, D15). A code outside the lookup surfaces its raw
 * value rather than throwing (issue #1, story 19), so an unknown code never
 * breaks a run.
 */

const CARC_TABLE: Readonly<Record<string, string>> = carcCodes;

/** The result of decoding a CARC. */
export interface DecodedCarc {
  /** The raw code as it appeared on the `CAS` segment, e.g. `"197"`. */
  code: string;
  /** Plain-English text when known; the raw code itself when not. */
  text: string;
  /** Whether the code was found in the lookup. */
  known: boolean;
}

/**
 * Decodes a CARC to plain English. An unknown code returns its raw value as the
 * text with `known: false`; it does not throw.
 */
export function decodeCarc(code: string): DecodedCarc {
  const text = CARC_TABLE[code];
  return text === undefined
    ? { code, text: code, known: false }
    : { code, text, known: true };
}
