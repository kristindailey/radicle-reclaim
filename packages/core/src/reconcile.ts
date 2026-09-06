import { lex835, mapLoops } from "./adapter/x12";
import type { ParsedClaim, ParsedLine } from "./adapter/x12";
import { ZERO_CENTS } from "./money";
import { aggregate } from "./pipeline/aggregate";
import { checkBalance } from "./pipeline/balance";
import { classifyAdjustment } from "./pipeline/classify";
import { disposeLine } from "./pipeline/disposition";
import { indexCharges, isMatched } from "./pipeline/match";
import { proposeAdjustment, proposePayment } from "./pipeline/propose";
import type {
  ProposedLine,
  ReconcileInput,
  ReconciledClaim,
  ReconciledLine,
  ReconciliationResult,
} from "./types";

/**
 * The single reconcile seam (issue #1). Takes seeded charges plus a raw 835 and
 * returns the whole typed result in one call, with no I/O, so the ingest Lambda
 * is a thin wrapper and the tests need no AWS.
 *
 * The pipeline is threaded end to end (issue #3): lex the 835, map its loops to
 * the typed graph, then at the service-line grain match each line to a seeded
 * charge, check that it foots, disposition it, and draft its proposed Payment,
 * rolling lines up to claims and summing the dashboard aggregates.
 */
function reconcileLine(
  parsedClaim: ParsedClaim,
  parsedLine: ParsedLine,
  matched: boolean,
): ReconciledLine {
  const balance = checkBalance(parsedLine);
  const adjustments = parsedLine.adjustments.map(classifyAdjustment);
  const disposition = disposeLine({
    matched,
    balances: balance.balances,
    adjustments,
  });

  return {
    claimControlNumber: parsedClaim.claimControlNumber,
    lineNumber: parsedLine.lineNumber,
    billed: parsedLine.billed,
    paid: parsedLine.paid,
    // Populating the patient-responsibility bucket lands with the PR ticket.
    patientResponsibility: ZERO_CENTS,
    adjustments,
    disposition,
    ...(balance.warning ? { balanceWarning: balance.warning } : {}),
  };
}

/**
 * A worksheet Payment is drafted only for a line that both matched a seeded
 * charge and foots. An unmatched or out-of-balance line has nothing to post, so
 * proposing a payment keyed to it would put a bad line in front of a reviewer.
 */
function shouldProposePayment(line: ReconciledLine): boolean {
  return (
    line.paid > 0 &&
    line.disposition !== "unmatched" &&
    line.disposition !== "out-of-balance"
  );
}

/**
 * A worksheet Adjustment is drafted for each classified `CAS` reason on a line
 * that placed and foots. An unmatched or out-of-balance line has nothing to
 * post, so its adjustments are surfaced on the row but not drafted for review.
 */
function shouldProposeAdjustments(line: ReconciledLine): boolean {
  return (
    line.disposition !== "unmatched" && line.disposition !== "out-of-balance"
  );
}

export function reconcile(input: ReconcileInput): ReconciliationResult {
  const parsed = mapLoops(lex835(input.raw835));
  const seeded = indexCharges(input.charges);

  const claims: ReconciledClaim[] = [];
  const lines: ReconciledLine[] = [];
  const proposedLines: ProposedLine[] = [];

  for (const parsedClaim of parsed.claims) {
    const matched = isMatched(seeded, parsedClaim.claimControlNumber);
    const claimLines: ReconciledLine[] = [];

    for (const parsedLine of parsedClaim.lines) {
      const line = reconcileLine(parsedClaim, parsedLine, matched);
      claimLines.push(line);
      lines.push(line);

      if (shouldProposePayment(line)) {
        proposedLines.push(
          proposePayment({
            traceNumber: parsed.traceNumber,
            claimControlNumber: parsedClaim.claimControlNumber,
            lineNumber: parsedLine.lineNumber,
            amount: parsedLine.paid,
          }),
        );
      }

      if (shouldProposeAdjustments(line)) {
        for (const adjustment of line.adjustments) {
          proposedLines.push(
            proposeAdjustment({
              traceNumber: parsed.traceNumber,
              claimControlNumber: parsedClaim.claimControlNumber,
              lineNumber: parsedLine.lineNumber,
              adjustment,
            }),
          );
        }
      }
    }

    claims.push({
      claimControlNumber: parsedClaim.claimControlNumber,
      ...(parsedClaim.payerControlNumber
        ? { payerControlNumber: parsedClaim.payerControlNumber }
        : {}),
      lines: claimLines,
    });
  }

  return { claims, lines, proposedLines, aggregates: aggregate(lines) };
}
