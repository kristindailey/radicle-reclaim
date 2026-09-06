import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  BatchWriteCommand,
  DynamoDBDocumentClient,
  ScanCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import type {
  BatchWriteCommandInput,
  BatchWriteCommandOutput,
} from "@aws-sdk/lib-dynamodb";
import type { Charge } from "core";

import { buildItems } from "../persistence";
import type { ChargeItem, Item } from "../persistence";
import { ATTR, CHARGE_SK } from "../persistence";
import { chargeFromItem } from "../seed/charge-item";
import type { SeededChargeItem } from "../seed/charge-item";
import { handleIngest } from "./handler";

/**
 * The ingest Lambda edge (issue #25): an `ObjectCreated` on the ingest bucket
 * lands here. It reads the 835 into a buffer, loads the seeded charges from the
 * store, runs the pure {@link handleIngest} core, persists the result via the
 * {@link buildItems} contract, and emits one structured JSON log line per run
 * (D15). All AWS lives here; the domain path is the pure core it wraps.
 */
const s3 = new S3Client({});
const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}));

/** DynamoDB caps a `BatchWriteItem` at 25 requests. */
const BATCH_LIMIT = 25;

interface S3EventRecord {
  s3: { bucket: { name: string }; object: { key: string } };
}
interface S3Event {
  Records: S3EventRecord[];
}

function tableName(): string {
  const name = process.env.RECLAIM_TABLE_NAME;
  if (!name) {
    throw new Error("RECLAIM_TABLE_NAME is not set on the ingest Lambda.");
  }
  return name;
}

async function readObject(bucket: string, key: string): Promise<Buffer> {
  const { Body } = await s3.send(
    new GetObjectCommand({ Bucket: bucket, Key: decodeURIComponent(key) }),
  );
  if (!Body) {
    throw new Error(`empty S3 object body: ${bucket}/${key}`);
  }
  return Buffer.from(await Body.transformToByteArray());
}

// The Lambda cannot know which claims an 835 touches until the core reconciles
// it, so it loads every seeded charge up front. Demo-scale table, so a scan is
// fine; the round-trip through `chargeFromItem` re-brands each billed amount.
async function loadCharges(table: string): Promise<Charge[]> {
  const charges: Charge[] = [];
  let start: Record<string, unknown> | undefined;
  do {
    const page = await doc.send(
      new ScanCommand({
        TableName: table,
        FilterExpression: "#sk = :charge",
        ExpressionAttributeNames: { "#sk": ATTR.SK },
        ExpressionAttributeValues: { ":charge": CHARGE_SK },
        ExclusiveStartKey: start,
      }),
    );
    for (const item of page.Items ?? []) {
      charges.push(chargeFromItem(item as SeededChargeItem));
    }
    start = page.LastEvaluatedKey;
  } while (start);
  return charges;
}

function isChargeItem(item: Item): item is ChargeItem {
  return item.type === "CHARGE";
}

/**
 * The reconciled `CHARGE` header carries no billed lines, so it merges onto the
 * seeded charge rather than overwriting it: a put would drop the seeded `lines`
 * and break the next reconcile's round-trip. `SET` touches only the reconciled
 * fields, leaving `lines` intact.
 */
async function mergeCharge(table: string, item: ChargeItem): Promise<void> {
  await doc.send(
    new UpdateCommand({
      TableName: table,
      Key: { [ATTR.PK]: item.PK, [ATTR.SK]: item.SK },
      UpdateExpression:
        "SET #type = :type, controlNumber = :cn, claimControlNumber = :ccn" +
        (item.payerControlNumber ? ", payerControlNumber = :pcn" : ""),
      ExpressionAttributeNames: { "#type": "type" },
      ExpressionAttributeValues: {
        ":type": item.type,
        ":cn": item.controlNumber,
        ":ccn": item.claimControlNumber,
        ...(item.payerControlNumber
          ? { ":pcn": item.payerControlNumber }
          : {}),
      },
    }),
  );
}

// BatchWrite can return UnprocessedItems on an otherwise-successful response
// (throttling), so retry them rather than assume every put landed.
async function putAll(table: string, items: Item[]): Promise<void> {
  for (let i = 0; i < items.length; i += BATCH_LIMIT) {
    let pending: BatchWriteCommandInput["RequestItems"] = {
      [table]: items
        .slice(i, i + BATCH_LIMIT)
        .map((Item) => ({ PutRequest: { Item } })),
    };
    for (let attempt = 0; attempt < 5; attempt++) {
      const result: BatchWriteCommandOutput = await doc.send(
        new BatchWriteCommand({ RequestItems: pending }),
      );
      const unprocessed = result.UnprocessedItems;
      if (!unprocessed || Object.keys(unprocessed).length === 0) {
        break;
      }
      if (attempt === 4) {
        throw new Error(`ingest left items unprocessed after retries: ${table}`);
      }
      pending = unprocessed;
    }
  }
}

async function persist(table: string, items: Item[]): Promise<void> {
  const charges = items.filter(isChargeItem);
  const rest = items.filter((item) => !isChargeItem(item));
  await Promise.all(charges.map((item) => mergeCharge(table, item)));
  await putAll(table, rest);
}

export async function handler(event: S3Event): Promise<void> {
  const table = tableName();

  for (const record of event.Records) {
    const started = Date.now();
    const key = record.s3.object.key;

    const raw835 = await readObject(record.s3.bucket.name, key);
    const charges = await loadCharges(table);
    const { result, logFigures } = handleIngest(raw835, charges);
    const items = buildItems(result.controlNumber, result);
    await persist(table, items);

    console.log(
      JSON.stringify({
        level: "info",
        msg: "reconciled 835",
        object: key,
        controlNumber: result.controlNumber,
        linesReconciled: logFigures.linesReconciled,
        dollarsAtRisk: logFigures.dollarsAtRisk,
        outOfBalanceCount: logFigures.outOfBalanceCount,
        itemsWritten: items.length,
        durationMs: Date.now() - started,
      }),
    );
  }
}
