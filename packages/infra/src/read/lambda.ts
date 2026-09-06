import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  QueryCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";

import {
  ATTR,
  GSI1,
  RECOVERABLE_DENIAL_GSI1PK,
  claimPk,
} from "../persistence";
import type { LineItem, ProposedLineItem } from "../persistence";
import type {
  GqlDashboard,
  GqlProposedLine,
  GqlReconciledLine,
} from "./graphql";
import { toDashboard, toProposedLines, toReconciledLines } from "./resolvers";

/**
 * The AppSync read API edge (issue #26, D22): a Lambda data source answering the
 * three dashboard queries. AppSync's VTL request template invokes this with the
 * resolved field name and its arguments; this reads the stored items and hands
 * them to the pure {@link toReconciledLines}/{@link toDashboard}/{@link toProposedLines}
 * resolvers. All AWS lives here; no reconciliation happens (resolvers read only).
 *
 * Dollars at risk is served by a query on the recoverable-denial GSI, never a
 * table scan (D12): the single hero figure the dashboard leans on.
 */
const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}));

/** The AppSync VTL request template's payload: the field to resolve and its arguments. */
interface ResolverEvent {
  field: string;
  arguments: { claimControlNumber?: string };
}

function tableName(): string {
  const name = process.env.RECLAIM_TABLE_NAME;
  if (!name) {
    throw new Error("RECLAIM_TABLE_NAME is not set on the read Lambda.");
  }
  return name;
}

interface Page {
  Items?: Record<string, unknown>[];
  LastEvaluatedKey?: Record<string, unknown>;
}

// DynamoDB pages both Scan and Query, so every read walks the pages to the end,
// casting each item to the stored shape it was written as.
async function collect<T>(
  send: (start: Record<string, unknown> | undefined) => Promise<Page>,
): Promise<T[]> {
  const items: T[] = [];
  let start: Record<string, unknown> | undefined;
  do {
    const page = await send(start);
    for (const item of page.Items ?? []) {
      items.push(item as T);
    }
    start = page.LastEvaluatedKey;
  } while (start);
  return items;
}

// Demo-scale table, so listing every reconciled line is a scan filtered to the
// LINE grain. Only dollars at risk is held to the no-scan bar (D12); the
// reconciliation table reads the whole line set by design.
function scanLines(table: string): Promise<LineItem[]> {
  return collect<LineItem>((start) =>
    doc.send(
      new ScanCommand({
        TableName: table,
        FilterExpression: "#type = :line",
        ExpressionAttributeNames: { "#type": "type" },
        ExpressionAttributeValues: { ":line": "LINE" },
        ExclusiveStartKey: start,
      }),
    ),
  );
}

// The dollars-at-risk read (D12): a query on GSI1, whose single partition holds
// exactly the matched, in-balance recoverable-denial lines. Never a scan.
function queryRecoverableDenialLines(table: string): Promise<LineItem[]> {
  return collect<LineItem>((start) =>
    doc.send(
      new QueryCommand({
        TableName: table,
        IndexName: GSI1.NAME,
        KeyConditionExpression: "#gsi1pk = :denial",
        ExpressionAttributeNames: { "#gsi1pk": GSI1.PK },
        ExpressionAttributeValues: { ":denial": RECOVERABLE_DENIAL_GSI1PK },
        ExclusiveStartKey: start,
      }),
    ),
  );
}

// A claim's proposed lines: a single-partition query, filtered to the proposed
// grain so the claim's CHARGE header and reconciled lines don't come along.
function queryProposedLines(
  table: string,
  claimControlNumber: string,
): Promise<ProposedLineItem[]> {
  return collect<ProposedLineItem>((start) =>
    doc.send(
      new QueryCommand({
        TableName: table,
        KeyConditionExpression: "#pk = :pk",
        FilterExpression: "#type = :proposed",
        ExpressionAttributeNames: { "#pk": ATTR.PK, "#type": "type" },
        ExpressionAttributeValues: {
          ":pk": claimPk(claimControlNumber),
          ":proposed": "PROPOSED_LINE",
        },
        ExclusiveStartKey: start,
      }),
    ),
  );
}

export async function handler(
  event: ResolverEvent,
): Promise<GqlReconciledLine[] | GqlDashboard | GqlProposedLine[]> {
  const table = tableName();

  switch (event.field) {
    case "reconciledLines":
      return toReconciledLines(await scanLines(table));
    case "dashboard": {
      const [lines, recoverableDenialLines] = await Promise.all([
        scanLines(table),
        queryRecoverableDenialLines(table),
      ]);
      return toDashboard(lines, recoverableDenialLines);
    }
    case "proposedLines": {
      const claimControlNumber = event.arguments.claimControlNumber;
      if (!claimControlNumber) {
        throw new Error("proposedLines requires a claimControlNumber argument.");
      }
      return toProposedLines(await queryProposedLines(table, claimControlNumber));
    }
    default:
      throw new Error(`unknown query field: ${event.field}`);
  }
}
