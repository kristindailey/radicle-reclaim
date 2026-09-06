import { lex835, mapLoops } from "./adapter/x12";
import { ZERO_CENTS } from "./money";
import { aggregate } from "./pipeline/aggregate";
import { checkBalance } from "./pipeline/balance";
import { disposeLine } from "./pipeline/disposition";
import { indexCharges, isMatched } from "./pipeline/match";
import { proposePayment } from "./pipeline/propose";
import type {
  ProposedLine,
  ReconcileInput,
  ReconciledClaim,
  ReconciledLine,
  ReconciliationResult,
} from "./types";

/**
 * The single reconcile seam (issue #1). Takes seeded charges plus a raw 835 and
 * returns the whole typed result in one call, with no I/O — the ingest Lambda is
 * a thin wrapper and the tests need no AWS.
 *
 * The pipeline is threaded end to end (issue #3): lex the 835, map its loops to
 * the typed graph, then at the service-line grain match each line to a seeded
 * charge, check that it foots, disposition it, and draft its proposed Payment —
 * rolling lines up to claims and summing the dashboard aggregates.
 */
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
      const balance = checkBalance(parsedLine);
      const disposition = disposeLine({ matched, balances: balance.balances });

      const line: ReconciledLine = {
        claimControlNumber: parsedClaim.claimControlNumber,
        lineNumber: parsedLine.lineNumber,
        billed: parsedLine.billed,
        paid: parsedLine.paid,
        patientResponsibility: ZERO_CENTS,
        // Per-`CAS` classification into ClassifiedAdjustment lands with the
        // classifier in a later ticket; a clean line carries no adjustments.
        adjustments: [],
        disposition,
        ...(balance.warning ? { balanceWarning: balance.warning } : {}),
      };

      claimLines.push(line);
      lines.push(line);

      if (parsedLine.paid > 0) {
        proposedLines.push(
          proposePayment({
            traceNumber: parsed.traceNumber,
            claimControlNumber: parsedClaim.claimControlNumber,
            lineNumber: parsedLine.lineNumber,
            amount: parsedLine.paid,
          }),
        );
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
