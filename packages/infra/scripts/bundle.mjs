import { build } from "esbuild";

// Bundle the ingest edge into one file for the Lambda. esbuild inlines the pure
// core and x12-parser. The nodejs20.x runtime ships the modular `@aws-sdk/client-*`
// clients, so those stay external, but NOT `@aws-sdk/lib-dynamodb` (the document
// client), so that must be inlined or the handler throws "Cannot find module" at
// runtime. Output is dist-lambda/lambda.js, whose `handler` export the Pulumi
// function points at (`lambda.handler`).
await build({
  entryPoints: ["src/ingest/lambda.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  outfile: "dist-lambda/lambda.js",
  external: ["@aws-sdk/client-s3"],
});
