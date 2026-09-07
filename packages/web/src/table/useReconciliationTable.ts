import { computed, toValue, type ComputedRef, type MaybeRefOrGetter } from "vue";

import type { Disposition, ReconciliationResult } from "core";

import { formatCents } from "../format/formatCents";

/** One decoded `CAS` reason ready to render: one entry per group-and-reason (D5). */
export interface AdjustmentRow {
  /** `CAS` group code, or `"unknown"` for a code outside the closed X12 set (D4). */
  groupCode: string;
  carc: string;
  /** CARC decoded to plain English (`ClassifiedAdjustment.carcText`). */
  carcText: string;
  /** Adjusted amount through `formatCents` (D7). */
  amount: string;
}

/** Display label and tone for a line's headline disposition badge (D17). */
export interface DispositionBadge {
  /** The machine disposition, so styling and tests key off the union, not the label. */
  disposition: Disposition;
  label: string;
  tone: "risk" | "warning" | "neutral" | "clean";
}

/** One reconciliation-table row: a reconciled service line turned display-ready. */
export interface TableRow {
  /** Stable row key: claim control number plus line number. */
  key: string;
  claimControlNumber: string;
  lineNumber: number;
  /** Billed amount through `formatCents` (D7). */
  billed: string;
  /** Paid amount through `formatCents` (D7). */
  paid: string;
  adjustments: AdjustmentRow[];
  disposition: DispositionBadge;
  /** Present only when the line's amounts do not foot (D6). */
  balanceWarning?: string;
}

/** Exhaustive over the union, so a new disposition is a compile error until it earns a badge (D17). */
const DISPOSITION_META: Record<Disposition, { label: string; tone: DispositionBadge["tone"] }> = {
  unmatched: { label: "Unmatched", tone: "warning" },
  "out-of-balance": { label: "Out of balance", tone: "warning" },
  "recoverable-denial": { label: "Recoverable denial", tone: "risk" },
  "contractual-adjustment": { label: "Contractual adjustment", tone: "neutral" },
  "other-adjustment": { label: "Other adjustment", tone: "neutral" },
  "clean-payment": { label: "Clean payment", tone: "clean" },
};

/**
 * Derives the reconciliation table's rows from `result.lines` (D2), one per
 * service line. The web layer only formats the result for display; it never
 * reconciles (STANDARDS). A split line (D8-4) shows one headline disposition over
 * its several adjustments (D17).
 */
export function useReconciliationTable(
  result: MaybeRefOrGetter<ReconciliationResult>,
): ComputedRef<TableRow[]> {
  return computed(() =>
    toValue(result).lines.map((line) => ({
      key: `${line.claimControlNumber}-${line.lineNumber}`,
      claimControlNumber: line.claimControlNumber,
      lineNumber: line.lineNumber,
      billed: formatCents(line.billed),
      paid: formatCents(line.paid),
      adjustments: line.adjustments.map((adjustment) => ({
        groupCode: adjustment.groupCode,
        carc: adjustment.carc,
        carcText: adjustment.carcText,
        amount: formatCents(adjustment.amount),
      })),
      disposition: {
        disposition: line.disposition,
        ...DISPOSITION_META[line.disposition],
      },
      balanceWarning: line.balanceWarning,
    })),
  );
}
