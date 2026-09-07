import type {
  ApiDashboard,
  ApiProposedLine,
  ApiReconciledLine,
  DashboardReader,
} from "./types";

/** Endpoint and API key for the AppSync read API (D22), read from the Vite env. */
export interface AppSyncConfig {
  endpoint: string;
  apiKey: string;
}

/** Reads the deployed read API's endpoint and key (infra exports `graphqlApiUrl` and `graphqlApiKey`). */
export function readAppSyncConfig(): AppSyncConfig {
  const endpoint = import.meta.env.VITE_APPSYNC_URL;
  const apiKey = import.meta.env.VITE_APPSYNC_API_KEY;
  if (!endpoint || !apiKey) {
    throw new Error(
      "Set VITE_APPSYNC_URL and VITE_APPSYNC_API_KEY to the deployed read API (infra exports graphqlApiUrl and graphqlApiKey).",
    );
  }
  return { endpoint, apiKey };
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: { message: string }[];
}

async function request<T>(
  config: AppSyncConfig,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(config.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.apiKey,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!response.ok) {
    throw new Error(`AppSync read failed: ${response.status} ${response.statusText}`);
  }
  const body = (await response.json()) as GraphQLResponse<T>;
  if (body.errors?.length) {
    throw new Error(
      `AppSync read errored: ${body.errors.map((error) => error.message).join("; ")}`,
    );
  }
  if (!body.data) {
    throw new Error("AppSync read returned no data.");
  }
  return body.data;
}

const RECONCILED_LINES = `
query ReconciledLines {
  reconciledLines {
    claimControlNumber
    lineNumber
    billed
    paid
    patientResponsibility
    disposition
    adjustments { groupCode carc carcText amount classification }
    balanceWarning
  }
}`.trim();

const DASHBOARD = `
query Dashboard {
  dashboard {
    controlNumber
    totalRemittance
    totalPaid
    totalContractual
    totalPatientResponsibility
    dollarsAtRisk
    unmatchedCount
    outOfBalanceCount
  }
}`.trim();

const PROPOSED_LINES = `
query ProposedLines($claimControlNumber: String!) {
  proposedLines(claimControlNumber: $claimControlNumber) {
    claimControlNumber
    lineNumber
    kind
    status
    amount
    groupCode
    carc
    idempotencyKey
  }
}`.trim();

/** The fetch-backed reader `main.ts` wires to the deployed API. */
export function createAppSyncReader(config: AppSyncConfig): DashboardReader {
  return {
    async reconciledLines() {
      const data = await request<{ reconciledLines: ApiReconciledLine[] }>(
        config,
        RECONCILED_LINES,
      );
      return data.reconciledLines;
    },
    async dashboard() {
      const data = await request<{ dashboard: ApiDashboard }>(config, DASHBOARD);
      return data.dashboard;
    },
    async proposedLines(claimControlNumber) {
      const data = await request<{ proposedLines: ApiProposedLine[] }>(
        config,
        PROPOSED_LINES,
        { claimControlNumber },
      );
      return data.proposedLines;
    },
  };
}
