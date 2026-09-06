import type { ParsedAdjustment } from "../adapter/x12";
import { decodeCarc } from "../carc/decode";
import type {
  AdjustmentClassification,
  ClassifiedAdjustment,
  GroupCode,
} from "../types";

type ParsedGroupCode = GroupCode | "unknown";

/**
 * Actionable adjustment groups (D4): the payer-side groups that carry money a
 * provider can pursue. `CO` (contractual write-down) and `PR` (patient
 * responsibility) are never actionable; a recoverable denial lives in `PI` or
 * `OA`. A malformed group ("unknown") is not trusted as actionable.
 */
const ACTIONABLE_GROUPS: ReadonlySet<ParsedGroupCode> = new Set<GroupCode>([
  "PI",
  "OA",
]);

/**
 * Actionable CARCs (D4): reason codes a provider can fix and resubmit or appeal,
 * such as 197. This is a deliberately narrower set than the decoded CARCs (D15),
 * because decoding a code to plain English is a separate concern from judging it
 * pursuable.
 */
const ACTIONABLE_CARCS: ReadonlySet<string> = new Set<string>(["197"]);

/**
 * The classifier (D4): each `CAS` reason is classified on its own, group code
 * first. `PR` is patient responsibility, straight off the group. A reason is a
 * recoverable denial only when it lands in an actionable group *and* carries an
 * actionable CARC; everything else (a `CO` write-down, a non-actionable reason in
 * an actionable group, a malformed group) is a non-recoverable contractual
 * adjustment, kept out of dollars at risk.
 */
function classify(
  groupCode: ParsedGroupCode,
  carc: string,
): AdjustmentClassification {
  if (groupCode === "PR") {
    return "patient-responsibility";
  }
  if (ACTIONABLE_GROUPS.has(groupCode) && ACTIONABLE_CARCS.has(carc)) {
    return "recoverable-denial";
  }
  return "contractual";
}

/**
 * Classifies one parsed `CAS` reason, decoding its CARC to plain English. An
 * unknown CARC surfaces its raw code rather than throwing (issue #1, story 19).
 */
export function classifyAdjustment(
  adjustment: ParsedAdjustment,
): ClassifiedAdjustment {
  return {
    groupCode: adjustment.groupCode,
    carc: adjustment.carc,
    carcText: decodeCarc(adjustment.carc).text,
    amount: adjustment.amount,
    classification: classify(adjustment.groupCode, adjustment.carc),
  };
}
