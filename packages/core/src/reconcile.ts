import { lex835, mapLoops } from "./adapter/x12";
import type { ParsedClaim, ParsedLine } from "./adapter/x12";
import { cents } from "./money";
import { aggregate } from "./pipeline/aggregate";
import {
  checkClaimBalance,
  checkLineBalance,
  checkTransactionBalance,
} from "./pipeline/balance";
import { classifyAdjustment, sumClassified } from "./pipeline/classify";
import { disposeLine } from "./pipeline/disposition";
import { indexCharges, isMatched } from "./pipeline/match";
import {
  CLAIM_LEVEL_LINE,
  proposeAdjustment,
  proposePayment,
  reasonTokens,
} from "./pipeline/propose";
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
  const balance = checkLineBalance(parsedLine);
  const adjustments = parsedLine.adjustments.map(classifyAdjustment);
  const disposition = disposeLine({
    matched,
    balances: balance.balances,
    adjustments,
  });

  // The line's patient-responsibility bucket is the sum of its `PR` reasons (D18),
  // read off the per-reason classifications so it never folds in a `CO` write-down.
  const patientResponsibility = cents(
    sumClassified(adjustments, "patient-responsibility"),
  );

  return {
    claimControlNumber: parsedClaim.claimControlNumber,
    lineNumber: parsedLine.lineNumber,
    billed: parsedLine.billed,
    paid: parsedLine.paid,
    patientResponsibility,
    adjustments,
    disposition,
    ...(balance.warning ? { balanceWarning: balance.warning } : {}),
  };
}

/**
 * A worksheet Payment is drafted for any matched line with a paid amount. An
 * unmatched line has no seeded charge to post against, so it drafts nothing. An
 * out-of-balance line still drafts, so the row is populated for review (D19); its
 * balance warning is what flags it, not a missing draft.
 */
function shouldProposePayment(line: ReconciledLine): boolean {
  return line.paid > 0 && line.disposition !== "unmatched";
}

/**
 * A worksheet Adjustment is drafted for each classified `CAS` reason on a matched
 * line, an out-of-balance one included (D19). An unmatched line has nothing to
 * post, so its adjustments are surfaced on the row but not drafted.
 */
function shouldProposeAdjustments(line: ReconciledLine): boolean {
  return line.disposition !== "unmatched";
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
        const tokens = reasonTokens(line.adjustments);
        line.adjustments.forEach((adjustment, index) => {
          proposedLines.push(
            proposeAdjustment({
              traceNumber: parsed.traceNumber,
              claimControlNumber: parsedClaim.claimControlNumber,
              lineNumber: parsedLine.lineNumber,
              adjustment,
              reasonToken: tokens[index],
            }),
          );
        });
      }
    }

    // Claim-level `CAS` (D2): reasons carried on the claim header, not any one
    // service line, classified like a line's. A matched claim drafts an Adjustment
    // for each, keyed on the claim-level sentinel line; an unmatched claim surfaces
    // them on the claim but drafts nothing (mirrors an unmatched line).
    const claimAdjustments = parsedClaim.adjustments.map(classifyAdjustment);
    if (matched) {
      const tokens = reasonTokens(claimAdjustments);
      claimAdjustments.forEach((adjustment, index) => {
        proposedLines.push(
          proposeAdjustment({
            traceNumber: parsed.traceNumber,
            claimControlNumber: parsedClaim.claimControlNumber,
            lineNumber: CLAIM_LEVEL_LINE,
            adjustment,
            reasonToken: tokens[index],
          }),
        );
      });
    }

    const claimBalance = checkClaimBalance(parsedClaim);
    claims.push({
      claimControlNumber: parsedClaim.claimControlNumber,
      ...(parsedClaim.payerControlNumber
        ? { payerControlNumber: parsedClaim.payerControlNumber }
        : {}),
      matched,
      lines: claimLines,
      adjustments: claimAdjustments,
      ...(claimBalance.warning ? { balanceWarning: claimBalance.warning } : {}),
    });
  }

  const transactionBalance = checkTransactionBalance(
    parsed.transactionPaid,
    parsed.claims,
  );

  const aggregates = aggregate(claims);

  return {
    controlNumber: parsed.traceNumber,
    claims,
    lines,
    proposedLines,
    aggregates,
    transactionBalance,
    logFigures: {
      linesReconciled: lines.length,
      dollarsAtRisk: aggregates.dollarsAtRisk,
      outOfBalanceCount: aggregates.outOfBalanceCount,
    },
  };
}
