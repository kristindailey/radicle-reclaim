import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

import { ATTR, GSI1 } from "./src/persistence";
import { GRAPHQL_SCHEMA } from "./src/read/graphql";

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

// The ingest bucket: dropping an 835 here fires the Lambda (D10). Demo spine, so
// no versioning or lifecycle rules; the object is read once and reconciled.
const ingestBucket = new aws.s3.BucketV2("ingest");

/** The ingest bucket name; drop an 835 here to reconcile it (`aws s3 cp`). */
export const ingestBucketName = ingestBucket.bucket;

const lambdaRole = new aws.iam.Role("ingest-lambda", {
  assumeRolePolicy: JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Principal: { Service: "lambda.amazonaws.com" },
        Action: "sts:AssumeRole",
      },
    ],
  }),
});

new aws.iam.RolePolicyAttachment("ingest-lambda-logs", {
  role: lambdaRole.name,
  policyArn: aws.iam.ManagedPolicy.AWSLambdaBasicExecutionRole,
});

// Least privilege for the ingest path: read the dropped object, and read the
// seeded charges plus write the reconciled items back to the one table and its
// index. Nothing else.
new aws.iam.RolePolicy("ingest-lambda-access", {
  role: lambdaRole.id,
  policy: pulumi
    .all([ingestBucket.arn, table.arn])
    .apply(([bucketArn, tableArn]) =>
      JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Action: ["s3:GetObject"],
            Resource: `${bucketArn}/*`,
          },
          {
            Effect: "Allow",
            Action: [
              "dynamodb:Scan",
              "dynamodb:UpdateItem",
              "dynamodb:BatchWriteItem",
            ],
            Resource: [tableArn, `${tableArn}/index/*`],
          },
        ],
      }),
    ),
});

// The bundled edge (`pnpm --filter infra bundle` writes dist-lambda/lambda.js).
// esbuild inlines the pure core and x12-parser; the nodejs20.x runtime supplies
// the AWS SDK, so the bundle stays small and the handler is a thin wrapper.
const ingestLambda = new aws.lambda.Function("ingest", {
  runtime: "nodejs20.x",
  role: lambdaRole.arn,
  handler: "lambda.handler",
  code: new pulumi.asset.FileArchive("dist-lambda"),
  timeout: 30,
  environment: { variables: { RECLAIM_TABLE_NAME: table.name } },
});

const allowS3 = new aws.lambda.Permission("ingest-allow-s3", {
  action: "lambda:InvokeFunction",
  function: ingestLambda.name,
  principal: "s3.amazonaws.com",
  sourceArn: ingestBucket.arn,
});

new aws.s3.BucketNotification(
  "ingest-notify",
  {
    bucket: ingestBucket.id,
    lambdaFunctions: [
      {
        lambdaFunctionArn: ingestLambda.arn,
        events: ["s3:ObjectCreated:*"],
      },
    ],
  },
  { dependsOn: [allowS3] },
);

// --- The read side: AppSync GraphQL API the dashboard queries (issue #26, D22) --

// The read Lambda that backs the AppSync data source. Its own role, read-only on
// the one table and its index: Scan (the reconciliation table and the dashboard's
// scan-derived figures) and Query (the recoverable-denial GSI and a claim's
// proposed lines). No write, no S3: the read path touches nothing else.
const readLambdaRole = new aws.iam.Role("read-lambda", {
  assumeRolePolicy: JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Principal: { Service: "lambda.amazonaws.com" },
        Action: "sts:AssumeRole",
      },
    ],
  }),
});

new aws.iam.RolePolicyAttachment("read-lambda-logs", {
  role: readLambdaRole.name,
  policyArn: aws.iam.ManagedPolicy.AWSLambdaBasicExecutionRole,
});

new aws.iam.RolePolicy("read-lambda-access", {
  role: readLambdaRole.id,
  policy: table.arn.apply((tableArn) =>
    JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Action: ["dynamodb:Scan", "dynamodb:Query"],
          Resource: [tableArn, `${tableArn}/index/*`],
        },
      ],
    }),
  ),
});

// The bundled read edge (`pnpm --filter infra bundle` writes dist-lambda-read/
// read.js). AppSync's VTL request template invokes `read.handler` with the field
// name and arguments; the handler routes to the pure resolvers.
const readLambda = new aws.lambda.Function("read", {
  runtime: "nodejs20.x",
  role: readLambdaRole.arn,
  handler: "read.handler",
  code: new pulumi.asset.FileArchive("dist-lambda-read"),
  timeout: 30,
  environment: { variables: { RECLAIM_TABLE_NAME: table.name } },
});

// API-key auth to reach green fast; the Cognito user-pool authorizer is the
// timeboxed upgrade (D22). API_KEY is the default authorizer for every field.
const api = new aws.appsync.GraphQLApi("reclaim", {
  authenticationType: "API_KEY",
  schema: GRAPHQL_SCHEMA,
});

/** The GraphQL endpoint the dashboard queries. */
export const graphqlApiUrl = api.uris["GRAPHQL"];

const apiKey = new aws.appsync.ApiKey("reclaim", { apiId: api.id });

/** The API key the dashboard sends as `x-api-key`. Secret: read it with `--show-secrets`. */
export const graphqlApiKey = pulumi.secret(apiKey.key);

// The role AppSync assumes to invoke the read Lambda data source. Least
// privilege: invoke that one function, nothing else.
const dataSourceRole = new aws.iam.Role("read-datasource", {
  assumeRolePolicy: JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Principal: { Service: "appsync.amazonaws.com" },
        Action: "sts:AssumeRole",
      },
    ],
  }),
});

new aws.iam.RolePolicy("read-datasource-invoke", {
  role: dataSourceRole.id,
  policy: readLambda.arn.apply((functionArn) =>
    JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Action: ["lambda:InvokeFunction"],
          Resource: functionArn,
        },
      ],
    }),
  ),
});

const readDataSource = new aws.appsync.DataSource("read", {
  apiId: api.id,
  type: "AWS_LAMBDA",
  serviceRoleArn: dataSourceRole.arn,
  lambdaConfig: { functionArn: readLambda.arn },
});

// One Lambda data source serves all three fields; the request template forwards
// the resolved field name and arguments as the invoke payload the handler routes
// on, and the response template passes the handler's result straight through.
const REQUEST_TEMPLATE = `{
  "version": "2017-02-28",
  "operation": "Invoke",
  "payload": {
    "field": "$context.info.fieldName",
    "arguments": $utils.toJson($context.arguments)
  }
}`;

const RESPONSE_TEMPLATE = "$utils.toJson($context.result)";

for (const field of ["reconciledLines", "dashboard", "proposedLines"]) {
  new aws.appsync.Resolver(`read-${field}`, {
    apiId: api.id,
    type: "Query",
    field,
    dataSource: readDataSource.name,
    requestTemplate: REQUEST_TEMPLATE,
    responseTemplate: RESPONSE_TEMPLATE,
  });
}
