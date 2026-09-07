import { computed, toValue, type ComputedRef, type MaybeRefOrGetter } from "vue";

import type { Aggregates, ReconciliationResult } from "core";

import { formatCents } from "../format/formatCents";

/**
 * One stat tile ready to render: the composable has already turned the core's
 * `Aggregates` figure into a display string, so the component stays thin.
 */
export interface StatTile {
  /** The `Aggregates` field this tile shows, so the tie to the core is type-checked. */
  key: keyof Aggregates;
  label: string;
  /** Display-ready value: money through `formatCents` (D7), counts as plain integers. */
  value: string;
  /** Dollars at risk is the one hero figure (D13). */
  hero: boolean;
}

/**
 * Derives the seven dashboard stat tiles from a result's `Aggregates` (D13). The
 * web layer reads the figures the core already computed; it never re-sums them
 * (STANDARDS). Dollars at risk leads as the hero, patient responsibility stays its
 * own tile distinct from contractual adjustments and from dollars at risk (D18),
 * and the two disposition counts render as plain integers rather than money.
 */
export function useStatTiles(
  result: MaybeRefOrGetter<ReconciliationResult>,
): ComputedRef<StatTile[]> {
  return computed(() => {
    const a = toValue(result).aggregates;
    return [
      {
        key: "dollarsAtRisk",
        label: "Dollars at risk",
        value: formatCents(a.dollarsAtRisk),
        hero: true,
      },
      {
        key: "totalRemittance",
        label: "Total remittance",
        value: formatCents(a.totalRemittance),
        hero: false,
      },
      {
        key: "totalPaid",
        label: "Total paid",
        value: formatCents(a.totalPaid),
        hero: false,
      },
      {
        key: "totalContractual",
        label: "Contractual adjustments",
        value: formatCents(a.totalContractual),
        hero: false,
      },
      {
        key: "totalPatientResponsibility",
        label: "Patient responsibility",
        value: formatCents(a.totalPatientResponsibility),
        hero: false,
      },
      {
        key: "unmatchedCount",
        label: "Unmatched lines",
        value: String(a.unmatchedCount),
        hero: false,
      },
      {
        key: "outOfBalanceCount",
        label: "Out of balance",
        value: String(a.outOfBalanceCount),
        hero: false,
      },
    ];
  });
}
