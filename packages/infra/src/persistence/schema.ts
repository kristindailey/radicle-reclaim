import type {
  Cents,
  ClassifiedAdjustment,
  Disposition,
  GroupCode,
  ProposedLineKind,
  ProposedLineStatus,
} from "core";

/**
 * The single-table schema (D12): one table holds every grain of a reconciled
 * 835, partitioned by claim. These constants keep the key shapes in one place
 * for later infra tickets (the Lambda writer, the AppSync resolvers) to read.
 */

/** `SK` prefixes, one per item grain. `CHARGE` is a fixed sort key, not a prefix. */
export const KEY_PREFIX = {
  CLAIM: "CLAIM#",
  LINE: "LINE#",
  PROPOSED_PAYMENT: "PROPPMT#",
  PROPOSED_ADJUSTMENT: "PROPADJ#",
} as const;

/** The claim header's sort key. */
export const CHARGE_SK = "CHARGE";

/**
 * The dollars-at-risk index (D12): recoverable-denial lines carry a single
 * partition value so the hero figure is served by a query, never a table scan.
 */
export const GSI1 = {
  NAME: "GSI1",
  PK: "GSI1PK",
} as const;

/** The one `GSI1PK` value written today: the recoverable-denial partition. */
export const RECOVERABLE_DENIAL_GSI1PK = "DISPOSITION#RECOVERABLE_DENIAL";

/** The item-type discriminator carried by every item. */
export type ItemType = "CHARGE" | "LINE" | "PROPOSED_LINE";

interface BaseItem {
  /** `CLAIM#<claimControlNumber>`. */
  PK: string;
  SK: string;
  type: ItemType;
  /** The 835 control number that wrote this item (the reassociation trace, D12). */
  controlNumber: string;
  claimControlNumber: string;
}

/** The claim header, one per seeded (matched) claim. */
export interface ChargeItem extends BaseItem {
  type: "CHARGE";
  SK: typeof CHARGE_SK;
  payerControlNumber?: string;
}

/** One reconciled service line, the primary grain. */
export interface LineItem extends BaseItem {
  type: "LINE";
  lineNumber: number;
  billed: Cents;
  paid: Cents;
  patientResponsibility: Cents;
  disposition: Disposition;
  adjustments: ClassifiedAdjustment[];
  balanceWarning?: string;
  /** Present only on recoverable-denial lines; the dollars-at-risk index. */
  GSI1PK?: typeof RECOVERABLE_DENIAL_GSI1PK;
}

/** A drafted Payment or Adjustment, pending review. */
export interface ProposedLineItem extends BaseItem {
  type: "PROPOSED_LINE";
  kind: ProposedLineKind;
  status: ProposedLineStatus;
  lineNumber: number;
  amount: Cents;
  /** The core's key verbatim (D12): the value that makes a redelivery upsert. */
  idempotencyKey: string;
  groupCode?: GroupCode | "unknown";
  carc?: string;
}

export type Item = ChargeItem | LineItem | ProposedLineItem;

/** `PK` for a claim's partition. */
export function claimPk(claimControlNumber: string): string {
  return `${KEY_PREFIX.CLAIM}${claimControlNumber}`;
}
