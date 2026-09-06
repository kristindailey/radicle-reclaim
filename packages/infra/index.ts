import * as aws from "@pulumi/aws";

import { ATTR, GSI1 } from "./src/persistence";

// The single-table store (D12). One table holds every grain of a reconciled 835,
// partitioned by claim (PK) and sorted by grain (SK). GSI1 partitions the
// recoverable-denial lines so "dollars at risk" is a query, not a table scan.
// PAY_PER_REQUEST: no capacity to provision for a demo-scale table.
const table = new aws.dynamodb.Table("reclaim", {
  billingMode: "PAY_PER_REQUEST",
  hashKey: ATTR.PK,
  rangeKey: ATTR.SK,
  attributes: [
    { name: ATTR.PK, type: "S" },
    { name: ATTR.SK, type: "S" },
    { name: GSI1.PK, type: "S" },
  ],
  globalSecondaryIndexes: [
    {
      name: GSI1.NAME,
      hashKey: GSI1.PK,
      projectionType: "ALL",
    },
  ],
});

/** The provisioned table name; the seed script reads it as `RECLAIM_TABLE_NAME`. */
export const tableName = table.name;
