import { X12parser, type FormattedSegment } from "x12-parser";

import type { Cents } from "../money";
import type { GroupCode } from "../types";

/**
 * The parser adapter boundary (D11, D21). `x12-parser` handles X12 lexing; this
 * core owns the mapping from raw segments into the typed 835 graph below,
 * because the claim-loop-vs-line-loop `CAS` disambiguation is domain logic, not
 * boilerplate.
 *
 * Scaffold only (issue #2): this file stands up the boundary and its types so
 * the shim type-checks. The {@link LoopMapper} implementation — the actual
 * segment-to-graph mapping — lands in ticket 3. No mapping logic here yet.
 */

/** A `CAS` adjustment on the raw 835 graph, before classification. */
export interface ParsedAdjustment {
  groupCode: GroupCode;
  /** Raw CARC. */
  carc: string;
  /** Adjusted amount, integer cents. */
  amount: Cents;
}

/** A parsed 835 service line (`SVC` + line-level `CAS`). */
export interface ParsedLine {
  lineNumber: number;
  billed: Cents;
  paid: Cents;
  adjustments: ParsedAdjustment[];
}

/** A parsed 835 claim (`CLP` + claim-level `CAS`), with its service lines. */
export interface ParsedClaim {
  /** Claim control number, `CLP01`. */
  claimControlNumber: string;
  /** Payer's own control number, `CLP07`. */
  payerControlNumber?: string;
  billed: Cents;
  paid: Cents;
  patientResponsibility: Cents;
  /** Claim-level `CAS` adjustments. */
  adjustments: ParsedAdjustment[];
  lines: ParsedLine[];
}

/** The typed 835 graph the loop-mapper produces from raw segments. */
export interface Parsed835 {
  /** The 835 transaction control number (`ST02`). */
  transactionControlNumber: string;
  claims: ParsedClaim[];
}

/**
 * The 835 loop-mapper seam (D11): raw lexed segments to the typed 835 graph,
 * disambiguating the claim-loop `CAS` from the line-loop `CAS`. The core owns
 * this mapping; ticket 3 implements it.
 */
export type LoopMapper = (segments: FormattedSegment[]) => Parsed835;

/** Constructs the `x12-parser` lexing stream the loop-mapper consumes. */
export function createParser(): X12parser {
  return new X12parser();
}
