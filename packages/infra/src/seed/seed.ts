import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  BatchWriteCommand,
  DynamoDBDocumentClient,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import type {
  BatchWriteCommandInput,
  BatchWriteCommandOutput,
} from "@aws-sdk/lib-dynamodb";

import { ATTR, CHARGE_SK, claimPk } from "../persistence";
import { chargeFromItem, seededChargeItem } from "./charge-item";
import type { SeededChargeItem } from "./charge-item";
import { FIXTURE_CHARGES } from "./fixture-charges";

/**
 * The post-deploy seed (D20): write the fixture `CHARGE` items to the live table
 * and read them back, so a dropped six-outcome 835 has charges to round-trip
 * against on `CLP01`. Run after `pulumi up`; the table name comes from
 * `pulumi stack output tableName`.
 */
function resolveTableName(): string {
  const tableName = process.env.RECLAIM_TABLE_NAME;
  if (!tableName) {
    throw new Error(
      "set RECLAIM_TABLE_NAME; read it from `pulumi stack output tableName`.",
    );
  }
  return tableName;
}

// BatchWrite can return UnprocessedItems on an otherwise-successful response
// (throttling), so retry them rather than assume every put landed.
async function writeCharges(
  doc: DynamoDBDocumentClient,
  tableName: string,
  items: SeededChargeItem[],
): Promise<void> {
  let pending: BatchWriteCommandInput["RequestItems"] = {
    [tableName]: items.map((item) => ({ PutRequest: { Item: item } })),
  };
  for (let attempt = 0; attempt < 5; attempt++) {
    const result: BatchWriteCommandOutput = await doc.send(
      new BatchWriteCommand({ RequestItems: pending }),
    );
    const unprocessed = result.UnprocessedItems;
    if (!unprocessed || Object.keys(unprocessed).length === 0) {
      return;
    }
    pending = unprocessed;
  }
  throw new Error(`seed left items unprocessed after retries: ${tableName}`);
}

async function readCharge(
  doc: DynamoDBDocumentClient,
  tableName: string,
  claimControlNumber: string,
): Promise<SeededChargeItem | undefined> {
  const { Items } = await doc.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: "#pk = :pk AND #sk = :sk",
      ExpressionAttributeNames: { "#pk": ATTR.PK, "#sk": ATTR.SK },
      ExpressionAttributeValues: {
        ":pk": claimPk(claimControlNumber),
        ":sk": CHARGE_SK,
      },
    }),
  );
  return Items?.[0] as SeededChargeItem | undefined;
}

async function main(): Promise<void> {
  const tableName = resolveTableName();
  const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}));

  await writeCharges(doc, tableName, FIXTURE_CHARGES.map(seededChargeItem));
  console.log(`seeded ${FIXTURE_CHARGES.length} charges into ${tableName}`);

  for (const charge of FIXTURE_CHARGES) {
    const item = await readCharge(doc, tableName, charge.claimControlNumber);
    if (!item) {
      throw new Error(`seed read-back failed: ${charge.claimControlNumber}`);
    }
    const readBack = chargeFromItem(item);
    console.log(
      `read back ${readBack.claimControlNumber}: ${readBack.lines.length} line(s)`,
    );
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
