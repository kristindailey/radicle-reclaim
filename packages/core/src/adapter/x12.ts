import { X12parser, type FormattedSegment } from "x12-parser";

import { dollarsToCents, ZERO_CENTS, type Cents } from "../money";
import type { GroupCode } from "../types";

/**
 * The parser adapter boundary (D11, D21). `x12-parser` handles X12 lexing; this
 * core owns the mapping from raw segments into the typed 835 graph below,
 * because the claim-loop-vs-line-loop `CAS` disambiguation is domain logic, not
 * boilerplate.
 */

/** A `CAS` adjustment on the raw 835 graph, before classification. */
export interface ParsedAdjustment {
  groupCode: GroupCode | "unknown";
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
  /**
   * The reassociation trace number (`TRN02`), the remittance-wide EFT/check
   * trace that identifies this 835. Serves as the "835 control number" component
   * of a proposed line's idempotency key (D12): stable across a redelivery of the
   * same remittance, and higher-entropy than the per-transaction `ST02`.
   */
  traceNumber: string;
  /**
   * The transaction's total actual payment amount (`BPR02`), integer cents. The
   * whole-file total the balancer ties to the sum of claim payments (D6).
   */
  transactionPaid: Cents;
  claims: ParsedClaim[];
}

/**
 * The 835 loop-mapper seam (D11): raw lexed segments to the typed 835 graph,
 * disambiguating the claim-loop `CAS` from the line-loop `CAS`. The core owns
 * this mapping.
 */
export type LoopMapper = (segments: FormattedSegment[]) => Parsed835;

/** Constructs the `x12-parser` lexing stream the loop-mapper consumes. */
export function createParser(): X12parser {
  return new X12parser();
}

/** A `CAS` segment carries up to six repetitions of (CARC, amount[, quantity]). */
const CAS_REPETITIONS = 6;
/** Elements per `CAS` repetition: CARC, amount, quantity. */
const CAS_STRIDE = 3;

/** The closed set of X12 `CAS` adjustment group codes (D4). */
const GROUP_CODES: ReadonlySet<string> = new Set<GroupCode>([
  "CO",
  "PR",
  "PI",
  "OA",
]);

/**
 * Maps a `CAS01` group code into the {@link GroupCode} union. The four codes are
 * a closed set in valid X12, but payers do send junk, and one malformed CAS01
 * must not abort a whole batch remittance. An unrecognized code becomes
 * "unknown" so the adjustment survives (its amount still foots the balance
 * identity, D6) for the classifier to handle in a later ticket.
 */
function toGroupCode(raw: string | undefined): GroupCode | "unknown" {
  if (raw !== undefined && GROUP_CODES.has(raw)) {
    return raw as GroupCode;
  }
  return "unknown";
}

/**
 * Lexes a raw X12 835 into its flat segment stream. `x12-parser` is a Node
 * Transform; feeding it the whole payload and draining the readable side runs
 * synchronously here (its transform calls back synchronously), so the seam stays
 * a plain function with no I/O. Empty input yields no segments, and the trailing
 * empty segment a terminating newline produces is dropped.
 *
 * A Buffer is decoded as `latin1`, not `ascii`: `ascii` masks the high bit and
 * silently corrupts any byte above 0x7F (an accented character in a name field,
 * a stray BOM), whereas `latin1` round-trips every byte 1:1 so nothing is mangled
 * at the boundary.
 */
export function lex835(raw: Buffer | string): FormattedSegment[] {
  const text = typeof raw === "string" ? raw : raw.toString("latin1");
  if (text.trim() === "") {
    return [];
  }

  const parser = createParser();
  let failure: Error | undefined;
  parser.on("error", (error: Error) => {
    failure = error;
  });

  parser.write(text);
  parser.end();

  const segments: FormattedSegment[] = [];
  let segment: FormattedSegment | null;
  while ((segment = parser.read() as FormattedSegment | null) !== null) {
    if (segment.name) {
      segments.push(segment);
    }
  }

  if (failure) {
    throw failure;
  }
  return segments;
}

/** Reads the `CAS` repetitions off one `CAS` segment into typed adjustments. */
function readCasAdjustments(segment: FormattedSegment): ParsedAdjustment[] {
  const groupCode = toGroupCode(segment["1"]);
  const adjustments: ParsedAdjustment[] = [];

  for (let repetition = 0; repetition < CAS_REPETITIONS; repetition++) {
    const base = repetition * CAS_STRIDE;
    const carc = segment[`${base + 2}`];
    const amount = segment[`${base + 3}`];
    if (!carc) {
      continue;
    }
    adjustments.push({ groupCode, carc, amount: dollarsToCents(amount ?? "") });
  }

  return adjustments;
}

/**
 * Maps the flat 835 segment stream into the typed graph, tracking loop context:
 * a `CLP` opens a claim loop, an `SVC` opens a service-line loop within it, and
 * a `CAS` attaches to whichever loop is currently open, the claim-vs-line
 * disambiguation (D2, D11). `TRN02` carries the reassociation trace number.
 */
export const mapLoops: LoopMapper = (segments) => {
  let traceNumber = "";
  let transactionPaid: Cents = ZERO_CENTS;
  const claims: ParsedClaim[] = [];
  let claim: ParsedClaim | undefined;
  let line: ParsedLine | undefined;

  for (const segment of segments) {
    switch (segment.name) {
      case "BPR": {
        transactionPaid = dollarsToCents(segment["2"] ?? "");
        break;
      }
      case "TRN": {
        traceNumber = segment["2"] ?? "";
        break;
      }
      case "CLP": {
        line = undefined;
        claim = {
          claimControlNumber: segment["1"] ?? "",
          payerControlNumber: segment["7"] || undefined,
          billed: dollarsToCents(segment["3"] ?? ""),
          paid: dollarsToCents(segment["4"] ?? ""),
          patientResponsibility: dollarsToCents(segment["5"] ?? ""),
          adjustments: [],
          lines: [],
        };
        claims.push(claim);
        break;
      }
      case "SVC": {
        if (!claim) {
          break;
        }
        line = {
          lineNumber: claim.lines.length + 1,
          billed: dollarsToCents(segment["2"] ?? ""),
          paid: dollarsToCents(segment["3"] ?? ""),
          adjustments: [],
        };
        claim.lines.push(line);
        break;
      }
      case "CAS": {
        const target = line ?? claim;
        if (target) {
          target.adjustments.push(...readCasAdjustments(segment));
        }
        break;
      }
      default:
        break;
    }
  }

  return { traceNumber, transactionPaid, claims };
};
