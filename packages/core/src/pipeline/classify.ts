import type { ParsedAdjustment } from "../adapter/x12";
import { decodeCarc } from "../carc/decode";
import type {
  AdjustmentClassification,
  ClassifiedAdjustment,
  GroupCode,
} from "../types";

type ParsedGroupCode = GroupCode | "unknown";

/**
 * The classifier (D4): each `CAS` reason is classified on its own, group code
 * first. `CO` is a contractual write-down and `PR` is patient responsibility;
 * both fall out of the group code alone. The remaining groups carry the
 * recoverable-denial candidates, refined by CARC actionability in a later ticket.
 */
function classify(groupCode: ParsedGroupCode): AdjustmentClassification {
  switch (groupCode) {
    case "CO":
      return "contractual";
    case "PR":
      return "patient-responsibility";
    default:
      return "recoverable-denial";
  }
}

/**
 * Classifies one parsed `CAS` reason, decoding its CARC to plain English. An
 * unknown CARC surfaces its raw code rather than throwing (issue #1, story 19).
 * The four X12 group codes are the only ones a valid 835 carries; a malformed
 * `CAS01` arrives here as "unknown" and classifies as a recoverable-denial
 * candidate for a later ticket to refine.
 */
export function classifyAdjustment(
  adjustment: ParsedAdjustment,
): ClassifiedAdjustment {
  return {
    groupCode: adjustment.groupCode,
    carc: adjustment.carc,
    carcText: decodeCarc(adjustment.carc).text,
    amount: adjustment.amount,
    classification: classify(adjustment.groupCode),
  };
}
