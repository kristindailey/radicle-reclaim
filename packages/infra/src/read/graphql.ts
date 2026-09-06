/**
 * The read API's GraphQL contract (issue #26, D22): the SDL AppSync serves and
 * the TypeScript result shapes the resolver Lambda returns, kept in one file so
 * the schema and the code that answers it cannot drift.
 *
 * Domain values that carry hyphens (dispositions like `recoverable-denial`,
 * classifications like `patient-responsibility`) stay `String`, not GraphQL enums,
 * so the stored value reaches the dashboard verbatim. Money is `Int` cents (D12).
 */

/** One classified `CAS` reason, group code plus decoded CARC (the dashboard's adjustment cell). */
export interface GqlAdjustment {
  groupCode: string;
  carc: string;
  carcText: string;
  amount: number;
  classification: string;
}

/** One reconciled service line with its disposition and decoded adjustments. */
export interface GqlReconciledLine {
  claimControlNumber: string;
  lineNumber: number;
  billed: number;
  paid: number;
  patientResponsibility: number;
  disposition: string;
  adjustments: GqlAdjustment[];
  balanceWarning: string | null;
}

/** A drafted Payment or Adjustment, pending review; a denial clicks into this. */
export interface GqlProposedLine {
  claimControlNumber: string;
  lineNumber: number;
  kind: string;
  status: string;
  amount: number;
  groupCode: string | null;
  carc: string | null;
  idempotencyKey: string;
}

/** The dashboard stat-tile figures (D13), all money in integer cents. */
export interface GqlDashboard {
  totalRemittance: number;
  totalPaid: number;
  totalContractual: number;
  totalPatientResponsibility: number;
  dollarsAtRisk: number;
  unmatchedCount: number;
  outOfBalanceCount: number;
}

/** The SDL AppSync serves. Three queries, matching the dashboard's read needs. */
export const GRAPHQL_SCHEMA = `
type Adjustment {
  groupCode: String!
  carc: String!
  carcText: String!
  amount: Int!
  classification: String!
}

type ReconciledLine {
  claimControlNumber: String!
  lineNumber: Int!
  billed: Int!
  paid: Int!
  patientResponsibility: Int!
  disposition: String!
  adjustments: [Adjustment!]!
  balanceWarning: String
}

type ProposedLine {
  claimControlNumber: String!
  lineNumber: Int!
  kind: String!
  status: String!
  amount: Int!
  groupCode: String
  carc: String
  idempotencyKey: String!
}

type Dashboard {
  totalRemittance: Int!
  totalPaid: Int!
  totalContractual: Int!
  totalPatientResponsibility: Int!
  dollarsAtRisk: Int!
  unmatchedCount: Int!
  outOfBalanceCount: Int!
}

type Query {
  reconciledLines: [ReconciledLine!]!
  dashboard: Dashboard!
  proposedLines(claimControlNumber: String!): [ProposedLine!]!
}
`.trim();
