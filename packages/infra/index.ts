import * as pulumi from "@pulumi/pulumi";

// Scaffold only (#22): no resources declared yet. The S3 ingest bucket, the
// ingest Lambda, the single-table DynamoDB store, and the AppSync read API
// arrive with the infra build (#20).
export const stack = pulumi.getStack();
