import { build } from "esbuild";

// Bundle each Lambda edge into one file. esbuild inlines the pure core and the
// x12-parser. The nodejs20.x runtime ships `@aws-sdk/client-s3`, so that stays
// external, but the DynamoDB document client (`@aws-sdk/lib-dynamodb`) is NOT on
// the runtime and must be inlined, and its `@aws-sdk/client-dynamodb` peer is
// bundled alongside it so the two ship as one matched pair (see #39), rather than
// pairing a bundled lib-dynamodb against the runtime's client-dynamodb.
const common = {
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
};

// The ingest edge: reads S3, so client-s3 stays external; lib-dynamodb and its
// client-dynamodb peer are inlined. Output `handler` is `lambda.handler`.
await build({
  ...common,
  entryPoints: ["src/ingest/lambda.ts"],
  outfile: "dist-lambda/lambda.js",
  external: ["@aws-sdk/client-s3"],
});

// The read edge (AppSync data source): no S3, only DynamoDB. lib-dynamodb and its
// client-dynamodb peer are inlined as a matched pair. Output `handler` is
// `read.handler`.
await build({
  ...common,
  entryPoints: ["src/read/lambda.ts"],
  outfile: "dist-lambda-read/read.js",
});
