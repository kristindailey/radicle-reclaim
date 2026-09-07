/**
 * The AppSync read API's response shapes (issue #26 SDL), typed at the web boundary
 * (STANDARDS). They differ from the core's result shapes in what the wire can carry:
 * money is a plain `Int`, the hyphenated domain unions arrive as `String`, and a
 * nullable field arrives as `null` where the core leaves it absent.
 */

export interface ApiAdjustment {
  groupCode: string;
  carc: string;
  carcText: string;
  amount: number;
  classification: string;
}

export interface ApiReconciledLine {
  claimControlNumber: string;
  lineNumber: number;
  billed: number;
  paid: number;
  patientResponsibility: number;
  disposition: string;
  adjustments: ApiAdjustment[];
  balanceWarning: string | null;
}

export interface ApiProposedLine {
  claimControlNumber: string;
  lineNumber: number;
  kind: string;
  status: string;
  amount: number;
  groupCode: string | null;
  carc: string | null;
  idempotencyKey: string;
}

export interface ApiDashboard {
  controlNumber: string;
  totalRemittance: number;
  totalPaid: number;
  totalContractual: number;
  totalPatientResponsibility: number;
  dollarsAtRisk: number;
  unmatchedCount: number;
  outOfBalanceCount: number;
}

/** The three read queries the dashboard needs, one method each. */
export interface DashboardReader {
  reconciledLines(): Promise<ApiReconciledLine[]>;
  dashboard(): Promise<ApiDashboard>;
  proposedLines(claimControlNumber: string): Promise<ApiProposedLine[]>;
}
