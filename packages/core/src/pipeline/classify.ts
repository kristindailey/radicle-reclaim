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
 * first. `CO` is a contractual write-down and `PR` is patient responsibility,
 * both straight off the group. A reason is a recoverable denial only when it
 * lands in an actionable group *and* carries an actionable CARC. Anything left (a
 * non-actionable reason in an actionable group, or a malformed group) is `other`:
 * a payer-side adjustment that is neither contractual nor pursuable.
 */
function classify(
  groupCode: ParsedGroupCode,
  carc: string,
): AdjustmentClassification {
  if (groupCode === "CO") {
    return "contractual";
  }
  if (groupCode === "PR") {
    return "patient-responsibility";
  }
  if (ACTIONABLE_GROUPS.has(groupCode) && ACTIONABLE_CARCS.has(carc)) {
    return "recoverable-denial";
  }
  return "other";
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

/** Sums the amounts of the classified adjustments in one bucket, in raw cents. */
export function sumClassified(
  adjustments: ClassifiedAdjustment[],
  classification: AdjustmentClassification,
): number {
  return adjustments
    .filter((adj) => adj.classification === classification)
    .reduce((total, adj) => total + adj.amount, 0);
}
