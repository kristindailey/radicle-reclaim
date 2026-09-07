import { computed, toValue, type ComputedRef, type MaybeRefOrGetter } from "vue";

import type {
  Disposition,
  ProposedLine,
  ProposedLineKind,
  ProposedLineStatus,
  ReconciliationResult,
} from "core";

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

/**
 * One drafted worksheet line turned display-ready: what would post for a line,
 * shown in its pending-review state before a human approves it (D5).
 */
export interface ProposedLineRow {
  /** Deterministic idempotency key, reused as the stable render key (D12). */
  idempotencyKey: string;
  /** The machine kind, so styling and tests key off the union, not the label. */
  kind: ProposedLineKind;
  /** Display label for the record type: "Payment" or "Adjustment". */
  kindLabel: string;
  /** The status, spelled for display (D5). */
  statusLabel: string;
  /** Amount through `formatCents` (D7). */
  amount: string;
  /** `CAS` group code, on adjustment lines only (D4). */
  groupCode?: string;
  /** Raw CARC, on adjustment lines only (D4). */
  carc?: string;
}

/** Human-readable labels for the proposed-line record types (Fiscal Periods model, D5). */
const KIND_LABEL: Record<ProposedLineKind, string> = {
  payment: "Payment",
  adjustment: "Adjustment",
};

/** Display label per status, read off `line.status` so the result stays the source (D5). */
const STATUS_LABEL: Record<ProposedLineStatus, string> = {
  "pending-review": "Pending review",
};

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
  /**
   * The drafted worksheet lines for this service line, revealed on click in a
   * pending-review state (D5). Read straight off `result.proposedLines`; nothing
   * is recomputed (STANDARDS). Empty for a line the proposer drafted nothing for,
   * e.g. an unmatched line.
   */
  proposedLines: ProposedLineRow[];
}

/** Groups the result's flat proposed lines by their service line's row key (D2). */
function groupProposedLinesByRow(proposedLines: ProposedLine[]): Map<string, ProposedLineRow[]> {
  const byRow = new Map<string, ProposedLineRow[]>();
  for (const line of proposedLines) {
    const key = `${line.claimControlNumber}-${line.lineNumber}`;
    const rows = byRow.get(key) ?? [];
    rows.push({
      idempotencyKey: line.idempotencyKey,
      kind: line.kind,
      kindLabel: KIND_LABEL[line.kind],
      statusLabel: STATUS_LABEL[line.status],
      amount: formatCents(line.amount),
      groupCode: line.groupCode,
      carc: line.carc,
    });
    byRow.set(key, rows);
  }
  return byRow;
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
  return computed(() => {
    const resolved = toValue(result);
    const proposedByRow = groupProposedLinesByRow(resolved.proposedLines);
    return resolved.lines.map((line) => {
      const key = `${line.claimControlNumber}-${line.lineNumber}`;
      return {
        key,
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
        proposedLines: proposedByRow.get(key) ?? [],
      };
    });
  });
}
